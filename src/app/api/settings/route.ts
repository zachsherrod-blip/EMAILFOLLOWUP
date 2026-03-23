import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const SettingsSchema = z.object({
  digestEmail: z.string().email().optional().nullable(),
  timezone: z.string().optional(),
  digestHour: z.number().min(0).max(23).optional(),
  digestMinute: z.number().min(0).max(59).optional(),
  internalDomains: z.array(z.string()).optional(),
  minimumPriorityScore: z.number().min(0).max(100).optional(),
  scanLookbackDays: z.number().min(1).max(30).optional(),
  businessHoursOnly: z.boolean().optional(),
  sendWeekdays: z.array(z.number().min(0).max(6)).optional(),
  autoCompleteOnReply: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      email: true,
      name: true,
      timezone: true,
      digestEmail: true,
      digestHour: true,
      digestMinute: true,
    },
  });

  const settings = await prisma.userSettings.findUnique({
    where: { userId: session.user.id },
  });

  return NextResponse.json({ user, settings });
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = SettingsSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid settings", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const {
    digestEmail,
    timezone,
    digestHour,
    digestMinute,
    internalDomains,
    minimumPriorityScore,
    scanLookbackDays,
    businessHoursOnly,
    sendWeekdays,
    autoCompleteOnReply,
  } = parsed.data;

  // Update User
  const userUpdate: Record<string, unknown> = {};
  if (digestEmail !== undefined) userUpdate.digestEmail = digestEmail;
  if (timezone !== undefined) userUpdate.timezone = timezone;
  if (digestHour !== undefined) userUpdate.digestHour = digestHour;
  if (digestMinute !== undefined) userUpdate.digestMinute = digestMinute;

  if (Object.keys(userUpdate).length > 0) {
    await prisma.user.update({
      where: { id: session.user.id },
      data: userUpdate,
    });
  }

  // Update UserSettings
  const settingsUpdate: Record<string, unknown> = {};
  if (internalDomains !== undefined)
    settingsUpdate.internalDomainsJson = internalDomains;
  if (minimumPriorityScore !== undefined)
    settingsUpdate.minimumPriorityScore = minimumPriorityScore;
  if (scanLookbackDays !== undefined)
    settingsUpdate.scanLookbackDays = scanLookbackDays;
  if (businessHoursOnly !== undefined)
    settingsUpdate.businessHoursOnly = businessHoursOnly;
  if (sendWeekdays !== undefined)
    settingsUpdate.sendWeekdaysJson = sendWeekdays;
  if (autoCompleteOnReply !== undefined)
    settingsUpdate.autoCompleteOnReply = autoCompleteOnReply;

  if (Object.keys(settingsUpdate).length > 0) {
    await prisma.userSettings.upsert({
      where: { userId: session.user.id },
      create: { userId: session.user.id, ...settingsUpdate },
      update: settingsUpdate,
    });
  }

  return NextResponse.json({ ok: true });
}
