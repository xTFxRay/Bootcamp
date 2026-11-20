---
description: Walk through writing a manual test case and save it under tests/manual/
argument-hint: "[optional: feature name]"
allowed-tools: Read, Write, Bash(ls:*), AskUserQuestion
---

Help me write one manual test case for this app, then save it as a Markdown file in `tests/manual/`.

The user may not write code, so keep the conversation plain and friendly. Ask one question at a time and wait for each answer before moving on.

If text was given after the command, treat it as the answer to question 1 and skip that question: $ARGUMENTS

## Questions to ask, in order

1. **Feature**: "Which feature or part of the app does this test cover?" (for example: the home page, signing in, adding an item)
2. **Steps**: "What steps does the user take? List them in order, one action per step." If the answer is vague or merges several actions into one, suggest a clearer split into separate steps and ask the user to confirm.
3. **Expected result**: "What should happen when the steps are done correctly?" It should be something a person can check by looking at the screen. If it's vague, like "it works", ask what exactly they'd see.
4. **Severity**: "If this test failed, how serious would that be?" Use AskUserQuestion with these four options:
   - **Critical**: the app is unusable, data is lost, or there's a security problem
   - **Major**: an important feature is broken, with no easy workaround
   - **Minor**: something is wrong but there's a workaround, or it's a small feature
   - **Trivial**: a cosmetic issue, like a typo or misalignment
5. **Title**: suggest a short, specific title based on the answers (for example "Home page shows server greeting") and ask the user to accept it or give their own.

## Confirm before saving

Show the finished test case in the format below and ask "Save this?" Make any changes the user asks for, then save.

## File format

```markdown
# <Title>

**Feature:** <feature>
**Severity:** <Critical | Major | Minor | Trivial>
**Created:** <today's date, YYYY-MM-DD>

## Steps

1. <step one>
2. <step two>
3. ...

## Expected result

<expected result>
```

## Saving

- Folder: `tests/manual/`. Writing the file creates the folder if it doesn't exist.
- File name: the title in lowercase, with spaces turned into hyphens and punctuation removed, then `.md`. For example: `tests/manual/home-page-shows-server-greeting.md`.
- First, list what's already there by running `ls tests/manual/` with the Bash tool. If that fails because the folder doesn't exist yet, there's nothing to clash with. If a file with that name already exists, add `-2`, `-3`, and so on, rather than overwriting it.
- When it's saved, tell the user the file path and offer to write another test case.
