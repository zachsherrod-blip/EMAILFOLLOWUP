"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

interface NavProps {
  user: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
}

const NAV_ITEMS = [
  { href: "/dashboard", label: "Today" },
  { href: "/dashboard/tasks", label: "All Tasks" },
  { href: "/dashboard/connections", label: "Connections" },
  { href: "/dashboard/settings", label: "Settings" },
];

export function DashboardNav({ user }: NavProps) {
  const pathname = usePathname();

  return (
    <nav className="bg-slate-900 border-b border-slate-800">
      <div className="max-w-4xl mx-auto px-4">
        <div className="flex items-center justify-between h-14">
          <div className="flex items-center gap-6">
            <Link
              href="/dashboard"
              className="text-sm font-bold text-white tracking-tight"
            >
              Follow-Up Queue
            </Link>
            <div className="flex items-center gap-1">
              {NAV_ITEMS.map((item) => {
                const isActive =
                  item.href === "/dashboard"
                    ? pathname === "/dashboard"
                    : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                      isActive
                        ? "bg-slate-700 text-white"
                        : "text-slate-400 hover:text-white hover:bg-slate-800"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400 hidden sm:block">
              {user.email}
            </span>
            <button
              onClick={() => signOut({ callbackUrl: "/" })}
              className="text-xs text-slate-400 hover:text-white transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
