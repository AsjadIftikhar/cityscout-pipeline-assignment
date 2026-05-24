'use strict';

const fs = require('fs');
const path = require('path');

// ─── Field extraction ─────────────────────────────────────────────────────────

// Returns the first non-null, non-empty value found under any of the given keys.
function pick(record, ...keys) {
  for (const key of keys) {
    const v = record[key];
    if (v !== null && v !== undefined && v !== '') return v;
  }
  return null;
}

// ─── Status normalization ─────────────────────────────────────────────────────

const STATUS_MAP = new Map([
  ['under review',         'In Review'],
  ['in review',            'In Review'],
  ['review',               'In Review'],
  ['pending review',       'In Review'],
  ['submitted',            'In Review'],
  ['application submitted','In Review'],
  ['intake',               'In Review'],
  ['received',             'In Review'],
  ['pending',              'In Review'],
  ['under examination',    'In Review'],
  ['corrections required', 'In Review'],
  ['revision requested',   'In Review'],
  ['corrections needed',   'In Review'],
  ['resubmittal required', 'In Review'],
  ['deficiency notice',    'In Review'],

  ['approved',             'Approved'],
  ['permit issued',        'Approved'],
  ['issued',               'Approved'],
  ['finalized',            'Approved'],
  ['complete',             'Approved'],
  ['completed',            'Approved'],
  ['certificate issued',   'Approved'],

  ['planning commission',  'Planning Commission'],
  ['commission review',    'Planning Commission'],
  ['public hearing',       'Planning Commission'],
  ['commission',           'Planning Commission'],
  ['hearing scheduled',    'Planning Commission'],

  ['withdrawn',            'Withdrawn'],
  ['denied',               'Withdrawn'],
  ['cancelled',            'Withdrawn'],
  ['canceled',             'Withdrawn'],
  ['voided',               'Withdrawn'],
  ['expired',              'Withdrawn'],

  ['under construction',   'Under Construction'],
  ['construction',         'Under Construction'],
  ['building',             'Under Construction'],
  ['in progress',          'Under Construction'],
]);

function normalizeStatus(raw) {
  if (!raw) return null;
  return STATUS_MAP.get(raw.toLowerCase().trim()) ?? null;
}

// ─── Project type normalization ───────────────────────────────────────────────

const TYPE_MAP = new Map([
  ['residential',            'Residential'],
  ['single family',          'Residential'],
  ['multi-family',           'Residential'],
  ['apartment',              'Residential'],
  ['townhouse',              'Residential'],
  ['condo',                  'Residential'],
  ['duplex',                 'Residential'],
  ['sfr',                    'Residential'],
  ['mfr',                    'Residential'],
  ['residential new',        'Residential'],
  ['new home',               'Residential'],

  ['commercial',             'Commercial'],
  ['office',                 'Commercial'],
  ['retail',                 'Commercial'],
  ['restaurant',             'Commercial'],
  ['hotel',                  'Commercial'],
  ['shopping',               'Commercial'],
  ['com',                    'Commercial'],
  ['commercial new',         'Commercial'],
  ['commercial renovation',  'Commercial'],

  ['mixed use',              'Mixed Use'],
  ['mixed-use',              'Mixed Use'],
  ['mxd',                    'Mixed Use'],
  ['residential/commercial', 'Mixed Use'],
  ['live-work',              'Mixed Use'],
  ['live/work',              'Mixed Use'],

  ['industrial',             'Industrial'],
  ['warehouse',              'Industrial'],
  ['manufacturing',          'Industrial'],
  ['distribution',           'Industrial'],
  ['ind',                    'Industrial'],

  ['institutional',          'Institutional'],
  ['school',                 'Institutional'],
  ['church',                 'Institutional'],
  ['hospital',               'Institutional'],
  ['government',             'Institutional'],
  ['library',                'Institutional'],
  ['fire station',           'Institutional'],
  ['public',                 'Institutional'],

  ['subdivision',            'Subdivision'],
  ['plat',                   'Subdivision'],
  ['lot split',              'Subdivision'],
  ['land division',          'Subdivision'],
  ['sub',                    'Subdivision'],

  ['demolition',             'Demolition'],
  ['demo',                   'Demolition'],
  ['tear down',              'Demolition'],

  ['renovation',             'Renovation'],
  ['remodel',                'Renovation'],
  ['alteration',             'Renovation'],
  ['addition',               'Renovation'],
  ['rehab',                  'Renovation'],
  ['tenant improvement',     'Renovation'],
  ['ti',                     'Renovation'],
  ['interior renovation',    'Renovation'],
]);

function normalizeProjectType(raw) {
  if (!raw) return null;
  return TYPE_MAP.get(raw.toLowerCase().trim()) ?? raw;
}

// ─── Date parsing ─────────────────────────────────────────────────────────────

const MONTHS = {
  january:'01', february:'02', march:'03', april:'04', may:'05', june:'06',
  july:'07', august:'08', september:'09', october:'10', november:'11', december:'12',
  jan:'01', feb:'02', mar:'03', apr:'04', jun:'06', jul:'07',
  aug:'08', sep:'09', oct:'10', nov:'11', dec:'12',
};

