import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function HomePage() {
  const session = await getServerSession(authOptions);

  if (session) {
    redirect("/dashboard");
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-900">
      <div className="max-w-md w-full px-6 py-12 text-center">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white tracking-tight mb-3">
            Follow-Up Queue
          </h1>
          <p className="text-slate-400 text-base leading-relaxed">
            Every day at 4 PM, get a clean list of the people you owe a follow-up —
            with a short prompt you can paste directly into Superhuman AI.
          </p>
        </div>

        <div className="space-y-3 mb-8 text-left">
          {[
            "Scans your Google Calendar for recent external meetings",
            "Checks Gmail to see if you already followed up",
            "Surfaces only the tasks you actually owe",
            "Generates a copy-paste Superhuman AI prompt for each one",
          ].map((item, i) => (
            <div key={i} className="flex items-start gap-3 text-sm text-slate-300">
              <span className="text-emerald-400 mt-0.5">✓</span>
              <span>{item}</span>
            </div>
          ))}
        </div>

        <Link
          href="/auth/signin"
          className="inline-flex items-center justify-center gap-3 w-full px-6 py-3 bg-white text-slate-900 font-semibold rounded-lg hover:bg-slate-100 transition-colors text-sm"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          Sign in with Google
        </Link>

        <p className="mt-6 text-xs text-slate-500">
          Requires Gmail and Google Calendar read access.
          No emails are auto-sent. Read-only access only.
        </p>
      </div>
    </main>
  );
}
