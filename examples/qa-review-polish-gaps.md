# Example: a QA review that finds polish gaps, then fixes them

Uses: the `qa-review` skill, the CLAUDE.md severity levels.

## Prompt

```text
Run our qa-review skill to spot polish gaps
```

Asked after the Flaky Test Tracker was built and before it was committed. The follow-up prompt was:

```text
Fix all 7
```

## What Claude did

1. The `qa-review` skill loaded on its own, because the request matched its description ("QA review", "spot gaps").
2. Scope: with nothing named, the skill reviews the unsaved changes. Here that was the /flaky page, its API (`server/routes/flaky.js`, `server/flaky-tracker.js`, `server/flakiness.js`, `server/flake-hypothesis-ai.js`), the write token, the "Write with AI" button, the two flaky-test hooks and the `flake-analyzer` agent.
3. It read every file in scope and followed the code from the page to the API.
4. It tried the API edge cases against the running app with `curl`: bad IDs (`0`, `abc`, `1.5`, `99999`), spaces-only and non-JSON bodies, writes without the token, and running the recompute twice.
5. It wrote the report in the skill's format: every issue numbered, grouped by severity, with where, what happens, why it matters, a suggested fix, and whether it was reproduced or only found by reading the code.
6. After "Fix all 7", it fixed each issue, rebuilt the client, and checked each fix again in the browser and with `curl`.

## Result

```text
Critical 0, Major 0, Minor 5, Trivial 2

Minor
QA-01 A failed refresh is silent: old data stays on screen with no error.
QA-02 Visitors to the deployed site see developer setup instructions in empty rows.
QA-03 Result details (date, run, failure notes) are only in hover tooltips.
QA-04 Every "Write with AI" button has the same accessible name.
QA-05 "Rewrite with AI" replaces a hypothesis without asking.

Trivial
QA-06 Asking AI about a test that doesn't exist says "AI is off" instead of "not found" (reproduced with curl).
QA-07 AI error messages show raw HTTP status codes.

Checked with no issues: server-side validation, the write token, the
{ success, data, error } shape, one alert per flake, loading and empty states, and the hooks.
```

All 7 were fixed in the same session:

- A "Couldn't refresh" line now appears when a refresh fails.
- The deployed site shows only "No hypothesis yet."
- Each result square can take keyboard focus and has its details as a hidden label.
- Each button's label names its test.
- Rewriting asks "Replace the hypothesis?" first.
- A missing test gets a 404 "Test case not found" reply.
- AI errors say "The Claude API had a problem. Try again in a few minutes." The status code now goes only to the server log.

## Try it yourself

```text
Run a QA review of the bug tracker
What could break on the CSV import page?
Is my change ready to ship?
```

For a read-only review that runs apart from your main conversation, ask for the `qa-reviewer` agent instead: "Use the qa-reviewer agent on the test suites page."
