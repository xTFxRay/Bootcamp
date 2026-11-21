import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Values allowed by CLAUDE.md.
export const SEVERITIES = ['Critical', 'Major', 'Minor', 'Trivial'];
export const TEST_CASE_STATUSES = ['draft', 'ready', 'passed', 'failed', 'blocked', 'skipped'];
export const TEST_SUITE_STATUSES = ['draft', 'ready', 'in-progress', 'passed', 'failed'];
export const BUG_STATUSES = ['open', 'in-progress', 'resolved', 'closed', 'reopened'];
export const BUG_PRIORITIES = ['high', 'medium', 'low'];
export const BUG_ACTIVITY_ACTIONS = ['created', 'status_change', 'comment'];

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || path.join(__dirname, 'data', 'app.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON'); // so deleting a suite or test case also removes its links

const list = (values) => values.map((v) => `'${v}'`).join(', ');

const testCasesTable = (name) => `
  CREATE TABLE IF NOT EXISTS ${name} (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    title           TEXT NOT NULL,
    preconditions   TEXT,
    steps           TEXT NOT NULL,           -- JSON array of strings, in order
    expected_result TEXT NOT NULL,
    severity        TEXT NOT NULL CHECK (severity IN (${list(SEVERITIES)})),
    status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (${list(TEST_CASE_STATUSES)})),
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
  )`;

db.exec(`
  ${testCasesTable('test_cases')};

  CREATE TABLE IF NOT EXISTS test_suites (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    feature    TEXT NOT NULL,                -- what the suite tests, e.g. "login"
    status     TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (${list(TEST_SUITE_STATUSES)})),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  -- Which test cases are in which suite, and in what order (sort_order 1, 2, 3...).
  CREATE TABLE IF NOT EXISTS test_suite_cases (
    suite_id     INTEGER NOT NULL REFERENCES test_suites(id) ON DELETE CASCADE,
    test_case_id INTEGER NOT NULL REFERENCES test_cases(id) ON DELETE CASCADE,
    sort_order   INTEGER NOT NULL,
    PRIMARY KEY (suite_id, test_case_id)
  );
  CREATE INDEX IF NOT EXISTS test_suite_cases_order ON test_suite_cases (suite_id, sort_order);
  CREATE INDEX IF NOT EXISTS test_suite_cases_case ON test_suite_cases (test_case_id);

  -- Small settings store. Records which sample data has been added, so it's added only once.
  CREATE TABLE IF NOT EXISTS app_meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS bugs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT NOT NULL,
    description TEXT,
    severity    TEXT NOT NULL CHECK (severity IN (${list(SEVERITIES)})),
    priority    TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN (${list(BUG_PRIORITIES)})),
    status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN (${list(BUG_STATUSES)})),
    steps       TEXT NOT NULL,                -- JSON array of strings: steps to reproduce, in order
    expected    TEXT NOT NULL,
    actual      TEXT NOT NULL,
    environment TEXT,                         -- e.g. "Chrome 131 on macOS, local dev server"
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  );

  -- Every creation, status change and comment on a bug, oldest first.
  CREATE TABLE IF NOT EXISTS bug_activity (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    bug_id     INTEGER NOT NULL REFERENCES bugs(id) ON DELETE CASCADE,
    action     TEXT NOT NULL CHECK (action IN (${list(BUG_ACTIVITY_ACTIONS)})),
    old_value  TEXT,                          -- status before, for status_change
    new_value  TEXT,                          -- status after, for status_change and created
    message    TEXT,                          -- the comment, or a note on a status change
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS bug_activity_bug ON bug_activity (bug_id, created_at);
`);

upgradeTestCaseStatuses();
seedOnce('seeded_test_cases', 'test_cases', seedTestCases);
seedOnce('seeded_test_suites', 'test_suites', seedTestSuites);
seedOnce('seeded_bugs', 'bugs', seedBugs);

// Databases made before a status was added (e.g. "blocked") still have the old list of
// allowed statuses built into the test_cases table. SQLite can't change that rule in place,
// so this rebuilds the table with the current rule, keeping every row, ID and suite link.
function upgradeTestCaseStatuses() {
  const { sql } = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'test_cases'").get();
  if (TEST_CASE_STATUSES.every((s) => sql.includes(`'${s}'`))) return;

  const oldSeq = db.prepare("SELECT seq FROM sqlite_sequence WHERE name = 'test_cases'").get()?.seq ?? 0;
  const columns = 'id, title, preconditions, steps, expected_result, severity, status, created_at, updated_at';

  // Links from suites must survive the swap, so foreign keys are off while it happens.
  db.pragma('foreign_keys = OFF');
  try {
    db.transaction(() => {
      db.exec(testCasesTable('test_cases_upgrade'));
      db.exec(`INSERT INTO test_cases_upgrade (${columns}) SELECT ${columns} FROM test_cases`);
      db.exec('DROP TABLE test_cases');
      db.exec('ALTER TABLE test_cases_upgrade RENAME TO test_cases');
      // Keep new IDs counting up from where they were, so a deleted ID is never reused.
      db.prepare("UPDATE sqlite_sequence SET seq = MAX(seq, ?) WHERE name = 'test_cases'").run(oldSeq);
      if (db.pragma('foreign_key_check').length > 0) throw new Error('Suite links broke during the upgrade');
    })();
    console.log(`Upgraded the test_cases table to allow statuses: ${TEST_CASE_STATUSES.join(', ')}.`);
  } finally {
    db.pragma('foreign_keys = ON');
  }
}

