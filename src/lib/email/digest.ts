import * as React from "react";
import { Resend } from "resend";
import { render } from "@react-email/components";
import {
  DigestEmail,
  PriorityItem,
  FollowUpItem,
} from "@/components/email/DigestEmail";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/utils/date";
import { TaskSignals } from "@/lib/followup/detect";

const resend = new Resend(process.env.RESEND_API_KEY);

// ── Types ────────────────────────────────────────────────────────────────────

interface RichTask {
  id: string;
  title: string;
  rationale: string;
  shortPrompt: string;
  priorityScore: number;
  priorityLabel: string;
  signals: TaskSignals;
  contacts: Array<{ email: string; name: string | null; company: string | null }>;
  sourceContext: string;
  dismissUrl: string;
  snoozeUrl: string;
}

// ── Main ─────────────────────────────────────────────────────────────────────

export async function sendDailyDigest(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error(`User ${userId} not found`);

  const recipientEmail = user.digestEmail ?? user.email;
  if (!recipientEmail) throw new Error("No recipient email configured");

  const settings = await prisma.userSettings.findUnique({ where: { userId } });
  const minScore = settings?.minimumPriorityScore ?? 27; // default = MEDIUM floor

  const rawTasks = await prisma.followUpTask.findMany({
    where: {
      userId,
      status: "OPEN",
      priorityScore: { gte: minScore },
    },
    include: { sourceEvent: true, sourceThread: true },
    orderBy: { priorityScore: "desc" },
  });

  const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";

  // Hydrate tasks with contacts + source context
  const richTasks: RichTask[] = [];
  for (const task of rawTasks) {
    const contactIds = task.contactIdsJson as string[];
    const contacts = await prisma.contact.findMany({
      where: { id: { in: contactIds } },
      select: { email: true, name: true, company: true },
    });

    let sourceContext = "";
    if (task.sourceEvent) {
      sourceContext = `${task.sourceEvent.title}, ${formatDate(task.sourceEvent.startAt)}`;
    } else if (task.sourceThread) {
      sourceContext = task.sourceThread.subject ?? "Email thread";
      if (task.sourceThread.lastMessageAt) {
        sourceContext += `, ${formatDate(task.sourceThread.lastMessageAt)}`;
      }
    }

    const signals = task.signalsJson as unknown as TaskSignals;

    richTasks.push({
      id: task.id,
      title: task.title,
      rationale: task.rationale,
      shortPrompt: task.shortPrompt,
      priorityScore: task.priorityScore,
      priorityLabel: task.priorityLabel,
      signals,
      contacts,
      sourceContext,
      dismissUrl: `${baseUrl}/api/tasks/${task.id}/dismiss`,
      snoozeUrl: `${baseUrl}/api/tasks/${task.id}/snooze`,
    });
  }

  // ── CALL PRIORITY OVERRIDE ────────────────────────────────────────────────
  // Any call follow-up within 2 days with no reply → force to MUST (HIGH)
  const mustFollowUp: RichTask[] = [];
  const shouldFollowUp: RichTask[] = [];

  for (const task of richTasks) {
    const s = task.signals;
    const isCallOverride =
      s?.isCallFollowUp === true && (s?.daysSinceLastTouch ?? 99) <= 2;
    const isMust = task.priorityLabel === "HIGH" || isCallOverride;

    if (isMust) {
      mustFollowUp.push(task);
    } else if (s?.followUpOwed !== false) {
      shouldFollowUp.push(task);
    }
  }

  // Cap sections
  const mustCapped = mustFollowUp.slice(0, 5);
  const shouldCapped = shouldFollowUp.slice(0, 5);

  // ── PRIORITIES ENGINE (account-level grouping) ────────────────────────────
  // Aggregate all tasks by account, sum scores, take top 3–6
  const accountMap = new Map<
    string,
    { totalScore: number; tasks: RichTask[]; area: string }
  >();

  for (const task of richTasks) {
    const account = task.signals?.account || inferAccount(task.contacts) || "Unknown";
    const area = signalTypeToArea(task.signals?.type);
    const existing = accountMap.get(account);
    if (existing) {
      existing.totalScore += task.priorityScore;
      existing.tasks.push(task);
    } else {
      accountMap.set(account, { totalScore: task.priorityScore, tasks: [task], area });
    }
  }

  const sortedAccounts = Array.from(accountMap.entries())
    .sort(([, a], [, b]) => b.totalScore - a.totalScore)
    .slice(0, 6);

  const priorities: PriorityItem[] = sortedAccounts.map(([account, data]) => {
    // Pick the highest-score task for the account-level narrative
    const lead = data.tasks.sort((a, b) => b.priorityScore - a.priorityScore)[0];
    const s = lead.signals;
    return {
      area: data.area,
      account,
      whatNeedsToHappen: s?.whatNeedsToHappen || lead.rationale,
      whyItMatters: s?.whyItMatters || "Momentum stalls without follow-through.",
      nextActions: s?.nextActions ?? [`Follow up with ${account}`, "Track response"],
    };
  });

  // ── BUILD FOLLOW-UP ITEMS ────────────────────────────────────────────────
  function toFollowUpItem(task: RichTask, n: number): FollowUpItem {
    const s = task.signals;
    const account = s?.account || inferAccount(task.contacts) || "Unknown";
    const contact =
      task.contacts.map((c) => c.name ?? c.email).join(", ") || "Unknown";
    const source = s?.source ?? "calendar";
    return {
      number: n,
      account,
      contact,
      source: source.charAt(0).toUpperCase() + source.slice(1) as FollowUpItem["source"],
      priority: task.priorityLabel as "HIGH" | "MEDIUM" | "LOW",
      action: s?.whatNeedsToHappen || task.rationale,
      shortPrompt: task.shortPrompt,
      dismissUrl: task.dismissUrl,
      snoozeUrl: task.snoozeUrl,
    };
  }

  const mustItems = mustCapped.map((t, i) => toFollowUpItem(t, i + 1));
  const shouldItems = shouldCapped.map((t, i) => toFollowUpItem(t, i + 1));

  // ── SURFACE COUNTS ────────────────────────────────────────────────────────
  const allShownIds = [
    ...mustCapped.map((t) => t.id),
    ...shouldCapped.map((t) => t.id),
  ];
  if (allShownIds.length > 0) {
    await prisma.followUpTask.updateMany({
      where: { id: { in: allShownIds } },
      data: { surfacedCount: { increment: 1 }, lastSurfacedAt: new Date() },
    });
  }

  const total = allShownIds.length;
  const priorityCount = priorities.length;

  const subjectLine =
    total === 0
      ? "Growth OS: All clear today"
      : mustItems.length > 0
      ? `Growth OS: ${mustItems.length} must-send + ${priorityCount} priorities`
      : `Growth OS: ${total} follow-ups · ${priorityCount} priorities`;

  const date = formatDate(new Date());
  const userName = user.name ?? user.email ?? "there";

  const emailHtml = await render(
    React.createElement(DigestEmail, {
      userName,
      date,
      priorities,
      mustFollowUp: mustItems,
      shouldFollowUp: shouldItems,
      dashboardUrl: `${baseUrl}/dashboard`,
    })
  );

  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? "followup@noreply.com",
    to: recipientEmail,
    subject: subjectLine,
    html: emailHtml,
  });

  if (error) {
    throw new Error(`Failed to send digest email: ${JSON.stringify(error)}`);
  }

  await prisma.digestRun.create({
    data: {
      userId,
      tasksIncluded: total,
      subjectLine,
      emailBody: emailHtml.slice(0, 5000),
    },
  });

  console.log(`Digest sent to ${recipientEmail}: "${subjectLine}" (${total} tasks, ${priorityCount} priorities)`);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function inferAccount(
  contacts: Array<{ email: string; company: string | null }>
): string | null {
  for (const c of contacts) {
    if (c.company) return c.company;
    // Infer from email domain
    const domain = c.email.split("@")[1];
    if (domain) {
      const parts = domain.split(".");
      if (parts.length >= 2) {
        return parts[parts.length - 2]
          .charAt(0)
          .toUpperCase() + parts[parts.length - 2].slice(1);
      }
    }
  }
  return null;
}

function signalTypeToArea(
  type: TaskSignals["type"] | undefined
): string {
  switch (type) {
    case "platform_partner": return "Platform";
    case "agency": return "Agency";
    case "prospect": return "Deals";
    case "customer": return "Customer";
    default: return "Growth";
  }
}
