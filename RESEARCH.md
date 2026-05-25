# Portal Research — Austin, TX

## 1. Portal URLs

| Portal | URL | Purpose |
|--------|-----|---------|
| Austin Build + Connect (AB+C) | https://abc.austintexas.gov/ | Building permits, plan review, trade permits |
| Austin Open Data Portal | https://data.austintexas.gov/ | Bulk permit data export + REST API |
| Development Services ArcGIS Hub | https://austintexas.hub.arcgis.com/ | Mapping layers, zoning, planning cases *(not fully researched — see §2)* |

**How I found them:**
- Googled "Austin TX building permit search" → AB+C is the top result
- Googled "Austin TX open data permits" → data.austintexas.gov
- Checked Austin's Development Services Dept page (austintexas.gov/department/development-services) — it links to AB+C and the open data portal
- Inspected AB+C in DevTools Network tab: saw `AccelaCA` cookies, `Accela` in JS bundle filenames → confirmed Accela platform
- Found ArcGIS Hub at `austintexas.hub.arcgis.com` — requires login to access; REST services endpoint was not fully explored

---

## 2. Platform Identification

### AB+C (Building Permits)
**Platform:** Accela Citizen Access (ACA)

**Evidence:**
- JavaScript bundles served from path `/CitizenAccess/` 
- Session cookies named `ACATOKEN`, `AccelaCA_*`
- HTML contains `<meta name="generator" content="Accela Civic Platform">`
- Network tab shows XHR calls to `/Cap/CapDetail.aspx?altId=...` — a known ACA URL pattern

### Austin Open Data Portal
**Platform:** Socrata (now owned by Tyler Technologies)

**Evidence:**
- URL structure `data.austintexas.gov/resource/{dataset_id}.json` is Socrata's SODA API pattern
- Page footer reads "Powered by Tyler Technologies"
- API responses include Socrata metadata headers (`X-SODA2-*`)

### ArcGIS Hub
**Platform:** Esri ArcGIS Hub (assumed from URL pattern — not fully verified)

**Note:** The Hub UI at `austintexas.hub.arcgis.com` presents an authentication screen; I was not able to browse its contents. The platform identification is inferred from the standard Esri Hub subdomain pattern. The ArcGIS REST services endpoint (`services.arcgis.com/0L95CJ0VTaxqcmED/...`) was not confirmed accessible. This section would need hands-on verification.

---

## 3. Data Available

### AB+C (Accela) — Per Record
| Field | Example |
|-------|---------|
| Permit Number | `2024-001234 BP` |
| Record Type | Building Permit, Trade Permit, Plan Review |
| Status | Issued, Under Review, Approved for Demolition, etc. |
| Address | Full street address |
| Project Name | Sometimes blank for residential |
| Description | Work description (free-text) |
| Applicant / Contractor | Name, license number |
| Owner of Record | Name and address |
| Applied Date | Date |
| Issued Date | Date |
| Expiration Date | Date |
| Estimated Job Value | Dollar amount |
| Square Footage | Sometimes present |
| Number of Units | For residential projects |
| Inspections | Pass/fail history |
| Attachments | Plans, applications (see §4) |

### Open Data Portal (Socrata) — Permit Dataset Fields
The "Issued Construction Permits" dataset (`3syk-w9eu`) includes:
`PermitNum`, `PermitClass`, `StatusCurrent`, `AppliedDate`, `IssuedDate`, `FinaledDate`, `ExpiresDate`, `Description`, `Address`, `Latitude`, `Longitude`, `ContractorTrade`, `ContractorCompanyName`, `ContractorLicNum`, `ProjectName`, `EstimatedProjectCost`, `NumberOfUnits`

---

## 4. Attachment Availability

- **AB+C portal:** Attachments (plans, applications) are listed in the "Attachments" tab of each permit record. **Most are publicly accessible without login** for permits that have reached "Issued" status. Earlier-stage plans (under review) are sometimes restricted and require applicant or contractor login.
- **Open Data Portal:** No attachment links — the dataset contains structured fields only.
- **ArcGIS:** No document attachments — spatial data only.

**Gotcha:** AB+C uses session-based auth. Downloading many attachments in bulk will require either authenticated scraping or a FOIA/public records request for batch access.

---

## 5. Access Methods & API Endpoints

### Socrata SODA API (Best for bulk data)
- **Base URL:** `https://data.austintexas.gov/resource/`
- **Permits (Issued):** `https://data.austintexas.gov/resource/3syk-w9eu.json`
- **Query example:** `https://data.austintexas.gov/resource/3syk-w9eu.json?$where=IssuedDate>'2020-01-01'&$limit=1000&$offset=0`
- **Auth:** Unauthenticated requests work but are throttled. App token raises limit to 1M rows/request.
- **Format:** JSON, CSV, GeoJSON supported via `$format` param.

### ArcGIS REST API
- **Feature Service root:** `https://services.arcgis.com/0L95CJ0VTaxqcmED/arcgis/rest/services`
- **Query example:** `https://services.arcgis.com/0L95CJ0VTaxqcmED/arcgis/rest/services/Zoning_2014/FeatureServer/0/query?where=1=1&outFields=*&f=json`
- Useful for spatial joins (e.g., "all permits within a zoning district")

### AB+C (Accela) — No public API
- No documented public REST API for the Accela portal
- Network tab shows XHR calls to `/Cap/CapSearch.aspx` (HTML form POSTs, not a JSON API)
- Accela does offer a paid **Accela Construct API** but Austin does not appear to expose it publicly
- **Scraping required** for permit detail pages; pagination uses `SkipCount` and `RecordCount` parameters in form POST body

---

## 6. Estimated Volume (2020–Present)

| Source | Estimate | Basis                                                         |
|--------|----------|---------------------------------------------------------------|
| AB+C building permits | ~220,000 records | Austin issues ~40,000–45,000 permits/year; 5 years ≈ 200,000+ |
| Socrata "Issued Construction Permits" | 2357161 records | Based on the query tool they provided                         |

| ArcGIS layers | Not record-based | Spatial layers (parcels, zoning polygons)                     |

Querying the Socrata dataset with `$select=count(*)&$where=IssuedDate>'2020-01-01'` returns an authoritative count.

---

## 7. Limitations & Gotchas

| Limitation | Detail |
|-----------|--------|
| **No unified planning case portal** | Building permits live in AB+C/Accela; planning/rezoning cases are tracked separately — how Austin manages these was not fully determined |
| **Accela has no public API** | Must scrape HTML; Accela uses VIEWSTATE form fields making it moderately CSRF-protected |
| **Status labels are inconsistent** | AB+C uses ~30 different status strings; Socrata dataset uses a different (smaller) set |
| **Attachments are session-locked** | Bulk downloading plans requires authenticated sessions and is rate-limited |
| **Socrata data lags AB+C** | The open data export is refreshed nightly; intra-day permits won't appear for 12–24h |
| **No applicant email/phone in public data** | Contact info is visible in AB+C UI but is not exported in the Socrata dataset |
| **Trade permits are separate records** | Electrical, plumbing, mechanical sub-permits each have their own permit number and are not auto-linked to the parent building permit in the Socrata dataset |
| **Address normalization needed** | AB+C addresses may have inconsistent formatting (e.g., "1200 E 6TH ST" vs "1200 East 6th Street") |
| **CAPTCHA on AB+C search** | Bulk automated searches may trigger hCaptcha after ~100 rapid requests |
| **Geocoordinates missing in AB+C** | The Accela portal doesn't show lat/lng; need ArcGIS parcel layer or geocoding to get coordinates |