// Runs a seed function the first time only. If the user later deletes everything,
// the samples don't come back. A database that already has rows counts as seeded.
function seedOnce(key, table, seed) {
  if (db.prepare('SELECT 1 FROM app_meta WHERE key = ?').get(key)) return;
  const { count } = db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get();
  if (count === 0) seed();
  db.prepare('INSERT INTO app_meta (key, value) VALUES (?, ?)').run(key, new Date().toISOString());
}

// Adds sample test cases the first time the app runs, so the page isn't empty.
function seedTestCases() {

  const daysAgo = (days) => new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const samples = [
    {
      title: 'User can sign in with a valid email and password',
      preconditions: 'A user account exists with the email test.user@example.com and the password Test1234!. You are signed out.',
      steps: [
        'Open http://localhost:5173/login.',
        'Type test.user@example.com in the "Email" field.',
        'Type Test1234! in the "Password" field.',
        'Click "Sign in".',
      ],
      expected_result: 'The home page opens and the top right corner shows "Signed in as test.user@example.com".',
      severity: 'Critical',
      status: 'ready',
      updated: daysAgo(0.1),
    },
    {
      title: 'Sign-in shows an error for a wrong password',
      preconditions: 'A user account exists with the email test.user@example.com. You are signed out.',
      steps: [
        'Open http://localhost:5173/login.',
        'Type test.user@example.com in the "Email" field.',
        'Type WrongPass1 in the "Password" field.',
        'Click "Sign in".',
      ],
      expected_result: 'The login page stays open and shows "Email or password is incorrect" under the form. The password field is empty.',
      severity: 'Major',
      status: 'passed',
      updated: daysAgo(1),
    },
    {
      title: 'Password reset email is sent to a registered address',
      preconditions: 'A user account exists with the email test.user@example.com.',
      steps: [
        'Open http://localhost:5173/login.',
        'Click "Forgot password?".',
        'Type test.user@example.com in the "Email" field.',
        'Click "Send reset link".',
      ],
      expected_result: 'The page shows "Check your inbox for a reset link", and an email with a reset link arrives within 2 minutes.',
      severity: 'Major',
      status: 'draft',
      updated: daysAgo(2),
    },
    {
      title: 'Test case search finds a title by partial text',
      preconditions: 'A test case titled "Sign-in shows an error for a wrong password" exists.',
      steps: [
        'Open http://localhost:5173/test-cases.',
        'Type "wrong pass" in the search box.',
      ],
      expected_result: 'The table shows only "Sign-in shows an error for a wrong password".',
      severity: 'Minor',
      status: 'failed',
      updated: daysAgo(3),
    },
    {
      title: 'Browser tab shows the app name',
      preconditions: null,
      steps: [
        'Open http://localhost:5173 in a web browser.',
        'Look at the browser tab title.',
      ],
      expected_result: 'The tab title reads "Bootcamp App".',
      severity: 'Trivial',
      status: 'skipped',
      updated: daysAgo(5),
    },
  ];

  const insert = db.prepare(`
    INSERT INTO test_cases (title, preconditions, steps, expected_result, severity, status, created_at, updated_at)
    VALUES (@title, @preconditions, @steps, @expected_result, @severity, @status, @updated, @updated)
  `);
  const insertAll = db.transaction((rows) => {
    for (const row of rows) insert.run({ ...row, steps: JSON.stringify(row.steps) });
  });
  insertAll(samples);
  console.log(`Added ${samples.length} sample test cases to the database.`);
}

// Adds 2 sample suites with 3 test cases each.
// Picks the sample test cases by title, filling any gaps with other test cases.
function seedTestSuites() {
  const allIds = db.prepare('SELECT id FROM test_cases ORDER BY id').all().map((r) => r.id);
  const findId = db.prepare('SELECT id FROM test_cases WHERE title = ? ORDER BY id LIMIT 1');
  const pickCases = (titles) => {
    const ids = titles.map((t) => findId.get(t)?.id).filter(Boolean);
    for (const id of allIds) {
      if (ids.length >= 3) break;
      if (!ids.includes(id)) ids.push(id);
    }
    return ids;
  };

  const now = new Date().toISOString();
  const samples = [
    {
      name: 'Login regression',
      feature: 'login',
      status: 'ready',
      titles: [
        'User can sign in with a valid email and password',
        'Sign-in shows an error for a wrong password',
        'Password reset email is sent to a registered address',
      ],
    },
    {
      name: 'Smoke test',
      feature: 'app basics',
      status: 'in-progress',
      titles: [
        'Browser tab shows the app name',
        'User can sign in with a valid email and password',
        'Test case search finds a title by partial text',
      ],
    },
  ];

  const insertSuite = db.prepare(
    `INSERT INTO test_suites (name, feature, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`
  );
  const insertLink = db.prepare(
    `INSERT INTO test_suite_cases (suite_id, test_case_id, sort_order) VALUES (?, ?, ?)`
  );
  db.transaction(() => {
    for (const s of samples) {
      const { lastInsertRowid } = insertSuite.run(s.name, s.feature, s.status, now, now);
      pickCases(s.titles).forEach((caseId, i) => insertLink.run(lastInsertRowid, caseId, i + 1));
    }
  })();
  console.log(`Added ${samples.length} sample test suites to the database.`);
}

