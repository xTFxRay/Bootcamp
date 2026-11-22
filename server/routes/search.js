import { Router } from 'express';
import db from '../db.js';
import { ok, fail } from '../api-response.js';

// Quick search (Cmd/Ctrl+K), mounted at /api/search.
// Every reply uses { success, data, error } (see CLAUDE.md).
const router = Router();

const PER_TYPE = 5;
const MAX_QUERY = 100;

// GET /api/search?q=login
// Up to 5 matches each from test cases (title), bugs (title, description, or "#12" / "12" for its ID)
// and test suites (name, feature). Titles that start with the text come first, then the newest.
function handleSearch(req, res) {
  const raw = req.query.q;
  if (typeof raw !== 'string') return fail(res, 400, 'Add the text to search for as ?q=');
  const q = raw.trim();
  if (!q) return fail(res, 400, 'Type something to search for');
  if (q.length > MAX_QUERY) return fail(res, 400, `Search text must be ${MAX_QUERY} characters or fewer`);

  const escaped = q.replace(/[\\%_]/g, (c) => `\\${c}`);
  const params = { contains: `%${escaped}%`, starts: `${escaped}%`, limit: PER_TYPE };
  const idMatch = /^#?(\d{1,9})$/.exec(q);
  const id = idMatch ? Number(idMatch[1]) : -1;

  const search = (sql) => {
    const rows = db.prepare(sql).all({ ...params, id });
    return rows;
  };

  const testCases = search(
    `SELECT id, title, severity, status, COUNT(*) OVER () AS total FROM test_cases
     WHERE title LIKE @contains ESCAPE '\\' OR id = @id
     ORDER BY id = @id DESC, title LIKE @starts ESCAPE '\\' DESC, updated_at DESC, id DESC LIMIT @limit`
  );
  const bugs = search(
    `SELECT id, title, severity, status, COUNT(*) OVER () AS total FROM bugs
     WHERE title LIKE @contains ESCAPE '\\' OR description LIKE @contains ESCAPE '\\' OR id = @id
     ORDER BY id = @id DESC, title LIKE @starts ESCAPE '\\' DESC, updated_at DESC, id DESC LIMIT @limit`
  );
  const suites = search(
    `SELECT id, name, feature, status, COUNT(*) OVER () AS total FROM test_suites
     WHERE name LIKE @contains ESCAPE '\\' OR feature LIKE @contains ESCAPE '\\' OR id = @id
     ORDER BY id = @id DESC, name LIKE @starts ESCAPE '\\' DESC, updated_at DESC, id DESC LIMIT @limit`
  );

  const group = (rows, map) => ({ items: rows.map(map), total: rows[0]?.total ?? 0 });
  ok(res, {
    query: q,
    testCases: group(testCases, (r) => ({ id: r.id, title: r.title, severity: r.severity, status: r.status })),
    bugs: group(bugs, (r) => ({ id: r.id, title: r.title, severity: r.severity, status: r.status })),
    suites: group(suites, (r) => ({ id: r.id, name: r.name, feature: r.feature, status: r.status })),
  });
}

router.get('/', handleSearch);

export default router;
