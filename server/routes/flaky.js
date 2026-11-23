import { timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import db from '../db.js';
import { ok, fail } from '../api-response.js';
import { toId } from '../validation.js';
import { allTestSummaries, evidenceFor, leaderboard, recomputeFlakes, saveHypothesis, writeHypothesisNow } from '../flaky-tracker.js';

// Flaky test endpoints, mounted at /api/flaky.
// Every reply uses { success, data, error } (see CLAUDE.md).
const router = Router();

const CONFIDENCE = ['low', 'medium', 'high'];

// Writing hypotheses (saving, deleting, or asking Claude for one) needs the write token when
// FLAKY_WRITE_TOKEN is set, as on the public deployed site, so strangers can't overwrite them or run
// up API costs. Without it (local development), anyone using the app can write.
function requireWriteToken(req, res, next) {
  const expected = process.env.FLAKY_WRITE_TOKEN;
  if (!expected) return next();
  const given = Buffer.from(req.get('X-Write-Token') ?? '');
  const wanted = Buffer.from(expected);
  if (given.length === wanted.length && timingSafeEqual(given, wanted)) return next();
  fail(res, 401, 'This change needs the write token, sent in the X-Write-Token header.');
}
const LIMITS = { hypothesis: [20, 500], evidence: 1000, writtenBy: 80 };

// GET /api/flaky -> summary counts and the 10 flakiest test cases with history and hypothesis
function handleGetFlakyLeaderboard(req, res) {
  const board = leaderboard(10);
  board.summary.writeProtected = Boolean(process.env.FLAKY_WRITE_TOKEN);
  ok(res, board);
}

// GET /api/flaky/history -> every test case that has results, with its classification and history
function handleListTestHistory(req, res) {
  ok(res, { items: allTestSummaries() });
}

// GET /api/flaky/:testCaseId/evidence -> what the flake-analyzer agent reads before writing a hypothesis
function handleGetFlakeEvidence(req, res) {
  const evidence = evidenceFor(req.params.testCaseId);
  if (!evidence) return fail(res, 404, 'Test case not found');
  ok(res, evidence);
}

// PUT /api/flaky/:testCaseId/hypothesis  { hypothesis, evidence?, confidence, writtenBy? }
function handleSaveFlakeHypothesis(req, res) {
  const testCaseId = toId(req.params.testCaseId);
  if (!db.prepare('SELECT 1 FROM test_cases WHERE id = ?').get(testCaseId)) return fail(res, 404, 'Test case not found');

  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fail(res, 400, 'Request body must be a JSON object');
  for (const key of ['hypothesis', 'evidence', 'confidence', 'writtenBy']) {
    if (body[key] !== undefined && body[key] !== null && typeof body[key] !== 'string') return fail(res, 400, `${key} must be text`);
  }
  const hypothesis = (body.hypothesis ?? '').trim();
  const evidence = (body.evidence ?? '').trim() || null;
  const writtenBy = (body.writtenBy ?? '').trim() || 'flake-analyzer';
  const [min, max] = LIMITS.hypothesis;
  if (hypothesis.length < min || hypothesis.length > max) {
    return fail(res, 400, `Hypothesis must be ${min}–${max} characters (it has ${hypothesis.length})`);
  }
  if (evidence && evidence.length > LIMITS.evidence) return fail(res, 400, `Evidence must be ${LIMITS.evidence} characters or fewer`);
  if (!CONFIDENCE.includes(body.confidence)) return fail(res, 400, `Confidence must be one of: ${CONFIDENCE.join(', ')}`);
  if (writtenBy.length > LIMITS.writtenBy) return fail(res, 400, `writtenBy must be ${LIMITS.writtenBy} characters or fewer`);

  saveHypothesis(testCaseId, { hypothesis, evidence, confidence: body.confidence, writtenBy });
  ok(res, evidenceFor(testCaseId).hypothesis);
}

// POST /api/flaky/:testCaseId/hypothesis/generate -> has the Claude API write the hypothesis now
// (the "Write with AI" button). 503 when ANTHROPIC_API_KEY isn't set.
async function handleGenerateFlakeHypothesis(req, res) {
  try {
    ok(res, await writeHypothesisNow(toId(req.params.testCaseId)), 201);
  } catch (err) {
    fail(res, err.status ?? 502, err.message);
  }
}

// POST /api/flaky/recompute -> rechecks every test, alerts new flakes (once each) and retries failed
// alerts. Called by the PostToolUse hook after Claude records a run result.
async function handleRecomputeFlakyTests(req, res) {
  ok(res, await recomputeFlakes());
}

// DELETE /api/flaky/:testCaseId/hypothesis -> removes a hypothesis (e.g. to have it written again)
function handleDeleteFlakeHypothesis(req, res) {
  const { changes } = db.prepare('DELETE FROM flake_hypotheses WHERE test_case_id = ?').run(toId(req.params.testCaseId));
  if (!changes) return fail(res, 404, 'This test case has no hypothesis');
  ok(res, { deleted: true });
}

// Only whole-number IDs reach the handlers.
router.param('testCaseId', (req, res, next, id) => (toId(id) ? next() : fail(res, 404, 'Test case not found')));

router.get('/', handleGetFlakyLeaderboard);
router.get('/history', handleListTestHistory);
router.post('/recompute', requireWriteToken, handleRecomputeFlakyTests);
router.get('/:testCaseId/evidence', handleGetFlakeEvidence);
router.put('/:testCaseId/hypothesis', requireWriteToken, handleSaveFlakeHypothesis);
router.post('/:testCaseId/hypothesis/generate', requireWriteToken, handleGenerateFlakeHypothesis);
router.delete('/:testCaseId/hypothesis', requireWriteToken, handleDeleteFlakeHypothesis);

export default router;
