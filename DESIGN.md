# Renter Readiness Copilot Design

## Product Context

The app is an affordable-housing application-readiness flow for the official frozen RealDoor Boston challenge simulation. The interface must feel calm, concrete, and controllable. It supports AI extraction, but it should never imply a housing decision.

## Visual Direction

- Palette: paper `#f8f6f0`, sheet `#fffdf7`, ink `#172026`, body `#334e68`, muted `#52616b`, folder tab `#6b5b3f`, action blue `#183b56`, confirmation green `#2f855a`.
- Typography: Geist Sans for interface text, with Geist Mono reserved for future trace output.
- Layout: full-width application shell, persistent navigation, compact document-folder surfaces, and repeated field panels.
- Signature: an evidence packet workspace where each document request has its own labeled upload surface, and the PDF, source page, source box, citations, statuses, and reviewed fields remain visibly separate.

## States

- Loading states use direct text such as "Loading dashboard."
- Empty states explain the next action.
- Save state is announced with `aria-live` and visible text on setup.
- Status is never color-only; every badge includes a text label.
- `DO_NOT_HAVE` is shown as an unresolved status with guidance to ask the housing provider whether the document is required or whether an alternative is accepted.

## Accessibility

- Every page has one descriptive `h1`.
- Navigation exposes `aria-current`.
- Setup controls use labels, fieldsets, and legends.
- Homepage language selection updates the shell and core interface copy without requiring an account.
- Review actions are ordinary buttons and can be completed with keyboard only.
- Focus rings are visible across links, inputs, and buttons.
- Touch targets are at least 44px where forms and primary actions are used.

## Copy Rules

- Allowed: "prepare," "review," "confirmed," "calculation," and "qualified housing professional makes the final determination."
- Disallowed: approval, denial, scoring, ranking, probability, prediction, and eligibility conclusions about the renter.
- Required packet disclaimer: "This calculation helps prepare your application. A qualified housing professional makes the final determination."
- Bundle descriptions use deterministic templates or labeled AI summaries based on confirmed fields and source citations.
- Uploaded document extraction is labeled provisional until the renter confirms, corrects, or rejects each field.
- AI-generated reviewer summaries in the bundle must be labeled as AI-generated and based only on renter-confirmed or renter-corrected facts.

## Upload Flow

- Each requested document type has its own card and file input.
- Choosing a file only changes the card to "File selected"; it never submits the file.
- Supported schema types use "Upload and extract": pay stub, employment letter, benefit letter, and gig statement.
- Support letters and other proof can be added to the bundle without validated extraction.
- Multiple documents of the same type are separate records with separate document IDs.
- Uploaded PDF bytes are application-scoped in browser memory. After refresh, show "Re-upload needed."
