---
name: test-generator
description: Generates test cases for a feature, field, form or API endpoint using ISTQB boundary-value analysis and equivalence partitioning, in the test case shape from CLAUDE.md. Use whenever the user asks for test cases, test scenarios, test ideas, edge cases or boundary tests, or asks what to test or how to test something in this app, even if they don't say "boundary". Not for the guided one-at-a-time /new-test interview or for bug reports.
---

# Test generator

Generate a set of test cases for what the user named, using ISTQB black-box techniques. Follow CLAUDE.md: its severity levels, its test case fields, its voice rules, and its chat text block rules.

## 1. Find the real rules before writing anything

Test cases are only useful if the expected results match how the feature is meant to behave. For each input the feature takes, find out:

- Type: text, number, date, choice from a list, list of items, and so on
- Required or optional
- Limits: minimum and maximum length, value or count
- Allowed values, for a choice from a list
- Uniqueness: whether duplicates are allowed
- Clean-up: for example, whether spaces at the start and end are trimmed

Look in this order:

1. What the user said.
2. The code. Server-side checks are the most reliable source. For the test case feature, that's `validateTestCase` in `server/test-cases.js` and the table definition in `server/db.js`. On the page, look for `required` and `maxLength` in the form components in `client/src/`.
3. CLAUDE.md.

If a rule can't be found, don't invent one. Write the test case with your assumption stated in the preconditions (for example "Assumes titles must be unique; no rule found"), set its status to draft, and list the open question at the end.

## 2. Work out the partitions and boundaries

For each input, list the following.

### Equivalence partitions

Split the possible values into groups the system should treat the same way. Each group needs one test case.

- Valid partitions: for example, a title of 1–200 characters, and each allowed severity value.
- Invalid partitions: for example, an empty title, a title over 200 characters, and a severity that isn't on the list.

### Boundary values (ISTQB 2-value)

For each limit, test the limit itself and its nearest invalid neighbor:

| Value | Example: text limited to 1–200 characters |
|---|---|
| min | 1 character, valid |
| max | exactly 200 characters, valid |
| min-1 | 0 characters, which is the same as empty: invalid |
| max+1 | 201 characters, invalid |

Use 3-value boundary analysis (also min+1 and max-1) only when the user asks for it or when the input is Critical severity.

If the page itself blocks an invalid value, for example a field with `maxLength` that stops typing at the limit, write two test cases. One checks the page blocks the value, such as typing stops at 200 characters. The other sends the value straight to the API and checks the server rejects it too.

### Special text values

For text inputs, also cover:

- Empty: nothing typed.
- Whitespace only: spaces, a tab or a line break, with no visible characters. If the system trims spaces, this should behave like empty.
- Leading and trailing spaces around valid text: check they're trimmed or kept, as the rules say.
- Very long: far over the maximum, like 10,000 characters. Check the system rejects it with a clear message rather than crashing, freezing or cutting the text off without saying so.

For a list input, such as the steps of a test case, apply the same idea to the count: no items, 1 item, the maximum number of items if there is one, and the maximum plus 1. Also cover a list where some items are blank.

## 3. Cover these categories

Every set must include each category below that applies. If a category doesn't apply, say why in the coverage summary rather than leaving it out silently.

1. Happy path: a normal, fully valid use of the feature, start to finish.
2. Boundary values: min, max, min-1 and max+1 for each limit, plus empty, whitespace only and very long text.
3. Equivalence partitions: one case per valid and invalid partition that the boundary cases don't already cover. Avoid repeats: one test case can cover a boundary and a partition at the same time.
4. Negative cases:
   - Missing required field: one case per required field, left out or blank.
   - Wrong type: a number, true/false, list or object where text is expected, and so on. Forms usually can't send these, so write the steps as a request to the API, such as `POST /api/test-cases` with the request body to send, and check the reply uses the CLAUDE.md shape with `success: false`.
   - Duplicate: the same item created twice, such as the same title. If there's no uniqueness rule, the expected result is that both are saved as separate items. Say so, and note that it's a product decision whether that's right.

## 4. Write each test case in the CLAUDE.md shape

Fields, in this order:

- Title: what is checked and the input condition, like "Title of exactly 200 characters is accepted". Keep it under 80 characters.
- Preconditions: what must be true before step 1, or "None".
- Steps: numbered, one action per step. Give exact values to type. For long values, describe how to make them, like "Type the letter a 201 times", rather than pasting the text.
- Expected result: something a person can check, such as the exact error message, what appears in the table, or the API reply. Use the real wording from the code when you can find it.
- Severity: Critical, Major, Minor or Trivial, using the definitions in CLAUDE.md. Judge it by the impact if this test failed. For example, a crash or data saved wrongly is Critical or Major. A missing or unclear error message is Minor.
- Status: draft for every generated test case, because nobody has reviewed or run it yet.

Give each test case an ID within the set, such as TC-01, so the user can refer to it.

## 5. Show the results

Show the test cases in the chat, following the CLAUDE.md text block rules: a plain `text` code block, and no bold except titles and headings. Use one block for the whole set so it can be copied at once.

After the block, add:

- A coverage summary: one line per category, listing the test case IDs that cover it. Mention any category you left out and why.
- Open questions: rules you couldn't find and assumed. Leave this out if there are none.

Then offer to save them in either or both of these places:

- As files in `tests/manual/`, one per test case, using the same file format as the `/new-test` command (see `.claude/commands/new-test.md`). Check existing names first and never overwrite a file.
- In the app's test case list, through `POST /api/test-cases`. The app must be running for this.

Only save after the user says yes.
