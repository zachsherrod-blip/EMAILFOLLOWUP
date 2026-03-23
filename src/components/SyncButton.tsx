"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SyncButton() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const router = useRouter();

  async function handleSync() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/connections/sync", { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        const created = data.detection?.created ?? 0;
        setResult(
          created > 0
            ? `Synced · ${created} new task${created === 1 ? "" : "s"}`
            : "Synced · no new tasks"
        );
        router.refresh();
      } else {
        setResult("Sync failed");
      }
    } catch {
      setResult("Error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {result && (
        <span className="text-xs text-slate-500">{result}</span>
      )}
      <button
        onClick={handleSync}
        disabled={loading}
        className="px-3 py-1.5 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-700 transition-colors disabled:opacity-50"
      >
        {loading ? "Syncing..." : "Sync Now"}
      </button>
    </div>
  );
}
