import { google, calendar_v3 } from "googleapis";
import { getGoogleClient } from "./client";
import { prisma } from "@/lib/prisma";
import { subDays, addDays } from "@/lib/utils/date";

export interface CalendarAttendee {
  email: string;
  displayName?: string;
  responseStatus?: string;
  organizer?: boolean;
  self?: boolean;
}

const PERSONAL_EVENT_KEYWORDS = [
  "birthday",
  "anniversary",
  "vacation",
  "holiday",
  "personal",
  "doctor",
  "dentist",
  "gym",
  "lunch",
  "dinner",
  "family",
  "haircut",
  "vet",
  "wedding",
  "party",
];

const INTERNAL_STANDUP_PATTERNS = [
  /standup/i,
  /stand-up/i,
  /stand up/i,
  /daily sync/i,
  /team sync/i,
  /scrum/i,
  /retro/i,
  /sprint/i,
  /1:1 with/i,
  /weekly team/i,
];

const BUSINESS_KEYWORDS = [
  "demo",
  "sales",
  "partner",
  "customer",
  "client",
  "pitch",
  "follow",
  "onboard",
  "review",
  "strategy",
  "roadmap",
  "kickoff",
  "check-in",
  "intro",
  "introduction",
  "discovery",
  "proposal",
  "negotiat",
  "contract",
  "recruit",
  "interview",
  "investor",
  "revenue",
  "deal",
  "enterprise",
  "integration",
  "partnership",
  "incrementality",
  "measurement",
  "attribution",
  "discussion",
  "meeting",
  "call",
  "sync",
];

export function isPersonalEvent(title: string, description?: string | null): boolean {
  const text = `${title} ${description ?? ""}`.toLowerCase();
  return PERSONAL_EVENT_KEYWORDS.some((kw) => text.includes(kw));
}

export function isInternalStandup(title: string): boolean {
  return INTERNAL_STANDUP_PATTERNS.some((p) => p.test(title));
}

export function isBusinessRelevant(title: string, description?: string | null): boolean {
  if (isPersonalEvent(title, description)) return false;
  if (isInternalStandup(title)) return false;
  const text = `${title} ${description ?? ""}`.toLowerCase();
  return BUSINESS_KEYWORDS.some((kw) => text.includes(kw));
}

export function getInternalDomains(settings: { internalDomainsJson: unknown }): string[] {
  const domains = settings.internalDomainsJson as string[];
  return Array.isArray(domains) ? domains : [];
}

export function isInternalEmail(email: string, internalDomains: string[]): boolean {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return false;
  return internalDomains.some((d) => d.toLowerCase() === domain);
}

export async function syncCalendarEvents(userId: string): Promise<number> {
  const auth = await getGoogleClient(userId);
  const calendar = google.calendar({ version: "v3", auth });

  const settings = await prisma.userSettings.findUnique({ where: { userId } });
  const lookbackDays = settings?.scanLookbackDays ?? 14;
  const internalDomains = getInternalDomains(
    settings ?? { internalDomainsJson: [] }
  );

  const timeMin = subDays(new Date(), lookbackDays).toISOString();
  const timeMax = addDays(new Date(), 3).toISOString();

  let pageToken: string | undefined;
  let syncCount = 0;

  do {
    const response = await calendar.events.list({
      calendarId: "primary",
      timeMin,
      timeMax,
      maxResults: 250,
      singleEvents: true,
      orderBy: "startTime",
      pageToken,
    });

    const events = response.data.items ?? [];

    for (const event of events) {
      if (!event.id || !event.summary) continue;
      if (event.status === "cancelled") continue;

      const startAt = event.start?.dateTime
        ? new Date(event.start.dateTime)
        : event.start?.date
        ? new Date(event.start.date)
        : null;
      const endAt = event.end?.dateTime
        ? new Date(event.end.dateTime)
        : event.end?.date
        ? new Date(event.end.date)
        : null;

      if (!startAt || !endAt) continue;

      const attendees: CalendarAttendee[] = (event.attendees ?? []).map((a) => ({
        email: a.email ?? "",
        displayName: a.displayName ?? undefined,
        responseStatus: a.responseStatus ?? undefined,
        organizer: a.organizer ?? false,
        self: a.self ?? false,
      })).filter((a) => a.email);

      const externalAttendees = attendees.filter(
        (a) => !a.self && !isInternalEmail(a.email, internalDomains)
      );
      const hasExternalAttendees = externalAttendees.length > 0;

      const businessRelevant = isBusinessRelevant(
        event.summary,
        event.description
      );

      await prisma.calendarEvent.upsert({
        where: { userId_googleEventId: { userId, googleEventId: event.id } },
        create: {
          userId,
          googleEventId: event.id,
          title: event.summary,
          description: event.description ?? null,
          startAt,
          endAt,
          organizerEmail: event.organizer?.email ?? null,
          attendeesJson: attendees as unknown as import("@prisma/client").Prisma.InputJsonValue,
          hasExternalAttendees,
          isBusinessRelevant: businessRelevant,
        },
        update: {
          title: event.summary,
          description: event.description ?? null,
          startAt,
          endAt,
          organizerEmail: event.organizer?.email ?? null,
          attendeesJson: attendees as unknown as import("@prisma/client").Prisma.InputJsonValue,
          hasExternalAttendees,
          isBusinessRelevant: businessRelevant,
          updatedAt: new Date(),
        },
      });

      syncCount++;
    }

    pageToken = response.data.nextPageToken ?? undefined;
  } while (pageToken);

  return syncCount;
}
