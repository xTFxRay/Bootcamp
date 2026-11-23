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

CSV import (`/test-cases/import`) checks every row before anything is saved, then imports the valid rows and skips the rest with a report.

- Required columns: Title, Severity, Steps, Expected result. Optional: Preconditions, Status (empty means draft). Header names ignore case, spaces, `_` and `-`; other columns are ignored.
- Steps: one per line inside the cell, or separated by `|`; leading numbering is removed.
- Files: comma, semicolon or tab separated; UTF-8, UTF-16 or Windows-1257/1252; up to 2 MB and 1,000 rows.

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

## Settings

Stored in the `user_preferences` table, one row per user (only user 1 for now), at `/settings`; `GET /api/settings`, `PUT /api/settings` (send only the fields to change).

- **Theme**: light / dark / system (default system). Colours in `client/src/index.css` must use the colour tokens (`var(--surface)`, `var(--text)`, ...), never fixed hex values, so both themes work.
- **Default severity for new bugs**: Critical / Major / Minor / Trivial (default Minor); preselected in the Report a bug form.
- **Default page size** (10 / 20 / 50 / 100, default 20), **time zone** (default: the browser's) and **auto-generate report after run** (default on) are saved but not used by the app yet.

## Flaky tests

`/flaky` tracks every test case's pass/fail history across all runs (`server/flakiness.js`, `server/flaky-tracker.js`).

- History: passed and failed results only (skipped and not-run are ignored), the most recent 20, oldest first.
- States: stable (always passed), failing (always failed: broken, not flaky), regressed / recovered (flipped once), **flaky** (passed and failed, flipped at least twice), not enough data (under 4 results).
- Score: flips ÷ (results − 1), 0–100%. The page lists the 10 highest.
- When a recorded result makes a test newly flaky, it's flagged in `flaky_flags` and a Discord alert is posted once (`DISCORD_WEBHOOK_URL`). The flag clears if the test becomes stable again.
- After Claude writes a test run result (a Bash command sending `PATCH /api/test-runs/:id/results/:id`), the PostToolUse hook `flaky-after-result.sh` in qa-plugin calls `POST /api/flaky/recompute`: it recomputes the leaderboard, alerts any new flake not yet alerted, and retries alerts that failed. Results recorded in the browser are covered by the server's own check; both share `flaky_flags`, so each flake is alerted once.
- Root-cause hypotheses are stored in `flake_hypotheses`; a hypothesis is out of date once the test has newer results. Two writers:
  - Automatic (`server/flake-hypothesis-ai.js`): when a test turns flaky, the server sends its evidence to the Claude API (Claude Opus 5.5) in the background and saves the answer; the page's "Write with AI" button does the same on demand (`POST /api/flaky/:testCaseId/hypothesis/generate`). Needs `ANTHROPIC_API_KEY` (in `.env`, and in Render); without it, AI is off and nothing is called.
  - On request: the `flake-analyzer` agent in Claude Code, with a SubagentStop hook that keeps it working until every top-10 test has a current one. It works on the local app or, when asked, on the deployed copy (https://bootcamp-app-a2hk.onrender.com).
- Writing hypotheses (PUT, DELETE, `/generate`) needs the `X-Write-Token` header when `FLAKY_WRITE_TOKEN` is set on the server (it is on the deployed site; the agent reads it from `.env` without printing it). Unset locally means no token needed.
- API: `GET /api/flaky` (summary + top 10), `GET /api/flaky/history`, `GET /api/flaky/:testCaseId/evidence`, `POST /api/flaky/recompute`, `PUT` / `DELETE /api/flaky/:testCaseId/hypothesis` (`{ hypothesis, evidence, confidence: low|medium|high }`).
- Sample history: the "Nightly regression" suite, 12 runs, added once per database.

## Keyboard shortcuts

Defined only in `client/src/shortcuts.js`: the key handler runs them from that list and the `?` help dialog is drawn from it. Plain-key shortcuts never fire while typing in a field or while a dialog is open. Quick search (⌘K / Ctrl+K) uses `GET /api/search?q=`, which returns up to 5 test cases, bugs and suites.

## QA tooling

The slash commands, skills, subagents and hooks used here (test cases, bug reports, daily updates, QA reviews, test runs, response-shape and severity checks, the after-commit page check) live in the `qa-plugin` plugin, not in this repo. It is enabled for this project in `.claude/settings.local.json` and read from the plugin folder next to this project. Its commands start with `/qa-plugin:`. One exception: the `flake-analyzer` subagent lives in this repo, at `.claude/agents/flake-analyzer.md`.

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
