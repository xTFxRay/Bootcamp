# QA Command Center

A QA workspace app (test cases, suites, runs, bugs, flaky tests, reports and a dashboard) together with
`qa-command-center`, the Claude Code plugin the team uses to work on it. Both live in this repository.
The app is an Express 5 server with a SQLite database and a React 19 client built with Vite.

## What this plugin does

It gives Claude Code the team's QA routine: writing test cases and bug reports in the CLAUDE.md format,
reviewing changes as a tester, running test cases against the app, explaining flaky tests, and
warning about mistakes as files are edited. Claude follows the house rules in `CLAUDE.md`:
the severity levels, the test case and bug report fields, and the `{ success, data, error }` API shape.

- Slash commands walk you through one task: write a test case, write a bug report, or summarize the day.
- Skills turn on by themselves when a request matches, for example "what could break?" or "write
  boundary tests for the password field".
- Subagents do bigger jobs on their own and report back: writing a test set, a read-only QA review,
  running test cases in the browser, and writing root-cause hypotheses for flaky tests.
- Hooks run automatically. They warn about API response-shape and severity mistakes, check the app
  after each commit, recompute flaky tests after a run result, and stop the flake analyzer from
  finishing early. None of them block your work.

## Install

You need [Claude Code](https://claude.com/claude-code), Node.js 24, `git`, `curl` and `jq`.

1. Clone the repository and start the app (the hooks and agents talk to it on http://localhost:5173):

   ```bash
   git clone https://github.com/xTFxRay/Bootcamp.git qa-command-center
   ```

   ```bash
   cd qa-command-center && npm install && npm run dev
   ```

   The first run creates a local database with sample data. Optional: copy `.env.example` to `.env`
   and fill in `DISCORD_WEBHOOK_URL` for Discord alerts. `.env` is git-ignored; never commit it.

2. Install the plugin. In Claude Code, from inside the cloned folder:

   ```text
   /plugin marketplace add ./
   /plugin install qa-command-center@qa-command-center
   ```

   Or from a terminal:

   ```bash
   claude plugin marketplace add ./ && claude plugin install qa-command-center@qa-command-center
   ```

   You can also install it without cloning: `claude plugin marketplace add xTFxRay/Bootcamp`, then
   the same install command.

3. Restart Claude Code. Plugins load at start-up. Check with `/plugin`: qa-command-center should be
   enabled. Its commands start with `/qa-command-center:`, for example `/qa-command-center:new-test`.

Notes:

- When the open project is this repository, the commands, skills and agents in `.claude/` also load
  as project settings without the plugin, as plain `/new-test` and so on. The hooks come only from
  the plugin. To use them without installing it, copy the `hooks` block from
  `.claude/hooks/settings.fragment.json` into `.claude/settings.json`. Don't do both, or every hook
  runs twice.
- The root folders `commands`, `skills`, `agents` and `hooks` are links to the matching folders in
  `.claude/`, so the plugin and the project use the same files. On Windows, clone with
  `git clone -c core.symlinks=true` (needs Developer Mode), or the links arrive as plain text files.
- To update after a `git pull`: `claude plugin marketplace update qa-command-center`, then restart.

## Examples

Worked examples from this project, each in prompt → what Claude did → result form:

- [examples/qa-review-polish-gaps.md](examples/qa-review-polish-gaps.md): "Run our qa-review skill to
  spot polish gaps" found 7 issues in the Flaky Test Tracker, and "Fix all 7" fixed them.
- [examples/flaky-test-hypotheses.md](examples/flaky-test-hypotheses.md): the flake-analyzer agent
  writes an evidence-based root-cause hypothesis for each of the 10 flakiest tests, and a hook
  stops it from finishing until every row has one.

Prompts to try on day one:

```text
/qa-command-center:new-test
/qa-command-center:bug-report The Save button on Settings does nothing
Write test cases for the CSV import page
Use the qa-reviewer agent on the bug tracker
Run test case 4
Explain the flaky tests
```

## What's inside

| Path | What it is |
|---|---|
| `.claude-plugin/plugin.json` | Plugin manifest: name, description, version, author. Metadata only. |
| `.claude-plugin/marketplace.json` | Lets this repository be added as a plugin marketplace |
| `.claude/commands/new-test.md` | `/new-test`: write one manual test case, saved in `tests/manual/` |
| `.claude/commands/bug-report.md` | `/bug-report`: write a bug report, saved in `tests/bugs/` |
| `.claude/commands/daily-update.md` | `/daily-update`: summarize today's work in `updates/YYYY-MM-DD.md` |
| `.claude/skills/test-generator/` | Test cases using boundary-value analysis and equivalence partitioning |
| `.claude/skills/qa-review/` | A tester's review, with issues grouped by severity |
| `.claude/skills/github-push/` | Pushes committed code to GitHub, step by step |
| `.claude/agents/test-writer.md` | Subagent: writes a full test set for a feature (Read, Write) |
| `.claude/agents/qa-reviewer.md` | Subagent: read-only QA review with a prioritized issue list (Read, Grep) |
| `.claude/agents/test-runner.md` | Subagent: runs test cases in the browser and records passed, failed or blocked |
| `.claude/agents/flake-analyzer.md` | Subagent: root-cause hypotheses for the 10 flakiest tests (Read, Bash) |
| `.claude/hooks/check-response-shape.sh` | After a server file is edited: warns if an endpoint skips `{ success, data, error }` |
| `.claude/hooks/check-severity-enum.sh` | After a code file is edited: warns about severity values outside Critical, Major, Minor, Trivial |
| `.claude/hooks/page_down.sh` | After a `git commit`: checks the app still answers, with a Discord alert if it doesn't |
| `.claude/hooks/flaky-after-result.sh` | After Claude records a test run result: recomputes flaky tests and alerts new flakes |
| `.claude/hooks/check-flake-hypotheses.sh` | When flake-analyzer stops: blocks it while a top-10 flaky test has no current hypothesis |
| `.claude/hooks/hooks.json` | Hook wiring the plugin loads (uses `${CLAUDE_PLUGIN_ROOT}`) |
| `.claude/hooks/settings.fragment.json` | The same wiring for `.claude/settings.json` (uses `${CLAUDE_PROJECT_DIR}`) |
| `examples/` | Worked examples |
| `client/`, `server/` | The app |
| `CLAUDE.md` | House rules Claude follows in this project |
| `LICENSE` | MIT |

## Run the app

Needs Node.js 24.

```bash
npm install
npm run dev
```

Open http://localhost:5173. The server runs on port 3001 and fills a new database with sample data
the first time. To turn on Discord alerts for failed test cases, copy `.env.example` to `.env` and
set `DISCORD_WEBHOOK_URL`. To have Claude write root-cause hypotheses for flaky tests
automatically, set `ANTHROPIC_API_KEY` too.

## DEPLOY

The app deploys to [Render](https://render.com) as one free web service. Render runs
`npm ci --include=dev && npm run build`, then `npm start`: the Express server serves the API and
the built React app from the same address. Everything Render needs is in `render.yaml`.

### Free tier: what to expect

Checked November 2026 against [Render's free tier docs](https://render.com/docs/free):

- **Cost:** $0. 750 free instance hours a month per workspace, enough for one always-on service.
  No card needed.
- **Sleeps when idle:** after 15 minutes with no visits the service stops. The next visit wakes it,
  which takes about a minute.
- **Data does not last:** the free tier has no persistent disk, so the SQLite database starts
  again from the sample data every time the service sleeps, restarts or is redeployed. Fine for a
  demo; for real use, upgrade to a paid instance and add a disk (set `DB_PATH` to a path on it).
- **One instance**, 512 MB memory, 0.1 CPU.

### First deploy

1. Commit your work and push it to GitHub (`main` branch).
2. Open the Blueprint link, sign in to Render (with GitHub), and click **Deploy Blueprint**:

   ```bash
   open "https://render.com/deploy?repo=https://github.com/xTFxRay/Bootcamp"
   ```

   Render asks for `DISCORD_WEBHOOK_URL` and `ANTHROPIC_API_KEY`. Paste them to get alerts and
   automatic flaky-test hypotheses, or leave them empty. If the service already exists, add them
   under the service's **Environment** tab instead (Render then redeploys).
3. Wait for the first build (a few minutes). The public address appears at the top of the
   service's page, for example `https://bootcamp-app.onrender.com`.

### Flaky-test hypotheses on the deployed site

Without an API key, ask Claude Code to "fill in the deployed flaky test hypotheses": the
`flake-analyzer` agent reads the deployed /flaky page and saves a hypothesis for each flaky
test, using `FLAKY_WRITE_TOKEN` from your local `.env`. On the free tier they're lost the next time
the service sleeps or redeploys, along with all other data, so run it again before showing the site.

### Later deploys

Every push to `main` deploys again automatically.

### Environment variables

See `.env.example`. On Render:

| Variable | Needed | What it does |
|---|---|---|
| `DISCORD_WEBHOOK_URL` | no | Discord alerts for failed test cases and new flaky tests; set in Render, never in a file |
| `ANTHROPIC_API_KEY` | no | Claude writes a root-cause hypothesis for each new flaky test (and on "Write with AI"); each one is a billed Claude API request. Set in Render, never in a file |
| `FLAKY_WRITE_TOKEN` | recommended | Protects saving flaky-test hypotheses on the public site. Use the same value as in your local `.env`, so `flake-analyzer` can save to the deployed copy |
| `APP_URL` | no | Address used in alert links; defaults to Render's own address |
| `PORT` | set by Render | Port the server listens on |
| `DB_PATH` | no | Where the database file goes; only useful with a paid disk |
| `NODE_VERSION` | set in `render.yaml` | Node.js version for the build |

### Removing it

In the Render dashboard, open the service → **Settings** → **Delete Web Service**.
