# CityScout Data Pipeline — Intern Take-Home Assignment

**Time estimate**: 2-3 hours
**Deliverable**: A GitHub repository (public or private) with the files described below

---

## Background

CityScout tracks real estate development projects across hundreds of U.S. cities. Our data pipeline ingests permit and planning data from municipal portals — each city uses a different system (EnerGov, Accela, Legistar, ArcGIS, etc.) with different field names, status labels, and data formats.

Your job as a pipeline engineer is to:
1. **Discover** a city's public data portals
2. **Transform** raw, messy portal data into a clean, standardized schema
3. **Extract** structured professional information from unstructured documents using AI

This assignment mirrors the actual work you'd do on the team. There are no trick questions — we want to see how you think through real data problems.

---

## Part 1 — Portal Research & Discovery (~30 minutes)

**Pick ONE of the following cities** (or propose your own — any U.S. city with a public permit portal):

- Columbus, OH
- Austin, TX
- Portland, OR
- Raleigh, NC
- Tampa, FL

### Your task

Research the city's public-facing permit and planning portals. Write a file called `RESEARCH.md` with:

1. **Portal URL(s)** — Links to the city's permit search, planning case search, or project tracker
2. **Platform identification** — What software does the portal run on? (e.g., Accela Citizen Access, EnerGov Self-Service, Salesforce, ArcGIS Hub, custom-built, etc.) How did you determine this?
3. **Data available** — What fields can you see on a typical project record? (project name, address, status, dates, applicant, attachments/documents, etc.)
4. **Attachment availability** — Can you access PDFs like site plans, applications, or staff reports? Are they behind authentication?
5. **Access method** — Is there a public API? Or would data need to be scraped from the portal UI? Did you find any API endpoints (check network tab, look for `/api/`, ArcGIS REST endpoints, etc.)?
6. **Estimated volume** — Roughly how many planning/permit records exist from 2020 to present?
7. **Limitations & gotchas** — What's missing? What might be tricky? (e.g., login required, CAPTCHA, data only goes back 1 year, no attachments, etc.)

### What we're looking for
- Thoroughness: Did you find ALL the relevant portals (not just the first Google result)?
- Technical curiosity: Did you inspect network requests, check for APIs, look at page source?
- Honest assessment: Did you flag limitations rather than glossing over them?

---

## Part 2 — Data Transform (~45-60 minutes)

We've provided a file called `raw-permits.json` containing ~50 raw records from a fictional city portal. The data is messy — inconsistent field names, duplicate records, mixed date formats, missing fields, and non-standard status values.

### Your task

Write a JavaScript script called `transform.js` that:

1. **Reads** `raw-permits.json`
2. **Transforms** each record to match our target schema (see `TARGET-SCHEMA.md`)
3. **Normalizes statuses** using the mapping table in `TARGET-SCHEMA.md`
4. **Deduplicates** records (same address should be merged — keep the most complete data)
5. **Filters** out records with insufficient data (must have at least a name OR address)
6. **Outputs** a clean `transformed.json` file

### Requirements
- Use JavaScript (no TypeScript required, but fine if you prefer it). We run everything with Node.js.
- No external libraries required (but you may use them if helpful — just include a `package.json`)
- Handle edge cases gracefully (null values, unexpected formats, empty strings)
- The output should be valid JSON, one array of objects matching the target schema

### What we're looking for
- **Correctness**: Does the output match the target schema?
- **Edge cases**: How do you handle missing data, weird formats, duplicates?
- **Code quality**: Is the code readable, well-structured, and not over-engineered?
- **Decisions**: When the data is ambiguous, what choices did you make and why?

---

## Part 3 — AI Professional Extraction (~30-45 minutes)

We've provided a file called `document-extracts.json` containing text extracted from 3 real estate documents (a site plan cover sheet, a permit application, and a planning staff report). Professional information — architects, engineers, developers, etc. — is embedded in the text.

### Your task

Write a script called `extract.js` that:

1. **Reads** each document from `document-extracts.json`
2. **Sends** the text to any LLM API of your choice (OpenAI, Google Gemini, Anthropic Claude, etc.)
3. **Extracts** structured professional data from each document
4. **Outputs** a clean `professionals.json` file

### Expected output format
```json
[
  {
    "document_id": "doc_1",
    "professionals": [
      {
        "name": "Jane Smith, PE",
        "role": "Civil Engineer",
        "firm": "Smith & Associates",
        "phone": "615-555-0100",
        "email": "jane@smithassoc.com",
        "license_number": "PE-12345",
        "license_state": "TN"
      }
    ]
  }
]
```

### Valid roles
`Owner`, `Applicant`, `Developer`, `Architect`, `Civil Engineer`, `Surveyor`, `Landscape Architect`, `Contractor`, `Traffic Engineer`, `Attorney`, `Structural Engineer`, `MEP Engineer`, `Environmental Consultant`, `Other`

### Requirements
- Use any LLM API (provide setup instructions in your README)
- Handle cases where information is ambiguous or missing (set fields to `null`, don't guess)
- Your prompt engineering matters — we'll look at how you instruct the model
- Include error handling (what if the API call fails? what if the model returns bad JSON?)

### What we're looking for
- **Prompt quality**: Is your prompt clear, specific, and does it produce consistent results?
- **Output parsing**: How do you handle malformed or unexpected LLM responses?

---

## Deliverable

Submit a GitHub repository containing:

```
your-repo/
├── RESEARCH.md          # Part 1: Portal research findings
├── transform.js         # Part 2: Data transform script
├── extract.js           # Part 3: AI extraction script
├── README.md            # Setup instructions, decisions, tradeoffs
├── raw-permits.json     # (provided — do not modify)
├── document-extracts.json  # (provided — do not modify)
├── transformed.json     # Your Part 2 output
├── professionals.json   # Your Part 3 output
└── package.json         # (if you use any dependencies)
```

### Your `README.md` should include:
1. **Setup instructions** — How to run your scripts (including any API keys needed)
2. **Decisions & tradeoffs** — What choices did you make when the data was ambiguous? Why?
3. **AI Tools & Process** — What AI tools you used, how you used them, and where you still had to apply your own judgment (see below)
4. **What you'd improve** — If you had more time, what would you do differently?

---

## AI Usage — Encouraged and Expected

**We actively encourage you to use AI tools throughout this assignment.** Claude, ChatGPT, Copilot, Cursor, Gemini — whatever you normally use when coding. This is not an academic exam; it reflects how we actually work. Our entire pipeline uses AI (LLM-powered extraction, AI-assisted classification, AI code generation), and we expect engineers to be fluent with these tools.

What matters to us is not whether you used AI, but **how** you used it. In your `README.md`, include a short section called **"AI Tools & Process"** where you describe:

1. **What tools you used** — Which AI assistants, code generators, or LLM APIs?
2. **How you used them** — Did you use AI for research, code generation, debugging, prompt iteration, or something else? Give a specific example or two.
3. **What you still had to do yourself** — Where did AI fall short and you had to step in? What required your own judgment?

A few sentences to a short paragraph is fine. We're looking for self-awareness about your process, not a lengthy essay.

---

Good luck!