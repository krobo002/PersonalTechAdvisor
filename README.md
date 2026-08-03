# Tech Relevance Advisor

Watches trending dev-community signals (Hacker News, Reddit, GitHub, Stack
Overflow), filters them against your GitHub-derived stack and self-declared
growth goals, enriches the top matches via a local Ollama model into
tailored learning recommendations, and delivers them via a dashboard and a
weekly email digest.

See [`docs/superpowers/specs/2026-08-02-tech-relevance-advisor-design.md`](docs/superpowers/specs/2026-08-02-tech-relevance-advisor-design.md)
for the design and [`docs/superpowers/plans/2026-08-02-tech-relevance-advisor.md`](docs/superpowers/plans/2026-08-02-tech-relevance-advisor.md)
for the implementation plan.

## Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project (Postgres + Auth)
- A [GitHub OAuth App](https://github.com/settings/developers) (for sign-in and
  reading your repos/languages)
- [Ollama](https://ollama.com) installed and running locally
  (`ollama serve`), with a chat model pulled, e.g. `ollama pull llama3.1`
  (enrichment — no cloud subscription needed)
- A [Voyage AI API key](https://www.voyageai.com) (embedding similarity)
- A [Resend](https://resend.com) account with a verified sending domain
  (digest email)

## Setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Create the database schema**

   Apply the migrations in `supabase/migrations/` to your Supabase project, in
   order, via the Supabase CLI or by pasting each file into the SQL editor:

   ```bash
   supabase db push
   ```

   (`0001_init.sql` creates the `profiles`, `recommendations`, and
   `digest_log` tables; `0002_enable_rls.sql` enables Row-Level Security and
   the access policies.)

3. **Enable GitHub sign-in in Supabase**

   In your Supabase project: **Authentication → Providers → GitHub**, toggle
   it on. Supabase displays a **Callback URL (for OAuth)** field —
   something like:

   ```
   https://<your-project-ref>.supabase.co/auth/v1/callback
   ```

   Create a [GitHub OAuth App](https://github.com/settings/applications/new)
   with that exact URL as its **Authorization callback URL** (this is
   Supabase's own callback, not your app's — your app's
   `/api/auth/callback` route only receives control afterward, via the
   `redirectTo` option already wired into the sign-in call in the code).
   Copy the OAuth App's **Client ID** and a generated **Client Secret** back
   into the Supabase GitHub provider fields, then save.

4. **Configure environment variables**

   Copy the template and fill in every value:

   ```bash
   cp .env.example .env.local
   ```

   | Variable | Where to get it |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase project settings → API |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase project settings → API |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase project settings → API (keep secret — used only by the cron routes) |
   | `OLLAMA_BASE_URL` | Defaults to `http://localhost:11434` — where your local `ollama serve` listens |
   | `OLLAMA_CHAT_MODEL` | Any model you've pulled locally, e.g. `llama3.1` (`ollama pull llama3.1`) |
   | `VOYAGE_API_KEY` | Voyage AI dashboard |
   | `RESEND_API_KEY` | Resend dashboard |
   | `DIGEST_FROM_EMAIL` | A sender address on a domain verified in Resend, e.g. `Tech Relevance Advisor <digest@yourdomain.com>` |
   | `CRON_SECRET` | Any random string you generate yourself — protects the cron routes from unauthenticated calls |

## Running locally

Start Ollama first (in a separate terminal, if it isn't already running as a
background service):

```bash
ollama serve
```

Then:

```bash
npm run dev
```

Visit `http://localhost:3000`, sign in with GitHub, then visit `/setup` to
enter 1-2 growth-goal tags (e.g. `backend infra, ai/ml`).

### Trigger the pipeline and digest manually

The pipeline (ingest → filter → enrich → store) and the digest send are each
a cron-triggered API route, gated by `CRON_SECRET`:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/run
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/digest
```

Then visit `/dashboard` to see your recommendations.

## Testing

```bash
npm test              # run the test suite (vitest)
npx tsc --noEmit       # typecheck
npm run build          # production build
```

## Deploying

This app is built for [Vercel](https://vercel.com). `vercel.json` schedules
the pipeline weekly (Monday 08:00) and the digest an hour later (Monday
09:00) via Vercel Cron.

**Note:** Vercel Cron does not automatically send an `Authorization` header
matching `CRON_SECRET`. Before relying on the schedule in production, either
switch the two cron routes to verify Vercel's own cron-request signature, or
configure the header some other way — otherwise the scheduled calls will get
a 401 and only manual/`curl`-triggered runs will work.

Set all the environment variables above in your Vercel project settings, then
deploy. Remember to also point your GitHub OAuth App's callback URL at the
deployed domain.

**Note:** enrichment calls a local Ollama server (`OLLAMA_BASE_URL`), which
won't be reachable from Vercel's servers by default. Deploying without
further changes means the pipeline will run but every recommendation will
fall back to the generic template blurb. To use real enrichment from a
Vercel deployment, you'd need to expose your local Ollama instance (e.g. via
a tunnel) or run Ollama on a server Vercel can reach, and point
`OLLAMA_BASE_URL` at it.
