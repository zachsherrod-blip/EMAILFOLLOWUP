import { prisma } from "@/lib/prisma";
import { classifyFollowUpTask, ClassificationResult } from "@/lib/ai/classify";
import { hasOutboundEmailAfter } from "@/lib/google/gmail";
import { businessDaysBetween, formatDate, subDays } from "@/lib/utils/date";
import { CalendarAttendee, isInternalEmail } from "@/lib/google/calendar";
import crypto from "crypto";

// Only surface meetings within this many business days (prevents stale noise)
const FOLLOW_UP_WINDOW_DAYS = 5;

// ── Signals ──────────────────────────────────────────────────────────────────

export interface TaskSignals {
  // Identifiers
  account: string | null;
  contact: string;
  source: "gmail" | "calendar" | "slack" | "gong";
  type: "platform_partner" | "agency" | "prospect" | "customer" | "other";

  // Binary signals
  isCallFollowUp: boolean;
  hasExplicitAsk: boolean;
  hasCommitment: boolean;
  isRevenueRelated: boolean;

  // Recency
  daysSinceLastTouch: number;

  // LLM-enriched
  category: string;
  urgency: "High" | "Medium" | "Low";
  followUpOwed: boolean;
  whatNeedsToHappen: string;
  whyItMatters: string;
  nextActions: [string, string];
}

/**
 * Deterministic signal scoring.
 * Max raw score = 11. Normalized to 0–99.
 *
 * priorityScore = (isCallFollowUp ? 3 : 0) + (hasExplicitAsk ? 2 : 0)
 *               + (hasCommitment ? 2 : 0) + (isRevenueRelated ? 2 : 0)
 *               + (daysSinceLastTouch <= 2 ? 2 : 0)
 */
function computePriorityScore(signals: TaskSignals): number {
  const raw =
    (signals.isCallFollowUp ? 3 : 0) +
    (signals.hasExplicitAsk ? 2 : 0) +
    (signals.hasCommitment ? 2 : 0) +
    (signals.isRevenueRelated ? 2 : 0) +
    (signals.daysSinceLastTouch <= 2 ? 2 : 0);

  // Normalize 0–11 → 0–99
  return Math.round((raw / 11) * 99);
}

function getPriorityLabel(
  signals: TaskSignals,
  score: number
): "HIGH" | "MEDIUM" | "LOW" {
  // Call follow-up override: always HIGH if call happened ≤2 days ago
  if (signals.isCallFollowUp && signals.daysSinceLastTouch <= 2) return "HIGH";
  if (score >= 54) return "HIGH";   // raw >= 6 of 11
  if (score >= 27) return "MEDIUM"; // raw >= 3 of 11
  return "LOW";
}

function categoryToType(
  category: string
): "platform_partner" | "agency" | "prospect" | "customer" | "other" {
  switch (category) {
    case "Platform Partnership": return "platform_partner";
    case "Agency": return "agency";
    case "Deal / Prospect": return "prospect";
    case "Customer": return "customer";
    default: return "other";
  }
}

// ── Main detection function ───────────────────────────────────────────────────

interface DetectionResult {
  created: number;
  skipped: number;
  errors: number;
}

