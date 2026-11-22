# Bootcamp App

## Stack

Express 5 server (`server/index.js`) with a SQLite database (better-sqlite3, `server/data/app.db`, git-ignored and seeded on first run) + React 19 client (`client/src/`, Vite, React Router) in one npm workspace; `npm run dev` starts both, and the client on port 5173 proxies `/api` to the server on port 3001.

## Severity levels

- **Critical**: the app is unusable, data is lost, or there's a security problem.
- **Major**: an important feature is broken, with no easy workaround.
- **Minor**: something is wrong but there's a workaround, or it affects a small feature.
- **Trivial**: a cosmetic issue, like a typo or misalignment.

## Test case fields

Saved in `tests/manual/`.

- **Title**
- **Preconditions**: what must be true before step 1
- **Steps**: numbered, one action per step
- **Expected result**: something a person can check on screen
- **Severity**: Critical / Major / Minor / Trivial
- **Status**: draft / ready / passed / failed / blocked / skipped

When a test case is run:

- **passed**: every step could be done and the actual result matches the expected result.
- **failed**: the steps could be done, but the actual result differs from the expected result.
- **blocked**: the test couldn't be completed, because a precondition couldn't be met, a step couldn't be done, or the expected result couldn't be checked.

## Test suite fields

Stored in the app's database; a suite groups existing test cases in a set order.

- **Name**
- **Feature**: what the suite tests, e.g. "login"
- **Status**: draft / ready / in-progress / passed / failed
- **Test cases**: ordered list; a test case can be in several suites, and removing it from a suite doesn't delete it

## Test run fields

A run executes one suite, tracked in the app at `/test-runs`.

- **Suite**: the suite it ran, by name. The name is kept even if the suite is later renamed or deleted.
- **Cases**: a snapshot of the suite's test cases (title, preconditions, steps, expected result, severity) taken when the run starts. Later edits to the test cases don't change past runs.
- **Result** per case: passed / failed / skipped, or not run yet. Failing a case requires notes saying what went wrong.
- **Status**: in-progress until every case has a result; then failed if any case failed, otherwise passed.
- **Counts, start and end time, run by**, and each case's duration: the time since the previous result in the run.

When a case is marked failed, the server posts an alert to Discord, using `DISCORD_WEBHOOK_URL` from `.env`, which is never committed. The alert has the case title, the failure notes and a link to the run, and the result records whether the alert was sent.

## Bug report fields

Saved in `tests/bugs/` by `/qa-plugin:bug-report`, and tracked in the app at `/bugs`.

- **Title**
- **Description**: optional; a short summary of the problem
- **Steps to reproduce**: numbered, one action per step
- **Expected**
- **Actual**
- **Severity**: Critical / Major / Minor / Trivial
- **Priority** (app only): high / medium / low; how soon it should be fixed, separate from severity
- **Environment** (app only): optional; browser, device, and where it happened
- **Status**: open / in-progress / resolved / closed / reopened

New bugs start as open. Allowed status changes (the server rejects any other):

- open → in-progress, closed
- in-progress → resolved, closed
- resolved → closed, reopened
- closed → reopened
- reopened → in-progress, closed

Every status change and comment is recorded in the bug's activity history.

## QA tooling

The slash commands, skills, subagents and hooks used here (test cases, bug reports, daily updates, QA reviews, test runs, response-shape and severity checks, the after-commit page check) live in the `qa-plugin` plugin, not in this repo. It is enabled for this project in `.claude/settings.local.json` and read from the plugin folder next to this project. Its commands start with `/qa-plugin:`.

## API response shape

Every endpoint returns:

```json
{ "success": true, "data": {}, "error": null }
```

- `success`: boolean
- `data`: any; `null` on failure
- `error`: string message on failure, `null` on success

Exception: file-download endpoints (e.g. `GET /api/reports/:id/export/html`) send the file itself on success, with a `Content-Disposition: attachment` header; their errors still use the envelope. Mark the line that sends the file with the comment `response-shape: file-download` so the response-shape hook accepts it.

## File naming

- Files: kebab-case (`bug-report.md`, `user-routes.js`)
- React components: PascalCase (`App.jsx`, `TestCaseList.jsx`)
- API handlers: handleVerbNoun (`handleGetHealth`, `handleCreateBug`)

## Voice

Write all test cases and bug reports in clear, direct English. Say exactly what happens. No buzzwords, no filler.

## Text blocks

For text shown in chat, unless explicitly told otherwise. Saved files keep the formats the slash commands define.

- Put text blocks in a plain `text` code block, so they show in black and white with no syntax colors.
- Don't bold anything except titles and headings.
