# Tech Relevance Advisor — Design

## Problem

Software developers face constant pressure to keep up with new tools, frameworks, and
practices, but the volume of "what's new" is overwhelming and mostly irrelevant to any
one person's actual work or goals. This leads to anxiety and wasted time chasing trends
that don't matter, or missing the few that do.

## Goal

Build a tool that watches what's trending in the developer community, filters it down
to what's actually relevant to *this* developer's current stack and stated growth
goals, and turns the relevant items into a short, actionable learning plan — delivered
both as a browsable dashboard and a periodic digest.

## Scope

- **v1 user**: the author, built as a personal tool.
- **Design constraint**: kept generic enough (config-driven profile, clean stage
  boundaries) to become a multi-user product later without a rewrite. Multi-tenant
  auth, billing, onboarding flows, etc. are explicitly **out of scope for v1**.

## Non-goals (v1)

- Multi-user accounts / auth beyond what Supabase provides for free.
- Job-market-signal analysis (postings, salary data) as a trend source.
- A fully tracked roadmap/LMS-style progress system beyond simple item statuses.
- Mobile app or browser extension delivery.

## Architecture

Five independent, individually-testable stages, run on a schedule (weekly by default,
configurable):

1. **Ingestion** — scheduled job pulls raw trending items from Hacker News, Reddit
   (r/programming and similar subs), GitHub Trending, and Stack Overflow tag activity.
   Each source has its own adapter normalizing results into a common shape:
   `{source, title, url, tags, raw_signal, fetched_at}`. Adapters run in parallel;
   results are fetched once per run and shared across the rest of the pipeline (not
   re-fetched per user), which keeps the design cheap even after it becomes
   multi-tenant, since raw trending data is the same for everyone.

2. **Profile** — built once at setup, editable later:
   - **Stack tags** (auto): pulled via GitHub OAuth — languages, repo topics,
     frameworks in use.
   - **Goal tags** (manual, one-time lightweight setup): the user types 1–2 growth
     directions (e.g. "backend infra", "AI/ML"), normalized into tags. If left empty,
     the "grow" bucket (see below) simply stays empty — this is not an error state.

3. **Pre-filter** — cheap tag-overlap scoring of each raw item against the user's
   stack tags and goal tags, augmented with embedding similarity to catch semantic
   matches that don't share literal tags (e.g. "Bun" relating to a "Node.js" stack
   tag). Produces a short ranked candidate list (~20 items), split into two buckets:
   - **maintain**: adjacent to the user's current stack.
   - **grow**: aligned to the user's stated goal tags.

   This stage exists specifically to bound the cost of the next (LLM) stage — it never
   sees the full raw trending set, only the narrowed candidates.

4. **Enrichment (LLM)** — a single LLM pass over the short candidate list plus the
   user's profile. For each candidate item, generates:
   - a relevance blurb explaining why it matters to *this* user specifically,
   - a maintain/grow category tag,
   - a learning-plan step: a suggested action (e.g. "skim the docs", "build a toy
     project") with a rough time estimate.

5. **Storage & delivery** — enriched recommendations are upserted into a
   `recommendations` table with a status field (`new` / `in-progress` / `learned` /
   `skipped`). Existing items already marked in-progress/learned are left untouched by
   later runs. Both delivery surfaces read from this same table:
   - **Dashboard**: browsable anytime, grouped by maintain/grow; user can update an
     item's status and view its learning-plan step.
   - **Digest**: a periodic job queries items created since the last digest send and
     emails a summary; logs each send.

### Proposed stack

- **App**: Next.js (dashboard UI + API routes).
- **Database**: Postgres via Supabase — also provides auth for free, which matters
  given the "shippable later" constraint.
- **Scheduler**: Vercel Cron (or equivalent) triggering stages 1–4, then the digest
  job.
- **Enrichment**: Claude API.
- **Email**: Resend (or equivalent transactional email API) for the digest.

Rationale: cheap to run for a single user today, and Supabase's built-in multi-tenant
auth means going multi-user later doesn't require re-architecting the data model or
auth layer.

## Data Flow

```
[Scheduler trigger]
      │
      ▼
Ingestion ─── fetch HN / Reddit / GitHub Trending / SO tags
      │        (adapters run in parallel, results cached for this run)
      ▼
Pre-filter ── score raw items vs. stack tags + goal tags
      │        → top ~20 candidates, tagged maintain/grow
      ▼
Enrichment ── single LLM pass over the candidate list + user profile
      │        → relevance blurb, category, learning-plan step per item
      ▼
Storage ────── upsert into `recommendations` table
      │        (status defaults to "new"; existing in-progress/learned
      │         items are left untouched)
      ▼
   ┌──┴───────────────┐
   ▼                  ▼
Dashboard          Digest job
(reads live,       (queries recommendations created since
user marks         last digest, emails a summary, logs
status)            the send)
```

## Error Handling

- **Source fetch failure** (an API is down or rate-limited): retry with backoff, then
  skip that source for the run and log the gap. The run continues with whatever
  sources succeeded rather than failing entirely.
- **Enrichment failure on an item**: retry once; if it still fails, fall back to a
  plain template blurb (e.g. "trending on {source}, matches your {tag} stack") with no
  learning-plan step, rather than dropping the item.
- **Zero candidates after pre-filter**: a valid outcome, not an error. The digest sends
  "nothing new matches your profile this week" instead of an empty or broken email.
- **Digest send failure**: retry once; if it still fails, log it and leave the
  recommendations queued — the next digest run picks up anything not yet sent rather
  than losing them.
- **No goal tags set**: the pipeline runs "maintain" scoring only; the "grow" bucket
  stays empty until goal tags are added. Not an error state.

## Testing

- **Pre-filter scoring**: pure deterministic logic — unit tests with fixed
  profile/raw-item fixtures asserting expected maintain/grow buckets and ranking.
- **Source adapters**: contract tests per adapter using recorded/mocked HTTP
  responses, independent of live APIs or rate limits.
- **Enrichment step**: since LLM output is non-deterministic, tests validate structure
  (required fields present, category is one of maintain/grow, blurb references the
  user's actual tags) against fixed sample inputs rather than exact text.
- **End-to-end**: one full manual run against real sources before shipping v1,
  checking the dashboard and a real digest email render correctly.
- **Fallback paths**: explicit tests for each failure mode above (source down, LLM
  failure, zero candidates) confirming graceful degradation rather than a crashed run.

## Open Questions

None outstanding — all design sections were reviewed and approved during
brainstorming.
