'use strict';

const fs        = require('fs');
const path      = require('path');
const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic();  // reads ANTHROPIC_API_KEY from environment

// ─── Constants ───────────────────────────────────────────────────────────────

const VALID_ROLES = new Set([
  'Owner', 'Applicant', 'Developer', 'Architect', 'Civil Engineer', 'Surveyor',
  'Landscape Architect', 'Contractor', 'Traffic Engineer', 'Attorney',
  'Structural Engineer', 'MEP Engineer', 'Environmental Consultant', 'Other',
]);

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY','DC',
];

// cache_control on the tool definition caches the schema tokens across all
// documents in a batch run, cutting input costs on every call after the first.
const EXTRACT_TOOL = {
  name: 'extract_professionals',
  description:
    'Extract every named professional from a real estate document. ' +
    'Omit entries where only a firm is present with no named individual. ' +
    'For superseded staff, include only the current assignee.',
  cache_control: { type: 'ephemeral' },
  input_schema: {
    type: 'object',
    required: ['professionals'],
    properties: {
      professionals: {
        type: 'array',
        description: 'All named professionals found in the document. Empty array if none.',
        items: {
          type: 'object',
          required: ['name', 'role'],
          properties: {
            name: {
              type: 'string',
              description:
                'Full name as written, including credentials (e.g. "Jane Smith, PE"). ' +
                'Must be explicitly named in the document — do not fabricate.',
            },
            role: {
              type: 'string',
              enum: [...VALID_ROLES],
              description:
                '"PREPARED FOR" party = Developer. ' +
                '"PROPERTY OWNER" contact = Owner. ' +
                '"APPLICANT INFORMATION" contact = Applicant. ' +
                'Government/municipal staff reviewer = Other. ' +
                '"TRAFFIC STUDY" or "TRAFFIC IMPACT STUDY" lead = Traffic Engineer. ' +
                '"GENERAL CONTRACTOR" contact = Contractor.',
            },
            firm:  { type: ['string', 'null'], description: 'Company or firm name, or null.' },
            phone: { type: ['string', 'null'], description: 'Phone number exactly as written, or null.' },
            email: { type: ['string', 'null'], description: 'Email address exactly as written, or null.' },
            license_number: {
              type: ['string', 'null'],
              description:
                'Individual professional license number, preserving any prefix or symbol ' +
                '(PE-, A-, LA-, #, etc.). ' +
                'A firm-level contractor license (e.g. "TN Contractor License: BC-22548") ' +
                'belongs to the company, not the individual — set null in that case.',
            },
            license_state: {
              type: ['string', 'null'],
              enum: [...US_STATES, null],
              description: 'Two-letter US state code for the license jurisdiction, or null.',
            },
          },
        },
      },
    },
  },
};

