import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { addDays } from "@/lib/utils/date";

const DEFAULT_SNOOZE_DAYS = 3;

export async function GET(
  req: NextRequest,
  { params }: { params: { taskId: string } }
) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");
  const days = parseInt(searchParams.get("days") ?? "3", 10);

  let userId: string | null = null;

  if (token) {
    const task = await prisma.followUpTask.findUnique({
      where: { id: params.taskId },
      select: { userId: true },
    });
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

  const snoozedUntil = addDays(new Date(), days || DEFAULT_SNOOZE_DAYS);

  await prisma.followUpTask.update({
    where: { id: params.taskId },
    data: { status: "SNOOZED", snoozedUntil, updatedAt: new Date() },
  });

  await prisma.taskAction.create({
    data: {
      taskId: params.taskId,
      userId,
      action: "SNOOZE",
      metadataJson: { days: days || DEFAULT_SNOOZE_DAYS, snoozedUntil },
    },
  });

  const baseUrl = process.env.APP_BASE_URL ?? "";
  return NextResponse.redirect(
    new URL("/dashboard?snoozed=1", baseUrl || req.url)
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

  const body = await req.json().catch(() => ({}));
  const days = body.days ?? DEFAULT_SNOOZE_DAYS;
  const snoozedUntil = addDays(new Date(), days);

  const task = await prisma.followUpTask.findFirst({
    where: { id: params.taskId, userId: session.user.id },
  });

  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  await prisma.followUpTask.update({
    where: { id: params.taskId },
    data: { status: "SNOOZED", snoozedUntil, updatedAt: new Date() },
  });

  await prisma.taskAction.create({
    data: {
      taskId: params.taskId,
      userId: session.user.id,
      action: "SNOOZE",
      metadataJson: { days, snoozedUntil },
    },
  });

  return NextResponse.json({ ok: true, snoozedUntil });
}
