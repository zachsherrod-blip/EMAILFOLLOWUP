"use client";

import { useState } from "react";
import { formatDate } from "@/lib/utils/date";

interface Contact {
  email: string;
  name: string | null;
  company: string | null;
}

interface Task {
  id: string;
  title: string;
  rationale: string;
  shortPrompt: string;
  priorityScore: number;
  priorityLabel: string;
  status: string;
  sourceEvent?: {
    title: string;
    startAt: Date;
  } | null;
  sourceThread?: {
    subject: string | null;
    lastMessageAt: Date | null;
  } | null;
  createdAt: Date;
}

interface TaskCardProps {
  task: Task;
  contacts: Contact[];
}

export function TaskCard({ task, contacts }: TaskCardProps) {
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const nameList =
    contacts.map((c) => c.name ?? c.email).join(", ") || "Unknown";
  const emailList = contacts.map((c) => c.email).join(", ");
  const companies = [
    ...Array.from(new Set(contacts.map((c) => c.company).filter(Boolean) as string[])),
  ].join(", ");

  let sourceContext = "";
  if (task.sourceEvent) {
    sourceContext = `${task.sourceEvent.title} · ${formatDate(new Date(task.sourceEvent.startAt))}`;
  } else if (task.sourceThread) {
    sourceContext =
      task.sourceThread.subject ?? "Email thread";
    if (task.sourceThread.lastMessageAt) {
      sourceContext += ` · ${formatDate(new Date(task.sourceThread.lastMessageAt))}`;
    }
  }

  async function handleAction(action: "dismiss" | "snooze" | "complete") {
    setLoading(action);
    try {
      const res = await fetch(`/api/tasks/${task.id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: action === "snooze" ? JSON.stringify({ days: 3 }) : undefined,
      });
      if (res.ok) {
        setDismissed(true);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(null);
    }
  }

  async function copyPrompt() {
    await navigator.clipboard.writeText(task.shortPrompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
      {/* Contact header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <p className="font-semibold text-slate-900 text-sm truncate">
            {nameList}
          </p>
          <p className="text-xs text-slate-500 truncate">{emailList}</p>
          {companies && (
            <p className="text-xs text-slate-400">{companies}</p>
          )}
        </div>
        <span className="shrink-0 text-xs font-medium text-slate-400">
          #{task.priorityScore}
        </span>
      </div>

      {/* Context */}
      {sourceContext && (
        <p className="text-xs text-slate-500 mb-2">
          <span className="font-medium text-slate-700">Context:</span>{" "}
          {sourceContext}
        </p>
      )}

      {/* Rationale */}
      <p className="text-xs text-slate-600 mb-3">
        <span className="font-medium text-slate-700">Why now:</span>{" "}
        {task.rationale}
      </p>

      {/* Superhuman AI Prompt */}
      <div className="bg-slate-900 rounded-md p-3 mb-3">
        <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-1.5">
          Superhuman AI Prompt
        </p>
        <p className="text-xs text-slate-200 font-mono leading-relaxed">
          {task.shortPrompt}
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={copyPrompt}
          className="flex-1 px-3 py-1.5 bg-slate-900 text-white text-xs font-medium rounded hover:bg-slate-700 transition-colors"
        >
          {copied ? "Copied!" : "Copy Prompt"}
        </button>
        <button
          onClick={() => handleAction("complete")}
          disabled={loading !== null}
          className="px-3 py-1.5 bg-emerald-50 text-emerald-700 text-xs font-medium rounded hover:bg-emerald-100 transition-colors border border-emerald-200"
        >
          {loading === "complete" ? "..." : "Done"}
        </button>
        <button
          onClick={() => handleAction("snooze")}
          disabled={loading !== null}
          className="px-3 py-1.5 bg-amber-50 text-amber-700 text-xs font-medium rounded hover:bg-amber-100 transition-colors border border-amber-200"
        >
          {loading === "snooze" ? "..." : "Snooze 3d"}
        </button>
        <button
          onClick={() => handleAction("dismiss")}
          disabled={loading !== null}
          className="px-3 py-1.5 bg-slate-50 text-slate-500 text-xs font-medium rounded hover:bg-slate-100 transition-colors border border-slate-200"
        >
          {loading === "dismiss" ? "..." : "Dismiss"}
        </button>
      </div>
    </div>
  );
}
