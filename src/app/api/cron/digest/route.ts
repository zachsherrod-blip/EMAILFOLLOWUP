import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendDailyDigest } from "@/lib/email/digest";

// Vercel Cron: configure in vercel.json to run every 15 minutes
// The route self-gates: it only sends if it's digest time for a user and they haven't received one today

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const currentHour = now.getUTCHours(); // Note: adjust for user timezone in production
  const currentMinute = now.getUTCMinutes();
  const currentDay = now.getUTCDay();

  const users = await prisma.user.findMany({
    where: { connectedAccounts: { some: { provider: "google" } } },
    include: { settings: true },
  });

  const sent: string[] = [];
  const skipped: string[] = [];

  for (const user of users) {
    const settings = user.settings;
    const digestHour = user.digestHour ?? 16;
    const digestMinute = user.digestMinute ?? 0;
    const sendDays = (settings?.sendWeekdaysJson as number[]) ?? [1, 2, 3, 4, 5];

    // TODO: Convert UTC to user's timezone for accurate scheduling
    // For now, uses UTC. Users should set digestHour in UTC.
    if (!sendDays.includes(currentDay)) {
      skipped.push(user.email);
      continue;
    }

    if (currentHour !== digestHour) {
      skipped.push(user.email);
      continue;
    }

    if (Math.abs(currentMinute - digestMinute) > 7) {
      skipped.push(user.email);
      continue;
    }

    // Avoid duplicate sends
    const today = new Date(now);
    today.setUTCHours(0, 0, 0, 0);

    const existingRun = await prisma.digestRun.findFirst({
      where: { userId: user.id, sentAt: { gte: today } },
    });

    if (existingRun) {
      skipped.push(user.email);
      continue;
    }

    try {
      await sendDailyDigest(user.id);
      sent.push(user.email);
    } catch (err) {
      console.error(`Digest send failed for ${user.email}:`, err);
      skipped.push(user.email);
    }
  }

  return NextResponse.json({ ok: true, sent, skipped });
}
