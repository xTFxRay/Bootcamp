---
description: Walk through writing a manual test case and save it under tests/manual/
argument-hint: "[optional: feature name]"
allowed-tools: Read, Write, Bash(ls:*), AskUserQuestion
---

Help me write one manual test case for this app, then save it as a Markdown file in `tests/manual/`.

The user may not write code, so keep the conversation plain and friendly. Ask one question at a time and wait for each answer before moving on. Follow the severity definitions and the voice rules in CLAUDE.md.

If text was given after the command, treat it as the answer to question 1 and skip that question: $ARGUMENTS

## Questions to ask, in order

1. **Feature**: "Which feature or part of the app does this test cover?" (for example: the home page, signing in, adding an item)
2. **Preconditions**: "What needs to be true before you start? For example: the app is running, or you're signed in." Suggest likely preconditions from the feature. If the user says there are none, write "None".
3. **Steps**: "What steps does the user take? List them in order, one action per step." If the answer is vague or merges several actions into one, suggest a clearer split into separate steps and ask the user to confirm.
4. **Expected result**: "What should happen when the steps are done correctly?" It should be something a person can check by looking at the screen. If it's vague, like "it works", ask what exactly they'd see.
5. **Severity**: "If this test failed, how serious would that be?" Use AskUserQuestion with these four options:
   - **Critical**: the app is unusable, data is lost, or there's a security problem
   - **Major**: an important feature is broken, with no easy workaround
   - **Minor**: something is wrong but there's a workaround, or it affects a small feature
   - **Trivial**: a cosmetic issue, like a typo or misalignment
6. **Status**: "Is this test ready to run, or still a draft?" Use AskUserQuestion with these options:
   - **ready**: the steps and expected result are final
   - **draft**: something still needs to be filled in or checked
   - **passed** or **failed**: only if the user has already run it
7. **Title**: suggest a short, specific title based on the answers (for example "Home page shows server greeting") and ask the user to accept it or give their own.

## Confirm before saving

Show the finished test case in the format below and ask "Save this?" Make any changes the user asks for, then save.

## File format

```markdown
# <Title>

**Feature:** <feature>
**Severity:** <Critical | Major | Minor | Trivial>
**Status:** <draft | ready | passed | failed | skipped>
**Created:** <today's date, YYYY-MM-DD>

## Preconditions

<what must be true before step 1, or "None">

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