export async function detectFollowUpTasks(userId: string): Promise<DetectionResult> {
  const result: DetectionResult = { created: 0, skipped: 0, errors: 0 };

  const settings = await prisma.userSettings.findUnique({ where: { userId } });
  const internalDomains = (settings?.internalDomainsJson as string[]) ?? [];
  const lookbackDays = settings?.scanLookbackDays ?? 14;

  const cutoff = subDays(new Date(), lookbackDays);
  const events = await prisma.calendarEvent.findMany({
    where: {
      userId,
      hasExternalAttendees: true,
      isBusinessRelevant: true,
      startAt: { gt: cutoff, lt: new Date() },
    },
    orderBy: { startAt: "desc" },
  });

  for (const event of events) {
    try {
      const attendees = event.attendeesJson as unknown as CalendarAttendee[];
      const externalAttendees = attendees.filter(
        (a) => a.email && !a.self && !isInternalEmail(a.email, internalDomains)
      );

      if (externalAttendees.length === 0) {
        result.skipped++;
        continue;
      }

      const externalEmails = externalAttendees.map((a) => a.email);

      // Dedupe check
      const sortedEmails = [...externalEmails].sort().join(",");
      const dedupeKey = crypto
        .createHash("sha256")
        .update(`${userId}:event:${event.googleEventId}:${sortedEmails}`)
        .digest("hex")
        .slice(0, 32);

      const existingTask = await prisma.followUpTask.findUnique({ where: { dedupeKey } });
      if (existingTask) {
        result.skipped++;
        continue;
      }

      const daysSince = businessDaysBetween(event.startAt, new Date());

      // Skip stale events
      if (daysSince > FOLLOW_UP_WINDOW_DAYS) {
        result.skipped++;
        continue;
      }

      // Outbound follow-up check
      const hasFollowUp = await hasOutboundEmailAfter(userId, externalEmails, event.endAt);

      // Related thread snippets for LLM context
      const threadSnippets = await getRelatedThreadSnippets(userId, externalEmails);

      // LLM classification
      const classification = await classifyFollowUpTask({
        eventTitle: event.title,
        eventDescription: event.description ?? undefined,
        attendees: externalAttendees.map((a) => ({
          name: a.displayName,
          email: a.email,
        })),
        eventDate: formatDate(event.startAt),
        daysSinceEvent: daysSince,
        hasOutboundFollowUp: hasFollowUp,
        threadSnippets,
      });

      if (!classification.shouldCreateTask || !classification.followUpOwed) {
        result.skipped++;
        continue;
      }

      // Hard filter: must have a real action
      if (!classification.shortPrompt.trim()) {
        result.skipped++;
        continue;
      }

      // Build signals object
      const primaryContact = externalAttendees[0];
      const contactDisplay = primaryContact.displayName
        ? `${primaryContact.displayName} <${primaryContact.email}>`
        : primaryContact.email;

      const signals: TaskSignals = {
        account: classification.company,
        contact: contactDisplay,
        source: "calendar",
        type: categoryToType(classification.category),
        isCallFollowUp: classification.isCallFollowUp,
        hasExplicitAsk: classification.hasExplicitAsk,
        hasCommitment: classification.hasCommitment,
        isRevenueRelated: classification.revenueImpact,
        daysSinceLastTouch: daysSince,
        category: classification.category,
        urgency: classification.urgency,
        followUpOwed: classification.followUpOwed,
        whatNeedsToHappen: classification.whatNeedsToHappen,
        whyItMatters: classification.whyItMatters,
        nextActions: classification.nextActions,
      };

      const priorityScore = computePriorityScore(signals);
      const priorityLabel = getPriorityLabel(signals, priorityScore);

      // Upsert contacts
      const contactIds: string[] = [];
      for (const attendee of externalAttendees) {
        const contact = await prisma.contact.upsert({
          where: { userId_email: { userId, email: attendee.email.toLowerCase() } },
          create: {
            userId,
            email: attendee.email.toLowerCase(),
            name: attendee.displayName ?? null,
            company: classification.company ?? null,
            isInternal: false,
          },
          update: {
            name: attendee.displayName ?? undefined,
            company: classification.company ?? undefined,
          },
        });
        contactIds.push(contact.id);
      }

      await prisma.followUpTask.create({
        data: {
          userId,
          sourceType: "CALENDAR",
          sourceEventId: event.id,
          contactIdsJson: contactIds,
          title: `Follow up: ${event.title}`,
          rationale: classification.rationale,
          priorityScore,
          priorityLabel,
          shortPrompt: classification.shortPrompt,
          status: "OPEN",
          dedupeKey,
          signalsJson: signals as unknown as import("@prisma/client").Prisma.InputJsonValue,
        },
      });

      result.created++;
    } catch (err) {
      console.error(`Error processing event ${event.id}:`, err);
      result.errors++;
    }
  }

  return result;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getRelatedThreadSnippets(
  userId: string,
  emails: string[]
): Promise<string[]> {
  const threads = await prisma.emailThread.findMany({
    where: { userId },
    select: { subject: true, snippet: true, participantsJson: true },
    orderBy: { lastMessageAt: "desc" },
    take: 50,
  });

  const lowerEmails = emails.map((e) => e.toLowerCase());
  const relevant: string[] = [];

  for (const thread of threads) {
    const participants = (thread.participantsJson as string[]).map((e) => e.toLowerCase());
    if (lowerEmails.some((e) => participants.includes(e)) && thread.snippet) {
      relevant.push(
        thread.subject
          ? `"${thread.subject}": ${thread.snippet.slice(0, 100)}`
          : thread.snippet.slice(0, 100)
      );
      if (relevant.length >= 3) break;
    }
  }

  return relevant;
}
