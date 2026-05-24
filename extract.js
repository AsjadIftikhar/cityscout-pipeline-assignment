'use strict';

const fs      = require('fs');
const path    = require('path');
const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic();  // reads ANTHROPIC_API_KEY from environment

const SYSTEM_PROMPT = `You are a structured data extraction specialist for a real estate data pipeline.
Your job is to extract professional contact information from real estate documents.
Return only valid JSON — no explanation, no markdown fences, no extra text.`;

function buildUserPrompt(docText) {
  return `Extract every professional named in the document below.

For each person found, produce one object with these fields:
- "name": full name as written, including credentials (e.g. "Jane Smith, PE"). Required.
- "role": exactly one of: Owner, Applicant, Developer, Architect, Civil Engineer, Surveyor,
  Landscape Architect, Contractor, Traffic Engineer, Attorney, Structural Engineer,
  MEP Engineer, Environmental Consultant, Other
- "firm": company or firm name, or null
- "phone": phone number as written in the document, or null
- "email": email address, or null
- "license_number": professional license number (include any prefix/suffix like "PE-", "A-", "#"), or null
- "license_state": two-letter US state code for the license jurisdiction, or null

Rules:
- Only include named individuals. Skip entries where a firm is mentioned but no person is named.
- Set any unknown or ambiguous field to null. Do not guess.
- If a person appears to have been replaced or superseded, include the current assignee only.
- Infer role from context (e.g. "Prepared For" party = Developer or Applicant; "Property Owner" contact = Owner).

Return a JSON array. Example:
[{"name":"Jane Smith, PE","role":"Civil Engineer","firm":"Smith & Assoc","phone":"615-555-0100","email":"jane@smith.com","license_number":"PE-12345","license_state":"TN"}]

Document:
${docText}`;
}

// Attempt to extract a JSON array from a string that might have extra text around it.
function parseJsonArray(text) {
  const s = text.trim();

  // Ideal: entire response is a JSON array
  try {
    const parsed = JSON.parse(s);
    if (Array.isArray(parsed)) return parsed;
  } catch (_) {}

  // Fallback: find first '[' ... last ']' in the response
  const start = s.indexOf('[');
  const end   = s.lastIndexOf(']');
  if (start !== -1 && end > start) {
    try {
      const parsed = JSON.parse(s.slice(start, end + 1));
      if (Array.isArray(parsed)) return parsed;
    } catch (_) {}
  }

  return null;
}

const VALID_ROLES = new Set([
  'Owner','Applicant','Developer','Architect','Civil Engineer','Surveyor',
  'Landscape Architect','Contractor','Traffic Engineer','Attorney',
  'Structural Engineer','MEP Engineer','Environmental Consultant','Other',
]);

function validateProfessional(p) {
  return {
    name:            typeof p.name === 'string' && p.name ? p.name : null,
    role:            VALID_ROLES.has(p.role) ? p.role : 'Other',
    firm:            typeof p.firm === 'string' && p.firm ? p.firm : null,
    phone:           typeof p.phone === 'string' && p.phone ? p.phone : null,
    email:           typeof p.email === 'string' && p.email ? p.email : null,
    license_number:  typeof p.license_number === 'string' && p.license_number ? p.license_number : null,
    license_state:   typeof p.license_state === 'string' && p.license_state ? p.license_state : null,
  };
}

async function extractFromDocument(doc) {
  const response = await client.messages.create({
    model:      'claude-opus-4-5',
    max_tokens: 2048,
    system:     SYSTEM_PROMPT,
    messages: [
      { role: 'user', content: buildUserPrompt(doc.text) },
    ],
  });

  const rawText = response.content[0].text;
  const parsed  = parseJsonArray(rawText);

  if (!parsed) {
    console.error(`  [WARN] Could not parse JSON for ${doc.id}. Raw response:\n${rawText.slice(0, 300)}`);
    return [];
  }

  return parsed
    .filter(p => p && typeof p === 'object' && p.name)
    .map(validateProfessional);
}

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
