---
description: Walk through writing a bug report and save it as a dated file under tests/bugs/
argument-hint: "[optional: page or screen where the bug happened]"
allowed-tools: Read, Write, Bash(ls:*), Bash(date:*), AskUserQuestion
---

Help me write one bug report for this app, then save it as a Markdown file in `tests/bugs/`.

The user may not write code, so keep the conversation plain and friendly. Ask one question at a time and wait for each answer before moving on.

If text was given after the command, treat it as the answer to question 1 and skip that question: $ARGUMENTS

## Questions to ask, in order

1. **Where**: "Which page or screen were you on when the bug happened?" (for example: the home page at http://localhost:5173)
2. **What you did**: "What did you do, step by step? List the actions in order, one per step, starting from opening the app." These become the steps to reproduce the bug. If the answer is vague or merges several actions into one, suggest a clearer split into separate steps and ask the user to confirm.
3. **Expected**: "What did you expect to happen?"
4. **Actual**: "What actually happened instead?" Ask for exactly what they saw: an error message (word for word if possible), a blank page, wrong text, nothing happening, and so on. If the answer is vague, like "it broke", ask what exactly was on the screen.
5. **Severity**: "How serious is this bug?" Use AskUserQuestion with these four options:
   - **Critical**: the app is unusable, data is lost, or there's a security problem
   - **Major**: an important feature is broken, with no easy workaround
   - **Minor**: something is wrong but there's a workaround, or it's a small feature
   - **Trivial**: a cosmetic issue, like a typo or misalignment
6. **Title**: suggest a short, specific title that names the problem (for example "Home page shows 'Could not reach the server'") and ask the user to accept it or give their own.

## Timestamp

Get the current date and time by running `date "+%Y-%m-%d %H:%M %Z"` with the Bash tool. Don't guess it. Use this as the report's timestamp, and its date part (YYYY-MM-DD) in the file name.

## Confirm before saving

Show the finished bug report in the format below and ask "Save this?" Make any changes the user asks for, then save.

## File format

```markdown
# <Title>

**Where:** <page or screen>
**Severity:** <Critical | Major | Minor | Trivial>
**Reported:** <timestamp, e.g. 2026-11-20 14:05 EET>

## Steps to reproduce

1. <step one>
2. <step two>
3. ...

## Expected result

<what the user expected>

## Actual result

<what actually happened>
```

## Saving

- Folder: `tests/bugs/`. Writing the file creates the folder if it doesn't exist.
- File name: the date, a hyphen, then the title in lowercase with spaces turned into hyphens and punctuation removed, then `.md`. For example: `tests/bugs/2026-11-20-home-page-shows-could-not-reach-the-server.md`.
- First, list what's already there by running `ls tests/bugs/` with the Bash tool. If that fails because the folder doesn't exist yet, there's nothing to clash with. If a file with that name already exists, add `-2`, `-3`, and so on, rather than overwriting it.
- When it's saved, tell the user the file path and offer to write another bug report.
