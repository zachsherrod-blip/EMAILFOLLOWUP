import { prisma } from "@/lib/prisma";
import { classifyFollowUpTask } from "@/lib/ai/classify";
import { hasOutboundEmailAfter } from "@/lib/google/gmail";
import { businessDaysBetween, formatDate, subDays } from "@/lib/utils/date";
import { CalendarAttendee, isInternalEmail } from "@/lib/google/calendar";
import crypto from "crypto";

const FOLLOW_UP_WINDOW_DAYS = 5; // Consider meetings within last N business days

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

  // Fetch recent calendar events that have external attendees
  const cutoff = subDays(new Date(), lookbackDays);
  const events = await prisma.calendarEvent.findMany({
    where: {
      userId,
      hasExternalAttendees: true,
      isBusinessRelevant: true,
      startAt: { gt: cutoff, lt: new Date() }, // Past events only
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

      // Build dedupe key
      const sortedEmails = [...externalEmails].sort().join(",");
      const dedupeKey = crypto
        .createHash("sha256")
        .update(`${userId}:event:${event.googleEventId}:${sortedEmails}`)
        .digest("hex")
        .slice(0, 32);

      // Check if task already exists
      const existingTask = await prisma.followUpTask.findUnique({
        where: { dedupeKey },
      });

      if (existingTask) {
        result.skipped++;
        continue;
      }

      // Check if user already sent a follow-up after this meeting
      const hasFollowUp = await hasOutboundEmailAfter(
        userId,
        externalEmails,
        event.endAt
      );

      const daysSince = businessDaysBetween(event.startAt, new Date());

      // Skip if event is too old (> FOLLOW_UP_WINDOW_DAYS business days) — deterministic rule
      if (daysSince > FOLLOW_UP_WINDOW_DAYS) {
        result.skipped++;
        continue;
      }

      // Get related thread snippets for context
      const threadSnippets = await getRelatedThreadSnippets(userId, externalEmails);

      // Classify with LLM
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

      if (!classification.shouldCreateTask) {
        result.skipped++;
        continue;
      }

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

      const priorityLabel = getPriorityLabel(classification.priorityScore);

      await prisma.followUpTask.create({
        data: {
          userId,
          sourceType: "CALENDAR",
          sourceEventId: event.id,
          contactIdsJson: contactIds,
          title: `Follow up: ${event.title}`,
          rationale: classification.rationale,
          priorityScore: classification.priorityScore,
          priorityLabel,
          shortPrompt: classification.shortPrompt,
          status: "OPEN",
          dedupeKey,
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

function getPriorityLabel(score: number): "HIGH" | "MEDIUM" | "LOW" {
  if (score >= 80) return "HIGH";
  if (score >= 55) return "MEDIUM";
  return "LOW";
}

async function getRelatedThreadSnippets(
  userId: string,
  emails: string[]
): Promise<string[]> {
  // Find threads involving these external email addresses
  const threads = await prisma.emailThread.findMany({
    where: { userId },
    select: {
      subject: true,
      snippet: true,
      participantsJson: true,
    },
    orderBy: { lastMessageAt: "desc" },
    take: 50,
  });

  const lowerEmails = emails.map((e) => e.toLowerCase());
  const relevant: string[] = [];

  for (const thread of threads) {
    const participants = (thread.participantsJson as string[]).map((e) =>
      e.toLowerCase()
    );
    if (lowerEmails.some((e) => participants.includes(e))) {
      if (thread.snippet) {
        relevant.push(
          thread.subject
            ? `"${thread.subject}": ${thread.snippet.slice(0, 100)}`
            : thread.snippet.slice(0, 100)
        );
      }
      if (relevant.length >= 3) break;
    }
  }

  return relevant;
}