// Adds 3 sample bugs in different statuses, each with a history that follows the allowed
// status changes. They are real issues found in this app's QA reviews, and their statuses
// are true: the resolved and closed ones were fixed when the bug tracker was built.
function seedBugs() {
  const at = (hoursAgo) => new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString();

  const samples = [
    {
      title: 'Leaving the page with the test case form open loses typed changes',
      description:
        'The "Discard your changes?" prompt covers Cancel, ✕, Escape and clicking outside the dialog, but not the browser Back button, reloading or closing the tab.',
      severity: 'Minor',
      priority: 'medium',
      steps: [
        'Open http://localhost:5173/test-cases.',
        'Click "+ New test case".',
        'Type Draft title in the "Title" field.',
        "Press the browser's Back button.",
      ],
      expected: 'The browser asks whether to leave the page and lose the typed changes.',
      actual: 'The page changes straight away and the typed title is lost, with no prompt.',
      environment: 'Chrome on macOS, local dev server',
      history: [{ hoursAgo: 3, action: 'created', newValue: 'open' }],
    },
    {
      title: 'Unknown sort value in the test case list returns HTTP 500',
      description: 'Some sort values that are not on the allowed list crash the list request instead of being ignored.',
      severity: 'Minor',
      priority: 'low',
      steps: ['Send GET http://localhost:5173/api/test-cases?sort=toString.'],
      expected: 'HTTP 200 with the list sorted the default way, newest first.',
      actual: 'HTTP 500 with "Something went wrong on the server".',
      environment: 'API, local dev server',
      history: [
        { hoursAgo: 2.5, action: 'created', newValue: 'open' },
        { hoursAgo: 2, action: 'status_change', oldValue: 'open', newValue: 'in-progress', message: 'Looking into it.' },
        {
          hoursAgo: 1,
          action: 'status_change',
          oldValue: 'in-progress',
          newValue: 'resolved',
          message: 'Fixed: only the listed sort values are used now; anything else falls back to newest first.',
        },
      ],
    },
    {
      title: 'Oversized request returns a generic server error',
      description: 'A request body over 100 KB gets "Something went wrong on the server" instead of saying the request is too large.',
      severity: 'Major',
      priority: 'medium',
      steps: [
        'Send POST http://localhost:5173/api/test-suites with a "name" of 200,000 characters and "feature": "f".',
      ],
      expected: 'HTTP 413 with a message saying the request is too large and how to fix it.',
      actual: 'HTTP 500 with "Something went wrong on the server".',
      environment: 'API, local dev server',
      history: [
        { hoursAgo: 2.4, action: 'created', newValue: 'open' },
        { hoursAgo: 1.8, action: 'status_change', oldValue: 'open', newValue: 'in-progress' },
        {
          hoursAgo: 1.2,
          action: 'status_change',
          oldValue: 'in-progress',
          newValue: 'resolved',
          message: 'Too-large requests now get HTTP 413 with a clear message.',
        },
        { hoursAgo: 0.5, action: 'comment', message: 'Checked with a 200,000-character name: HTTP 413 and the new message.' },
        { hoursAgo: 0.4, action: 'status_change', oldValue: 'resolved', newValue: 'closed', message: 'Verified.' },
      ],
    },
  ];

  const insertBug = db.prepare(`
    INSERT INTO bugs (title, description, severity, priority, status, steps, expected, actual, environment, created_at, updated_at)
    VALUES (@title, @description, @severity, @priority, @status, @steps, @expected, @actual, @environment, @createdAt, @updatedAt)
  `);
  const insertActivity = db.prepare(`
    INSERT INTO bug_activity (bug_id, action, old_value, new_value, message, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  db.transaction(() => {
    for (const { history, ...bug } of samples) {
      const last = history[history.length - 1];
      const status = [...history].reverse().find((h) => h.newValue)?.newValue ?? 'open';
      const { lastInsertRowid } = insertBug.run({
        ...bug,
        status,
        steps: JSON.stringify(bug.steps),
        createdAt: at(history[0].hoursAgo),
        updatedAt: at(last.hoursAgo),
      });
      for (const h of history) {
        insertActivity.run(lastInsertRowid, h.action, h.oldValue ?? null, h.newValue ?? null, h.message ?? null, at(h.hoursAgo));
      }
    }
  })();
  console.log(`Added ${samples.length} sample bugs to the database.`);
}

export default db;
