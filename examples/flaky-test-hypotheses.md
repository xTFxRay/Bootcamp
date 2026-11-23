# Example: root-cause hypotheses for the flakiest tests

Uses: the `flake-analyzer` agent and the `check-flake-hypotheses.sh` SubagentStop hook. The `flaky-after-result.sh` PostToolUse hook keeps the leaderboard current.

## Prompt

From the Flaky Test Tracker build:

```text
BUILD the Flaky Test Tracker on your app — plan mode + a Discord alert + a new subagent + a hook.
... the top-10 flakiest tests in a leaderboard, each row with an AI-written root-cause
hypothesis ...
VALIDATE it against the data already in your app — meaningful output, not zeros, not crashes.
```

To run only the agent later, any of these works:

```text
Explain the flaky tests
Fill in the likely root cause for the flaky tests
Fill in the deployed flaky test hypotheses
```

The last one targets the deployed copy on Render instead of the local app.

## What Claude did

1. Handed the work to the `flake-analyzer` agent. Its tools are Read and Bash only, and it never changes code, test cases or results.
2. The agent called `GET /api/flaky` to get the top 10. For every row with a missing or out-of-date hypothesis, it read `GET /api/flaky/:id/evidence`. The evidence covers each result's run, time, duration, failure notes, position in the run, and the test that ran just before it.
3. For each test, it compared failures with passes on four things:
   - whether the notes repeat the same symptom
   - duration
   - which test ran just before
   - time of day
4. It saved each hypothesis with `PUT /api/flaky/:id/hypothesis` and a confidence level (low, medium or high). The write token is read from `.env` inside the command and is never printed.
5. When the agent tried to stop, the SubagentStop hook called `GET /api/flaky`. If any top-10 test still had no current hypothesis, the hook blocked the stop and named the missing tests. So the agent can only finish once every top-10 row is filled in.

## Result

The sample data had 10 tracked tests: 5 flaky, 1 failing (broken, not flaky), 3 stable, and 1 without enough data. Saved hypotheses for the top 4 flaky tests:

```text
1. Dashboard shows the number of open bugs (82% flaky), medium confidence
   Likely stale cached data: the "Open bugs" count lags by one until the page is reloaded.
   Evidence: all 5 failures show the same symptom (card 2, Bugs page 3) and all 5 notes say a
   refresh fixed it. Order doesn't explain it: 4 of 5 failures and 4 of 7 passes ran right after
   'Reporting a bug adds it to the bug list'.

2. Bug list can be filtered by status (73%), high confidence
   Likely an order dependency on shared state: the bug created by the previous test stays in the
   list when the status filter is applied.
   Evidence: 4 of 4 failures ran right after 'Reporting a bug adds it to the bug list'; 0 of 8
   passes did.

3. Quick search opens the highlighted result with Enter (55%), high confidence
   Likely a race condition: Enter acts on the previous search's results before the new ones return.
   Evidence: all 3 failure notes say Enter was pressed right after typing, and waiting a second fixed it.

4. Password reset email is sent to a registered address (55%), medium confidence
   Likely slow delivery by the external email service, past the test's 2-minute limit.
   Evidence: failures took 177-189 s, against 61-100 s for the 9 passes; no time-of-day pattern.
```

The hypotheses appear in the "Likely root cause" column on /flaky, each with its confidence and "by flake-analyst". A hypothesis is marked "Out of date" once the test has newer results.

The leaderboard changes when Claude records a test run result, for example through the `test-runner` agent. After each recorded result, the PostToolUse hook `flaky-after-result.sh` calls `POST /api/flaky/recompute`, which:

- recomputes the leaderboard
- posts one Discord alert for any test that just became flaky
- retries any alert that failed before
