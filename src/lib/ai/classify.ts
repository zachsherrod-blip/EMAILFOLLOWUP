import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

const ClassificationResultSchema = z.object({
  shouldCreateTask: z.boolean(),
  rationale: z.string(),
  priorityScore: z.number().min(0).max(100),
  shortPrompt: z.string().max(300), // Will be trimmed to 50 words
  company: z.string().nullable(),
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

const SYSTEM_PROMPT = `You are a follow-up task classifier for a personal productivity tool.
Your job is to determine if a calendar meeting needs a follow-up email, and if so, generate a short AI prompt the user can paste into Superhuman AI to draft the email.

Rules:
- Only recommend follow-up for external business meetings (not personal, not internal standups)
- Be conservative — low false positives are better than many false positives
- If the user already sent a follow-up, do NOT recommend creating a task
- The shortPrompt must be 50 words or fewer, plain text, actionable, and specific
- The shortPrompt should mention recipient names, meeting context, and the goal (warm follow-up, check-in, next steps, etc.)
- Do not fabricate details or hallucinate next steps not evident from the context

Return valid JSON matching this exact schema:
{
  "shouldCreateTask": boolean,
  "rationale": "one sentence explaining why",
  "priorityScore": number between 0 and 100,
  "shortPrompt": "the Superhuman AI prompt, max 50 words",
  "company": "company name if inferable, or null"
}

Priority scoring guide:
- 80-100: Revenue, partnership, customer, investor meetings with no follow-up
- 55-79: Important business meetings, pending next steps
- 30-54: Lower-stakes meetings, nice to follow up but not urgent
- 0-29: Likely not worth a task`;

export async function classifyFollowUpTask(
  input: ClassifyInput
): Promise<ClassificationResult> {
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
User already sent follow-up: ${input.hasOutboundFollowUp ? "YES — do not create task" : "NO"}${threadContext}

Classify this meeting and return JSON.`;

  // Deterministic pre-check: if user already followed up, skip LLM call
  if (input.hasOutboundFollowUp) {
    return {
      shouldCreateTask: false,
      rationale: "User already sent an outbound email to the attendee(s) after this meeting.",
      priorityScore: 0,
      shortPrompt: "",
      company: null,
    };
  }

  try {
    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });

    const content = message.content[0];
    if (content.type !== "text") {
      throw new Error("Unexpected response type from LLM");
    }

    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in LLM response");
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const result = ClassificationResultSchema.parse(parsed);

    // Enforce 50-word limit on shortPrompt
    if (result.shortPrompt) {
      const words = result.shortPrompt.trim().split(/\s+/);
      if (words.length > 50) {
        result.shortPrompt = words.slice(0, 50).join(" ");
      }
    }

    return result;
  } catch (err) {
    console.error("LLM classification failed, using fallback:", err);
    // Fallback: create a task with a generic prompt
    return fallbackClassification(input);
  }
}

function fallbackClassification(input: ClassifyInput): ClassificationResult {
  const names = input.attendees
    .filter((a) => a.name)
    .map((a) => a.name!)
    .slice(0, 2)
    .join(" and ");

  const recipient = names || input.attendees[0]?.email || "the attendees";

  // Score based on recency and attendee count
  let score = 60;
  if (input.daysSinceEvent <= 1) score += 20;
  else if (input.daysSinceEvent <= 3) score += 10;
  else if (input.daysSinceEvent > 7) score -= 15;

  if (input.attendees.length >= 3) score += 5;

  score = Math.max(0, Math.min(100, score));

  const shortPrompt = `Write a concise follow-up to ${recipient} after our ${input.eventTitle} meeting. Mention key discussion points, confirm next steps, and keep it professional and warm.`;

  const words = shortPrompt.split(/\s+/);
  const trimmed = words.length > 50 ? words.slice(0, 50).join(" ") : shortPrompt;

  return {
    shouldCreateTask: true,
    rationale: `External business meeting with ${recipient} occurred ${input.daysSinceEvent} day(s) ago with no outbound follow-up detected.`,
    priorityScore: score,
    shortPrompt: trimmed,
    company: null,
  };
}
