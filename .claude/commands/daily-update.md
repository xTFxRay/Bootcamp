---
description: Summarize today's work so far and save it as updates/YYYY-MM-DD.md
allowed-tools: Read, Write, Bash(date:*), Bash(ls:*), Bash(wc:*), Bash(git log:*), Bash(git diff:*), Bash(git status:*), Bash(git ls-files:*), AskUserQuestion
---

Write a daily update describing what was done in this project today, from midnight until now, and save it as `updates/YYYY-MM-DD.md`.

The user may not write code, so write the update in plain language. Get every number from the commands below; never estimate or make one up. If a command fails or a number can't be worked out, write "unknown" and say why.

## 1. Find today's date and time

Run `date "+%Y-%m-%d %H:%M %Z"`. The date part (YYYY-MM-DD) is "today" and goes in the file name. The full value is the "Generated" timestamp.

## 2. Collect what happened today

Run these from the project folder. "Since midnight" means local midnight today.

- **Saved versions (commits):** `git log --since=midnight --reverse --format="%h %ad %s" --date=format:%H:%M`
- **Lines changed in saved versions, per file:** `git log --since=midnight --numstat --format= -- . ':!package-lock.json' ':!updates/'`
- **Files added today:** `git log --since=midnight --diff-filter=A --name-only --format=`
- **Unsaved changes:** `git status --short`, plus `git diff HEAD --numstat -- . ':!package-lock.json' ':!updates/'` for changed files. For brand-new files that git isn't tracking yet (`git ls-files --others --exclude-standard`), count their lines with `wc -l`.
- **Test cases written today:** list `tests/manual/` and read each file. Count the ones whose `**Created:**` line is today's date.
- **Bugs found today:** list `tests/bugs/`. Count the files whose names start with today's date, and read each for its title and severity.

Leave out `package-lock.json` (generated automatically by npm when packages are installed, not written by anyone) and `updates/` (these reports themselves) from all line counts. Ignore `.gitkeep` files: they're empty placeholders.

## 3. Ask about test runs

Nothing in the project records when test cases are run, so ask the user once:

"Did you run any test cases today? If so, which ones, and did each pass or fail?"

If there are test cases in `tests/manual/`, list their titles in the question so the user can answer quickly. If the user says none or skips, write "None recorded" in the update.

## 4. Sort the line counts

Split the lines added and removed into two groups:

- **App code:** files in `server/` and `client/`, plus the root `package.json`.
- **Project files:** everything else, such as Claude commands in `.claude/`, test cases and bug reports in `tests/`, and config files like `.gitignore`.

Add saved and unsaved changes together for the totals, and mention how many lines are still unsaved.

## 5. Describe the functionality

From the commit messages and the changed files, write a short plain-language list of what can now be done that couldn't before, such as a new page, a new button, or a new server feature. Changes to tooling, like new Claude commands, go under "Other changes" instead. If nothing user-facing was added, write "No new app functionality today."

## 6. Write the file

Use this format:

```markdown
# Daily update: <YYYY-MM-DD>

**Generated:** <full timestamp>
**Covers:** midnight to <time from the timestamp>

## At a glance

| | Today |
|---|---|
| App code lines | +<added> / -<removed> |
| Other project lines | +<added> / -<removed> |
| Saved versions (commits) | <count> |
| Test cases written | <count> |
| Test cases run | <count, or "None recorded"> |
| Bugs found | <count> |

## New functionality

- <plain-language item>

## Other changes

- <plain-language item, e.g. "Added the /bug-report command for writing bug reports">

## Saved versions

- <HH:MM> <commit message>

## Test cases

- **Written:** <titles, or "None">
- **Run:** <title: pass/fail for each, or "None recorded">

## Bugs found

- <title> (<severity>), or "None"

## Not saved yet

<files with unsaved changes and their line counts, or "Everything is saved.">
```

## 7. Save

- Save to `updates/<YYYY-MM-DD>.md`. Writing the file creates the folder if needed.
- There is one file per day. If today's file already exists, replace it: the new update covers the whole day so far, so it includes everything the earlier one had. Tell the user you updated the existing file.
- When it's saved, show the "At a glance" table and give the file path.
