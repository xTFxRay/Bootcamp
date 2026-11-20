# Bootcamp App

## Stack

Express 5 server (`server/index.js`) + React 19 client (`client/src/`, built with Vite) in one npm workspace; `npm run dev` starts both, and the client on port 5173 proxies `/api` to the server on port 3001.

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
- **Status**: draft / ready / passed / failed / skipped

## Bug report fields

Saved in `tests/bugs/`.

- **Title**
- **Steps to reproduce**: numbered, one action per step
- **Expected**
- **Actual**
- **Severity**: Critical / Major / Minor / Trivial
- **Status**: open / in-progress / resolved / closed / reopened

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
