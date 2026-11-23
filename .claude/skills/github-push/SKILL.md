---
name: github-push
description: Pushes this project's saved (committed) code to a repository on GitHub, walking the user through each step and asking for whatever is needed, such as an existing repo or a new one, its name, private or public, and sign-in. Use when the user asks to push to GitHub, upload or put the code on GitHub, back it up online, publish the repo, connect a GitHub repo, or make the code available to others. Not for making commits; those stay local until this runs.
---

# Push to GitHub

Get the user's saved commits from this computer onto GitHub, safely. The user doesn't write code, so explain each step in plain language before doing it. Follow the CLAUDE.md chat rules: no bold except headings, and plain `text` code blocks.

Pushing is outward-facing: once code is on GitHub, others may see it, and it can be copied or cached even if deleted later. So never push, create a repo or change settings without the user's clear yes to the exact plan in step 5.

## Hard rules

- Never type, ask for or handle passwords, tokens or sign-in codes. The user signs in themselves, in their own terminal or browser.
- Never force-push (`--force`, `-f`, `--force-with-lease`) or delete anything on GitHub unless the user explicitly asks for that exact action after you explain what it destroys.
- Never push to a repository the user didn't name or approve.
- Only committed work is pushed. Don't commit, add or delete files as part of this skill. If there are unsaved changes, say so and let the user decide whether to commit first.
- If a step fails, stop, explain the error in plain words, and say what the user can do. Don't try workarounds that bypass these rules.

## 1. Check the starting point

Run these and summarize the results for the user in a few plain lines:

- `git status -sb`: the current branch, and whether there are unsaved changes or untracked files. Untracked and unsaved files will not be pushed. List them, so nothing is left behind by surprise.
- `git log --oneline -10` and `git rev-list --count HEAD`: what will be pushed.
- `git remote -v`: whether a GitHub repo is already connected. If one is, show its address and ask whether to push there.
- `git config user.name` and `git config user.email`, and `git log -1 --format="%an <%ae>"`: who the commits say wrote them. See step 3.
- `command -v gh` and `gh auth status`: whether the GitHub command-line tool is installed and signed in.

## 2. Check for things that must not go online

Before anything is pushed, look through the committed files (`git ls-files`, and file contents where needed) for:

- Secrets: `.env` files, API keys, tokens, passwords, private keys (`*.pem`, `id_rsa`), and strings like `sk-`, `ghp_`, `AKIA`, `-----BEGIN`.
- Local data: database files (`*.db`, `*.sqlite`), logs, `node_modules/`.
- Very large files (over 50 MB). GitHub rejects files over 100 MB.

Also check `.gitignore` covers these.

If anything turns up, stop and tell the user what and where. A secret that's already in a commit stays in the history even if the file is deleted later. Removing it means rewriting history, which needs the user's go-ahead and should happen before the first push. Don't continue until it's resolved.

## 3. Check the author details

Every commit carries an author name and email. On GitHub they become visible to anyone who can see the repo.

If `user.name` or `user.email` isn't set, or the email looks automatic, such as one ending in `.local`, explain this and ask:

- What name to use.
- Which email to use. Recommend their GitHub "noreply" address: on github.com, go to Settings, then Emails, and turn on "Keep my email addresses private". The noreply address is shown there. It links commits to their account without showing their real email.
- Whether to save these for this project only (`git config user.name ...`) or for every project on this computer (`git config --global ...`).

Commits that already exist keep their old author. If nothing has been pushed yet, offer to update them, explaining it rewrites the local history:

```text
git rebase --root --exec "git commit --amend --no-edit --reset-author"
```

Only run it if the user agrees. Never do it to commits that are already on GitHub.

## 4. Ask what's needed

Ask one question at a time, using AskUserQuestion where there are clear options. Skip anything already answered.

1. "Do you already have a repository on GitHub for this project?"
   - Yes: ask for its web address, like https://github.com/owner/name. Check whether it's empty with `git ls-remote <address>`. If it already has commits, see "Repo already has commits" below.
   - No: create a new one. Continue with questions 2 to 5.
2. "Which GitHub account or organization should own it?" With `gh` signed in, list the options with `gh api user --jq .login` and `gh org list`.
3. "What should it be called?" Suggest the project folder name. Names use letters, numbers, hyphens, dots and underscores, with no spaces.
4. "Should it be private or public?"
   - Private (recommended): only you, and people you invite, can see it.
   - Public: anyone on the internet can see it, including every commit's author name and email.
5. "Add a short description?" (optional)
6. Which branch to push: normally the current branch (usually `main`).

### Sign-in

The simplest route is the GitHub command-line tool, `gh`:

- If it isn't installed, give the user the command to run themselves: `brew install gh` on a Mac with Homebrew. Otherwise, point them to https://cli.github.com.
- If it isn't signed in, ask the user to run `gh auth login` in their own terminal and follow the prompts. The easiest choices are GitHub.com, HTTPS, and "Login with a web browser". Wait for them to say it's done, then check again with `gh auth status`.

If the user prefers not to install `gh`, they can create an empty repo on github.com themselves: click the "+" at the top right, then "New repository", and don't add a README, .gitignore or license. Then they give you its address. Git will ask for sign-in in a browser window or the macOS keychain the first time it pushes.

## 5. Confirm the plan

Before running anything that touches GitHub, show the exact plan and ask for a yes, for example:

```text
I'll create a private repository your-account/bootcamp-app on GitHub and push 14 commits from the main branch.
Not included: notes/draft.md (never committed).
```

If anything changes after the yes, such as a different name or visibility, ask again.

## 6. Push

New repo, with `gh`:

```text
gh repo create <owner>/<name> --private --source=. --remote=origin --push --description "<description>"
```

Use `--public` instead of `--private` if that's what the user chose. Leave out `--description` if there isn't one.

Existing empty repo, or a repo the user created on github.com:

```text
git remote add origin <address>
git push -u origin <branch>
```

If `origin` already exists and points somewhere else, don't overwrite it silently. Show both addresses and ask which one to use.

### Repo already has commits

If the GitHub repo isn't empty, for example because it was created with a README, the push is rejected. Don't force-push. Explain the options and let the user choose:

- Combine the two: `git pull --rebase origin <branch>`, check the result, then push. This keeps both.
- Use a different, empty repo.
- Replace what's on GitHub. This destroys its existing commits, so only do it if the user explicitly asks after you explain that.

### Common errors

| Error message contains | What it means | What to do |
|---|---|---|
| `Authentication failed` / `could not read Username` | Not signed in | The user runs `gh auth login` |
| `Permission denied` / `403` | The signed-in account can't write to this repo | Check the owner, or ask the repo owner for access |
| `Name already exists` | A repo with that name exists on the account | Pick another name, or push to the existing one if it's theirs and empty |
| `rejected` / `fetch first` / `non-fast-forward` | GitHub has commits that aren't here | See "Repo already has commits" |
| `File ... exceeds GitHub's file size limit` | A file is over 100 MB | Stop, and see step 2 |
| `Could not resolve host` | No internet connection | Check the connection and try again |

## 7. Check it worked, and report

- Run `git status -sb`. It should say the branch is up to date with `origin/<branch>`.
- Run `git ls-remote origin` to confirm the latest commit is on GitHub.
- Tell the user:
  - The repo's web address.
  - How many commits went up, and from which branch.
  - Whether it's private or public.
  - What wasn't pushed: unsaved changes and untracked files.
- Explain future pushes in one line: after saving new commits, `git push` sends them, or ask Claude to push.
