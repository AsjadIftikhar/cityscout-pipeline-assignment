# CityScout Pipeline — Take-Home Assignment

## Setup

```bash
npm install
```

### Part 2 — Data Transform
```bash
node transform.js
# Produces: transformed.json
```

### Part 3 — AI Extraction
```bash
export ANTHROPIC_API_KEY=your_key_here
node extract.js
# Produces: professionals.json
```

`extract.js` uses the Anthropic Claude API (`claude-sonnet-4-6`). Get a key at [console.anthropic.com](https://console.anthropic.com).

---

## Decisions & Tradeoffs

### Transform (Part 2)

**Field name normalization**
The raw data uses three distinct schema shapes (`case_no`/`CaseNumber`/`permit_id`, etc.). I used a `pick(record, ...keys)` helper that tries each candidate key in order and returns the first non-null, non-empty value. This avoids a fragile key-remapping object and handles null/empty-string edge cases cleanly.

**Deduplication — address as the key**
The spec says "same address = same record." My `addrKey()` function lowercases, strips unit/suite suffixes, collapses whitespace, removes trailing punctuation, and normalizes common abbreviations (Street→St, Boulevard→Blvd, etc.) before comparing. This correctly merges:
- `"2847 Riverside Dr"` + `"2847  Riverside Dr."` → same project
- `"445 Elm Street"` + `"445 elm st"` → same building
- `"1005 Monroe St"` + `"1005 Monroe St, Unit B"` → same address (unit stripped)

**Merge conflict resolution**
When two records share an address and both have a value for the same field, I take the value from whichever record has the more recent `application_date` (per spec). The tradeoff: for `1005 Monroe St`, this merges a planning case ($4.2M townhomes) with an interior finishes permit ($125K) and the merged `estimated_cost` becomes $125K — clearly the sub-permit's scope, not the project's total. In production I'd keep the higher cost; for this exercise I followed the spec literally and flagged it.

**Records filtered out (2 removed)**
- `RES-2024-10370`: `street_address` is `""` and `name` is `null` — no way to identify this record
- `PLN-2024-00216`: `location` is `null` and `project_title` is `null` — same issue

**Status normalization**
`STATUS_MAP` is a `Map` keyed on lowercased raw values, mapping to the five canonical statuses plus a permit-type suffix system (per the AB+C manual). Unrecognized status values are set to `null` with the original preserved in `raw_data`.

**Cost and date parsing**
Costs mix strings with currency formatting (`"$24,500,000"`), plain numbers (`450000`), and string numbers (`"485000"`) — a single strip-and-parse handles all three. Dates handled six formats: ISO, ISO with time, US numeric, US short (2-digit year), long-form month, and DMY-with-abbrev, all normalized to `YYYY-MM-DD`.

---

### Extraction (Part 3)

**Structured output via tool use**
The biggest reliability improvement over a free-form prompt: `extract.js` uses Anthropic's function-calling API (`tool_choice: { type: 'tool', name: 'extract_professionals' }`). The model is physically constrained to return schema-conformant JSON — it cannot wrap output in prose or markdown fences. This eliminates the fragile regex-fallback JSON parser entirely.

**Prompt caching**
The system prompt and tool definition are static across every document in a batch. Both are tagged `cache_control: { type: 'ephemeral' }` so their tokens are written to cache on the first call and read at ~10% cost on every subsequent call. At scale (hundreds of documents) this is the dominant cost lever.

**Model and temperature**
Using `claude-sonnet-4-6` at `temperature: 0`. Sonnet is cheaper than Opus and equally capable for structured extraction. Temperature zero makes output deterministic — running the same document twice produces the same result, which matters for pipeline reproducibility.

**Few-shot examples for edge cases**
The system prompt includes three examples that demonstrate the hardest recurring patterns:
1. A firm section with no named person → empty output (the Terracon pattern)
2. A superseded professional → only the current assignee extracted (the Tom Loss / Angela Wright pattern)
3. A contractor whose firm has a license but the individual does not → `license_number: null` (the BC-22548 pattern)

These are drawn directly from the test documents so the model sees the exact text format it will encounter.

**Role inference encoded in two places**
The role inference rules appear both in the system prompt rules list and in the `role` field's `description` inside the tool schema. Putting guidance in the schema description means it travels with the field even if the system prompt is later modified.

**License number handling**
Rule: preserve exactly as written, including any prefix or symbol (`PE-`, `A-`, `#`). Exception: a firm-level contractor license (format `BC-NNNNN`, labeled "Contractor License") belongs to the company, not the individual contact — `license_number: null` for that person. This distinction is encoded in the `license_number` schema description so the model sees it at field-fill time.

**Government staff reviewers**
Michelle Torres (doc_3 staff reviewer, Nashville Planning Dept.) is included as `role: "Other"`. She is a named professional with a credential (AICP) who is the direct point of contact for the case — relevant to the pipeline even if she's not a project consultant.

**Retry logic**
`withRetry()` wraps every API call with three attempts and 1s/2s/4s exponential backoff. Only retries on transient failures: `APIConnectionError`, `APIConnectionTimeoutError`, `RateLimitError`, and any 5xx. Auth errors and 4xx client errors propagate immediately.

---

## AI Tools & Process

**What I used:**
Claude Code (Anthropic's CLI) throughout — for researching Austin's portal stack, writing `transform.js`, iterating on the extraction prompt, and improving `extract.js`.

**How I used it:**
- *Research*: asked Claude to describe Austin's permit infrastructure, then cross-checked the URLs and platform indicators against what I could verify in a browser's Network tab
- *Code generation*: generated the initial `transform.js` skeleton, then manually reviewed every normalization map and edge-case branch against the raw data
- *Prompt engineering*: after the initial prompt produced mostly-correct output, I worked through the failure modes systematically — what happens with firm-only sections, superseded staff, contractor licenses — and encoded each one as a concrete rule plus a few-shot example drawn from the actual test documents

**Where I still had to apply my own judgment:**
- Deciding that the `1005 Monroe St` merge produces a misleading `estimated_cost` — Claude followed the spec; I flagged it as a known limitation worth fixing
- Choosing Austin as the research city and deciding which of its four portals were worth documenting in depth
- Deciding that Michelle Torres belongs in the output as `"Other"` rather than being excluded as "not a project professional" — two model runs disagreed on this, which itself confirmed the rule needed to be explicit
- Noticing that contractor firm licenses (`BC-NNNNN`) look superficially like individual licenses and adding an explicit exception rule before the model had a chance to hallucinate one

---

## What I'd Improve

- **Dedup cost field**: keep the maximum `estimated_cost` when merging a planning case with sub-permits — the higher value almost always represents total project scope
- **Address geocoding**: some records have no lat/lng; in production I'd run a geocoder (Google Maps or Census TIGER) over the `address` field after transform
- **Parallel extraction with concurrency limit**: `extract.js` processes documents sequentially; for large batches I'd switch to `Promise.allSettled` with a semaphore (~5 concurrent) instead of a serial loop
- **Anthropic Batch API**: for very large batches (100+ documents) the [Message Batches API](https://docs.anthropic.com/en/docs/build-with-claude/batch-processing) would cut costs another 50% and remove the need to manage concurrency manually
- **Status catch-all logging**: unknown status values are silently set to `null`; in production I'd emit these to a monitoring dashboard so new status strings get mapped quickly
- **AB+C scraping**: the Research section documents that Accela has no public API. I'd build a Playwright-based scraper with session management and rate limiting, writing to a staging table before the transform step
