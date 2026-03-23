import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SettingsForm } from "@/components/SettingsForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;

  const userId = session.user.id;

  const [user, settings] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        email: true,
        name: true,
        timezone: true,
        digestEmail: true,
        digestHour: true,
        digestMinute: true,
      },
    }),
    prisma.userSettings.findUnique({ where: { userId } }),
  ]);

  const defaultSettings = {
    digestEmail: user?.digestEmail ?? user?.email ?? "",
    timezone: user?.timezone ?? "America/New_York",
    digestHour: user?.digestHour ?? 16,
    digestMinute: user?.digestMinute ?? 0,
    internalDomains: (settings?.internalDomainsJson as string[]) ?? [],
    minimumPriorityScore: settings?.minimumPriorityScore ?? 30,
    scanLookbackDays: settings?.scanLookbackDays ?? 14,
    businessHoursOnly: settings?.businessHoursOnly ?? false,
    sendWeekdays: (settings?.sendWeekdaysJson as number[]) ?? [1, 2, 3, 4, 5],
    autoCompleteOnReply: settings?.autoCompleteOnReply ?? true,
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 tracking-tight mb-6">
        Settings
      </h1>
      <SettingsForm defaultValues={defaultSettings} />
    </div>
  );
}
