# Target Schema Reference

Your transform should produce records matching this schema. All fields are optional except where noted.

## Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `proposal_number` | string | **Yes** | Unique project identifier from the source system |
| `name` | string | No | Project name or title |
| `address` | string | No | Full street address |
| `description` | string | No | Project description |
| `project_type` | string | No | Normalized project type (see table below) |
| `status` | string | No | Normalized status (see mapping below) |
| `application_date` | string (ISO 8601) | No | Date the application was filed (format: `YYYY-MM-DD`) |
| `applicant` | string | No | Applicant name |
| `owner` | string | No | Property owner name |
| `estimated_cost` | number | No | Estimated construction cost in dollars (no currency symbols) |
| `latitude` | number | No | Latitude coordinate |
| `longitude` | number | No | Longitude coordinate |
| `source_url` | string | No | URL to view this record in the original portal |
| `raw_data` | object | **Yes** | The original unmodified record (preserve for debugging) |

## Status Mapping

Map raw status values to these normalized statuses:

| Normalized Status | Raw values to map (case-insensitive) |
|-------------------|--------------------------------------|
| `In Review` | "Under Review", "In Review", "REVIEW", "Pending Review", "Submitted", "Application Submitted", "Intake", "Received", "PENDING", "Under Examination", "Corrections Required", "Revision Requested", "Corrections Needed", "Resubmittal Required", "Deficiency Notice" |
| `Approved` | "Approved", "APPROVED", "Permit Issued", "Issued", "ISSUED", "Finalized", "Complete", "COMPLETE", "Completed", "Certificate Issued" |
| `Planning Commission` | "Planning Commission", "Commission Review", "Public Hearing", "Commission", "COMMISSION", "Hearing Scheduled" |
| `Withdrawn` | "Withdrawn", "WITHDRAWN", "Denied", "DENIED", "Cancelled", "Canceled", "Voided", "Expired", "EXPIRED" |
| `Under Construction` | "Under Construction", "Construction", "Building", "In Progress", "CONSTRUCTION" |

If a status doesn't match any of the above, set it to `null` and preserve the original value in `raw_data`.

## Project Type Normalization

Map raw project types to these categories:

| Normalized Type | Raw values (case-insensitive) |
|-----------------|-------------------------------|
| `Residential` | "Residential", "Single Family", "Multi-Family", "Apartment", "Townhouse", "Condo", "Duplex", "SFR", "MFR", "Residential New", "New Home" |
| `Commercial` | "Commercial", "Office", "Retail", "Restaurant", "Hotel", "Shopping", "COM", "Commercial New", "Commercial Renovation" |
| `Mixed Use` | "Mixed Use", "Mixed-Use", "MXD", "Residential/Commercial", "Live-Work", "Live/Work" |
| `Industrial` | "Industrial", "Warehouse", "Manufacturing", "Distribution", "IND" |
| `Institutional` | "Institutional", "School", "Church", "Hospital", "Government", "Library", "Fire Station", "Public" |
| `Subdivision` | "Subdivision", "Plat", "Lot Split", "Land Division", "SUB" |
| `Demolition` | "Demolition", "Demo", "Tear Down", "DEMO" |
| `Renovation` | "Renovation", "Remodel", "Alteration", "Addition", "Rehab", "Tenant Improvement", "TI", "Interior Renovation" |

If a type doesn't match, keep the original value as-is (don't set to null).

## Deduplication Rules

Records with the **same normalized address** (after trimming whitespace, collapsing multiple spaces, normalizing case, removing trailing punctuation, removing unit/suite numbers, and normalizing common abbreviations like St/Street, Blvd/Boulevard, Dr/Drive, Ave/Avenue, Rd/Road, Ln/Lane, Ct/Court, Pl/Place, Pkwy/Parkway) should be merged:
- Keep the record with the most non-null fields
- If one record has a field the other doesn't, take the non-null value
- If both have different values for the same field, keep the value from the record with the more recent `application_date` (or the first record if dates are equal/missing)

## Date Parsing

Raw dates may appear in various formats:
- `2024-01-15` (ISO)
- `01/15/2024` (US format)
- `January 15, 2024` (long form)
- `1/15/24` (short US format)
- `15-Jan-2024` (other)
- `2024-01-15T00:00:00` (ISO with time)

All should be output as `YYYY-MM-DD` (ISO 8601 date only).
