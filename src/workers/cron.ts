/**
 * Standalone cron worker — run with: npm run worker
 * Uses node-cron to schedule both the sync job and the digest job.
 *
 * For Vercel deployments, use the API route cron endpoints instead:
 * - /api/cron/sync  (called every few hours)
 * - /api/cron/digest (called every 15 minutes, but only sends if it's digest time)
 */
import cron from "node-cron";
import { prisma } from "@/lib/prisma";
import { syncCalendarEvents } from "@/lib/google/calendar";
import { syncGmailThreads } from "@/lib/google/gmail";
import { detectFollowUpTasks } from "@/lib/followup/detect";
import {
  autoCompleteResolvedTasks,
  expireSnoozedTasks,
} from "@/lib/followup/autocomplete";
import { sendDailyDigest } from "@/lib/email/digest";

async function runSyncJob(): Promise<void> {
  console.log(`[sync] Starting sync job at ${new Date().toISOString()}`);

  const users = await prisma.user.findMany({
    where: { connectedAccounts: { some: { provider: "google" } } },
    select: { id: true, email: true },
  });

  for (const user of users) {
    console.log(`[sync] Syncing user ${user.email}`);

    try {
      const calCount = await syncCalendarEvents(user.id);
      console.log(`[sync] ${user.email}: synced ${calCount} calendar events`);
    } catch (err) {
      console.error(`[sync] Failed to sync calendar for ${user.email}:`, err);
    }

    try {
      const gmailCount = await syncGmailThreads(user.id);
      console.log(`[sync] ${user.email}: synced ${gmailCount} gmail threads`);
    } catch (err) {
      console.error(`[sync] Failed to sync gmail for ${user.email}:`, err);
    }

    try {
      await expireSnoozedTasks(user.id);
    } catch (err) {
      console.error(`[sync] Failed to expire snoozed tasks for ${user.email}:`, err);
    }

    try {
      await autoCompleteResolvedTasks(user.id);
    } catch (err) {
      console.error(`[sync] Failed to auto-complete tasks for ${user.email}:`, err);
    }

    try {
      const result = await detectFollowUpTasks(user.id);
      console.log(
        `[sync] ${user.email}: detection created=${result.created} skipped=${result.skipped} errors=${result.errors}`
      );
    } catch (err) {
      console.error(`[sync] Failed to detect follow-ups for ${user.email}:`, err);
    }
  }

  console.log(`[sync] Sync job complete at ${new Date().toISOString()}`);
}

async function runDigestJob(): Promise<void> {
  console.log(`[digest] Checking digest eligibility at ${new Date().toISOString()}`);

  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const currentDay = now.getDay(); // 0=Sun, 1=Mon...

  const users = await prisma.user.findMany({
    where: { connectedAccounts: { some: { provider: "google" } } },
    include: { settings: true },
  });

  for (const user of users) {
    const settings = user.settings;
    const digestHour = user.digestHour ?? 16;
    const digestMinute = user.digestMinute ?? 0;
    const sendDays = (settings?.sendWeekdaysJson as number[]) ?? [1, 2, 3, 4, 5];

    // Check if this is the right time for this user's digest
    if (!sendDays.includes(currentDay)) continue;
    if (currentHour !== digestHour) continue;
    if (Math.abs(currentMinute - digestMinute) > 7) continue; // 15-min window

    // Avoid duplicate sends: check if we already sent a digest today
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);

    const existingRun = await prisma.digestRun.findFirst({
      where: {
        userId: user.id,
        sentAt: { gte: today },
      },
    });

    if (existingRun) {
      console.log(`[digest] Already sent digest for ${user.email} today, skipping`);
      continue;
    }

    console.log(`[digest] Sending digest for ${user.email}`);
    try {
      await sendDailyDigest(user.id);
    } catch (err) {
      console.error(`[digest] Failed to send digest for ${user.email}:`, err);
    }
  }
}

// Sync every 3 hours
cron.schedule("0 */3 * * *", async () => {
  await runSyncJob();
});

// Check digest every 15 minutes (actual send happens only at the configured hour)
cron.schedule("*/15 * * * *", async () => {
  await runDigestJob();
});

console.log("Follow-Up Queue worker started.");
console.log("  - Sync job: every 3 hours");
console.log("  - Digest job: checked every 15 minutes");

// Run sync immediately on startup
runSyncJob().catch(console.error);
