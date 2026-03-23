import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncCalendarEvents } from "@/lib/google/calendar";
import { syncGmailThreads } from "@/lib/google/gmail";
import { detectFollowUpTasks } from "@/lib/followup/detect";
import {
  autoCompleteResolvedTasks,
  expireSnoozedTasks,
} from "@/lib/followup/autocomplete";

// Vercel Cron: configure in vercel.json to run every 3 hours
// Also callable via API key for manual triggers

export async function GET(req: NextRequest) {
  // Verify cron secret to prevent unauthorized calls
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: Record<string, unknown>[] = [];

  const users = await prisma.user.findMany({
    where: { connectedAccounts: { some: { provider: "google" } } },
    select: { id: true, email: true },
  });

  for (const user of users) {
    const userResult: Record<string, unknown> = { userId: user.id, email: user.email };

    try {
      userResult.calendarEvents = await syncCalendarEvents(user.id);
    } catch (err) {
      userResult.calendarError = String(err);
    }

    try {
      userResult.gmailThreads = await syncGmailThreads(user.id);
    } catch (err) {
      userResult.gmailError = String(err);
    }

    try {
      await expireSnoozedTasks(user.id);
      await autoCompleteResolvedTasks(user.id);
    } catch (err) {
      userResult.autocompleteError = String(err);
    }

    try {
      userResult.detection = await detectFollowUpTasks(user.id);
    } catch (err) {
      userResult.detectionError = String(err);
    }

    results.push(userResult);
  }

  return NextResponse.json({ ok: true, users: results.length, results });
}
