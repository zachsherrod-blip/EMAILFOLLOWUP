import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

// ── Zod schema for the structured LLM response ─────────────────────────────

const ClassificationResultSchema = z.object({
  shouldCreateTask: z.boolean(),
  category: z.enum([
    "Platform Partnership",
    "Agency",
    "Deal / Prospect",
    "Customer",
    "Other",
  ]),
  followUpOwed: z.boolean(),
  isCallFollowUp: z.boolean(),
  hasExplicitAsk: z.boolean(),
  hasCommitment: z.boolean(),
  revenueImpact: z.boolean(),
  urgency: z.enum(["High", "Medium", "Low"]),
  company: z.string().nullable(),
  rationale: z.string(),
  shortPrompt: z.string(),
  whatNeedsToHappen: z.string(),
  whyItMatters: z.string(),
  nextActions: z.tuple([z.string(), z.string()]),
});

export type ClassificationResult = z.infer<typeof ClassificationResultSchema>;

export interface ClassifyInput {
  eventTitle: string;
  eventDescription?: string;
  attendees: Array<{ name?: string; email: string }>;
  eventDate: string;
  daysSinceEvent: number;
  hasOutboundFollowUp: boolean;
  threadSnippets?: string[];
}

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const SYSTEM_PROMPT = `You are a Chief of Staff classifying outbound follow-up tasks for a Head of Growth.

Your job: determine if a calendar meeting or email thread requires a follow-up, and return ONLY structured JSON — no explanation, no markdown, no preamble.

Hard rules:
- External meetings only. Skip anything internal.
- If the user already replied after the meeting, set shouldCreateTask: false.
- shortPrompt must be ≤50 plain-text words, paste-ready for Superhuman AI.
- whatNeedsToHappen: 1–2 lines describing the business outcome needed.
- whyItMatters: 1 line on business consequence if this stalls.
- nextActions: exactly 2 concrete action bullets.
- Do NOT fabricate details not in the context.

Return valid JSON matching this exact schema, no other text:
{
  "shouldCreateTask": boolean,
  "category": "Platform Partnership" | "Agency" | "Deal / Prospect" | "Customer" | "Other",
  "followUpOwed": boolean,
  "isCallFollowUp": boolean,
  "hasExplicitAsk": boolean,
  "hasCommitment": boolean,
  "revenueImpact": boolean,
  "urgency": "High" | "Medium" | "Low",
  "company": string | null,
  "rationale": "one sentence",
  "shortPrompt": "≤50 word Superhuman AI prompt",
  "whatNeedsToHappen": "1–2 lines describing required outcome",
  "whyItMatters": "1 line on business consequence",
  "nextActions": ["action 1", "action 2"]
}

Category guide:
- Platform Partnership: tech partner, integration, co-sell, API partner, measurement vendor
- Agency: media agency, buying group, holding company
- Deal / Prospect: new logo, pipeline, proposal stage
- Customer: existing paying account, renewal, expansion
- Other: recruiter, advisor, conference, unclear

Urgency guide:
- High: call follow-up overdue, commitment made, explicit ask outstanding, revenue at risk
- Medium: meeting happened, next steps discussed, 2–4 days ago
- Low: intro meeting, general check-in, low stakes`;

export async function classifyFollowUpTask(
  input: ClassifyInput
): Promise<ClassificationResult> {
  // Deterministic pre-check: skip LLM entirely if already followed up
  if (input.hasOutboundFollowUp) {
    return noFollowUpNeeded("User already sent an outbound reply after this meeting.");
  }

  const attendeeList = input.attendees
    .map((a) => (a.name ? `${a.name} <${a.email}>` : a.email))
    .join(", ");

  const threadContext =
    input.threadSnippets && input.threadSnippets.length > 0
      ? `\nRelated email snippets:\n${input.threadSnippets.map((s) => `- ${s}`).join("\n")}`
      : "";

  const userMessage = `Meeting: "${input.eventTitle}"
Date: ${input.eventDate} (${input.daysSinceEvent} business day(s) ago)
Attendees: ${attendeeList}
Description: ${input.eventDescription || "(none)"}
User already replied: NO${threadContext}

Return JSON only.`;

  try {
    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 700,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });

    const content = message.content[0];
    if (content.type !== "text") throw new Error("Unexpected LLM response type");

    // Strip markdown fences if present
    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in LLM response");

    const parsed = JSON.parse(jsonMatch[0]);
    const result = ClassificationResultSchema.parse(parsed);

    // Enforce 50-word limit on shortPrompt
    const words = result.shortPrompt.trim().split(/\s+/);
    if (words.length > 50) result.shortPrompt = words.slice(0, 50).join(" ");

    return result;
  } catch (err) {
    console.error("LLM classification failed, using fallback:", err);
    return fallbackClassification(input);
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function noFollowUpNeeded(rationale: string): ClassificationResult {
  return {
    shouldCreateTask: false,
    category: "Other",
    followUpOwed: false,
    isCallFollowUp: false,
    hasExplicitAsk: false,
    hasCommitment: false,
    revenueImpact: false,
    urgency: "Low",
    company: null,
    rationale,
    shortPrompt: "",
    whatNeedsToHappen: "",
    whyItMatters: "",
    nextActions: ["", ""],
  };
}

function fallbackClassification(input: ClassifyInput): ClassificationResult {
  const names = input.attendees
    .filter((a) => a.name)
    .map((a) => a.name!)
    .slice(0, 2)
    .join(" and ");
  const recipient = names || input.attendees[0]?.email || "the attendees";

  const isRecent = input.daysSinceEvent <= 2;
  const urgency: "High" | "Medium" | "Low" = isRecent ? "High" : input.daysSinceEvent <= 4 ? "Medium" : "Low";

  const shortPrompt = `Write a concise follow-up to ${recipient} after our ${input.eventTitle} meeting. Confirm next steps and keep it warm and professional.`;
  const words = shortPrompt.split(/\s+/);
  const trimmedPrompt = words.length > 50 ? words.slice(0, 50).join(" ") : shortPrompt;

  return {
    shouldCreateTask: true,
    category: "Other",
    followUpOwed: true,
    isCallFollowUp: true,
    hasExplicitAsk: false,
    hasCommitment: false,
    revenueImpact: false,
    urgency,
    company: null,
    rationale: `External meeting with ${recipient} occurred ${input.daysSinceEvent} day(s) ago with no outbound follow-up.`,
    shortPrompt: trimmedPrompt,
    whatNeedsToHappen: `Send follow-up to ${recipient} after the ${input.eventTitle} meeting.`,
    whyItMatters: "Momentum stalls without a timely reply.",
    nextActions: [
      `Email ${recipient} to recap and confirm next steps`,
      "Set a reminder if no reply within 3 days",
    ],
  };
}
