# Renter Readiness Copilot

Affordable-housing application-readiness MVP for a 24-hour hackathon.

## Problem

Renters applying for affordable housing often need to gather documents over several short sessions. They may be using a phone, working around jobs and caregiving, and trying to understand unfamiliar housing rules.

## Current Solution

This project has a browser-local RealDoor challenge flow with isolated application attempts, explicit uploads, renter review, deterministic calculations, and OpenAI document extraction:

- Metro: Boston-Cambridge-Quincy, MA-NH HMFA
- Program: LIHTC federal baseline
- Rule set: official frozen RealDoor 2026 HUD MTSP simulation
- HUD source: https://www.huduser.gov/portal/datasets/mtsp/mtsp26/HERA-Income-Limits-Report-FY26.pdf
- Effective date preserved in app config: May 1, 2026
- Checklist requests are driven by selected income sources
- Supported OpenAI extraction schemas: pay stub, employment letter, benefit letter, gig statement
- Support/other proof PDFs can be included in the bundle without validated extraction

The app helps a renter prepare information. It does not approve, deny, rank, score, predict acceptance, or determine eligibility.

## Demo Flow

1. Choose a language and start an application at `/`.
2. Complete setup at `/setup`, including metro/program and one or more income sources.
3. View task counts and next step at `/dashboard`.
4. Upload each requested PDF from its own card at `/documents`, or try available synthetic samples.
5. Confirm, correct, or reject provisional fields at `/documents/[id]/review`.
6. Calculate annualized income and the frozen threshold comparison from confirmed/corrected fields only at `/prepare`.
7. Download a local preparation bundle ZIP from `/prepare`.
8. Review browser-local storage and delete data at `/privacy`.

## Live, Mocked, Seeded, And Not Built

- Live: browser-local application-attempt persistence with IndexedDB and active attempt selection in localStorage.
- Live: deterministic annualized income calculation, frozen threshold comparison, deterministic document descriptions, and local ZIP bundle generation from confirmed/corrected fields only.
- Seeded: official RealDoor Boston program metadata, frozen checklist, rule citations, MTSP thresholds, and synthetic sample documents.
- Mocked/seeded: bundled synthetic sample fields come from official synthetic gold records.
- Live AI: PDF upload to a server-side OpenAI extraction route for pay stubs, employment letters, benefit letters, and gig statements; provisional field review; type-scoped hash-based extraction caching; AI reviewer summaries for uploaded documents and the preparation bundle.
- Not built yet: live upload extraction for non-schema support/other documents, authentication, cloud storage, reminders, property discovery, HUD LIHTC Database usage, and Fair Market Rent logic.

## OpenAI Setup

Create `.env.local` locally:

```bash
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_DOCUMENT_MODEL=gpt-5-nano
OPENAI_PAYSTUB_MODEL=gpt-5-nano
```

`OPENAI_API_KEY` is read only by server-side route handlers. It is never imported into client code.

The app uses `gpt-5-nano` by default for cost-efficient PDF extraction. Override `OPENAI_DOCUMENT_MODEL` if needed. `OPENAI_PAYSTUB_MODEL` remains as a backwards-compatible fallback.

## Download Bundle

The `/prepare` page has a **Download preparation bundle** button. It recalculates from confirmed/corrected fields, then generates `realdoor-preparation-bundle.zip` locally in the browser.

The ZIP includes:

- `00-readiness-summary.pdf`
- `01-document-checklist.pdf`
- `02-income-calculation.pdf`
- `03-document-descriptions.pdf`
- `04-application-summary.pdf`
- `documents/` with selected synthetic PDFs and exact user-uploaded PDFs that are still available in browser memory
- `citations/rule-citations.txt`
- `data/confirmed-fields.json`
- `data/session-summary.json`

Generated summary PDFs are local text PDFs. Uploaded document descriptions and the application summary may include AI-generated factual summaries based only on renter-confirmed or renter-corrected facts and document statuses. If the API request fails, the bundle uses deterministic fallback text. If uploaded PDF bytes are unavailable after refresh, the ZIP includes a `Re-upload needed` note instead of substituting a synthetic PDF.

## Persistence

Anonymous application data is stored only in this browser using IndexedDB database `renter-readiness-copilot`, schema version `5`, object stores `sessions` and `extractionCache`.

The active application ID is stored in localStorage as `renter-readiness.activeSessionId`. Preferred language is stored in localStorage as `renter-readiness.preferredLanguage`. Full deletion clears IndexedDB session records and removes the active localStorage key.

## Development

```bash
npm install
npm run dev
npm run lint
npm run build
npm run copy-safety
npm run realdoor-tests
npm run eval:documents
npm run eval:paystubs
```

## Architecture

- Next.js App Router
- TypeScript
- Tailwind CSS v4
- shadcn/Base UI button
- `idb` for browser IndexedDB

Official copied challenge assets live in `data/realdoor/`. Bundled pay-stub and benefit-letter PDFs used by the review screen live in `public/realdoor/documents/`. Domain adapters live in `lib/housing/`. Browser persistence and development extraction caching live in `lib/session/`.

## Limitations

This is not a production housing application system. Uploaded PDFs are not permanently stored by the app; they are held in browser memory for review and bundle generation. OpenAI output is provisional extraction only. A qualified housing professional makes final housing determinations.
