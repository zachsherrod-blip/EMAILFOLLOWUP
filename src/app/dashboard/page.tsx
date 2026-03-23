import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TaskCard } from "@/components/TaskCard";
import { SyncButton } from "@/components/SyncButton";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;

  const userId = session.user.id;

  const [openTasks, connectedAccount, lastDigest, snoozedCount] =
    await Promise.all([
      prisma.followUpTask.findMany({
        where: { userId, status: "OPEN" },
        include: { sourceEvent: true, sourceThread: true },
        orderBy: { priorityScore: "desc" },
      }),
      prisma.connectedAccount.findUnique({
        where: { userId_provider: { userId, provider: "google" } },
        select: { email: true, updatedAt: true },
      }),
      prisma.digestRun.findFirst({
        where: { userId },
        orderBy: { sentAt: "desc" },
        select: { sentAt: true, tasksIncluded: true, subjectLine: true },
      }),
      prisma.followUpTask.count({ where: { userId, status: "SNOOZED" } }),
    ]);

  // Fetch contacts for tasks
  const taskContactMap = new Map<string, Array<{ email: string; name: string | null; company: string | null }>>();
  for (const task of openTasks) {
    const ids = task.contactIdsJson as string[];
    const contacts = await prisma.contact.findMany({
      where: { id: { in: ids } },
      select: { email: true, name: true, company: true },
    });
    taskContactMap.set(task.id, contacts);
  }

  const high = openTasks.filter((t) => t.priorityLabel === "HIGH");
  const medium = openTasks.filter((t) => t.priorityLabel === "MEDIUM");
  const low = openTasks.filter((t) => t.priorityLabel === "LOW");
  const total = openTasks.length;

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Today&apos;s Follow-Ups
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {total === 0
              ? "All clear — no open follow-ups."
              : `${total} open task${total === 1 ? "" : "s"} · ${snoozedCount} snoozed`}
          </p>
        </div>
        <SyncButton />
      </div>

      {/* Connection status */}
      {!connectedAccount && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          <strong>Google account not connected.</strong>{" "}
          <a href="/dashboard/connections" className="underline">
            Connect now
          </a>{" "}
          to start syncing.
        </div>
      )}

      {/* Last digest info */}
      {lastDigest && (
        <div className="mb-6 px-4 py-3 bg-slate-100 rounded-lg text-xs text-slate-500 flex items-center justify-between">
          <span>
            Last digest: {new Date(lastDigest.sentAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })} · {lastDigest.tasksIncluded} task{lastDigest.tasksIncluded === 1 ? "" : "s"}
          </span>
          <span className="text-slate-400">{lastDigest.subjectLine}</span>
        </div>
      )}

      {total === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <div className="text-4xl mb-3">✓</div>
          <p className="text-base font-medium text-slate-600">All caught up</p>
          <p className="text-sm mt-1">
            No open follow-up tasks. Check back after your next sync.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {high.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-700">
                  HIGH
                </span>
                <span className="text-xs text-slate-400">{high.length} item{high.length !== 1 ? "s" : ""}</span>
              </div>
              <div className="space-y-3">
                {high.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    contacts={taskContactMap.get(task.id) ?? []}
                  />
                ))}
              </div>
            </section>
          )}

          {medium.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-700">
                  MEDIUM
                </span>
                <span className="text-xs text-slate-400">{medium.length} item{medium.length !== 1 ? "s" : ""}</span>
              </div>
              <div className="space-y-3">
                {medium.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    contacts={taskContactMap.get(task.id) ?? []}
                  />
                ))}
              </div>
            </section>
          )}

          {low.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-600">
                  LOW
                </span>
                <span className="text-xs text-slate-400">{low.length} item{low.length !== 1 ? "s" : ""}</span>
              </div>
              <div className="space-y-3">
                {low.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    contacts={taskContactMap.get(task.id) ?? []}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
