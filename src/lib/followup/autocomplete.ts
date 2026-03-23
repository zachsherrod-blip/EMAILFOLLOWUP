import { prisma } from "@/lib/prisma";
import { hasOutboundEmailAfter } from "@/lib/google/gmail";
import { CalendarAttendee } from "@/lib/google/calendar";

/**
 * For all open follow-up tasks, check if the user has since replied.
 * If so, auto-complete the task.
 */
export async function autoCompleteResolvedTasks(userId: string): Promise<number> {
  const settings = await prisma.userSettings.findUnique({ where: { userId } });
  if (!settings?.autoCompleteOnReply) return 0;

  const openTasks = await prisma.followUpTask.findMany({
    where: { userId, status: "OPEN" },
    include: {
      sourceEvent: true,
      sourceThread: true,
    },
  });

  let completedCount = 0;

  for (const task of openTasks) {
    try {
      const completed = await checkIfTaskCompleted(task);
      if (completed) {
        await prisma.followUpTask.update({
          where: { id: task.id },
          data: {
            status: "COMPLETED",
            autoCompletedAt: new Date(),
            completedReason: completed,
            updatedAt: new Date(),
          },
        });

        await prisma.taskAction.create({
          data: {
            taskId: task.id,
            userId,
            action: "AUTO_COMPLETE",
            metadataJson: { reason: completed },
          },
        });

        completedCount++;
      }
    } catch (err) {
      console.error(`Error checking task ${task.id}:`, err);
    }
  }

  return completedCount;
}

interface TaskWithRelations {
  id: string;
  userId: string;
  sourceType: string;
  sourceEventId: string | null;
  sourceThreadId: string | null;
  contactIdsJson: unknown;
  createdAt: Date;
  sourceEvent: {
    endAt: Date;
    attendeesJson: unknown;
  } | null;
  sourceThread: {
    gmailThreadId: string;
  } | null;
}

async function checkIfTaskCompleted(
  task: TaskWithRelations
): Promise<string | null> {
  // For calendar-based tasks: check if outbound email was sent to attendees after meeting end
  if (task.sourceEvent) {
    const attendees = task.sourceEvent.attendeesJson as CalendarAttendee[];
    const externalEmails = attendees
      .filter((a) => !a.self)
      .map((a) => a.email)
      .filter(Boolean);

    if (externalEmails.length > 0) {
      const replied = await hasOutboundEmailAfter(
        task.userId,
        externalEmails,
        task.sourceEvent.endAt
      );
      if (replied) {
        return "Outbound email detected to meeting attendee(s) after the meeting.";
      }
    }
  }

  // For thread-based tasks: check if there's an outbound reply after task creation
  if (task.sourceThread) {
    const outboundAfterCreation = await prisma.emailMessage.findFirst({
      where: {
        userId: task.userId,
        thread: { gmailThreadId: task.sourceThread.gmailThreadId },
        direction: "OUTBOUND",
        sentAt: { gt: task.createdAt },
      },
    });
    if (outboundAfterCreation) {
      return "User replied in the associated email thread after task creation.";
    }
  }

  return null;
}

/**
 * Expire snoozed tasks that are past their snooze date.
 */
export async function expireSnoozedTasks(userId: string): Promise<number> {
  const result = await prisma.followUpTask.updateMany({
    where: {
      userId,
      status: "SNOOZED",
      snoozedUntil: { lt: new Date() },
    },
    data: {
      status: "OPEN",
      snoozedUntil: null,
    },
  });

  return result.count;
}
