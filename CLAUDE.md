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

## Bug report fields

Saved in `tests/bugs/` by `/bug-report`, and tracked in the app at `/bugs`.

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

## API response shape

Every endpoint returns:

```json
{ "success": true, "data": {}, "error": null }
```

- `success`: boolean
- `data`: any; `null` on failure
- `error`: string message on failure, `null` on success

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
