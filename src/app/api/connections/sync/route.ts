import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { syncCalendarEvents } from "@/lib/google/calendar";
import { syncGmailThreads } from "@/lib/google/gmail";
import { detectFollowUpTasks } from "@/lib/followup/detect";
import {
  autoCompleteResolvedTasks,
  expireSnoozedTasks,
} from "@/lib/followup/autocomplete";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const result: Record<string, unknown> = {};

  try {
    result.calendarEvents = await syncCalendarEvents(userId);
  } catch (err) {
    result.calendarError = String(err);
  }

  try {
    result.gmailThreads = await syncGmailThreads(userId);
  } catch (err) {
    result.gmailError = String(err);
  }

  try {
    await expireSnoozedTasks(userId);
    await autoCompleteResolvedTasks(userId);
    result.detection = await detectFollowUpTasks(userId);
  } catch (err) {
    result.detectionError = String(err);
  }

  return NextResponse.json({ ok: true, ...result });
}
