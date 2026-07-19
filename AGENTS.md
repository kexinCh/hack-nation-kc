<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Objective

This is a solo Hack-Nation project built under a strict time limit.

The project should succeed as both:

1. a clear and reliable hackathon demonstration;
2. an early-stage product that could continue into incubation.

Prioritize:

1. One compelling end-to-end user flow
2. A real and meaningful AI capability
3. Reliable deployment
4. Clear product value
5. Strong demo presentation
6. Visual polish
7. Optional features

Prefer one complete and convincing workflow over several incomplete features.

Clearly distinguish live, mocked, seeded, and precomputed functionality.

## Default Stack

Unless the challenge requires otherwise, use:

- Next.js App Router
- TypeScript
- Tailwind CSS
- shadcn/ui
- Next.js route handlers or server actions
- Vercel

Add a separate backend only when required by Python libraries, heavy processing,
an existing model pipeline, or sponsor infrastructure.

Do not add authentication, payments, databases, or queues until the core flow
requires them.
## Before Major Changes

For substantial work:

1. Inspect the relevant code.
2. Restate the requested outcome.
3. Identify the smallest complete implementation.
4. Note the files likely to change and major risks.

Do not rewrite working parts unnecessarily.

For small, obvious changes, implement them directly without excessive planning.

## Development Strategy

Build vertical slices:

```text
user action
→ frontend state
→ server or API operation
→ AI or sponsor integration
→ structured result
→ visible UI output
```

The first milestone must work locally and on Vercel.

Classify scope as:

* **Must work:** required for the demo
* **Mocked or precomputed:** supporting functionality that is not the core contribution
* **Optional:** only build after the main flow is reliable

Clearly document what is live, mocked, seeded, or precomputed.
## AI and API Safety

- Keep API keys server-side.
- Use `.env.local` for secrets.
- Maintain `.env.example` without credentials.
- Validate inputs and AI outputs.
- Handle timeouts, quotas, and failures.
- Never expose or log secrets.
- Prefer structured responses where practical.
- Provide an honest demo fallback when useful.
## Frontend and Design

Core screens must have:

* a clear primary action;
* readable hierarchy;
* loading, empty, and error states;
* responsive behavior;
* accessible labels, focus states, and controls.

Avoid fake analytics, excessive cards, generic AI gradients, nonfunctional controls, and unnecessary pages.

Use the `frontend-design` skill for visual direction and substantial UI implementation.

Use `DESIGN.md` for project-specific colors, typography, spacing, components, states, responsiveness, and motion.

Use `web-design-guidelines` after implementation to audit accessibility, usability, responsiveness, and consistency.

When a Figma design or screenshot is provided, treat it as the visual reference while preserving functionality and responsive behavior.

## Architecture

Prefer the simplest suitable state and data architecture:

1. URL or server-rendered state
2. Local React state
3. Shared client state
4. Persistent database state

Do not add a global state library for data used in only one area.

API routes must validate input, protect secrets, use meaningful status codes, handle external failures, and return consistent responses.

For uploads, validate file type and size and account for Vercel runtime and storage limitations. Keep a stable sample input for the demo when practical.

## Dependencies

Before adding a package:

* confirm existing code cannot reasonably provide the behavior;
* explain why it is needed;
* prefer maintained packages;
* consider browser bundle size and Vercel compatibility;
* avoid overlapping libraries.

Do not perform unnecessary major framework upgrades during the hackathon.

## Verification

After meaningful changes, run:

```bash
npm run lint
npm run build
```

Also verify the relevant user interaction, loading and error states, browser console, and desktop/mobile layout.

For API changes, test valid input, invalid input, missing configuration, and external-service failure where practical.

Do not claim untested behavior works. State clearly what remains unverified.

## Deployment

Deploy the first working vertical slice early.

Before considering the core flow complete, verify it on a Vercel preview or production deployment, including:

* environment variables;
* API routes;
* server/client boundaries;
* external APIs;
* browser permissions;
* timeout behavior;
* fresh or incognito browser access.

Do not rely on local filesystem persistence, localhost-only services, or credentials available only on one machine.

## Git and Security

Before editing, check `git status` and preserve unrelated work.

Make focused commits.

Never commit secrets, `.env.local`, generated builds, local recordings, temporary debug output, or unnecessary large files.

## Demo and Submission

Maintain one short, repeatable demo flow that begins from a predictable state and clearly demonstrates the real AI or sponsor integration.

Keep the README updated with:

* problem and target user;
* solution and core flow;
* AI and sponsor usage;
* architecture and setup;
* deployment and demo links;
* what is live versus mocked;
* limitations;
* team contributions.

Before submission, test the deployed flow in an incognito browser, confirm repository and video permissions, verify no secrets are committed, and submit before the deadline.

## Completion Reports

After substantial work, report:

* what changed;
* key files changed;
* checks performed;
* what remains incomplete or mocked;
* the next highest-priority action.

Be factual and do not describe untested work as complete.
