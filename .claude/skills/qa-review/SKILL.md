---
name: qa-review
description: Reviews code changes, pages or features from a tester's point of view and reports issues grouped by CLAUDE.md severity (Critical, Major, Minor, Trivial). Use when the user asks for a QA review, a tester's review, to "test my change", "what could break", "find bugs in this", "is this ready to ship", or to check a feature, page, form or endpoint for problems. Covers missing validation, missing error handling, unclear user messages, missing confirmation for destructive actions, and accessibility. Not for writing test cases (use test-generator) or for code style reviews.
---

# QA review

Review what the user named the way a tester would: look for ways real users, mistakes and bad input can break it, and report the issues grouped by severity. Follow CLAUDE.md: its severity levels, its API response shape, its voice rules, and its chat text rules.

Don't fix anything during the review. Report first, and fix only what the user picks afterwards.

## 1. Decide the scope

- If the user named a feature, page, file or endpoint, review that.
- If they said "my change", "this" or nothing specific, review the unsaved changes (`git diff HEAD` and new files from `git status`). If everything is saved, review the most recent commit (`git show HEAD`).
- Read every file in scope fully, and follow the code paths it relies on. For a page, that includes the API endpoints it calls. For an endpoint, that includes the page that calls it.

State the scope in one line at the top of the report.

## 2. Check each area

Go through every area below. For each issue, try to confirm it rather than guess:

- If the app is running, try it: send the request with `curl`, or use the page in the browser pane.
- If you can't try it, trace the code path and say the issue was found by reading the code.

### Missing validation

- Every input is checked on the server, not only on the page. The page's checks can be skipped by calling the API directly.
- Required fields, types, lengths, number ranges, allowed values, and spaces-only text are all handled.
- The page and the server agree on the limits, such as the same maximum length.
- IDs in addresses that don't exist, or aren't numbers, get a clear "not found" reply.
- Query values like page numbers, sort options and filters are checked: negative, zero, very large, and unknown values.

### Missing error handling

- Every API call on the page handles a failed request, the server being down, and an error reply. The user sees what went wrong, and the page doesn't break or show nothing.
- Loading states exist. Buttons can't send the same request twice while waiting.
- Empty states exist: no items yet, and no results for a search or filter.
- The server catches unexpected errors and still replies in the CLAUDE.md shape `{ success, data, error }`.
- Errors aren't silently swallowed: no empty `catch` blocks or ignored failed replies.
- The page copes with unexpected data, such as a missing field or `null`.

### Unclear user messages

- Error messages say what went wrong and what to do next. A generic "Something went wrong" where the cause is known is an issue.
- No technical wording reaches the user: status codes, error names or raw server messages.
- Successful actions give feedback, so the user can tell a save or delete worked.
- Wording is consistent across the app, such as the same term for the same thing, and follows the CLAUDE.md voice rules.

### Missing confirmation for destructive actions

- Deleting, overwriting or resetting anything asks for confirmation first. The confirmation names the item and says whether it can be undone.
- Closing a form with unsaved changes, by Cancel, Escape, clicking outside it, or leaving the page, doesn't throw away the user's input without warning.
- The destructive button is clearly marked and isn't the default action of the form.

### Accessibility

- Every input has a label that screen readers can read, not just placeholder text.
- Everything works with the keyboard alone: Tab order makes sense, menus and dialogs open and close with Enter and Escape, and there's a visible focus outline.
- Dialogs move focus into themselves when they open, keep it inside while open, and return it to the button that opened them when they close.
- Errors are announced: error messages use `role="alert"` or are linked to their field.
- Color is never the only signal. A severity badge needs its text, not only its color. Text contrast is readable, at least 4.5 to 1 for normal text.
- Icon-only buttons, like "⋯" or "✕", have an accessible name.
- Click targets are large enough to tap on a phone, about 24 × 24 pixels minimum.

### CLAUDE.md conventions

Also report any drift from CLAUDE.md: the API response shape, test case and bug report fields, severity and status values, and file and handler naming.

## 3. Assign severity

Use the CLAUDE.md definitions, judged by the effect on a real user:

- Critical: the app is unusable, data is lost, or there's a security problem. For example, a crash on common input, a delete without confirmation that loses data, or bad input saved to the database.
- Major: an important feature is broken, with no easy workaround. For example, an error that leaves the page stuck, a form that can't be used with the keyboard, or a missing server-side check on an important field.
- Minor: something is wrong but there's a workaround, or it affects a small feature. For example, an unclear error message, a missing empty state, or a small accessibility gap.
- Trivial: a cosmetic issue, like a typo, inconsistent wording or misalignment.

When unsure between two levels, pick the higher one and say why.

## 4. Write the report

Use this structure. Use headings and lists, with no bold, per the CLAUDE.md chat rules. Number issues QA-01, QA-02 and so on across the whole report, so the user can refer to them. Link file references as `path:line`.

```text
# QA review: <what was reviewed>

Scope: <files, pages or endpoints reviewed, and how: read the code, tried it in the browser, called the API>

## Critical

1. QA-01 <short title of the problem>
   - Where: <page and control, or file:line>
   - What happens: <steps or input, and the result>
   - Why it matters: <the effect on the user>
   - Suggested fix: <one or two sentences>
   - Confirmed: <yes, reproduced / no, found by reading the code>

## Major

...

## Minor

...

## Trivial

...

## Summary

<count per severity, e.g. "Critical 0, Major 2, Minor 3, Trivial 1">
Checked with no issues: <areas from step 2 where nothing was found>
```

Rules:

- Always show all four severity headings, in the order above. Under a heading with no issues, write "None found."
- One issue per problem. If the same problem appears in several places, list it once and name every place.
- Only report real problems. Don't pad the list with personal preferences or "could be nicer" ideas.
- If something couldn't be checked, for example because the app wasn't running, say so in the Summary.

## 5. Offer next steps

After the report, offer to do either or both of these:

- Fix the issues: all of them, by severity, or by number, such as "fix QA-01 and QA-03".
- Save them as bug reports in `tests/bugs/`, one file per issue, using the format from the `bug-report` command (see `${CLAUDE_PLUGIN_ROOT}/.claude/commands/bug-report.md`), with status open.

Only do either after the user says yes.
