# Follow-Up Queue

A lightweight personal workflow tool that sends you a daily email at 4:00 PM with a prioritized list of people you should follow up with — based on your Gmail and Google Calendar activity.

## What It Does

**Every day at 4 PM**, Follow-Up Queue:

1. Scans your Google Calendar for recent external meetings (past 1–5 business days)
2. Cross-references your Gmail to check if you already sent a follow-up
3. Surfaces only the tasks you actually owe
4. Sends a clean digest email with a copy-paste **Superhuman AI prompt** for each one

**You are never auto-sent anything.** This tool only reads your data and emails you a task list.

## Why Prompts Instead of Drafts

Full AI-written email drafts require too much context to be trusted. Instead, Follow-Up Queue generates a short, specific **Superhuman AI prompt** (≤50 words) for each follow-up. You paste it directly into Superhuman AI, review the draft, and send it yourself.

This keeps you in control while eliminating the friction of remembering what to write and why.

### Example Output

```
1. Jane Smith <jane@google.com>, Mark Lee <mark@google.com>
Context: Google x Northbeam incrementality discussion, Mar 21
Why now: External partner meeting happened 2 days ago and no outbound follow-up was sent.

Superhuman AI Prompt:
Write a warm partner follow-up to Jane and Mark after our incrementality discussion.
Mention measurement alignment, next steps, and interest in continued collaboration.
Keep it concise and strategic.

[Dismiss] [Snooze 3 days]
```

## How It Works

