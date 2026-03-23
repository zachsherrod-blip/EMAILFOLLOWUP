import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SyncButton } from "@/components/SyncButton";

export const dynamic = "force-dynamic";

export default async function ConnectionsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;

  const userId = session.user.id;

  const [connectedAccount, eventCount, threadCount] = await Promise.all([
    prisma.connectedAccount.findUnique({
      where: { userId_provider: { userId, provider: "google" } },
    }),
    prisma.calendarEvent.count({ where: { userId } }),
    prisma.emailThread.count({ where: { userId } }),
  ]);

  const isExpired =
    connectedAccount?.expiresAt &&
    new Date(connectedAccount.expiresAt) < new Date();

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 tracking-tight mb-6">
        Connections
      </h1>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-slate-100 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">Google</p>
                <p className="text-xs text-slate-500">
                  {connectedAccount?.email ?? "Not connected"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {connectedAccount ? (
                <>
                  {isExpired ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700">
                      Token expired — re-sign in
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-700">
                      Connected
                    </span>
                  )}
                </>
              ) : (
                <a
                  href="/auth/signin"
                  className="px-3 py-1.5 bg-slate-900 text-white text-xs font-medium rounded hover:bg-slate-700 transition-colors"
                >
                  Connect
                </a>
              )}
            </div>
          </div>
        </div>

        {connectedAccount && (
          <div className="px-6 py-4 bg-slate-50">
            <div className="grid grid-cols-2 gap-4 text-sm mb-4">
              <div>
                <p className="text-xs text-slate-400 mb-0.5">Scopes</p>
                <p className="text-slate-700 text-xs leading-relaxed">
                  Gmail (read-only) · Calendar (read-only)
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-400 mb-0.5">Last synced</p>
                <p className="text-slate-700 text-xs">
                  {new Date(connectedAccount.updatedAt).toLocaleDateString(
                    "en-US",
                    { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }
                  )}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm mb-4">
              <div>
                <p className="text-xs text-slate-400 mb-0.5">Calendar events synced</p>
                <p className="text-lg font-bold text-slate-900">{eventCount}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 mb-0.5">Email threads synced</p>
                <p className="text-lg font-bold text-slate-900">{threadCount}</p>
              </div>
            </div>

            <SyncButton />
          </div>
        )}
      </div>

      <div className="mt-6 p-4 bg-blue-50 border border-blue-100 rounded-lg text-sm text-blue-700">
        <p className="font-medium mb-1">Read-only access</p>
        <p className="text-xs leading-relaxed">
          This app only reads your Gmail and Google Calendar. It never sends emails,
          modifies calendar events, or stores email bodies — only metadata and snippets.
        </p>
      </div>
    </div>
  );
}
