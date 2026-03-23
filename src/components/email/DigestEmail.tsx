import {
  Html,
  Head,
  Preview,
  Body,
  Container,
  Section,
  Text,
  Hr,
  Link,
} from "@react-email/components";

// ── Data shapes ───────────────────────────────────────────────────────────────

export interface PriorityItem {
  area: string;          // Platform / Agency / Deals / Customer / Growth
  account: string;
  whatNeedsToHappen: string;
  whyItMatters: string;
  nextActions: [string, string];
}

export interface FollowUpItem {
  number: number;
  account: string;
  contact: string;
  source: "Calendar" | "Gmail" | "Slack" | "Gong";
  priority: "HIGH" | "MEDIUM" | "LOW";
  action: string;         // one-line required action
  shortPrompt: string;    // ≤50 word Superhuman AI prompt
  dismissUrl: string;
  snoozeUrl: string;
}

export interface DigestEmailProps {
  userName: string;
  date: string;
  priorities: PriorityItem[];
  mustFollowUp: FollowUpItem[];
  shouldFollowUp: FollowUpItem[];
  dashboardUrl: string;
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const font = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

const PRIORITY_DOT: Record<FollowUpItem["priority"], string> = {
  HIGH: "#dc2626",
  MEDIUM: "#d97706",
  LOW: "#6b7280",
};

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionHeader({ emoji, title, subtitle }: { emoji: string; title: string; subtitle?: string }) {
  return (
    <Section style={{ marginBottom: "16px", paddingBottom: "10px", borderBottom: "2px solid #0f172a" }}>
      <Text style={{ margin: 0, fontSize: "16px", fontWeight: "700", color: "#0f172a", letterSpacing: "-0.01em" }}>
        {emoji} {title}
      </Text>
      {subtitle && (
        <Text style={{ margin: "3px 0 0", fontSize: "12px", color: "#94a3b8" }}>
          {subtitle}
        </Text>
      )}
    </Section>
  );
}

function PriorityCard({ item }: { item: PriorityItem }) {
  return (
    <Section style={{ marginBottom: "14px", padding: "14px 16px", backgroundColor: "#f8fafc", borderRadius: "6px", borderLeft: "3px solid #0f172a" }}>
      <Text style={{ margin: "0 0 2px", fontSize: "10px", fontWeight: "700", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>
        {item.area}
      </Text>
      <Text style={{ margin: "0 0 8px", fontSize: "15px", fontWeight: "700", color: "#0f172a" }}>
        {item.account}
      </Text>
      <Text style={{ margin: "0 0 4px", fontSize: "13px", color: "#1e293b", lineHeight: "1.5" }}>
        <span style={{ fontWeight: "600" }}>What needs to happen: </span>{item.whatNeedsToHappen}
      </Text>
      <Text style={{ margin: "0 0 10px", fontSize: "12px", color: "#64748b", lineHeight: "1.4" }}>
        <span style={{ fontWeight: "600" }}>Why it matters: </span>{item.whyItMatters}
      </Text>
      <Text style={{ margin: "0 0 3px", fontSize: "11px", fontWeight: "600", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em" }}>
        Next actions
      </Text>
      <Text style={{ margin: "0 0 2px", fontSize: "12px", color: "#374151", lineHeight: "1.5" }}>
        → {item.nextActions[0]}
      </Text>
      <Text style={{ margin: "0", fontSize: "12px", color: "#374151", lineHeight: "1.5" }}>
        → {item.nextActions[1]}
      </Text>
    </Section>
  );
}

function FollowUpCard({ item }: { item: FollowUpItem }) {
  return (
    <Section style={{ marginBottom: "12px", padding: "12px 14px", backgroundColor: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "6px" }}>
      {/* Row 1: number, account, contact, source, priority */}
      <Text style={{ margin: "0 0 6px", fontSize: "13px", fontWeight: "600", color: "#0f172a", lineHeight: "1.3" }}>
        [{item.number}]{"  "}{item.account}
        <span style={{ fontWeight: "400", color: "#64748b" }}>{" — "}{item.contact}</span>
      </Text>
      <Text style={{ margin: "0 0 8px", fontSize: "11px", color: "#94a3b8" }}>
        Source: {item.source}{"  ·  "}
        <span style={{ color: PRIORITY_DOT[item.priority], fontWeight: "600" }}>
          {item.priority}
        </span>
      </Text>

      {/* Action */}
      <Text style={{ margin: "0 0 8px", fontSize: "13px", color: "#374151", lineHeight: "1.5" }}>
        <span style={{ fontWeight: "600" }}>→ </span>{item.action}
      </Text>

      {/* Superhuman prompt */}
      <Section style={{ backgroundColor: "#0f172a", padding: "8px 12px", borderRadius: "4px", margin: "0 0 8px" }}>
        <Text style={{ margin: "0 0 3px", fontSize: "10px", color: "#475569", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          ✉ Prompt
        </Text>
        <Text style={{ margin: 0, fontSize: "12px", color: "#e2e8f0", lineHeight: "1.5", fontFamily: "monospace" }}>
          {item.shortPrompt}
        </Text>
      </Section>

      {/* Actions */}
      <Text style={{ margin: 0, fontSize: "11px", color: "#94a3b8" }}>
        <Link href={item.dismissUrl} style={{ color: "#64748b", textDecoration: "underline" }}>Dismiss</Link>
        {" · "}
        <Link href={item.snoozeUrl} style={{ color: "#64748b", textDecoration: "underline" }}>Snooze 3d</Link>
      </Text>
    </Section>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <Text style={{ margin: "0 0 16px", fontSize: "13px", color: "#94a3b8", fontStyle: "italic" }}>
      {message}
    </Text>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function DigestEmail({
  userName,
  date,
  priorities,
  mustFollowUp,
  shouldFollowUp,
  dashboardUrl,
}: DigestEmailProps) {
  const total = mustFollowUp.length + shouldFollowUp.length;
  const firstName = userName?.split(" ")[0] ?? "there";

  const preview =
    total === 0
      ? "All clear — no open follow-ups today."
      : mustFollowUp.length > 0
      ? `${mustFollowUp.length} must-send today · ${priorities.length} priorities this week`
      : `${total} follow-ups · ${priorities.length} priorities this week`;

  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: "#f1f5f9", fontFamily: font }}>
        <Container style={{ maxWidth: "620px", margin: "0 auto", padding: "28px 16px" }}>

          {/* ── Header ─────────────────────────────────────────────────── */}
          <Section style={{ backgroundColor: "#0f172a", padding: "20px 24px", borderRadius: "8px 8px 0 0" }}>
            <Text style={{ margin: "0 0 2px", fontSize: "13px", fontWeight: "700", color: "#38bdf8", textTransform: "uppercase", letterSpacing: "0.1em" }}>
              Growth OS
            </Text>
            <Text style={{ margin: "0 0 2px", fontSize: "20px", fontWeight: "800", color: "#f8fafc", letterSpacing: "-0.02em" }}>
              Daily Execution Brief
            </Text>
            <Text style={{ margin: 0, fontSize: "12px", color: "#64748b" }}>
              {date} · {firstName} ·{" "}
              {total === 0
                ? "All clear"
                : `${total} action${total === 1 ? "" : "s"} · ${priorities.length} priorit${priorities.length === 1 ? "y" : "ies"}`}
            </Text>
          </Section>

          {/* ── Body ───────────────────────────────────────────────────── */}
          <Section style={{ backgroundColor: "#ffffff", padding: "24px 24px", borderRadius: "0 0 8px 8px" }}>

            {total === 0 ? (
              <Text style={{ color: "#374151", fontSize: "14px", textAlign: "center", padding: "24px 0" }}>
                You&apos;re all caught up. No open follow-ups today.
              </Text>
            ) : (
              <>
                {/* ── Section 1: Biggest Priorities ──────────────────── */}
                <Section style={{ marginBottom: "28px" }}>
                  <SectionHeader
                    emoji="🚨"
                    title="Biggest Priorities This Week"
                    subtitle={`Top ${priorities.length} account${priorities.length === 1 ? "" : "s"} by urgency score`}
                  />
                  {priorities.length === 0 ? (
                    <EmptyState message="No account-level priorities detected." />
                  ) : (
                    priorities.map((item, i) => <PriorityCard key={i} item={item} />)
                  )}
                </Section>

                {/* ── Section 2: Must Follow Up ──────────────────────── */}
                <Section style={{ marginBottom: "28px" }}>
                  <SectionHeader
                    emoji="🔥"
                    title="Must Follow Up Today"
                    subtitle="Call follow-ups ≤2 days old · High-signal items · Copy prompt → paste into Superhuman AI"
                  />
                  {mustFollowUp.length === 0 ? (
                    <EmptyState message="No urgent follow-ups required today." />
                  ) : (
                    mustFollowUp.map((item) => <FollowUpCard key={item.number} item={item} />)
                  )}
                </Section>

                {/* ── Section 3: Other Follow Ups ────────────────────── */}
                {shouldFollowUp.length > 0 && (
                  <Section style={{ marginBottom: "20px" }}>
                    <SectionHeader
                      emoji="⏳"
                      title="Other Follow Ups"
                      subtitle="Worth sending when you have a moment"
                    />
                    {shouldFollowUp.map((item) => <FollowUpCard key={item.number} item={item} />)}
                  </Section>
                )}
              </>
            )}

            <Hr style={{ borderColor: "#e2e8f0", margin: "20px 0 14px" }} />
            <Text style={{ margin: 0, fontSize: "11px", color: "#94a3b8", textAlign: "center" }}>
              <Link href={dashboardUrl} style={{ color: "#64748b", textDecoration: "underline" }}>
                View Dashboard
              </Link>
              {" · "}
              Read in 60 seconds · Act in 5
            </Text>

          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export default DigestEmail;

// ── Legacy type export for TaskCard compatibility ─────────────────────────────
// (TaskCard still uses DigestTask shape in the dashboard — keep it working)
export interface DigestTask {
  id: string;
  number: number;
  names: string[];
  emails: string[];
  companies: string[];
  sourceContext: string;
  rationale: string;
  shortPrompt: string;
  priorityLabel: "HIGH" | "MEDIUM" | "LOW";
  dismissUrl: string;
  snoozeUrl: string;
}