```
Google Calendar ──► Sync events (past 14 days)
                         │
                         ▼
                   Filter: external attendees only
                   Filter: business-relevant events
                         │
                         ▼
Gmail ──────────► Check: did I already follow up?
                         │
                         ▼
                   LLM Classification (Claude Haiku)
                   → shouldCreateTask
                   → priorityScore (0–100)
                   → shortPrompt (≤50 words)
                   → company (if inferable)
                         │
                         ▼
                   FollowUpTask saved to DB
                   (deduped by event + contacts)
                         │
                         ▼
               4:00 PM ► Digest email sent via Resend
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Database | PostgreSQL + Prisma |
| Auth | NextAuth.js v4 + Google OAuth |
| Calendar | Google Calendar API |
| Email read | Gmail API |
| Email send | Resend |
| AI | Anthropic Claude (Haiku) |
| Styling | Tailwind CSS |
| Cron | Vercel Cron (or node-cron for self-hosted) |
| Validation | Zod |

## Local Setup

### Prerequisites

- Node.js 18+
- PostgreSQL database
- Google Cloud Project with Calendar + Gmail APIs enabled
- Anthropic API key
- Resend account

### 1. Clone and install

```bash
git clone <repo-url>
cd followup-queue
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Fill in all values in `.env` — see [Environment Variables](#environment-variables) section.

### 3. Generate encryption key

```bash
openssl rand -hex 32
# Paste output into TOKEN_ENCRYPTION_KEY in .env
```

### 4. Set up the database

```bash
npm run db:push
# or for migrations:
npm run db:migrate
```

### 5. Start the dev server

```bash
npm run dev
```

### 6. (Optional) Run the worker locally

```bash
npm run worker
```

The worker syncs every 3 hours and checks for digest time every 15 minutes.

## Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project (or use an existing one)
3. Enable these APIs:
   - **Gmail API**
   - **Google Calendar API**
4. Go to **APIs & Services → Credentials**
5. Create an **OAuth 2.0 Client ID** (Web application)
6. Add authorized redirect URI:
   ```
   http://localhost:3000/api/auth/callback/google
   https://yourdomain.com/api/auth/callback/google
   ```
7. Copy Client ID and Client Secret to `.env`

### Required OAuth Scopes

```
openid
email
profile
https://www.googleapis.com/auth/gmail.readonly
https://www.googleapis.com/auth/calendar.readonly
```

These are requested automatically on first sign-in. The app requests `access_type=offline` and `prompt=consent` to obtain a refresh token for background sync.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✓ | PostgreSQL connection string |
| `NEXTAUTH_SECRET` | ✓ | Random secret for NextAuth session signing |
| `NEXTAUTH_URL` | ✓ | Your app URL (e.g., `http://localhost:3000`) |
| `GOOGLE_CLIENT_ID` | ✓ | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | ✓ | Google OAuth client secret |
| `TOKEN_ENCRYPTION_KEY` | ✓ | 64-char hex key for encrypting OAuth tokens |
| `ANTHROPIC_API_KEY` | ✓ | Anthropic API key (Claude Haiku) |
| `RESEND_API_KEY` | ✓ | Resend API key for sending digest emails |
| `RESEND_FROM_EMAIL` | ✓ | Sender email address (must be verified in Resend) |
| `APP_BASE_URL` | ✓ | Full app URL without trailing slash |
| `CRON_SECRET` | optional | Bearer token to protect cron endpoints |
| `OPENAI_API_KEY` | optional | Not used in v1, reserved for future |

## Cron Setup

### Vercel (recommended)

The `vercel.json` in this repo configures two cron jobs:

- **`/api/cron/sync`** — runs every 3 hours, syncs calendar + Gmail + detects tasks
- **`/api/cron/digest`** — runs every 15 minutes, sends digest only when it's your configured time

Vercel Cron calls your routes with `Authorization: Bearer <CRON_SECRET>`.

Set `CRON_SECRET` in your Vercel environment variables.

### Self-hosted (node-cron)

Run the worker process:

```bash
npm run worker
```

This starts a long-running process with the same schedule.

## Dashboard

The dashboard lives at `/dashboard` and includes:

| Page | Description |
|------|-------------|
| `/dashboard` | Today's open tasks, grouped by priority |
| `/dashboard/tasks` | All tasks (open, completed, snoozed, dismissed) |
| `/dashboard/connections` | Google account status + manual sync |
| `/dashboard/settings` | Digest email, timezone, internal domains, detection config |

### Dashboard Actions

From any task card:
- **Copy Prompt** — copies the Superhuman AI prompt to clipboard
- **Done** — manually marks the task complete
- **Snooze 3d** — hides the task for 3 days
- **Dismiss** — permanently removes it from future digests

## Detection Logic

Follow-up tasks are created when **all or most** of these are true:

- The calendar event had at least one external attendee
- The event occurred within the last 1–5 business days
- No outbound email was sent to the attendee(s) after the meeting
- The event title/description suggests business relevance

**Excluded:**
- Internal-only meetings (all attendees match configured internal domains)
- Recurring internal standups (detected by title patterns)
- Personal appointments (birthday, vacation, lunch, etc.)
- Events where you already replied after the meeting

**Auto-complete** triggers when:
- You send an email to an attendee after the meeting ends
- You reply in the associated Gmail thread after task creation

## Prioritization

Tasks are scored 0–100:

| Score | Label | Meaning |
|-------|-------|---------|
| 80–100 | HIGH | Revenue, partnership, customer meeting, no follow-up |
| 55–79 | MEDIUM | Important business meetings, pending next steps |
| 30–54 | LOW | Lower-stakes meetings, nice-to-have follow-up |
| <30 | (filtered) | Likely not worth surfacing |

The LLM (Claude Haiku) scores each task based on meeting context, attendee signals, and recency. Deterministic rules run first, LLM enrichment runs second.

## Deployment

### Vercel

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel --prod
```

Set all environment variables in the Vercel dashboard under **Settings → Environment Variables**.

After deploying:
1. Add your production URL to Google OAuth's authorized redirect URIs
2. Set `APP_BASE_URL` and `NEXTAUTH_URL` to your production URL
3. Run `npx prisma migrate deploy` or `npm run db:push` against your production database

### Database

Any PostgreSQL provider works: Supabase, Neon, Railway, PlanetScale (MySQL), etc.

For Neon (serverless Postgres, free tier):
```
DATABASE_URL="postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require"
```

## Limitations (v1)

- **Single Google account per user** — only one Gmail/Calendar connection
- **UTC-only digest scheduling** — `digestHour` is in UTC; timezone support is partially implemented
- **No email body access** — only snippets and metadata (by design, for privacy)
- **No Gmail send** — read-only; prompts are for Superhuman AI, not for this app to send
- **Claude Haiku only** — uses the fast, cheap model; upgrade to Sonnet for better classification
- **~200 thread cap per sync** — to avoid rate limits; adjustable in `gmail.ts`
- **5-business-day follow-up window** — older meetings are not surfaced (configurable)

## Future Ideas

- Timezone-aware digest scheduling using `date-fns-tz`
- HubSpot / Salesforce contact enrichment for company inference
- Slack notification option alongside email
- Smart re-surface: if the same contact re-appears in your calendar, re-open the task
- Task grouping by company (all Google contacts → one section)
- iOS Shortcut integration for quick "done" actions
- Weekly summary view
- GPT-4o / Claude Sonnet upgrade path for better prompt generation

## Privacy

- OAuth tokens are encrypted at rest using AES-256-GCM before storage
- Email bodies are **never stored** — only subject, participants, and snippet
- No data is shared with third parties beyond Anthropic (for prompt generation)
- The app never sends emails on your behalf
