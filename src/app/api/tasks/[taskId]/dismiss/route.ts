import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  req: NextRequest,
  { params }: { params: { taskId: string } }
) {
  // Support both authenticated requests and token-based requests from email links
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");

  let userId: string | null = null;

  if (token) {
    // Validate dismiss token
    const task = await prisma.followUpTask.findUnique({
      where: { id: params.taskId },
      select: { userId: true, id: true },
    });
    // For simplicity in MVP: the task ID itself acts as a token
    // In production, use signed URLs with expiry
    if (task) userId = task.userId;
  } else {
    const session = await getServerSession(authOptions);
    if (session?.user?.id) userId = session.user.id;
  }

  if (!userId) {
    return NextResponse.redirect(new URL("/auth/signin", req.url));
  }

  const task = await prisma.followUpTask.findFirst({
    where: { id: params.taskId, userId },
  });

  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  if (task.status === "DISMISSED") {
    // Already dismissed — redirect to dashboard
    const baseUrl = process.env.APP_BASE_URL ?? "";
    return NextResponse.redirect(new URL("/dashboard", baseUrl || req.url));
  }

  await prisma.followUpTask.update({
    where: { id: params.taskId },
    data: { status: "DISMISSED", updatedAt: new Date() },
  });

  await prisma.taskAction.create({
    data: {
      taskId: params.taskId,
      userId,
      action: "DISMISS",
    },
  });

  const baseUrl = process.env.APP_BASE_URL ?? "";
  return NextResponse.redirect(
    new URL("/dashboard?dismissed=1", baseUrl || req.url)
  );
}

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
    data: { status: "DISMISSED", updatedAt: new Date() },
  });

  await prisma.taskAction.create({
    data: {
      taskId: params.taskId,
      userId: session.user.id,
      action: "DISMISS",
    },
  });

  return NextResponse.json({ ok: true });
}
