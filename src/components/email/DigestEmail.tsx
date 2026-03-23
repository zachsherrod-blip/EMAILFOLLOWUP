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
  Heading,
} from "@react-email/components";

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

export interface DigestEmailProps {
  userName: string;
  date: string;
  highTasks: DigestTask[];
  mediumTasks: DigestTask[];
  lowTasks: DigestTask[];
  dashboardUrl: string;
}

const PRIORITY_COLORS = {
  HIGH: "#dc2626",
  MEDIUM: "#d97706",
  LOW: "#6b7280",
};

const PRIORITY_BG = {
  HIGH: "#fef2f2",
  MEDIUM: "#fffbeb",
  LOW: "#f9fafb",
};

function TaskItem({ task }: { task: DigestTask }) {
  const nameList = task.names.length > 0 ? task.names.join(", ") : task.emails[0] ?? "Unknown";
  const emailList = task.emails.join(", ");
  const companyStr = task.companies.filter(Boolean).join(", ");

  return (
    <Section
      style={{
        backgroundColor: PRIORITY_BG[task.priorityLabel],
        borderLeft: `3px solid ${PRIORITY_COLORS[task.priorityLabel]}`,
        padding: "16px 20px",
        marginBottom: "12px",
        borderRadius: "4px",
      }}
    >
      <Text
        style={{
          margin: "0 0 4px 0",
          fontSize: "15px",
          fontWeight: "600",
          color: "#111827",
          lineHeight: "1.4",
        }}
      >
        {task.number}. {nameList}
      </Text>

      <Text
        style={{
          margin: "0 0 2px 0",
          fontSize: "13px",
          color: "#6b7280",
          lineHeight: "1.4",
        }}
      >
        {emailList}
        {companyStr ? ` · ${companyStr}` : ""}
      </Text>

      <Text
        style={{
          margin: "8px 0 2px 0",
          fontSize: "13px",
          color: "#374151",
          lineHeight: "1.5",
        }}
      >
        <strong>Context:</strong> {task.sourceContext}
      </Text>

      <Text
        style={{
          margin: "4px 0 8px 0",
          fontSize: "13px",
          color: "#374151",
          lineHeight: "1.5",
        }}
      >
        <strong>Why now:</strong> {task.rationale}
      </Text>

      <Section
        style={{
          backgroundColor: "#1e293b",
          padding: "10px 14px",
          borderRadius: "4px",
          margin: "8px 0",
        }}
      >
        <Text
          style={{
            margin: "0 0 4px 0",
            fontSize: "11px",
            color: "#94a3b8",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            fontWeight: "600",
          }}
        >
          Superhuman AI Prompt
        </Text>
        <Text
          style={{
            margin: "0",
            fontSize: "13px",
            color: "#e2e8f0",
            lineHeight: "1.5",
            fontFamily: "monospace",
          }}
        >
          {task.shortPrompt}
        </Text>
      </Section>

      <Text style={{ margin: "8px 0 0 0", fontSize: "12px", color: "#9ca3af" }}>
        <Link
          href={task.dismissUrl}
          style={{ color: "#6b7280", textDecoration: "underline" }}
        >
          Dismiss
        </Link>
        {" · "}
        <Link
          href={task.snoozeUrl}
          style={{ color: "#6b7280", textDecoration: "underline" }}
        >
          Snooze 3 days
        </Link>
      </Text>
    </Section>
  );
}

function PrioritySection({
  label,
  tasks,
  color,
}: {
  label: string;
  tasks: DigestTask[];
  color: string;
}) {
  if (tasks.length === 0) return null;

  return (
    <Section style={{ marginBottom: "24px" }}>
      <Text
        style={{
          fontSize: "11px",
          fontWeight: "700",
          color,
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          margin: "0 0 12px 0",
        }}
      >
        {label} PRIORITY · {tasks.length} {tasks.length === 1 ? "item" : "items"}
      </Text>
      {tasks.map((task) => (
        <TaskItem key={task.id} task={task} />
      ))}
    </Section>
  );
}

export function DigestEmail({
  userName,
  date,
  highTasks,
  mediumTasks,
  lowTasks,
  dashboardUrl,
}: DigestEmailProps) {
  const totalTasks = highTasks.length + mediumTasks.length + lowTasks.length;
  const preview =
    totalTasks === 0
      ? "No follow-ups needed today."
      : `${totalTasks} follow-up${totalTasks === 1 ? "" : "s"} to review today.`;

  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: "#f8fafc", fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
        <Container
          style={{
            maxWidth: "640px",
            margin: "0 auto",
            padding: "32px 16px",
          }}
        >
          {/* Header */}
          <Section
            style={{
              backgroundColor: "#0f172a",
              padding: "24px 28px",
              borderRadius: "8px 8px 0 0",
            }}
          >
            <Text
              style={{
                margin: "0 0 4px 0",
                fontSize: "18px",
                fontWeight: "700",
                color: "#f8fafc",
                letterSpacing: "-0.01em",
              }}
            >
              Follow-Up Queue
            </Text>
            <Text
              style={{
                margin: "0",
                fontSize: "13px",
                color: "#94a3b8",
              }}
            >
              {date} · {totalTasks === 0 ? "All clear" : `${totalTasks} ${totalTasks === 1 ? "person" : "people"} to follow up with`}
            </Text>
          </Section>

          {/* Body */}
          <Section
            style={{
              backgroundColor: "#ffffff",
              padding: "24px 28px",
              borderRadius: "0 0 8px 8px",
            }}
          >
            {totalTasks === 0 ? (
              <Text
                style={{
                  color: "#374151",
                  fontSize: "15px",
                  textAlign: "center",
                  padding: "24px 0",
                }}
              >
                You&apos;re all caught up. No open follow-ups today.
              </Text>
            ) : (
              <>
                <Text
                  style={{
                    margin: "0 0 20px 0",
                    fontSize: "14px",
                    color: "#6b7280",
                    lineHeight: "1.5",
                  }}
                >
                  Hi {userName?.split(" ")[0] ?? "there"}, here are the people you likely owe a follow-up to. Copy any prompt below into Superhuman AI to draft a reply instantly.
                </Text>

                <PrioritySection
                  label="High"
                  tasks={highTasks}
                  color={PRIORITY_COLORS.HIGH}
                />
                <PrioritySection
                  label="Medium"
                  tasks={mediumTasks}
                  color={PRIORITY_COLORS.MEDIUM}
                />
                <PrioritySection
                  label="Low"
                  tasks={lowTasks}
                  color={PRIORITY_COLORS.LOW}
                />
              </>
            )}

            <Hr style={{ borderColor: "#e5e7eb", margin: "24px 0 16px" }} />

            <Text
              style={{
                margin: "0",
                fontSize: "12px",
                color: "#9ca3af",
                textAlign: "center",
              }}
            >
              <Link
                href={dashboardUrl}
                style={{ color: "#6b7280", textDecoration: "underline" }}
              >
                View Dashboard
              </Link>
              {" · "}
              Follow-Up Queue — your personal outbound follow-up assistant
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export default DigestEmail;
