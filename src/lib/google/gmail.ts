import { google } from "googleapis";
import { getGoogleClient } from "./client";
import { prisma } from "@/lib/prisma";
import { subDays } from "@/lib/utils/date";

export interface ParsedMessage {
  id: string;
  threadId: string;
  from: string;
  to: string[];
  cc: string[];
  subject: string;
  date: Date;
  snippet: string;
  isOutbound: boolean; // sent by the authenticated user
}

function parseEmailAddresses(header: string): string[] {
  if (!header) return [];
  // Match email addresses from headers like "Name <email@domain.com>" or "email@domain.com"
  const matches = header.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g);
  return matches ? Array.from(new Set(matches.map((e) => e.toLowerCase()))) : [];
}

function getHeader(headers: { name?: string | null; value?: string | null }[], name: string): string {
  return headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
}

export async function syncGmailThreads(userId: string): Promise<number> {
  const auth = await getGoogleClient(userId);
  const gmail = google.gmail({ version: "v1", auth });

  // Get the authenticated user's email
  const profile = await gmail.users.getProfile({ userId: "me" });
  const myEmail = profile.data.emailAddress?.toLowerCase() ?? "";

  const lookbackDays = 21; // Slightly wider than calendar lookback
  const afterDate = subDays(new Date(), lookbackDays);
  const query = `after:${Math.floor(afterDate.getTime() / 1000)} -category:promotions -category:social -category:updates`;

  let pageToken: string | undefined;
  let syncCount = 0;
  const maxThreads = 200; // Cap for MVP

  do {
    const listRes = await gmail.users.threads.list({
      userId: "me",
      q: query,
      maxResults: 50,
      pageToken,
    });

    const threads = listRes.data.threads ?? [];

    for (const threadMeta of threads) {
      if (!threadMeta.id) continue;

      try {
        await syncThread(gmail, userId, myEmail, threadMeta.id);
        syncCount++;
      } catch (err) {
        console.warn(`Failed to sync thread ${threadMeta.id}:`, err);
      }

      if (syncCount >= maxThreads) break;
    }

    pageToken = listRes.data.nextPageToken ?? undefined;
    if (syncCount >= maxThreads) break;
  } while (pageToken);

  return syncCount;
}

async function syncThread(
  gmail: ReturnType<typeof google.gmail>,
  userId: string,
  myEmail: string,
  gmailThreadId: string
): Promise<void> {
  const threadRes = await gmail.users.threads.get({
    userId: "me",
    id: gmailThreadId,
    format: "metadata",
    metadataHeaders: ["From", "To", "Cc", "Subject", "Date"],
  });

  const messages = threadRes.data.messages ?? [];
  if (messages.length === 0) return;

  // Collect all participants
  const participantSet = new Set<string>();
  let subject = "";
  let lastMessageAt: Date | null = null;
  let snippet = threadRes.data.snippet ?? "";

  const parsedMessages: Array<{
    gmailMessageId: string;
    from: string;
    to: string[];
    cc: string[];
    subject: string;
    sentAt: Date;
    isOutbound: boolean;
    snippet: string;
  }> = [];

  for (const msg of messages) {
    if (!msg.id || !msg.payload?.headers) continue;

    const headers = msg.payload.headers;
    const from = getHeader(headers, "from");
    const to = getHeader(headers, "to");
    const cc = getHeader(headers, "cc");
    const dateStr = getHeader(headers, "date");
    const subjectStr = getHeader(headers, "subject");

    if (!subject && subjectStr) subject = subjectStr;

    const fromEmails = parseEmailAddresses(from);
    const toEmails = parseEmailAddresses(to);
    const ccEmails = parseEmailAddresses(cc);

    fromEmails.forEach((e) => participantSet.add(e));
    toEmails.forEach((e) => participantSet.add(e));
    ccEmails.forEach((e) => participantSet.add(e));

    const sentAt = dateStr ? new Date(dateStr) : new Date();
    if (!lastMessageAt || sentAt > lastMessageAt) {
      lastMessageAt = sentAt;
    }

    const fromEmail = fromEmails[0] ?? "";
    const isOutbound = fromEmail === myEmail;

    parsedMessages.push({
      gmailMessageId: msg.id,
      from: fromEmail,
      to: toEmails,
      cc: ccEmails,
      subject: subjectStr,
      sentAt,
      isOutbound,
      snippet: msg.snippet ?? "",
    });
  }

  const participants = Array.from(participantSet);

  // Upsert EmailThread
  const thread = await prisma.emailThread.upsert({
    where: { userId_gmailThreadId: { userId, gmailThreadId } },
    create: {
      userId,
      gmailThreadId,
      subject: subject || null,
      participantsJson: participants,
      lastMessageAt,
      snippet,
    },
    update: {
      subject: subject || null,
      participantsJson: participants,
      lastMessageAt,
      snippet,
      updatedAt: new Date(),
    },
  });

  // Upsert each message
  for (const msg of parsedMessages) {
    await prisma.emailMessage.upsert({
      where: { userId_gmailMessageId: { userId, gmailMessageId: msg.gmailMessageId } },
      create: {
        userId,
        threadId: thread.id,
        gmailMessageId: msg.gmailMessageId,
        sentAt: msg.sentAt,
        fromEmail: msg.from,
        toJson: msg.to,
        ccJson: msg.cc,
        direction: msg.isOutbound ? "OUTBOUND" : "INBOUND",
        bodySnippet: msg.snippet,
      },
      update: {
        sentAt: msg.sentAt,
        fromEmail: msg.from,
        toJson: msg.to,
        ccJson: msg.cc,
        direction: msg.isOutbound ? "OUTBOUND" : "INBOUND",
        bodySnippet: msg.snippet,
      },
    });
  }
}

/**
 * Check whether the user has sent any outbound email to a set of external addresses
 * after a given date.
 */
export async function hasOutboundEmailAfter(
  userId: string,
  externalEmails: string[],
  afterDate: Date
): Promise<boolean> {
  if (externalEmails.length === 0) return false;

  // Find outbound messages sent after the date
  const outboundMessages = await prisma.emailMessage.findMany({
    where: {
      userId,
      direction: "OUTBOUND",
      sentAt: { gt: afterDate },
    },
    select: {
      toJson: true,
      ccJson: true,
    },
  });

  const lowerEmails = externalEmails.map((e) => e.toLowerCase());

  for (const msg of outboundMessages) {
    const to = (msg.toJson as string[]).map((e) => e.toLowerCase());
    const cc = (msg.ccJson as string[]).map((e) => e.toLowerCase());
    const recipients = [...to, ...cc];

    if (lowerEmails.some((email) => recipients.includes(email))) {
      return true;
    }
  }

  return false;
}
