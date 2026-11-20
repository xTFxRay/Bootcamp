import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Values allowed by CLAUDE.md.
export const SEVERITIES = ['Critical', 'Major', 'Minor', 'Trivial'];
export const TEST_CASE_STATUSES = ['draft', 'ready', 'passed', 'failed', 'skipped'];
export const TEST_SUITE_STATUSES = ['draft', 'ready', 'in-progress', 'passed', 'failed'];

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || path.join(__dirname, 'data', 'app.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON'); // so deleting a suite or test case also removes its links

const list = (values) => values.map((v) => `'${v}'`).join(', ');

db.exec(`
  CREATE TABLE IF NOT EXISTS test_cases (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    title           TEXT NOT NULL,
    preconditions   TEXT,
    steps           TEXT NOT NULL,           -- JSON array of strings, in order
    expected_result TEXT NOT NULL,
    severity        TEXT NOT NULL CHECK (severity IN (${list(SEVERITIES)})),
    status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (${list(TEST_CASE_STATUSES)})),
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
  );

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
`);

seedTestCases();
seedTestSuites();

// Adds sample test cases the first time the app runs, so the page isn't empty.
function seedTestCases() {
  const { count } = db.prepare('SELECT COUNT(*) AS count FROM test_cases').get();
  if (count > 0) return;

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

// Adds 2 sample suites with 3 test cases each the first time suites exist.
// Picks the sample test cases by title, filling any gaps with other test cases.
function seedTestSuites() {
  const { count } = db.prepare('SELECT COUNT(*) AS count FROM test_suites').get();
  if (count > 0) return;

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

export default db;
