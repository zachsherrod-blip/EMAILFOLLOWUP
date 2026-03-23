import * as React from "react";
import { Resend } from "resend";
import { render } from "@react-email/components";
import { DigestEmail, DigestTask } from "@/components/email/DigestEmail";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/utils/date";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendDailyDigest(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error(`User ${userId} not found`);

  const recipientEmail = user.digestEmail ?? user.email;
  if (!recipientEmail) throw new Error("No recipient email configured");

  const settings = await prisma.userSettings.findUnique({ where: { userId } });
  const minScore = settings?.minimumPriorityScore ?? 30;

  // Fetch eligible open tasks
  const tasks = await prisma.followUpTask.findMany({
    where: {
      userId,
      status: "OPEN",
      priorityScore: { gte: minScore },
    },
    include: {
      sourceEvent: true,
      sourceThread: true,
    },
    orderBy: { priorityScore: "desc" },
  });

  const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
  const dashboardUrl = `${baseUrl}/dashboard`;

  // Build digest task objects
  let taskNumber = 0;
  const digestTasks: DigestTask[] = [];

  for (const task of tasks) {
    taskNumber++;
    const contactIds = task.contactIdsJson as string[];

    const contacts = await prisma.contact.findMany({
      where: { id: { in: contactIds } },
    });

    const names = contacts.map((c) => c.name).filter((n): n is string => !!n);
    const emails = contacts.map((c) => c.email);
    const companies = Array.from(
      new Set(contacts.map((c) => c.company).filter((c): c is string => !!c))
    );

    let sourceContext = "";
    if (task.sourceEvent) {
      sourceContext = `${task.sourceEvent.title}, ${formatDate(task.sourceEvent.startAt)}`;
    } else if (task.sourceThread) {
      sourceContext = task.sourceThread.subject ?? "Email thread";
      if (task.sourceThread.lastMessageAt) {
        sourceContext += `, ${formatDate(task.sourceThread.lastMessageAt)}`;
      }
    }

    digestTasks.push({
      id: task.id,
      number: taskNumber,
      names,
      emails,
      companies,
      sourceContext,
      rationale: task.rationale,
      shortPrompt: task.shortPrompt,
      priorityLabel: task.priorityLabel as "HIGH" | "MEDIUM" | "LOW",
      dismissUrl: `${baseUrl}/api/tasks/${task.id}/dismiss`,
      snoozeUrl: `${baseUrl}/api/tasks/${task.id}/snooze`,
    });
  }

  // Update surfaced counts
  if (digestTasks.length > 0) {
    await prisma.followUpTask.updateMany({
      where: { id: { in: digestTasks.map((t) => t.id) } },
      data: {
        surfacedCount: { increment: 1 },
        lastSurfacedAt: new Date(),
      },
    });
  }

  const high = digestTasks.filter((t) => t.priorityLabel === "HIGH");
  const medium = digestTasks.filter((t) => t.priorityLabel === "MEDIUM");
  const low = digestTasks.filter((t) => t.priorityLabel === "LOW");
  const total = digestTasks.length;

  const subjectLine =
    total === 0
      ? "Follow-Up Queue: All clear today"
      : total === 1
      ? "Follow-Up Queue: 1 person to reply to"
      : `Follow-Up Queue: ${total} people to follow up with`;

  const date = formatDate(new Date());

  // Render email HTML
  const emailHtml = await render(
    React.createElement(DigestEmail, {
      userName: user.name ?? user.email,
      date,
      highTasks: high,
      mediumTasks: medium,
      lowTasks: low,
      dashboardUrl,
    })
  );

  // Send email
  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? "followup@noreply.com",
    to: recipientEmail,
    subject: subjectLine,
    html: emailHtml,
  });

  if (error) {
    throw new Error(`Failed to send digest email: ${JSON.stringify(error)}`);
  }

  // Record digest run
  await prisma.digestRun.create({
    data: {
      userId,
      tasksIncluded: total,
      subjectLine,
      emailBody: emailHtml.slice(0, 5000),
    },
  });

  console.log(
    `Digest sent to ${recipientEmail}: "${subjectLine}" (${total} tasks)`
  );
}
