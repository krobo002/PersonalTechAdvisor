# Tech Relevance Advisor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a pipeline + web app that ingests dev-community trending signals, filters them against a developer's stack/goal profile, generates tailored learning recommendations via an LLM, and delivers them via a dashboard and a periodic email digest.

**Architecture:** Five independent stages (ingestion → profile-aware pre-filter → LLM enrichment → storage → delivery) wired together by a scheduled pipeline job, per `docs/superpowers/specs/2026-08-02-tech-relevance-advisor-design.md`. Next.js serves both the API routes (cron-triggered pipeline/digest, status updates) and the dashboard UI; Supabase Postgres is the single source of truth read by both delivery surfaces.

**Tech Stack:** Next.js 14 (App Router, TypeScript), Supabase (Postgres + Auth w/ GitHub provider), Vercel Cron, Anthropic Claude API (`@anthropic-ai/sdk`) for enrichment, Voyage AI embeddings API for semantic pre-filter matching, Resend for digest email, Vitest for tests.

## Global Constraints

- v1 is single-user (the author); design stays generic enough for multi-user later but multi-tenant auth/billing/onboarding UI is **out of scope for v1**.
- No job-market-signal sources (postings/salary data) — dev-community sources only (Hacker News, Reddit, GitHub, Stack Overflow).
- No LMS-style tracked roadmap beyond the four-state `status` field (`new`/`in-progress`/`learned`/`skipped`).
- No mobile app or browser extension delivery.
- Pipeline runs on a schedule, weekly by default, configurable.
- Pre-filter must bound the candidate list to ~20 items before the LLM enrichment stage ever runs (cost control).
- Every stage must degrade gracefully per the spec's Error Handling section (partial source failure, LLM failure, zero candidates, digest send failure, no goal tags) rather than crashing a run.

---

### Task 1: Project scaffolding & database schema

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.js`
- Create: `vitest.config.ts`
- Create: `.env.example`
- Create: `.gitignore`
- Create: `src/app/layout.tsx`
- Create: `src/app/page.tsx`
- Create: `supabase/migrations/0001_init.sql`
- Test: `tests/smoke.test.ts`

**Interfaces:**
- Produces: DB tables `profiles(id, email, stack_tags jsonb, goal_tags jsonb, created_at, updated_at)`, `recommendations(id, profile_id, source, title, url, category, score, blurb, learning_action, learning_time_estimate, status, created_at, updated_at)`, `digest_log(id, profile_id, sent_at, recommendation_ids jsonb)` — every later task's DB access relies on these exact column names.
- Produces: path alias `@/*` → `./src/*`, used by every later `import` statement.

- [ ] **Step 1: Write the failing smoke test**

```ts
// tests/smoke.test.ts
import { describe, it, expect } from 'vitest';

describe('project scaffolding', () => {
  it('runs a basic assertion', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify the harness doesn't exist yet**

Run: `npx vitest run tests/smoke.test.ts`
Expected: FAIL — `vitest: command not found` or module resolution error (no `package.json`/deps yet).

- [ ] **Step 3: Create package.json**

```json
{
  "name": "tech-relevance-advisor",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run"
  },
  "dependencies": {
    "next": "^14.2.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "@supabase/supabase-js": "^2.45.0",
    "@supabase/ssr": "^0.5.0",
    "@anthropic-ai/sdk": "^0.27.0",
    "resend": "^4.0.0"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "@types/react": "^18.3.0",
    "@types/node": "^20.14.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 4: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "ES2022"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "preserve",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "incremental": true,
    "noEmit": true,
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 5: Create next.config.js**

```js
/** @type {import('next').NextConfig} */
const nextConfig = {};
module.exports = nextConfig;
```

- [ ] **Step 6: Create vitest.config.ts**

```ts
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

- [ ] **Step 7: Create .env.example**

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
VOYAGE_API_KEY=
RESEND_API_KEY=
CRON_SECRET=
```

- [ ] **Step 8: Create .gitignore**

```
node_modules
.next
.env
.env.local
```

- [ ] **Step 9: Create minimal app shell**

```tsx
// src/app/layout.tsx
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

```tsx
// src/app/page.tsx
export default function HomePage() {
  return <main>Tech Relevance Advisor</main>;
}
```

- [ ] **Step 10: Create the database migration**

```sql
-- supabase/migrations/0001_init.sql
create extension if not exists "pgcrypto";

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  stack_tags jsonb not null default '[]'::jsonb,
  goal_tags jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists recommendations (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  source text not null,
  title text not null,
  url text not null,
  category text not null check (category in ('maintain', 'grow')),
  score numeric not null,
  blurb text not null,
  learning_action text not null default '',
  learning_time_estimate text not null default '',
  status text not null default 'new' check (status in ('new', 'in-progress', 'learned', 'skipped')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, source, url)
);

create table if not exists digest_log (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  sent_at timestamptz not null default now(),
  recommendation_ids jsonb not null default '[]'::jsonb
);
```

- [ ] **Step 11: Install dependencies and run the test to verify it passes**

Run: `npm install && npx vitest run tests/smoke.test.ts`
Expected: PASS — `1 passed`

- [ ] **Step 12: Verify the app builds**

Run: `npx next build`
Expected: build completes with no errors (a route for `/` is listed in the output).

- [ ] **Step 13: Apply the migration**

Run: `supabase db push` (or paste `supabase/migrations/0001_init.sql` into the Supabase project's SQL editor)
Expected: three tables (`profiles`, `recommendations`, `digest_log`) exist in the Supabase project.

- [ ] **Step 14: Commit**

```bash
git add package.json tsconfig.json next.config.js vitest.config.ts .env.example .gitignore src/app/layout.tsx src/app/page.tsx supabase/migrations/0001_init.sql tests/smoke.test.ts
git commit -m "chore: scaffold Next.js app and database schema"
```

---

### Task 2: Source adapter interface & shared tag extractor

**Files:**
- Create: `src/lib/sources/types.ts`
- Create: `src/lib/sources/extractTags.ts`
- Test: `tests/lib/sources/extractTags.test.ts`

**Interfaces:**
- Produces: `TrendItem { source: 'hacker-news'|'reddit'|'github-trending'|'stack-overflow'; title: string; url: string; tags: string[]; rawSignal: number; fetchedAt: string }` — used by every source adapter, the pre-filter, and enrichment.
- Produces: `SourceAdapter { name: TrendItem['source']; fetchTrending(): Promise<TrendItem[]> }` — implemented by every adapter in Tasks 3–6.
- Produces: `extractTags(text: string): string[]` — used by the Hacker News and Reddit adapters to derive tags from free text.

- [ ] **Step 1: Write the failing test for extractTags**

```ts
// tests/lib/sources/extractTags.test.ts
import { describe, it, expect } from 'vitest';
import { extractTags } from '@/lib/sources/extractTags';

describe('extractTags', () => {
  it('lowercases words and strips stopwords/short tokens', () => {
    expect(extractTags('Show HN: A new React Server Components library')).toEqual([
      'show',
      'react',
      'server',
      'components',
      'library',
    ]);
  });

  it('deduplicates repeated words', () => {
    expect(extractTags('Rust rust RUST')).toEqual(['rust']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/sources/extractTags.test.ts`
Expected: FAIL — `Cannot find module '@/lib/sources/extractTags'`

- [ ] **Step 3: Write the types and implementation**

```ts
// src/lib/sources/types.ts
export interface TrendItem {
  source: 'hacker-news' | 'reddit' | 'github-trending' | 'stack-overflow';
  title: string;
  url: string;
  tags: string[];
  rawSignal: number;
  fetchedAt: string;
}

export interface SourceAdapter {
  name: TrendItem['source'];
  fetchTrending(): Promise<TrendItem[]>;
}
```

```ts
// src/lib/sources/extractTags.ts
const STOPWORDS = new Set([
  'the', 'a', 'an', 'of', 'to', 'in', 'for', 'and', 'is', 'on', 'with', 'hn',
]);

export function extractTags(text: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const word of text
    .toLowerCase()
    .replace(/[^a-z0-9\s.+#-]/g, '')
    .split(/\s+/)) {
    if (word.length > 2 && !STOPWORDS.has(word) && !seen.has(word)) {
      seen.add(word);
      result.push(word);
    }
  }

  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/sources/extractTags.test.ts`
Expected: PASS — `2 passed`

- [ ] **Step 5: Commit**

```bash
git add src/lib/sources/types.ts src/lib/sources/extractTags.ts tests/lib/sources/extractTags.test.ts
git commit -m "feat: add source adapter interface and tag extractor"
```

---

### Task 3: Hacker News adapter

**Files:**
- Create: `src/lib/sources/hackerNews.ts`
- Test: `tests/lib/sources/hackerNews.test.ts`

**Interfaces:**
- Consumes: `TrendItem`, `SourceAdapter` from `@/lib/sources/types`; `extractTags` from `@/lib/sources/extractTags`.
- Produces: `hackerNewsAdapter: SourceAdapter` — added to the aggregator's adapter list in Task 7.

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/sources/hackerNews.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { hackerNewsAdapter } from '@/lib/sources/hackerNews';

describe('hackerNewsAdapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('maps HN Algolia hits into TrendItems', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          hits: [
            { objectID: '1', title: 'Bun 2.0 released', url: 'https://bun.sh', points: 500 },
            { objectID: '2', title: 'Ask HN: best rust crates', url: null, points: 20 },
          ],
        }),
      })
    );

    const items = await hackerNewsAdapter.fetchTrending();

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      source: 'hacker-news',
      title: 'Bun 2.0 released',
      url: 'https://bun.sh',
      rawSignal: 500,
    });
    expect(items[0].tags).toContain('bun');
    expect(items[1].url).toBe('https://news.ycombinator.com/item?id=2');
  });

  it('throws when the API returns a non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));

    await expect(hackerNewsAdapter.fetchTrending()).rejects.toThrow('503');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/sources/hackerNews.test.ts`
Expected: FAIL — `Cannot find module '@/lib/sources/hackerNews'`

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/sources/hackerNews.ts
import type { SourceAdapter, TrendItem } from './types';
import { extractTags } from './extractTags';

const HN_API_URL = 'https://hn.algolia.com/api/v1/search?tags=front_page';

interface HnHit {
  objectID: string;
  title: string | null;
  url: string | null;
  points: number | null;
}

export const hackerNewsAdapter: SourceAdapter = {
  name: 'hacker-news',
  async fetchTrending(): Promise<TrendItem[]> {
    const response = await fetch(HN_API_URL);
    if (!response.ok) {
      throw new Error(`Hacker News API returned ${response.status}`);
    }

    const data = (await response.json()) as { hits: HnHit[] };
    const fetchedAt = new Date().toISOString();

    return data.hits.map((hit) => ({
      source: 'hacker-news' as const,
      title: hit.title ?? '',
      url: hit.url ?? `https://news.ycombinator.com/item?id=${hit.objectID}`,
      tags: extractTags(hit.title ?? ''),
      rawSignal: hit.points ?? 0,
      fetchedAt,
    }));
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/sources/hackerNews.test.ts`
Expected: PASS — `2 passed`

- [ ] **Step 5: Commit**

```bash
git add src/lib/sources/hackerNews.ts tests/lib/sources/hackerNews.test.ts
git commit -m "feat: add Hacker News source adapter"
```

---

### Task 4: Reddit adapter

**Files:**
- Create: `src/lib/sources/reddit.ts`
- Test: `tests/lib/sources/reddit.test.ts`

**Interfaces:**
- Consumes: `TrendItem`, `SourceAdapter` from `@/lib/sources/types`; `extractTags` from `@/lib/sources/extractTags`.
- Produces: `redditAdapter: SourceAdapter` — added to the aggregator's adapter list in Task 7.

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/sources/reddit.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { redditAdapter } from '@/lib/sources/reddit';

describe('redditAdapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('maps Reddit listing children into TrendItems', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {
            children: [
              {
                data: {
                  title: 'Svelte 5 is out',
                  url: 'https://svelte.dev',
                  ups: 342,
                  permalink: '/r/programming/comments/abc/svelte_5/',
                },
              },
            ],
          },
        }),
      })
    );

    const items = await redditAdapter.fetchTrending();

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      source: 'reddit',
      title: 'Svelte 5 is out',
      url: 'https://svelte.dev',
      rawSignal: 342,
    });
    expect(items[0].tags).toContain('svelte');
  });

  it('throws when the API returns a non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429 }));

    await expect(redditAdapter.fetchTrending()).rejects.toThrow('429');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/sources/reddit.test.ts`