// System prompt as two blocks. The second (rules + examples) is tagged for
// prompt caching — reused from cache on every call after the first, cutting
const SYSTEM_PROMPT = [
  {
    type: 'text',
    text:
      'You are a structured data extraction specialist for a real estate data pipeline. ' +
      'Your job is to extract professional contact information from real estate documents. ' +
      'You will receive the document type and project identifier before each document.',
  },
  {
    type: 'text',
    cache_control: { type: 'ephemeral' },
    text: `EXTRACTION RULES:

1. NAMED INDIVIDUALS ONLY — skip any section that lists a firm with contact info but no person's name.
   Bad:  "TERRACON CONSULTANTS / 2701 ALBION ST / PHONE: (615) 356-0558" → no name, omit entirely.
   Good: "MICHAEL GARRIGAN, PE / TN LICENSE NO. 112847 / PHONE: (615) 297-5166" → include.

2. ROLE INFERENCE — use the section label and document context:
   - "PREPARED FOR" party → Developer (the developer who commissioned the work)
   - "PROPERTY OWNER" section contact → Owner
   - "APPLICANT INFORMATION" contact → Applicant
   - Government/municipal staff reviewer (planner or engineer at a city/county agency) → Other
   - "TRAFFIC STUDY" or "TRAFFIC IMPACT STUDY" section lead → Traffic Engineer
   - "GENERAL CONTRACTOR" or "GC" contact → Contractor

3. SUPERSEDED PERSONNEL — if the document states one person replaced another, include ONLY the current
   assignee. Exclude the person who was replaced.

4. LICENSE NUMBERS — preserve exactly as written, including any prefix or symbol.
   "TN LICENSE NO. 112847" → "112847"   |   "TN License: A-5521" → "A-5521"   |   "TN PE #107223" → "#107223"
   EXCEPTION: A firm-level contractor license (format like "BC-NNNNN", labeled "Contractor License")
   belongs to the company, not the individual contact. Set license_number to null for that person.

5. AMBIGUOUS OR MISSING FIELDS — set to null. Never infer or fabricate contact details.

---
FEW-SHOT EXAMPLES:

Example 1 — Firm-only section (no named individual):
Document snippet:
  GEOTECHNICAL ENGINEER:
  TERRACON CONSULTANTS
  2701 ALBION ST
  NASHVILLE, TN 37209
  PHONE: (615) 356-0558

Correct output: []
(Terracon Consultants is a firm — no individual is named. Omit entirely.)

---
Example 2 — Superseded person:
Document snippet:
  Landscape: Lose Design, 322 3rd Ave N, Nashville TN 37201
    Tom Loss was listed on preliminary plans but staff understands firm has since
    assigned Angela Wright, PLA to lead landscape design.
    No license number on file — applicant to provide at next submittal.

Correct output:
[{"name":"Angela Wright, PLA","role":"Landscape Architect","firm":"Lose Design","phone":null,"email":null,"license_number":null,"license_state":null}]
(Tom Loss was superseded — excluded. Angela Wright is the current assignee.
"No license number on file" means license_number: null.)

---
Example 3 — Contractor with firm-level license:
Document snippet:
  GENERAL CONTRACTOR:
  Brasfield & Gorrie LLC
  TN Contractor License: BC-22548
  Contact: Tommy Barnwell, Project Director
  Phone: (615) 665-0500
  Email: tbarnwell@brasfieldgorrie.com

Correct output:
[{"name":"Tommy Barnwell","role":"Contractor","firm":"Brasfield & Gorrie LLC","phone":"(615) 665-0500","email":"tbarnwell@brasfieldgorrie.com","license_number":null,"license_state":null}]
(BC-22548 is the firm's contractor license, not Tommy Barnwell's individual license.
license_number = null for the contact person.)`,
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildUserContent(doc) {
  return (
    `Document type: ${doc.type}\n` +
    `Project: ${doc.source_project}\n\n` +
    `Document text:\n${doc.text}`
  );
}

async function withRetry(fn, { maxAttempts = 3, baseDelayMs = 1000 } = {}) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const retryable =
        err instanceof Anthropic.APIConnectionError ||
        err instanceof Anthropic.APIConnectionTimeoutError ||
        err instanceof Anthropic.RateLimitError ||
        (err instanceof Anthropic.APIError && err.status >= 500);

      if (!retryable || attempt === maxAttempts) throw err;

      const delay = baseDelayMs * 2 ** (attempt - 1);
      console.warn(`  [RETRY] Attempt ${attempt} failed (${err.message}). Retrying in ${delay}ms…`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

// Returns trimmed string or null.
function str(v) {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function postProcess(rawArray) {
  return rawArray
    .filter(p => p && typeof p === 'object' && typeof p.name === 'string' && p.name.trim())
    .map(p => ({
      name:           p.name.trim(),
      role:           VALID_ROLES.has(p.role) ? p.role : 'Other',
      firm:           str(p.firm),
      phone:          str(p.phone),
      email:          str(p.email),
      license_number: str(p.license_number),
      license_state:  typeof p.license_state === 'string' && p.license_state.trim()
                        ? p.license_state.trim().toUpperCase()
                        : null,
    }));
}

// ─── Core extraction ─────────────────────────────────────────────────────────

async function extractFromDocument(doc) {
  const response = await withRetry(() =>
    client.beta.promptCaching.messages.create({
      model:       'claude-sonnet-4-6',
      max_tokens:  2048,
      temperature: 0,
      system:      SYSTEM_PROMPT,
      tools:       [EXTRACT_TOOL],
      tool_choice: { type: 'tool', name: 'extract_professionals' },
      messages: [
        { role: 'user', content: buildUserContent(doc) },
      ],
    }),
  );

  const { input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens } =
    response.usage || {};
  console.log(
    `  tokens — in: ${input_tokens}, out: ${output_tokens}` +
    (cache_creation_input_tokens ? `, cache_write: ${cache_creation_input_tokens}` : '') +
    (cache_read_input_tokens     ? `, cache_read: ${cache_read_input_tokens}`      : ''),
  );

  // With tool_choice: { type: 'tool' }, the response must contain a tool_use block.
  const toolUseBlock = response.content.find(b => b.type === 'tool_use');
  if (!toolUseBlock) {
    console.error(`  [WARN] No tool_use block for ${doc.id}. stop_reason=${response.stop_reason}`);
    return [];
  }

  const raw = toolUseBlock.input;
  if (!raw || !Array.isArray(raw.professionals)) {
    console.error(`  [WARN] Unexpected tool input for ${doc.id}:`, JSON.stringify(raw).slice(0, 200));
    return [];
  }

  return postProcess(raw.professionals);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const docs    = JSON.parse(fs.readFileSync(path.join(__dirname, 'document-extracts.json'), 'utf8'));
  const results = [];

  for (const doc of docs) {
    console.log(`Processing ${doc.id} (${doc.type})…`);
    try {
      const professionals = await extractFromDocument(doc);
      console.log(`  → ${professionals.length} professional(s) found`);
      results.push({ document_id: doc.id, professionals });
    } catch (err) {
      console.error(`  [ERROR] ${doc.id}: ${err.message}`);
      results.push({ document_id: doc.id, professionals: [] });
    }
  }

  fs.writeFileSync(
    path.join(__dirname, 'professionals.json'),
    JSON.stringify(results, null, 2),
    'utf8',
  );
  console.log('\nWritten → professionals.json');
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
