"use client";

import { useState } from "react";

interface SettingsValues {
  digestEmail: string;
  timezone: string;
  digestHour: number;
  digestMinute: number;
  internalDomains: string[];
  minimumPriorityScore: number;
  scanLookbackDays: number;
  businessHoursOnly: boolean;
  sendWeekdays: number[];
  autoCompleteOnReply: boolean;
}

interface SettingsFormProps {
  defaultValues: SettingsValues;
}

const WEEKDAYS = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];

export function SettingsForm({ defaultValues }: SettingsFormProps) {
  const [values, setValues] = useState<SettingsValues>(defaultValues);
  const [domainInput, setDomainInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof SettingsValues>(key: K, value: SettingsValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  function addDomain() {
    const domain = domainInput.trim().toLowerCase().replace(/^@/, "");
    if (!domain || values.internalDomains.includes(domain)) return;
    set("internalDomains", [...values.internalDomains, domain]);
    setDomainInput("");
  }

  function removeDomain(domain: string) {
    set("internalDomains", values.internalDomains.filter((d) => d !== domain));
  }

  function toggleWeekday(day: number) {
    const days = values.sendWeekdays.includes(day)
      ? values.sendWeekdays.filter((d) => d !== day)
      : [...values.sendWeekdays, day].sort();
    set("sendWeekdays", days);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          digestEmail: values.digestEmail,
          timezone: values.timezone,
          digestHour: values.digestHour,
          digestMinute: values.digestMinute,
          internalDomains: values.internalDomains,
          minimumPriorityScore: values.minimumPriorityScore,
          scanLookbackDays: values.scanLookbackDays,
          businessHoursOnly: values.businessHoursOnly,
          sendWeekdays: values.sendWeekdays,
          autoCompleteOnReply: values.autoCompleteOnReply,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to save settings");
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch {
      setError("Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Digest email */}
      <section className="bg-white border border-slate-200 rounded-xl p-6">
        <h2 className="text-sm font-semibold text-slate-900 mb-4">Digest Email</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">
              Send digest to
            </label>
            <input
              type="email"
              value={values.digestEmail}
              onChange={(e) => set("digestEmail", e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
              placeholder="your@email.com"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                Digest hour (24h, local time)
              </label>
              <input
                type="number"
                min={0}
                max={23}
                value={values.digestHour}
                onChange={(e) => set("digestHour", parseInt(e.target.value, 10))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                Timezone
              </label>
              <input
                type="text"
                value={values.timezone}
                onChange={(e) => set("timezone", e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                placeholder="America/New_York"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-2">
              Send on these days
            </label>
            <div className="flex gap-1.5">
              {WEEKDAYS.map((day) => (
                <button
                  key={day.value}
                  type="button"
                  onClick={() => toggleWeekday(day.value)}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                    values.sendWeekdays.includes(day.value)
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                  }`}
                >
                  {day.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Internal domains */}
      <section className="bg-white border border-slate-200 rounded-xl p-6">
        <h2 className="text-sm font-semibold text-slate-900 mb-1">
          Internal Domains
        </h2>
        <p className="text-xs text-slate-500 mb-4">
          Meetings with only these domains are treated as internal and ignored.
        </p>

        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={domainInput}
            onChange={(e) => setDomainInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addDomain()}
            className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
            placeholder="yourcompany.com"
          />
          <button
            type="button"
            onClick={addDomain}
            className="px-3 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-700 transition-colors"
          >
            Add
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {values.internalDomains.map((domain) => (
            <span
              key={domain}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 rounded-full text-xs text-slate-700"
            >
              {domain}
              <button
                type="button"
                onClick={() => removeDomain(domain)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                ×
              </button>
            </span>
          ))}
          {values.internalDomains.length === 0 && (
            <p className="text-xs text-slate-400">No internal domains set.</p>
          )}
        </div>
      </section>

      {/* Detection settings */}
      <section className="bg-white border border-slate-200 rounded-xl p-6">
        <h2 className="text-sm font-semibold text-slate-900 mb-4">
          Detection Settings
        </h2>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                Scan lookback (days)
              </label>
              <input
                type="number"
                min={1}
                max={30}
                value={values.scanLookbackDays}
                onChange={(e) =>
                  set("scanLookbackDays", parseInt(e.target.value, 10))
                }
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                Minimum priority score (0–100)
              </label>
              <input
                type="number"
                min={0}
                max={100}
                value={values.minimumPriorityScore}
                onChange={(e) =>
                  set("minimumPriorityScore", parseInt(e.target.value, 10))
                }
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="autoComplete"
              checked={values.autoCompleteOnReply}
              onChange={(e) => set("autoCompleteOnReply", e.target.checked)}
              className="rounded"
            />
            <label htmlFor="autoComplete" className="text-sm text-slate-700">
              Auto-complete tasks when I reply to the attendee
            </label>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="businessHours"
              checked={values.businessHoursOnly}
              onChange={(e) => set("businessHoursOnly", e.target.checked)}
              className="rounded"
            />
            <label htmlFor="businessHours" className="text-sm text-slate-700">
              Only consider events during business hours
            </label>
          </div>
        </div>
      </section>

      {/* Save */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-700 transition-colors disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Settings"}
        </button>
        {saved && (
          <span className="text-xs text-emerald-600 font-medium">Saved!</span>
        )}
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
    </div>
  );
}