Expected: FAIL — `Cannot find module '@/lib/sources/reddit'`

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/sources/reddit.ts
import type { SourceAdapter, TrendItem } from './types';
import { extractTags } from './extractTags';

const REDDIT_API_URL = 'https://www.reddit.com/r/programming/top.json?limit=25&t=week';

interface RedditChild {
  data: {
    title: string;
    url: string | null;
    ups: number;
    permalink: string;
  };
}

export const redditAdapter: SourceAdapter = {
  name: 'reddit',
  async fetchTrending(): Promise<TrendItem[]> {
    const response = await fetch(REDDIT_API_URL, {
      headers: { 'User-Agent': 'tech-relevance-advisor/0.1' },
    });
    if (!response.ok) {
      throw new Error(`Reddit API returned ${response.status}`);
    }

    const data = (await response.json()) as { data: { children: RedditChild[] } };
    const fetchedAt = new Date().toISOString();

    return data.data.children.map(({ data: post }) => ({
      source: 'reddit' as const,
      title: post.title,
      url: post.url ?? `https://reddit.com${post.permalink}`,
      tags: extractTags(post.title),
      rawSignal: post.ups,
      fetchedAt,
    }));
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/sources/reddit.test.ts`
Expected: PASS — `2 passed`

- [ ] **Step 5: Commit**

```bash
git add src/lib/sources/reddit.ts tests/lib/sources/reddit.test.ts
git commit -m "feat: add Reddit source adapter"
```

---

### Task 5: GitHub trending adapter

**Files:**
- Create: `src/lib/sources/githubTrending.ts`
- Test: `tests/lib/sources/githubTrending.test.ts`

**Interfaces:**
- Consumes: `TrendItem`, `SourceAdapter` from `@/lib/sources/types`.
- Produces: `githubTrendingAdapter: SourceAdapter` — added to the aggregator's adapter list in Task 7.

Uses the official GitHub Search API (repos created in the last 7 days, sorted by stars) rather than scraping the unofficial trending page, since the design spec's error-handling requires deterministic HTTP failure modes that a scraper can't reliably guarantee.

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/sources/githubTrending.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { githubTrendingAdapter } from '@/lib/sources/githubTrending';

describe('githubTrendingAdapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('maps GitHub search results into TrendItems', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          items: [
            {
              full_name: 'someorg/cool-lib',
              html_url: 'https://github.com/someorg/cool-lib',
              stargazers_count: 1200,
              language: 'TypeScript',
              topics: ['ai', 'agents'],
            },
          ],
        }),
      })
    );

    const items = await githubTrendingAdapter.fetchTrending();

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      source: 'github-trending',
      title: 'someorg/cool-lib',
      url: 'https://github.com/someorg/cool-lib',
      rawSignal: 1200,
    });
    expect(items[0].tags).toEqual(expect.arrayContaining(['typescript', 'ai', 'agents']));
  });

  it('throws when the API returns a non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 }));

    await expect(githubTrendingAdapter.fetchTrending()).rejects.toThrow('403');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/sources/githubTrending.test.ts`
Expected: FAIL — `Cannot find module '@/lib/sources/githubTrending'`

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/sources/githubTrending.ts
import type { SourceAdapter, TrendItem } from './types';

const GITHUB_SEARCH_URL = 'https://api.github.com/search/repositories';

interface GitHubRepoItem {
  full_name: string;
  html_url: string;
  stargazers_count: number;
  language: string | null;
  topics: string[];
}

function sevenDaysAgoIso(): string {
  const date = new Date();
  date.setDate(date.getDate() - 7);
  return date.toISOString().slice(0, 10);
}

export const githubTrendingAdapter: SourceAdapter = {
  name: 'github-trending',
  async fetchTrending(): Promise<TrendItem[]> {
    const query = `created:>${sevenDaysAgoIso()}`;
    const url = `${GITHUB_SEARCH_URL}?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=25`;
    const response = await fetch(url, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!response.ok) {
      throw new Error(`GitHub search API returned ${response.status}`);
    }

    const data = (await response.json()) as { items: GitHubRepoItem[] };
    const fetchedAt = new Date().toISOString();

    return data.items.map((repo) => ({
      source: 'github-trending' as const,
      title: repo.full_name,
      url: repo.html_url,
      tags: [
        ...(repo.language ? [repo.language.toLowerCase()] : []),
        ...repo.topics.map((topic) => topic.toLowerCase()),
      ],
      rawSignal: repo.stargazers_count,
      fetchedAt,
    }));
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/sources/githubTrending.test.ts`
Expected: PASS — `2 passed`

- [ ] **Step 5: Commit**

```bash
git add src/lib/sources/githubTrending.ts tests/lib/sources/githubTrending.test.ts
git commit -m "feat: add GitHub trending source adapter"
```

---

### Task 6: Stack Overflow adapter

**Files:**
- Create: `src/lib/sources/stackOverflow.ts`
- Test: `tests/lib/sources/stackOverflow.test.ts`

**Interfaces:**
- Consumes: `TrendItem`, `SourceAdapter` from `@/lib/sources/types`.
- Produces: `stackOverflowAdapter: SourceAdapter` — added to the aggregator's adapter list in Task 7.

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/sources/stackOverflow.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { stackOverflowAdapter } from '@/lib/sources/stackOverflow';

describe('stackOverflowAdapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('maps Stack Exchange questions into TrendItems', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          items: [
            {
              title: 'How to use React Server Components with Next.js 14?',
              link: 'https://stackoverflow.com/q/123',
              view_count: 5000,
              tags: ['reactjs', 'next.js'],
            },
          ],
        }),
      })
    );

    const items = await stackOverflowAdapter.fetchTrending();

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      source: 'stack-overflow',
      url: 'https://stackoverflow.com/q/123',
      rawSignal: 5000,
      tags: ['reactjs', 'next.js'],
    });
  });

  it('throws when the API returns a non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400 }));

    await expect(stackOverflowAdapter.fetchTrending()).rejects.toThrow('400');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/sources/stackOverflow.test.ts`
Expected: FAIL — `Cannot find module '@/lib/sources/stackOverflow'`

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/sources/stackOverflow.ts
import type { SourceAdapter, TrendItem } from './types';

const SO_API_URL =
  'https://api.stackexchange.com/2.3/questions?order=desc&sort=activity&site=stackoverflow&pagesize=50';

interface SoQuestion {
  title: string;
  link: string;
  view_count: number;
  tags: string[];
}

export const stackOverflowAdapter: SourceAdapter = {
  name: 'stack-overflow',
  async fetchTrending(): Promise<TrendItem[]> {
    const response = await fetch(SO_API_URL);
    if (!response.ok) {
      throw new Error(`Stack Exchange API returned ${response.status}`);
    }

    const data = (await response.json()) as { items: SoQuestion[] };
    const fetchedAt = new Date().toISOString();

    return data.items.map((question) => ({
      source: 'stack-overflow' as const,
      title: question.title,
      url: question.link,
      tags: question.tags.map((tag) => tag.toLowerCase()),
      rawSignal: question.view_count,
      fetchedAt,
    }));
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/sources/stackOverflow.test.ts`
Expected: PASS — `2 passed`

- [ ] **Step 5: Commit**

```bash
git add src/lib/sources/stackOverflow.ts tests/lib/sources/stackOverflow.test.ts
git commit -m "feat: add Stack Overflow source adapter"
```

---

### Task 7: Ingestion aggregator (parallel fetch, retry, partial failure)

**Files:**
- Create: `src/lib/sources/index.ts`
- Test: `tests/lib/sources/index.test.ts`

**Interfaces:**
- Consumes: `SourceAdapter`, `TrendItem` from `@/lib/sources/types`; the four adapters from Tasks 3–6.
- Produces: `IngestionResult { items: TrendItem[]; failedSources: string[] }` and `fetchAllTrending(adapters?: SourceAdapter[]): Promise<IngestionResult>` — consumed by the pipeline orchestrator in Task 16.

Implements the spec's error-handling rule: each adapter is retried with backoff before being counted as failed; a failing source is skipped (not fatal to the run).

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/sources/index.test.ts
import { describe, it, expect, vi } from 'vitest';
import { fetchAllTrending } from '@/lib/sources';
import type { SourceAdapter, TrendItem } from '@/lib/sources/types';

function makeItem(source: TrendItem['source'], title: string): TrendItem {
  return { source, title, url: `https://example.com/${title}`, tags: [], rawSignal: 1, fetchedAt: 'now' };
}

describe('fetchAllTrending', () => {
  it('aggregates items from all adapters that succeed', async () => {
    const good: SourceAdapter = {
      name: 'hacker-news',
      fetchTrending: vi.fn().mockResolvedValue([makeItem('hacker-news', 'a')]),
    };
    const alsoGood: SourceAdapter = {
      name: 'reddit',
      fetchTrending: vi.fn().mockResolvedValue([makeItem('reddit', 'b')]),
    };

    const result = await fetchAllTrending([good, alsoGood]);

    expect(result.items).toHaveLength(2);
    expect(result.failedSources).toEqual([]);
  });

  it('retries a failing adapter, then skips it and reports it as failed without throwing', async () => {
    const flaky: SourceAdapter = {
      name: 'github-trending',
      fetchTrending: vi.fn().mockRejectedValue(new Error('boom')),
    };
    const good: SourceAdapter = {
      name: 'stack-overflow',
      fetchTrending: vi.fn().mockResolvedValue([makeItem('stack-overflow', 'c')]),
    };

    const result = await fetchAllTrending([flaky, good]);

    expect(flaky.fetchTrending).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
    expect(result.items).toHaveLength(1);
    expect(result.failedSources).toEqual(['github-trending']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/sources/index.test.ts`
Expected: FAIL — `Cannot find module '@/lib/sources'`

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/sources/index.ts
import { hackerNewsAdapter } from './hackerNews';
import { redditAdapter } from './reddit';
import { githubTrendingAdapter } from './githubTrending';
import { stackOverflowAdapter } from './stackOverflow';
import type { SourceAdapter, TrendItem } from './types';

export const allAdapters: SourceAdapter[] = [
  hackerNewsAdapter,
  redditAdapter,
  githubTrendingAdapter,
  stackOverflowAdapter,
];

export interface IngestionResult {
  items: TrendItem[];
  failedSources: string[];
}

async function withRetry<T>(fn: () => Promise<T>, retries = 2, delayMs = 200): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, delayMs * 2 ** attempt));
      }
    }
  }
  throw lastError;
}

export async function fetchAllTrending(adapters: SourceAdapter[] = allAdapters): Promise<IngestionResult> {
  const items: TrendItem[] = [];
  const failedSources: string[] = [];

  const results = await Promise.allSettled(
    adapters.map((adapter) => withRetry(() => adapter.fetchTrending()))
  );

  results.forEach((result, index) => {
    const adapter = adapters[index];
    if (result.status === 'fulfilled') {
      items.push(...result.value);
    } else {
      failedSources.push(adapter.name);
      console.error(`Ingestion failed for source ${adapter.name}:`, result.reason);
    }
  });

  return { items, failedSources };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/sources/index.test.ts`
Expected: PASS — `2 passed`

- [ ] **Step 5: Commit**

```bash
git add src/lib/sources/index.ts tests/lib/sources/index.test.ts
git commit -m "feat: add ingestion aggregator with retry and partial-failure handling"
```

---

### Task 8: Profile types & stack-tag derivation

**Files:**
- Create: `src/lib/profile/types.ts`
- Create: `src/lib/profile/deriveStackTags.ts`
- Test: `tests/lib/profile/deriveStackTags.test.ts`

**Interfaces:**
- Produces: `StackTag { tag: string; weight: number }`, `GoalTag { tag: string }`, `Profile { id: string; stackTags: StackTag[]; goalTags: GoalTag[] }` — used by the pre-filter (Task 13) and enrichment (Task 14).
- Produces: `GitHubRepoSummary { language: string | null; topics: string[] }` and `deriveStackTags(repos: GitHubRepoSummary[]): StackTag[]` — consumed by Task 9's network fetcher.

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/profile/deriveStackTags.test.ts
import { describe, it, expect } from 'vitest';
import { deriveStackTags } from '@/lib/profile/deriveStackTags';

describe('deriveStackTags', () => {
  it('weights primary language higher than topics, normalized to 0-1', () => {
    const tags = deriveStackTags([
      { language: 'TypeScript', topics: ['react'] },
      { language: 'TypeScript', topics: ['nextjs'] },
    ]);

    expect(tags[0]).toMatchObject({ tag: 'typescript', weight: 1 });
    expect(tags.find((t) => t.tag === 'react')?.weight).toBeLessThan(1);
  });

  it('returns an empty array for no repos', () => {
    expect(deriveStackTags([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/profile/deriveStackTags.test.ts`
Expected: FAIL — `Cannot find module '@/lib/profile/deriveStackTags'`

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/profile/types.ts
export interface StackTag {
  tag: string;
  weight: number;
}

export interface GoalTag {
  tag: string;
}

export interface Profile {
  id: string;
  stackTags: StackTag[];
  goalTags: GoalTag[];
}
```

```ts
// src/lib/profile/deriveStackTags.ts
import type { StackTag } from './types';

export interface GitHubRepoSummary {
  language: string | null;
  topics: string[];
}

export function deriveStackTags(repos: GitHubRepoSummary[]): StackTag[] {
  const counts = new Map<string, number>();

  for (const repo of repos) {
    if (repo.language) {
      const tag = repo.language.toLowerCase();
      counts.set(tag, (counts.get(tag) ?? 0) + 2);
    }
    for (const topic of repo.topics) {
      const tag = topic.toLowerCase();
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }

  if (counts.size === 0) return [];

  const maxCount = Math.max(...counts.values());

  return Array.from(counts.entries())
    .map(([tag, count]) => ({ tag, weight: count / maxCount }))
    .sort((a, b) => b.weight - a.weight);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/profile/deriveStackTags.test.ts`
Expected: PASS — `2 passed`

- [ ] **Step 5: Commit**

```bash
git add src/lib/profile/types.ts src/lib/profile/deriveStackTags.ts tests/lib/profile/deriveStackTags.test.ts
git commit -m "feat: add profile types and stack-tag derivation"
```

---

### Task 9: GitHub stack-tag fetcher, Supabase clients, and auth callback

**Files:**
- Create: `src/lib/profile/fetchGitHubStackTags.ts`
- Create: `src/lib/supabase/server.ts`
- Create: `src/app/api/auth/callback/route.ts`
- Test: `tests/lib/profile/fetchGitHubStackTags.test.ts`

**Interfaces:**
- Consumes: `deriveStackTags`, `GitHubRepoSummary` from `@/lib/profile/deriveStackTags`; `StackTag` from `@/lib/profile/types`.
- Produces: `fetchGitHubStackTags(accessToken: string): Promise<StackTag[]>` — used by the auth callback route below.
- Produces: `createServerSupabaseClient()` (cookie-based, respects the signed-in user) and `createServiceSupabaseClient()` (service-role, used by cron jobs) from `@/lib/supabase/server` — used by every later route/pipeline task.

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/profile/fetchGitHubStackTags.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchGitHubStackTags } from '@/lib/profile/fetchGitHubStackTags';

describe('fetchGitHubStackTags', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches repos and derives stack tags', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          { language: 'Go', topics: ['grpc'] },
          { language: 'Go', topics: [] },
        ],
      })
    );

    const tags = await fetchGitHubStackTags('fake-token');

    expect(tags[0]).toMatchObject({ tag: 'go', weight: 1 });
  });

  it('throws when the GitHub API returns a non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));

    await expect(fetchGitHubStackTags('bad-token')).rejects.toThrow('401');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/profile/fetchGitHubStackTags.test.ts`
Expected: FAIL — `Cannot find module '@/lib/profile/fetchGitHubStackTags'`

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/profile/fetchGitHubStackTags.ts
import { deriveStackTags, type GitHubRepoSummary } from './deriveStackTags';
import type { StackTag } from './types';

const GITHUB_REPOS_URL = 'https://api.github.com/user/repos?per_page=100&sort=updated';

export async function fetchGitHubStackTags(accessToken: string): Promise<StackTag[]> {
  const response = await fetch(GITHUB_REPOS_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github+json',
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub repos API returned ${response.status}`);
  }

  const repos = (await response.json()) as Array<{ language: string | null; topics?: string[] }>;
  const summaries: GitHubRepoSummary[] = repos.map((repo) => ({
    language: repo.language,
    topics: repo.topics ?? [],
  }));

  return deriveStackTags(summaries);
}
```

```ts
// src/lib/supabase/server.ts
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export function createServerSupabaseClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: Record<string, unknown>) {
          cookieStore.set(name, value, options);
        },
        remove(name: string, options: Record<string, unknown>) {
          cookieStore.set(name, '', { ...options, maxAge: 0 });
        },
      },
    }
  );
}

export function createServiceSupabaseClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}
```

```ts
// src/app/api/auth/callback/route.ts
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { fetchGitHubStackTags } from '@/lib/profile/fetchGitHubStackTags';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');

  if (!code) {
    return NextResponse.redirect(new URL('/setup?error=missing_code', request.url));
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.session) {
    return NextResponse.redirect(new URL('/setup?error=auth_failed', request.url));
  }

  const providerToken = data.session.provider_token;
  const user = data.session.user;

  try {
    const stackTags = providerToken ? await fetchGitHubStackTags(providerToken) : [];
    await supabase.from('profiles').upsert(
      {
        id: user.id,
        email: user.email ?? '',
        stack_tags: stackTags,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );
  } catch (fetchError) {
    console.error('Failed to derive stack tags from GitHub:', fetchError);
    await supabase
      .from('profiles')
      .upsert({ id: user.id, email: user.email ?? '' }, { onConflict: 'id', ignoreDuplicates: true });
  }

  return NextResponse.redirect(new URL('/dashboard', request.url));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/profile/fetchGitHubStackTags.test.ts`
Expected: PASS — `2 passed`

- [ ] **Step 5: Manually verify the auth flow**

In the Supabase dashboard, enable the GitHub provider under Authentication → Providers, add a GitHub OAuth app callback URL pointing at `<app-url>/api/auth/callback`. Run `npm run dev`, trigger a GitHub sign-in from the Supabase Auth UI helper (or a temporary sign-in link), and confirm a row appears in the `profiles` table with populated `stack_tags`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/profile/fetchGitHubStackTags.ts src/lib/supabase/server.ts src/app/api/auth/callback/route.ts tests/lib/profile/fetchGitHubStackTags.test.ts
git commit -m "feat: add GitHub stack-tag fetcher and auth callback"
```

---

### Task 10: Goal-tag normalization & one-time setup form

**Files:**
- Create: `src/lib/profile/normalizeGoalTags.ts`
- Create: `src/app/api/profile/goals/route.ts`
- Create: `src/app/setup/page.tsx`
- Test: `tests/lib/profile/normalizeGoalTags.test.ts`

**Interfaces:**
- Produces: `normalizeGoalTags(rawInput: string): string[]` — used by the goals API route; kept pure so it's covered by an automated test independent of the route/HTTP layer.

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/profile/normalizeGoalTags.test.ts
import { describe, it, expect } from 'vitest';
import { normalizeGoalTags } from '@/lib/profile/normalizeGoalTags';

describe('normalizeGoalTags', () => {
  it('splits on commas, trims, lowercases, and dedupes', () => {
    expect(normalizeGoalTags(' Backend Infra, AI/ML, backend infra ')).toEqual([
      'backend infra',
      'ai/ml',
    ]);
  });

  it('returns an empty array for blank input', () => {
    expect(normalizeGoalTags('   ')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/profile/normalizeGoalTags.test.ts`
Expected: FAIL — `Cannot find module '@/lib/profile/normalizeGoalTags'`

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/profile/normalizeGoalTags.ts
export function normalizeGoalTags(rawInput: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const raw of rawInput.split(',')) {
    const tag = raw.trim().toLowerCase();
    if (tag.length > 0 && !seen.has(tag)) {
      seen.add(tag);
      result.push(tag);
    }
  }

  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/profile/normalizeGoalTags.test.ts`
Expected: PASS — `2 passed`

- [ ] **Step 5: Write the goals API route**

```ts
// src/app/api/profile/goals/route.ts
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { normalizeGoalTags } from '@/lib/profile/normalizeGoalTags';

export async function POST(request: Request) {
  const { rawInput } = await request.json();
  if (typeof rawInput !== 'string') {
    return NextResponse.json({ error: 'rawInput must be a string' }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const goalTags = normalizeGoalTags(rawInput).map((tag) => ({ tag }));

  const { error } = await supabase
    .from('profiles')
    .update({ goal_tags: goalTags, updated_at: new Date().toISOString() })
    .eq('id', user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ goalTags });
}
```

- [ ] **Step 6: Write the setup page**

```tsx
// src/app/setup/page.tsx
'use client';

import { useState } from 'react';

export default function SetupPage() {
  const [rawInput, setRawInput] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setStatus('saving');
    const response = await fetch('/api/profile/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rawInput }),
    });
    setStatus(response.ok ? 'saved' : 'error');
  }

  return (
    <main>
      <h1>What are you growing toward?</h1>
      <p>List 1-2 growth directions, comma-separated (e.g. "backend infra, ai/ml").</p>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          value={rawInput}
          onChange={(event) => setRawInput(event.target.value)}
          placeholder="backend infra, ai/ml"
        />
        <button type="submit" disabled={status === 'saving'}>
          Save
        </button>
      </form>
      {status === 'saved' && <p>Saved.</p>}
      {status === 'error' && <p>Something went wrong — try again.</p>}
    </main>
  );
}
```

- [ ] **Step 7: Manually verify the route**

Run: `npm run dev`, sign in (Task 9), then from the browser console on `/setup`:
`fetch('/api/profile/goals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rawInput: 'backend infra, ai/ml' }) }).then(r => r.json()).then(console.log)`
Expected: `{ goalTags: [{ tag: 'backend infra' }, { tag: 'ai/ml' }] }`, and the `profiles` row's `goal_tags` column reflects it.

- [ ] **Step 8: Commit**

```bash
git add src/lib/profile/normalizeGoalTags.ts src/app/api/profile/goals/route.ts src/app/setup/page.tsx tests/lib/profile/normalizeGoalTags.test.ts
git commit -m "feat: add goal-tag normalization and setup form"
```

---

### Task 11: Tag-overlap scoring

**Files:**
- Create: `src/lib/prefilter/scoreTagOverlap.ts`
- Test: `tests/lib/prefilter/scoreTagOverlap.test.ts`

**Interfaces:**
- Consumes: `TrendItem` from `@/lib/sources/types`; `StackTag`, `GoalTag` from `@/lib/profile/types`.
- Produces: `OverlapScore { maintainScore: number; growScore: number }` and `scoreTagOverlap(item: TrendItem, stackTags: StackTag[], goalTags: GoalTag[]): OverlapScore` — used by the pre-filter combiner in Task 13.

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/prefilter/scoreTagOverlap.test.ts
import { describe, it, expect } from 'vitest';
import { scoreTagOverlap } from '@/lib/prefilter/scoreTagOverlap';
import type { TrendItem } from '@/lib/sources/types';

const item: TrendItem = {
  source: 'hacker-news',
  title: 'React Server Components deep dive',
  url: 'https://example.com',
  tags: ['react', 'server', 'components'],
  rawSignal: 100,
  fetchedAt: 'now',
};

describe('scoreTagOverlap', () => {
  it('sums stack-tag weights for maintain, and counts goal-tag matches for grow', () => {
    const result = scoreTagOverlap(
      item,
      [{ tag: 'react', weight: 0.8 }, { tag: 'python', weight: 1 }],
      [{ tag: 'server' }]
    );

    expect(result.maintainScore).toBeCloseTo(0.8);
    expect(result.growScore).toBe(1);
  });

  it('returns zero scores when nothing overlaps', () => {
    const result = scoreTagOverlap(item, [{ tag: 'rust', weight: 1 }], [{ tag: 'kubernetes' }]);
    expect(result).toEqual({ maintainScore: 0, growScore: 0 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/prefilter/scoreTagOverlap.test.ts`
Expected: FAIL — `Cannot find module '@/lib/prefilter/scoreTagOverlap'`

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/prefilter/scoreTagOverlap.ts
import type { StackTag, GoalTag } from '../profile/types';
import type { TrendItem } from '../sources/types';

export interface OverlapScore {
  maintainScore: number;
  growScore: number;
}

export function scoreTagOverlap(item: TrendItem, stackTags: StackTag[], goalTags: GoalTag[]): OverlapScore {
  const itemTags = new Set(item.tags.map((tag) => tag.toLowerCase()));

  const maintainScore = stackTags.reduce(
    (total, stackTag) => (itemTags.has(stackTag.tag) ? total + stackTag.weight : total),
    0
  );

  const growScore = goalTags.reduce(
    (total, goalTag) => (itemTags.has(goalTag.tag) ? total + 1 : total),
    0
  );

  return { maintainScore, growScore };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/prefilter/scoreTagOverlap.test.ts`
Expected: PASS — `2 passed`

- [ ] **Step 5: Commit**

```bash
git add src/lib/prefilter/scoreTagOverlap.ts tests/lib/prefilter/scoreTagOverlap.test.ts
git commit -m "feat: add tag-overlap scoring"
```

---

### Task 12: Embedding similarity

**Files:**
- Create: `src/lib/prefilter/embeddingSimilarity.ts`
- Test: `tests/lib/prefilter/embeddingSimilarity.test.ts`

**Interfaces:**
- Produces: `embedTexts(texts: string[], apiKey: string): Promise<number[][]>` and `cosineSimilarity(a: number[], b: number[]): number` — used by the pre-filter combiner in Task 13.

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/prefilter/embeddingSimilarity.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { embedTexts, cosineSimilarity } from '@/lib/prefilter/embeddingSimilarity';

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
  });

  it('returns 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it('returns 0 when a vector is all zeros', () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
});

describe('embedTexts', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts texts to the Voyage API and returns embeddings', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: [{ embedding: [0.1, 0.2] }, { embedding: [0.3, 0.4] }] }),
      })
    );

    const result = await embedTexts(['a', 'b'], 'fake-key');
    expect(result).toEqual([[0.1, 0.2], [0.3, 0.4]]);
  });

  it('throws when the API returns a non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));
    await expect(embedTexts(['a'], 'bad-key')).rejects.toThrow('401');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/prefilter/embeddingSimilarity.test.ts`
Expected: FAIL — `Cannot find module '@/lib/prefilter/embeddingSimilarity'`

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/prefilter/embeddingSimilarity.ts
const VOYAGE_API_URL = 'https://api.voyageai.com/v1/embeddings';

export async function embedTexts(texts: string[], apiKey: string): Promise<number[][]> {
  const response = await fetch(VOYAGE_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ input: texts, model: 'voyage-3-lite' }),
  });

  if (!response.ok) {
    throw new Error(`Voyage embeddings API returned ${response.status}`);
  }

  const data = (await response.json()) as { data: Array<{ embedding: number[] }> };
  return data.data.map((entry) => entry.embedding);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/prefilter/embeddingSimilarity.test.ts`
Expected: PASS — `5 passed`

- [ ] **Step 5: Commit**

```bash
git add src/lib/prefilter/embeddingSimilarity.ts tests/lib/prefilter/embeddingSimilarity.test.ts
git commit -m "feat: add embedding similarity scoring"
```

---

### Task 13: Pre-filter combiner

**Files:**
- Create: `src/lib/prefilter/types.ts`
- Create: `src/lib/prefilter/prefilter.ts`
- Test: `tests/lib/prefilter/prefilter.test.ts`

**Interfaces:**
- Consumes: `TrendItem` from `@/lib/sources/types`; `Profile` from `@/lib/profile/types`; `scoreTagOverlap` from `@/lib/prefilter/scoreTagOverlap`; `embedTexts`, `cosineSimilarity` from `@/lib/prefilter/embeddingSimilarity`.
- Produces: `Candidate extends TrendItem { matchScore: number; category: 'maintain' | 'grow' }` and `prefilterItems(items: TrendItem[], profile: Profile, voyageApiKey: string): Promise<Candidate[]>` — consumed by the pipeline orchestrator in Task 16.

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/prefilter/prefilter.test.ts
import { describe, it, expect, vi } from 'vitest';
import { prefilterItems } from '@/lib/prefilter/prefilter';
import type { TrendItem } from '@/lib/sources/types';
import type { Profile } from '@/lib/profile/types';

vi.mock('@/lib/prefilter/embeddingSimilarity', () => ({
  embedTexts: vi.fn().mockResolvedValue([
    [1, 0], // stack embedding
    [0, 1], // goal embedding
    [1, 0], // item 0 (matches stack)
    [0, 1], // item 1 (matches goal)
  ]),
  cosineSimilarity: (a: number[], b: number[]) => (a[0] === b[0] && a[1] === b[1] ? 1 : 0),
}));

const profile: Profile = {
  id: 'user-1',
  stackTags: [{ tag: 'typescript', weight: 1 }],
  goalTags: [{ tag: 'ai/ml' }],
};

const items: TrendItem[] = [
  {
    source: 'hacker-news',
    title: 'TypeScript 6 release notes',
    url: 'https://a.com',
    tags: ['typescript'],
    rawSignal: 100,
    fetchedAt: 'now',
  },
  {
    source: 'reddit',
    title: 'New transformer architecture',
    url: 'https://b.com',
    tags: ['ai/ml'],
    rawSignal: 50,
    fetchedAt: 'now',
  },
];

describe('prefilterItems', () => {
  it('categorizes and ranks items by combined tag-overlap and embedding score', async () => {
    const candidates = await prefilterItems(items, profile, 'fake-key');

    expect(candidates).toHaveLength(2);
    expect(candidates.find((c) => c.url === 'https://a.com')?.category).toBe('maintain');
    expect(candidates.find((c) => c.url === 'https://b.com')?.category).toBe('grow');
  });

  it('caps the candidate list at 20 items', async () => {
    const manyItems = Array.from({ length: 30 }, (_, i) => ({
      ...items[0],
      url: `https://item-${i}.com`,
    }));

    const { embedTexts } = await import('@/lib/prefilter/embeddingSimilarity');
    vi.mocked(embedTexts).mockResolvedValueOnce([
      [1, 0],
      [0, 1],
      ...Array.from({ length: 30 }, () => [1, 0]),
    ]);

    const candidates = await prefilterItems(manyItems, profile, 'fake-key');
    expect(candidates.length).toBeLessThanOrEqual(20);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/prefilter/prefilter.test.ts`
Expected: FAIL — `Cannot find module '@/lib/prefilter/prefilter'`

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/prefilter/types.ts
import type { TrendItem } from '../sources/types';

export interface Candidate extends TrendItem {
  matchScore: number;
  category: 'maintain' | 'grow';
}
```

```ts
// src/lib/prefilter/prefilter.ts
import type { TrendItem } from '../sources/types';
import type { Profile } from '../profile/types';
import type { Candidate } from './types';
import { scoreTagOverlap } from './scoreTagOverlap';
import { embedTexts, cosineSimilarity } from './embeddingSimilarity';

const CANDIDATE_LIMIT = 20;
const EMBEDDING_WEIGHT = 0.5;

export async function prefilterItems(
  items: TrendItem[],
  profile: Profile,
  voyageApiKey: string
): Promise<Candidate[]> {
  const stackText = profile.stackTags.map((t) => t.tag).join(', ') || 'no stack tags';
  const goalText = profile.goalTags.map((t) => t.tag).join(', ') || 'no goal tags';
  const itemTexts = items.map((item) => `${item.title} ${item.tags.join(' ')}`);

  const embeddings = await embedTexts([stackText, goalText, ...itemTexts], voyageApiKey);
  const [stackEmbedding, goalEmbedding, ...itemEmbeddings] = embeddings;

  const scored: Candidate[] = items.map((item, index) => {
    const overlap = scoreTagOverlap(item, profile.stackTags, profile.goalTags);
    const itemEmbedding = itemEmbeddings[index];
    const maintainSimilarity = cosineSimilarity(itemEmbedding, stackEmbedding);
    const growSimilarity = profile.goalTags.length > 0 ? cosineSimilarity(itemEmbedding, goalEmbedding) : 0;

    const maintainTotal = overlap.maintainScore + EMBEDDING_WEIGHT * maintainSimilarity;
    const growTotal = overlap.growScore + EMBEDDING_WEIGHT * growSimilarity;

    const category: 'maintain' | 'grow' = growTotal > maintainTotal ? 'grow' : 'maintain';

    return { ...item, matchScore: Math.max(maintainTotal, growTotal), category };
  });

  return scored.sort((a, b) => b.matchScore - a.matchScore).slice(0, CANDIDATE_LIMIT);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/prefilter/prefilter.test.ts`
Expected: PASS — `2 passed`

- [ ] **Step 5: Commit**

```bash
git add src/lib/prefilter/types.ts src/lib/prefilter/prefilter.ts tests/lib/prefilter/prefilter.test.ts
git commit -m "feat: add pre-filter combiner ranking and bucketing candidates"
```

---

### Task 14: LLM enrichment with fallback

**Files:**
- Create: `src/lib/enrichment/types.ts`
- Create: `src/lib/enrichment/enrich.ts`
- Test: `tests/lib/enrichment/enrich.test.ts`

**Interfaces:**
- Consumes: `Candidate` from `@/lib/prefilter/types`; `Profile` from `@/lib/profile/types`.
- Produces: `EnrichedRecommendation extends Candidate { blurb: string; learningAction: string; learningTimeEstimate: string }` and `enrichCandidate(candidate: Candidate, profile: Profile, client: Pick<Anthropic, 'messages'>): Promise<EnrichedRecommendation>` — consumed by the pipeline orchestrator in Task 16. The `client` parameter is injected (not constructed inside) so it can be swapped for a fake in tests.

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/enrichment/enrich.test.ts
import { describe, it, expect, vi } from 'vitest';
import { enrichCandidate } from '@/lib/enrichment/enrich';
import type { Candidate } from '@/lib/prefilter/types';
import type { Profile } from '@/lib/profile/types';

const candidate: Candidate = {
  source: 'hacker-news',
  title: 'Bun 2.0 released',
  url: 'https://bun.sh',
  tags: ['bun'],
  rawSignal: 500,
  fetchedAt: 'now',
  matchScore: 0.9,
  category: 'maintain',
};

const profile: Profile = {
  id: 'user-1',
  stackTags: [{ tag: 'javascript', weight: 1 }],
  goalTags: [],
};

function textResponse(json: string) {
  return { content: [{ type: 'text', text: json }] };
}

describe('enrichCandidate', () => {
  it('returns the parsed LLM payload merged onto the candidate', async () => {
    const client = {
      messages: {
        create: vi.fn().mockResolvedValue(
          textResponse(
            JSON.stringify({
              blurb: 'Bun 2.0 matters because you use JavaScript daily.',
              learningAction: 'Skim the release notes',
              learningTimeEstimate: '20 minutes',
            })
          )
        ),
      },
    };

    const result = await enrichCandidate(candidate, profile, client as any);

    expect(result.blurb).toContain('Bun 2.0');
    expect(result.learningAction).toBe('Skim the release notes');
    expect(result.learningTimeEstimate).toBe('20 minutes');
    expect(result.source).toBe('hacker-news');
  });

  it('retries once, then falls back to a template on repeated failure', async () => {
    const client = {
      messages: {
        create: vi.fn().mockRejectedValue(new Error('rate limited')),
      },
    };

    const result = await enrichCandidate(candidate, profile, client as any);

    expect(client.messages.create).toHaveBeenCalledTimes(2);
    expect(result.blurb).toContain('hacker-news');
    expect(result.learningAction).toBe('');
  });

  it('falls back when the response is not valid JSON matching the expected shape', async () => {
    const client = {
      messages: {
        create: vi.fn().mockResolvedValue(textResponse('not json')),
      },
    };

    const result = await enrichCandidate(candidate, profile, client as any);
    expect(result.learningAction).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/enrichment/enrich.test.ts`
Expected: FAIL — `Cannot find module '@/lib/enrichment/enrich'`

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/enrichment/types.ts
import type { Candidate } from '../prefilter/types';

export interface EnrichedRecommendation extends Candidate {
  blurb: string;
  learningAction: string;
  learningTimeEstimate: string;
}
```

```ts
// src/lib/enrichment/enrich.ts
import type Anthropic from '@anthropic-ai/sdk';
import type { Candidate } from '../prefilter/types';
import type { Profile } from '../profile/types';
import type { EnrichedRecommendation } from './types';

interface EnrichmentPayload {
  blurb: string;
  learningAction: string;
  learningTimeEstimate: string;
}

function fallbackEnrichment(candidate: Candidate): EnrichmentPayload {
  const focus = candidate.category === 'maintain' ? 'current stack' : 'growth goal';
  return {
    blurb: `Trending on ${candidate.source}, matches your ${focus} tags.`,
    learningAction: '',
    learningTimeEstimate: '',
  };
}

function isValidPayload(value: unknown): value is EnrichmentPayload {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.blurb === 'string' &&
    typeof record.learningAction === 'string' &&
    typeof record.learningTimeEstimate === 'string'
  );
}

function buildPrompt(candidate: Candidate, profile: Profile): string {
  return `You are helping a developer decide what's worth learning.
Developer's current stack tags: ${profile.stackTags.map((t) => t.tag).join(', ') || 'none'}
Developer's growth goal tags: ${profile.goalTags.map((t) => t.tag).join(', ') || 'none'}

Trending item:
Title: ${candidate.title}
Source: ${candidate.source}
Tags: ${candidate.tags.join(', ')}
Category: ${candidate.category}

Respond with ONLY a JSON object with exactly these keys:
"blurb" (1-2 sentences on why this matters to this specific developer),
"learningAction" (one concrete suggested action, e.g. "skim the release notes"),
"learningTimeEstimate" (a rough time estimate, e.g. "30 minutes").`;
}

export async function enrichCandidate(
  candidate: Candidate,
  profile: Profile,
  client: Pick<Anthropic, 'messages'>
): Promise<EnrichedRecommendation> {
  const prompt = buildPrompt(candidate, profile);

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await client.messages.create({
        model: 'claude-sonnet-5',
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }],
      } as Parameters<Anthropic['messages']['create']>[0]);

      const textBlock = (response as any).content.find((block: any) => block.type === 'text');
      if (!textBlock) {
        throw new Error('No text block in Claude response');
      }

      const parsed = JSON.parse(textBlock.text);
      if (!isValidPayload(parsed)) {
        throw new Error('Claude response did not match expected shape');
      }

      return { ...candidate, ...parsed };
    } catch {
      if (attempt === 1) {
        return { ...candidate, ...fallbackEnrichment(candidate) };
      }
    }
  }

  return { ...candidate, ...fallbackEnrichment(candidate) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/enrichment/enrich.test.ts`
Expected: PASS — `3 passed`

- [ ] **Step 5: Commit**

```bash
git add src/lib/enrichment/types.ts src/lib/enrichment/enrich.ts tests/lib/enrichment/enrich.test.ts
git commit -m "feat: add LLM enrichment with retry and template fallback"
```

---

### Task 15: Status-preserving recommendation storage

**Files:**
- Create: `src/lib/db/recommendations.ts`
- Test: `tests/lib/db/recommendations.test.ts`

**Interfaces:**
- Consumes: `EnrichedRecommendation` from `@/lib/enrichment/types`.
- Produces: `upsertRecommendation(supabase: SupabaseClient, profileId: string, recommendation: EnrichedRecommendation): Promise<void>` — consumed by the pipeline orchestrator in Task 16.

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/db/recommendations.test.ts
import { describe, it, expect, vi } from 'vitest';
import { upsertRecommendation } from '@/lib/db/recommendations';
import type { EnrichedRecommendation } from '@/lib/enrichment/types';

const recommendation: EnrichedRecommendation = {
  source: 'hacker-news',
  title: 'Bun 2.0 released',
  url: 'https://bun.sh',
  tags: ['bun'],
  rawSignal: 500,
  fetchedAt: 'now',
  matchScore: 0.9,
  category: 'maintain',
  blurb: 'Matters to you.',
  learningAction: 'Skim the docs',
  learningTimeEstimate: '20 minutes',
};

function makeSupabaseStub(existingRow: { id: string } | null) {
  const update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
  const insert = vi.fn().mockResolvedValue({ error: null });
  const maybeSingle = vi.fn().mockResolvedValue({ data: existingRow, error: null });

  const select = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({ maybeSingle }),
      }),
    }),
  });

  const from = vi.fn().mockReturnValue({ select, update, insert });
  return { from, update, insert, select };
}

describe('upsertRecommendation', () => {
  it('inserts a new row with status "new" when none exists', async () => {
    const supabase = makeSupabaseStub(null);

    await upsertRecommendation(supabase as any, 'profile-1', recommendation);

    expect(supabase.insert).toHaveBeenCalledWith(
      expect.objectContaining({ profile_id: 'profile-1', status: 'new', title: 'Bun 2.0 released' })
    );
  });

  it('updates content fields but never touches status when a row already exists', async () => {
    const supabase = makeSupabaseStub({ id: 'existing-id' });

    await upsertRecommendation(supabase as any, 'profile-1', recommendation);

    expect(supabase.update).toHaveBeenCalledWith(
      expect.not.objectContaining({ status: expect.anything() })
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/db/recommendations.test.ts`
Expected: FAIL — `Cannot find module '@/lib/db/recommendations'`

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/db/recommendations.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { EnrichedRecommendation } from '../enrichment/types';

export async function upsertRecommendation(
  supabase: SupabaseClient,
  profileId: string,
  recommendation: EnrichedRecommendation
): Promise<void> {
  const { data: existing, error: selectError } = await supabase
    .from('recommendations')
    .select('id')
    .eq('profile_id', profileId)
    .eq('source', recommendation.source)
    .eq('url', recommendation.url)
    .maybeSingle();

  if (selectError) {
    throw new Error(`Failed to check existing recommendation: ${selectError.message}`);
  }

  const contentFields = {
    profile_id: profileId,
    source: recommendation.source,
    title: recommendation.title,
    url: recommendation.url,
    category: recommendation.category,
    score: recommendation.matchScore,
    blurb: recommendation.blurb,
    learning_action: recommendation.learningAction,
    learning_time_estimate: recommendation.learningTimeEstimate,
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    const { error: updateError } = await supabase
      .from('recommendations')
      .update(contentFields)
      .eq('id', existing.id);
    if (updateError) {
      throw new Error(`Failed to update recommendation: ${updateError.message}`);
    }
    return;
  }

  const { error: insertError } = await supabase
    .from('recommendations')
    .insert({ ...contentFields, status: 'new', created_at: new Date().toISOString() });
  if (insertError) {
    throw new Error(`Failed to insert recommendation: ${insertError.message}`);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/db/recommendations.test.ts`
Expected: PASS — `2 passed`

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/recommendations.ts tests/lib/db/recommendations.test.ts
git commit -m "feat: add status-preserving recommendation upsert"
```

---

### Task 16: Pipeline orchestrator & cron route

**Files:**
- Create: `src/lib/pipeline/runPipeline.ts`
- Create: `src/app/api/cron/run/route.ts`
- Test: `tests/lib/pipeline/runPipeline.test.ts`

**Interfaces:**
- Consumes: `fetchAllTrending` from `@/lib/sources`; `prefilterItems` from `@/lib/prefilter/prefilter`; `enrichCandidate` from `@/lib/enrichment/enrich`; `upsertRecommendation` from `@/lib/db/recommendations`; `Profile` from `@/lib/profile/types`.
- Produces: `PipelineResult { processedCount: number; failedSources: string[] }` and `runPipeline(supabase, profile, claudeClient, voyageApiKey): Promise<PipelineResult>` — invoked directly by the cron route below.

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/pipeline/runPipeline.test.ts
import { describe, it, expect, vi } from 'vitest';
import { runPipeline } from '@/lib/pipeline/runPipeline';
import type { Profile } from '@/lib/profile/types';

vi.mock('@/lib/sources', () => ({
  fetchAllTrending: vi.fn(),
}));
vi.mock('@/lib/prefilter/prefilter', () => ({
  prefilterItems: vi.fn(),
}));
vi.mock('@/lib/enrichment/enrich', () => ({
  enrichCandidate: vi.fn(),
}));
vi.mock('@/lib/db/recommendations', () => ({
  upsertRecommendation: vi.fn(),
}));

const profile: Profile = { id: 'user-1', stackTags: [], goalTags: [] };
const fakeSupabase = {} as any;
const fakeClaudeClient = {} as any;

describe('runPipeline', () => {
  it('short-circuits with zero processed when ingestion returns no items', async () => {
    const { fetchAllTrending } = await import('@/lib/sources');
    vi.mocked(fetchAllTrending).mockResolvedValue({ items: [], failedSources: ['reddit'] });

    const result = await runPipeline(fakeSupabase, profile, fakeClaudeClient, 'voyage-key');

    expect(result).toEqual({ processedCount: 0, failedSources: ['reddit'] });
  });

  it('runs candidates through enrichment and storage, and reports counts', async () => {
    const { fetchAllTrending } = await import('@/lib/sources');
    const { prefilterItems } = await import('@/lib/prefilter/prefilter');
    const { enrichCandidate } = await import('@/lib/enrichment/enrich');
    const { upsertRecommendation } = await import('@/lib/db/recommendations');

    const item = {
      source: 'hacker-news',
      title: 't',
      url: 'u',
      tags: [],
      rawSignal: 1,
      fetchedAt: 'now',
    };
    const candidate = { ...item, matchScore: 1, category: 'maintain' as const };
    const enriched = { ...candidate, blurb: 'b', learningAction: 'a', learningTimeEstimate: 'e' };

    vi.mocked(fetchAllTrending).mockResolvedValue({ items: [item], failedSources: [] });
    vi.mocked(prefilterItems).mockResolvedValue([candidate]);
    vi.mocked(enrichCandidate).mockResolvedValue(enriched);
    vi.mocked(upsertRecommendation).mockResolvedValue(undefined);

    const result = await runPipeline(fakeSupabase, profile, fakeClaudeClient, 'voyage-key');

    expect(upsertRecommendation).toHaveBeenCalledWith(fakeSupabase, 'user-1', enriched);
    expect(result).toEqual({ processedCount: 1, failedSources: [] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/pipeline/runPipeline.test.ts`
Expected: FAIL — `Cannot find module '@/lib/pipeline/runPipeline'`

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/pipeline/runPipeline.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type Anthropic from '@anthropic-ai/sdk';
import { fetchAllTrending } from '../sources';
import { prefilterItems } from '../prefilter/prefilter';
import { enrichCandidate } from '../enrichment/enrich';
import { upsertRecommendation } from '../db/recommendations';
import type { Profile } from '../profile/types';

export interface PipelineResult {
  processedCount: number;
  failedSources: string[];
}

export async function runPipeline(
  supabase: SupabaseClient,
  profile: Profile,
  claudeClient: Pick<Anthropic, 'messages'>,
  voyageApiKey: string
): Promise<PipelineResult> {
  const { items, failedSources } = await fetchAllTrending();

  if (items.length === 0) {
    return { processedCount: 0, failedSources };
  }

  const candidates = await prefilterItems(items, profile, voyageApiKey);

  for (const candidate of candidates) {
    const enriched = await enrichCandidate(candidate, profile, claudeClient);
    await upsertRecommendation(supabase, profile.id, enriched);
  }

  return { processedCount: candidates.length, failedSources };
}
```

```ts
// src/app/api/cron/run/route.ts
import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createServiceSupabaseClient } from '@/lib/supabase/server';
import { runPipeline } from '@/lib/pipeline/runPipeline';

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceSupabaseClient();
  const { data: profileRows, error } = await supabase.from('profiles').select('*');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const claudeClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  const voyageApiKey = process.env.VOYAGE_API_KEY!;

  const results = [];
  for (const row of profileRows ?? []) {
    const profile = { id: row.id, stackTags: row.stack_tags, goalTags: row.goal_tags };
    const result = await runPipeline(supabase, profile, claudeClient, voyageApiKey);
    results.push({ profileId: profile.id, ...result });
  }

  return NextResponse.json({ results });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/pipeline/runPipeline.test.ts`
Expected: PASS — `2 passed`

- [ ] **Step 5: Manually verify the cron route**

Set `CRON_SECRET` in `.env.local`, run `npm run dev`, then:
`curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/run`
Expected: JSON with a `results` array; check the `recommendations` table gets new rows for the signed-in profile.

- [ ] **Step 6: Commit**

```bash
git add src/lib/pipeline/runPipeline.ts src/app/api/cron/run/route.ts tests/lib/pipeline/runPipeline.test.ts
git commit -m "feat: add pipeline orchestrator and cron trigger route"
```

---

### Task 17: Digest builder

**Files:**
- Create: `src/lib/digest/buildDigest.ts`
- Test: `tests/lib/digest/buildDigest.test.ts`

**Interfaces:**
- Produces: `DigestRecommendation { id: string; title: string; url: string; category: 'maintain' | 'grow'; blurb: string; learningAction: string; learningTimeEstimate: string }`, `DigestContent { recommendations: DigestRecommendation[]; isEmpty: boolean }`, and `buildDigest(supabase: SupabaseClient, profileId: string): Promise<DigestContent>` — consumed by Task 18's render/send step.

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/digest/buildDigest.test.ts
import { describe, it, expect, vi } from 'vitest';
import { buildDigest } from '@/lib/digest/buildDigest';

function makeSupabaseStub(lastDigestSentAt: string | null, recommendationRows: any[]) {
  const digestLogChain = {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: lastDigestSentAt ? { sent_at: lastDigestSentAt } : null,
              error: null,
            }),
          }),
        }),
      }),
    }),
  };

  const recommendationsChain = {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        gt: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: recommendationRows, error: null }),
        }),
      }),
    }),
  };

  const from = vi.fn((table: string) => (table === 'digest_log' ? digestLogChain : recommendationsChain));
  return { from };
}

describe('buildDigest', () => {
  it('returns isEmpty=true with no recommendations when there is nothing new', async () => {
    const supabase = makeSupabaseStub(null, []);

    const content = await buildDigest(supabase as any, 'profile-1');

    expect(content).toEqual({ recommendations: [], isEmpty: true });
  });

  it('maps recommendation rows created since the last digest', async () => {
    const supabase = makeSupabaseStub('2026-07-01T00:00:00.000Z', [
      {
        id: 'rec-1',
        title: 'Bun 2.0',
        url: 'https://bun.sh',
        category: 'maintain',
        blurb: 'Matters to you.',
        learning_action: 'Skim the docs',
        learning_time_estimate: '20 minutes',
      },
    ]);

    const content = await buildDigest(supabase as any, 'profile-1');

    expect(content.isEmpty).toBe(false);
    expect(content.recommendations[0]).toMatchObject({
      id: 'rec-1',
      learningAction: 'Skim the docs',
      learningTimeEstimate: '20 minutes',
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/digest/buildDigest.test.ts`
Expected: FAIL — `Cannot find module '@/lib/digest/buildDigest'`

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/digest/buildDigest.ts
import type { SupabaseClient } from '@supabase/supabase-js';

export interface DigestRecommendation {
  id: string;
  title: string;
  url: string;
  category: 'maintain' | 'grow';
  blurb: string;
  learningAction: string;
  learningTimeEstimate: string;
}

export interface DigestContent {
  recommendations: DigestRecommendation[];
  isEmpty: boolean;
}

export async function buildDigest(supabase: SupabaseClient, profileId: string): Promise<DigestContent> {
  const { data: lastDigest, error: lastDigestError } = await supabase
    .from('digest_log')
    .select('sent_at')
    .eq('profile_id', profileId)
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastDigestError) {
    throw new Error(`Failed to load last digest: ${lastDigestError.message}`);
  }

  const since = lastDigest?.sent_at ?? new Date(0).toISOString();

  const { data: rows, error } = await supabase
    .from('recommendations')
    .select('id, title, url, category, blurb, learning_action, learning_time_estimate')
    .eq('profile_id', profileId)
    .gt('created_at', since)
    .order('score', { ascending: false });

  if (error) {
    throw new Error(`Failed to load recommendations for digest: ${error.message}`);
  }

  const recommendations: DigestRecommendation[] = (rows ?? []).map((row: any) => ({
    id: row.id,
    title: row.title,
    url: row.url,
    category: row.category,
    blurb: row.blurb,
    learningAction: row.learning_action,
    learningTimeEstimate: row.learning_time_estimate,
  }));

  return { recommendations, isEmpty: recommendations.length === 0 };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/digest/buildDigest.test.ts`
Expected: PASS — `2 passed`

- [ ] **Step 5: Commit**

```bash
git add src/lib/digest/buildDigest.ts tests/lib/digest/buildDigest.test.ts
git commit -m "feat: add digest builder with zero-candidate handling"
```

---

### Task 18: Digest render/send with retry-and-requeue, and cron route

**Files:**
- Create: `src/lib/digest/renderDigestEmail.ts`
- Create: `src/lib/digest/sendDigest.ts`
- Create: `src/app/api/cron/digest/route.ts`
- Test: `tests/lib/digest/renderDigestEmail.test.ts`
- Test: `tests/lib/digest/sendDigest.test.ts`

**Interfaces:**
- Consumes: `DigestContent`, `buildDigest` from `@/lib/digest/buildDigest`.
- Produces: `renderDigestEmail(content: DigestContent): { subject: string; html: string }` and `sendDigest(supabase, resend, profileId, toEmail): Promise<SendDigestResult>` — `SendDigestResult { sent: boolean; recommendationCount: number }`, invoked directly by the cron route below.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/lib/digest/renderDigestEmail.test.ts
import { describe, it, expect } from 'vitest';
import { renderDigestEmail } from '@/lib/digest/renderDigestEmail';

describe('renderDigestEmail', () => {
  it('renders a "nothing new" message when empty', () => {
    const { subject, html } = renderDigestEmail({ recommendations: [], isEmpty: true });
    expect(subject).toContain('nothing new');
    expect(html).toContain('Nothing new matches your profile');
  });

  it('renders each recommendation when non-empty', () => {
    const { subject, html } = renderDigestEmail({
      isEmpty: false,
      recommendations: [
        {
          id: '1',
          title: 'Bun 2.0',
          url: 'https://bun.sh',
          category: 'maintain',
          blurb: 'Matters to you.',
          learningAction: 'Skim the docs',
          learningTimeEstimate: '20 minutes',
        },
      ],
    });
    expect(subject).toContain('1 new recommendation');
    expect(html).toContain('Bun 2.0');
    expect(html).toContain('Skim the docs');
  });
});
```

```ts
// tests/lib/digest/sendDigest.test.ts
import { describe, it, expect, vi } from 'vitest';
import { sendDigest } from '@/lib/digest/sendDigest';

vi.mock('@/lib/digest/buildDigest', () => ({
  buildDigest: vi.fn().mockResolvedValue({
    isEmpty: false,
    recommendations: [{ id: 'rec-1', title: 't', url: 'u', category: 'maintain', blurb: 'b', learningAction: 'a', learningTimeEstimate: 'e' }],
  }),
}));

describe('sendDigest', () => {
  it('sends the email and logs the digest on success', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const supabase = { from: vi.fn().mockReturnValue({ insert }) } as any;
    const resend = { emails: { send: vi.fn().mockResolvedValue({}) } };

    const result = await sendDigest(supabase, resend as any, 'profile-1', 'me@example.com');

    expect(resend.emails.send).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ profile_id: 'profile-1', recommendation_ids: ['rec-1'] })
    );
    expect(result).toEqual({ sent: true, recommendationCount: 1 });
  });

  it('retries once, then leaves recommendations queued (no log entry) on repeated send failure', async () => {
    const insert = vi.fn();
    const supabase = { from: vi.fn().mockReturnValue({ insert }) } as any;
    const resend = { emails: { send: vi.fn().mockRejectedValue(new Error('send failed')) } };

    const result = await sendDigest(supabase, resend as any, 'profile-1', 'me@example.com');

    expect(resend.emails.send).toHaveBeenCalledTimes(2);
    expect(insert).not.toHaveBeenCalled();
    expect(result).toEqual({ sent: false, recommendationCount: 1 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/digest/renderDigestEmail.test.ts tests/lib/digest/sendDigest.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/digest/renderDigestEmail.ts
import type { DigestContent } from './buildDigest';

export function renderDigestEmail(content: DigestContent): { subject: string; html: string } {
  if (content.isEmpty) {
    return {
      subject: 'Tech Relevance Advisor: nothing new this week',
      html: '<p>Nothing new matches your profile this week.</p>',
    };
  }

  const items = content.recommendations
    .map(
      (rec) => `<li>
        <strong>[${rec.category}] <a href="${rec.url}">${rec.title}</a></strong><br/>
        ${rec.blurb}<br/>
        <em>${rec.learningAction} (${rec.learningTimeEstimate})</em>
      </li>`
    )
    .join('');

  return {
    subject: `Tech Relevance Advisor: ${content.recommendations.length} new recommendation(s)`,
    html: `<ul>${items}</ul>`,
  };
}
```

```ts
// src/lib/digest/sendDigest.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Resend } from 'resend';
import { buildDigest } from './buildDigest';
import { renderDigestEmail } from './renderDigestEmail';

export interface SendDigestResult {
  sent: boolean;
  recommendationCount: number;
}

export async function sendDigest(
  supabase: SupabaseClient,
  resend: Pick<Resend, 'emails'>,
  profileId: string,
  toEmail: string
): Promise<SendDigestResult> {
  const content = await buildDigest(supabase, profileId);
  const { subject, html } = renderDigestEmail(content);

  let lastError: unknown;
  let sent = false;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await resend.emails.send({
        from: 'Tech Relevance Advisor <digest@example.com>',
        to: toEmail,
        subject,
        html,
      });
      sent = true;
      break;
    } catch (error) {
      lastError = error;
    }
  }

  if (!sent) {
    console.error('Digest send failed after retry, leaving recommendations queued:', lastError);
    return { sent: false, recommendationCount: content.recommendations.length };
  }

  const { error: logError } = await supabase.from('digest_log').insert({
    profile_id: profileId,
    sent_at: new Date().toISOString(),
    recommendation_ids: content.recommendations.map((rec) => rec.id),
  });

  if (logError) {
    throw new Error(`Failed to log digest send: ${logError.message}`);
  }

  return { sent: true, recommendationCount: content.recommendations.length };
}
```

```ts
// src/app/api/cron/digest/route.ts
import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createServiceSupabaseClient } from '@/lib/supabase/server';
import { sendDigest } from '@/lib/digest/sendDigest';

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceSupabaseClient();
  const { data: profileRows, error } = await supabase.from('profiles').select('id, email');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const resend = new Resend(process.env.RESEND_API_KEY!);
  const results = [];
  for (const row of profileRows ?? []) {
    const result = await sendDigest(supabase, resend, row.id, row.email);
    results.push({ profileId: row.id, ...result });
  }

  return NextResponse.json({ results });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/digest/renderDigestEmail.test.ts tests/lib/digest/sendDigest.test.ts`
Expected: PASS — `4 passed`

- [ ] **Step 5: Manually verify the digest cron route**

Run: `npm run dev`, then:
`curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/digest`
Expected: JSON with a `results` array, and a real email arrives at the signed-in profile's address; check `digest_log` gets a new row.

- [ ] **Step 6: Commit**

```bash
git add src/lib/digest/renderDigestEmail.ts src/lib/digest/sendDigest.ts src/app/api/cron/digest/route.ts tests/lib/digest/renderDigestEmail.test.ts tests/lib/digest/sendDigest.test.ts
git commit -m "feat: add digest email rendering, sending, and cron trigger route"
```

---

### Task 19: Dashboard grouping, page, and status update endpoint

**Files:**
- Create: `src/lib/dashboard/groupByCategory.ts`
- Create: `src/app/dashboard/page.tsx`
- Create: `src/components/RecommendationList.tsx`
- Create: `src/app/api/recommendations/[id]/status/route.ts`
- Test: `tests/lib/dashboard/groupByCategory.test.ts`

**Interfaces:**
- Produces: `groupByCategory<T extends { category: 'maintain' | 'grow' }>(rows: T[]): { maintain: T[]; grow: T[] }` — used by the dashboard page below.

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/dashboard/groupByCategory.test.ts
import { describe, it, expect } from 'vitest';
import { groupByCategory } from '@/lib/dashboard/groupByCategory';

describe('groupByCategory', () => {
  it('splits rows into maintain and grow buckets', () => {
    const rows = [
      { id: '1', category: 'maintain' as const },
      { id: '2', category: 'grow' as const },
      { id: '3', category: 'maintain' as const },
    ];

    expect(groupByCategory(rows)).toEqual({
      maintain: [rows[0], rows[2]],
      grow: [rows[1]],
    });
  });

  it('returns empty buckets for an empty input', () => {
    expect(groupByCategory([])).toEqual({ maintain: [], grow: [] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/dashboard/groupByCategory.test.ts`
Expected: FAIL — `Cannot find module '@/lib/dashboard/groupByCategory'`

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/dashboard/groupByCategory.ts
export interface CategorizedRow {
  category: 'maintain' | 'grow';
}

export function groupByCategory<T extends CategorizedRow>(rows: T[]): { maintain: T[]; grow: T[] } {
  return {
    maintain: rows.filter((row) => row.category === 'maintain'),
    grow: rows.filter((row) => row.category === 'grow'),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/dashboard/groupByCategory.test.ts`
Expected: PASS — `2 passed`

- [ ] **Step 5: Write the status update route**

```ts
// src/app/api/recommendations/[id]/status/route.ts
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const VALID_STATUSES = ['new', 'in-progress', 'learned', 'skipped'];

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const { status } = await request.json();
  if (!VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { error } = await supabase
    .from('recommendations')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .eq('profile_id', user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ status });
}
```

- [ ] **Step 6: Write the dashboard page and recommendation list component**

```tsx
// src/components/RecommendationList.tsx
'use client';

import { useState } from 'react';

interface Recommendation {
  id: string;
  title: string;
  url: string;
  category: 'maintain' | 'grow';
  blurb: string;
  learning_action: string;
  learning_time_estimate: string;
  status: string;
}

export function RecommendationList({ recommendations }: { recommendations: Recommendation[] }) {
  const [statuses, setStatuses] = useState<Record<string, string>>(
    Object.fromEntries(recommendations.map((rec) => [rec.id, rec.status]))
  );

  async function updateStatus(id: string, status: string) {
    const response = await fetch(`/api/recommendations/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (response.ok) {
      setStatuses((prev) => ({ ...prev, [id]: status }));
    }
  }

  if (recommendations.length === 0) {
    return <p>Nothing here yet.</p>;
  }

  return (
    <ul>
      {recommendations.map((rec) => (
        <li key={rec.id}>
          <strong>
            <a href={rec.url}>{rec.title}</a>
          </strong>
          <p>{rec.blurb}</p>
          <p>
            {rec.learning_action} ({rec.learning_time_estimate})
          </p>
          <select value={statuses[rec.id]} onChange={(event) => updateStatus(rec.id, event.target.value)}>
            <option value="new">New</option>
            <option value="in-progress">In progress</option>
            <option value="learned">Learned</option>
            <option value="skipped">Skipped</option>
          </select>
        </li>
      ))}
    </ul>
  );
}
```

```tsx
// src/app/dashboard/page.tsx
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { groupByCategory } from '@/lib/dashboard/groupByCategory';
import { RecommendationList } from '@/components/RecommendationList';

export default async function DashboardPage() {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return <p>Please sign in to view your recommendations.</p>;
  }

  const { data: recommendations } = await supabase
    .from('recommendations')
    .select('id, title, url, category, blurb, learning_action, learning_time_estimate, status')
    .eq('profile_id', user.id)
    .order('score', { ascending: false });

  const { maintain, grow } = groupByCategory(recommendations ?? []);

  return (
    <main>
      <h1>Your Recommendations</h1>
      <section>
        <h2>Grow</h2>
        <RecommendationList recommendations={grow} />
      </section>
      <section>
        <h2>Maintain</h2>
        <RecommendationList recommendations={maintain} />
      </section>
    </main>
  );
}
```

- [ ] **Step 7: Manually verify the dashboard**

Run: `npm run dev`, sign in, visit `/dashboard`. Expected: recommendations from Task 16's manual pipeline run appear grouped under "Grow"/"Maintain"; changing an item's status dropdown persists (reload the page and the new status sticks).

- [ ] **Step 8: Commit**

```bash
git add src/lib/dashboard/groupByCategory.ts src/app/dashboard/page.tsx src/components/RecommendationList.tsx src/app/api/recommendations/\[id\]/status/route.ts tests/lib/dashboard/groupByCategory.test.ts
git commit -m "feat: add dashboard with status updates"
```

---

### Task 20: End-to-end verification

**Files:** none created — this task exercises the full system built in Tasks 1–19.

- [ ] **Step 1: Configure environment**

Fill in `.env.local` with real values for `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `VOYAGE_API_KEY`, `RESEND_API_KEY`, `CRON_SECRET`.

- [ ] **Step 2: Run the full automated test suite**

Run: `npm run test`
Expected: all tests across every task pass with zero failures.

- [ ] **Step 3: Sign in and set up a real profile**

Run `npm run dev`, sign in via GitHub, confirm a `profiles` row exists with populated `stack_tags`, then visit `/setup` and save 1-2 goal tags. Confirm `goal_tags` is populated.

- [ ] **Step 4: Run the pipeline against real sources**

`curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/run`
Expected: a `results` entry with `processedCount > 0` (or a non-empty `failedSources` list if a public API is temporarily rate-limiting — the run should still complete, not crash).

- [ ] **Step 5: Verify the dashboard**

Visit `/dashboard`. Expected: recommendations appear grouped under "Grow" and "Maintain", each with a blurb and a learning action/time estimate. Change a status and reload to confirm it persists.

- [ ] **Step 6: Run the digest and verify the email**

`curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/digest`
Expected: a real email arrives with the same recommendations, rendered readably; `digest_log` has a new row.

- [ ] **Step 7: Verify the zero-candidate path**

Run the digest cron route a second time immediately (`curl` command from Step 6 again) without running the pipeline in between.
Expected: the response's `recommendationCount` is `0` for that profile (nothing new since the last digest) rather than an error, and the "nothing new this week" email variant is what would render (confirm via `renderDigestEmail({ recommendations: [], isEmpty: true })` in a REPL if you want to see the exact HTML).

- [ ] **Step 8: Commit any environment/config fixes discovered during verification**

```bash
git add -A
git commit -m "chore: fix configuration issues found during end-to-end verification"
```
(Skip this commit if no fixes were needed.)

## Self-Review Notes

- **Spec coverage:** Ingestion (Tasks 2-7), Profile (Tasks 8-10), Pre-filter (Tasks 11-13), Enrichment (Task 14), Storage & delivery (Tasks 15, 17-19), pipeline wiring (Task 16), error-handling paths (retry/skip in Task 7, LLM fallback in Task 14, zero-candidates in Task 17, digest retry/requeue in Task 18) and the proposed stack (Task 1) are all covered by a task each.
- **Placeholder scan:** no TBD/TODO markers; every step has complete, runnable code.
- **Type consistency:** `TrendItem` → `Candidate` (extends `TrendItem`) → `EnrichedRecommendation` (extends `Candidate`) is used identically across Tasks 2, 13, 14, 15, 16. `Profile`/`StackTag`/`GoalTag` from Task 8 are consumed unchanged by Tasks 11, 13, 14, 16. Column names in Task 1's migration (`profile_id`, `learning_action`, `learning_time_estimate`, `stack_tags`, `goal_tags`) match every later task's Supabase queries verbatim.

