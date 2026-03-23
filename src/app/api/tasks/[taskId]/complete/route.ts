import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(
  req: NextRequest,
  { params }: { params: { taskId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const task = await prisma.followUpTask.findFirst({
    where: { id: params.taskId, userId: session.user.id },
  });

  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  await prisma.followUpTask.update({
    where: { id: params.taskId },
    data: {
      status: "COMPLETED",
      autoCompletedAt: new Date(),
      completedReason: "Manually marked complete",
      updatedAt: new Date(),
    },
  });

  await prisma.taskAction.create({
    data: {
      taskId: params.taskId,
      userId: session.user.id,
      action: "MANUAL_COMPLETE",
    },
  });

  return NextResponse.json({ ok: true });
}
