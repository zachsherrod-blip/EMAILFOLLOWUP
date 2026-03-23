import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TaskCard } from "@/components/TaskCard";
import Link from "next/link";

export const dynamic = "force-dynamic";

type Tab = "open" | "completed" | "dismissed" | "snoozed";

interface PageProps {
  searchParams: { tab?: string };
}

export default async function AllTasksPage({ searchParams }: PageProps) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;

  const userId = session.user.id;
  const tab = (searchParams.tab ?? "open") as Tab;

  const statusMap: Record<Tab, string> = {
    open: "OPEN",
    completed: "COMPLETED",
    dismissed: "DISMISSED",
    snoozed: "SNOOZED",
  };

  const tasks = await prisma.followUpTask.findMany({
    where: { userId, status: statusMap[tab] as "OPEN" | "COMPLETED" | "DISMISSED" | "SNOOZED" },
    include: { sourceEvent: true, sourceThread: true },
    orderBy: tab === "open" ? { priorityScore: "desc" } : { updatedAt: "desc" },
  });

  // Fetch contacts for each task
  const taskContactMap = new Map<string, Array<{ email: string; name: string | null; company: string | null }>>();
  for (const task of tasks) {
    const ids = task.contactIdsJson as string[];
    const contacts = await prisma.contact.findMany({
      where: { id: { in: ids } },
      select: { email: true, name: true, company: true },
    });
    taskContactMap.set(task.id, contacts);
  }

  const counts = await prisma.followUpTask.groupBy({
    by: ["status"],
    where: { userId },
    _count: true,
  });
  const countMap = Object.fromEntries(
    counts.map((c) => [c.status.toLowerCase(), c._count])
  );

  const tabs: Array<{ key: Tab; label: string }> = [
    { key: "open", label: `Open (${countMap.open ?? 0})` },
    { key: "completed", label: `Completed (${countMap.completed ?? 0})` },
    { key: "snoozed", label: `Snoozed (${countMap.snoozed ?? 0})` },
    { key: "dismissed", label: `Dismissed (${countMap.dismissed ?? 0})` },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 tracking-tight mb-6">
        All Tasks
      </h1>

      {/* Tab nav */}
      <div className="flex gap-1 mb-6 border-b border-slate-200 pb-0">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={`/dashboard/tasks?tab=${t.key}`}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key
                ? "border-slate-900 text-slate-900"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {tasks.length === 0 ? (
        <p className="text-sm text-slate-400 py-8 text-center">
          No {tab} tasks.
        </p>
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              contacts={taskContactMap.get(task.id) ?? []}
            />
          ))}
        </div>
      )}
    </div>
  );
}