function parseDate(raw) {
  if (!raw) return null;
  const s = String(raw).trim();

  // ISO (with optional time): 2024-01-15 or 2024-01-15T00:00:00
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // US numeric: 01/15/2024 or 1/15/24
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (us) {
    const y = us[3].length === 2 ? `20${us[3]}` : us[3];
    return `${y}-${us[1].padStart(2,'0')}-${us[2].padStart(2,'0')}`;
  }

  // Long form: January 15, 2024
  const long = s.match(/^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/);
  if (long) {
    const m = MONTHS[long[1].toLowerCase()];
    if (m) return `${long[3]}-${m}-${long[2].padStart(2,'0')}`;
  }

  // DMY with month abbrev: 15-Jan-2024
  const dmy = s.match(/^(\d{1,2})-([A-Za-z]+)-(\d{4})$/);
  if (dmy) {
    const m = MONTHS[dmy[2].toLowerCase()];
    if (m) return `${dmy[3]}-${m}-${dmy[1].padStart(2,'0')}`;
  }

  return null;
}

// ─── Cost parsing ─────────────────────────────────────────────────────────────

function parseCost(raw) {
  if (raw === null || raw === undefined) return null;
  const n = Number(String(raw).replace(/[$,\s]/g, ''));
  return isNaN(n) ? null : n;
}

// ─── Address normalization (for dedup key only) ───────────────────────────────

function addrKey(addr) {
  if (!addr) return null;
  let s = addr.toLowerCase().trim();
  s = s.replace(/,?\s*(suite|ste|unit|apt|#)\s*[\w-]+/gi, '');
  s = s.replace(/[.,]+$/, '').trim();
  s = s.replace(/\s+/g, ' ');
  s = s.replace(/\bstreet\b/g, 'st');
  s = s.replace(/\bboulevard\b/g, 'blvd');
  s = s.replace(/\bdrive\b/g, 'dr');
  s = s.replace(/\bavenue\b/g, 'ave');
  s = s.replace(/\broad\b/g, 'rd');
  s = s.replace(/\blane\b/g, 'ln');
  s = s.replace(/\bcourt\b/g, 'ct');
  s = s.replace(/\bplace\b/g, 'pl');
  s = s.replace(/\bparkway\b/g, 'pkwy');
  return s;
}

// ─── Record transformation ────────────────────────────────────────────────────

function transform(raw) {
  const name    = pick(raw, 'project_title', 'ProjectName', 'name');
  const address = pick(raw, 'location', 'Address', 'street_address');

  // Must have at least a name or an address
  if (!name && !address) return null;

  return {
    proposal_number:  pick(raw, 'case_no', 'CaseNumber', 'permit_id'),
    name:             name   ? String(name).trim()    : null,
    address:          address ? String(address).trim().replace(/\s+/g, ' ') : null,
    description:      pick(raw, 'desc', 'Description', 'project_description'),
    project_type:     normalizeProjectType(pick(raw, 'case_type', 'Type', 'permit_type')),
    status:           normalizeStatus(pick(raw, 'current_status', 'Status', 'status')),
    application_date: parseDate(pick(raw, 'filed_date', 'DateFiled', 'date_submitted')),
    applicant:        pick(raw, 'applicant_name', 'Applicant', 'applicant'),
    owner:            pick(raw, 'property_owner', 'Owner', 'owner_name'),
    estimated_cost:   parseCost(pick(raw, 'est_cost', 'EstimatedCost', 'valuation')),
    latitude:         pick(raw, 'lat', 'Latitude', 'x_coord'),
    longitude:        pick(raw, 'lng', 'Longitude', 'y_coord'),
    source_url:       pick(raw, 'portal_link', 'URL', 'link'),
    raw_data:         raw,
  };
}

// ─── Deduplication ────────────────────────────────────────────────────────────

const SCHEMA_FIELDS = [
  'proposal_number','name','address','description','project_type','status',
  'application_date','applicant','owner','estimated_cost','latitude','longitude','source_url',
];

function nonNullCount(r) {
  return SCHEMA_FIELDS.filter(f => r[f] !== null && r[f] !== undefined).length;
}

// Merges two records for the same address.
// For each field: prefer the value from whichever record has the more recent
// application_date; fall back to the other record if that value is null.
// raw_data is taken from the record with more non-null fields.
function merge(a, b) {
  const aDate = a.application_date || '';
  const bDate = b.application_date || '';
  const [recent, older] = bDate > aDate ? [b, a] : [a, b];

  const merged = {};
  for (const f of SCHEMA_FIELDS) {
    merged[f] = (recent[f] !== null && recent[f] !== undefined)
      ? recent[f]
      : (older[f] ?? null);
  }
  merged.raw_data = nonNullCount(a) >= nonNullCount(b) ? a.raw_data : b.raw_data;
  return merged;
}

function deduplicate(records) {
  const byAddr  = new Map();  // normalized address → record
  const noAddr  = new Map();  // proposal_number → record (no address to dedup on)

  for (const r of records) {
    const key = addrKey(r.address);
    if (!key) {
      noAddr.set(r.proposal_number, r);
    } else if (byAddr.has(key)) {
      byAddr.set(key, merge(byAddr.get(key), r));
    } else {
      byAddr.set(key, r);
    }
  }

  return [...byAddr.values(), ...noAddr.values()];
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'raw-permits.json'), 'utf8'));

const filtered   = raw.map(transform).filter(Boolean);
const deduped    = deduplicate(filtered);

fs.writeFileSync(
  path.join(__dirname, 'transformed.json'),
  JSON.stringify(deduped, null, 2),
  'utf8',
);

console.log(`Input:      ${raw.length} records`);
console.log(`Filtered:   ${filtered.length} records  (${raw.length - filtered.length} removed — no name or address)`);
console.log(`Deduped:    ${deduped.length} records  (${filtered.length - deduped.length} merged)`);
console.log('Written →   transformed.json');
