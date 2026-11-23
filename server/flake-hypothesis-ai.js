import Anthropic from '@anthropic-ai/sdk';

// Writes a root-cause hypothesis for a flaky test with the Claude API, from the same evidence the
// flake-analyzer agent reads (GET /api/flaky/:id/evidence). Used automatically when a test turns
// flaky, and by the "Write with AI" button. Needs ANTHROPIC_API_KEY; without it, AI is off.

export const AI_MODEL = 'claude-opus-5-5';
export const AI_WRITTEN_BY = `${AI_MODEL} (automatic)`;

export const isAiEnabled = () => Boolean(process.env.ANTHROPIC_API_KEY);

let client = null;
const getClient = () => (client ??= new Anthropic({ timeout: 90_000, maxRetries: 2 }));

// The same rules the flake-analyzer agent follows (.claude/agents/flake-analyzer.md).
const SYSTEM = `You explain why a test in a QA app is flaky: it passes and fails on and off across test runs.
You get the test case and its recent results as JSON: each result's run, time, duration, the tester's notes, its position in the run, and the test that ran just before it (ranAfter).

Look for patterns before deciding:
- Failure notes: what exactly went wrong, and whether the same symptom repeats.
- Timing: are failures much slower than passes (waiting on something), or much faster (acting too early)?
- Order: do failures only happen after a particular test ran just before (shared state, leftover data)?
- Time: do failures cluster on certain dates or times of day?
- Workarounds in the notes ("after refreshing", "on the second click", "waiting a second") usually point at the mechanism.

Answer with:
- hypothesis: one or two sentences, 20-500 characters, starting "Likely". Name the likely mechanism (for example a race condition, a timeout on an external service, stale cached data, an order dependency on shared state, test data left by another test) and what makes the result flip.
- evidence: one or two sentences, at most 600 characters, citing the facts you used, with numbers (for example "4 of 4 failures ran right after 'Reporting a bug'; 0 of 8 passes did").
- confidence: "high" when one pattern explains every failure and no pass contradicts it; "medium" when it explains most failures; "low" when the evidence is thin or mixed. Say low rather than guess.

Base it only on the evidence given. Don't invent symptoms, logs or code details. Plain, direct English, no filler.`;

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    hypothesis: { type: 'string' },
    evidence: { type: 'string' },
    confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
  },
  required: ['hypothesis', 'evidence', 'confidence'],
  additionalProperties: false,
};

// Only what's useful for the analysis, to keep the request small.
function evidenceForPrompt(e) {
  return {
    title: e.title,
    severity: e.severity,
    preconditions: e.preconditions,
    steps: e.steps,
    expectedResult: e.expectedResult,
    flakinessScore: `${e.score}%`,
    passed: e.passed,
    failed: e.failed,
    results: e.results.map((r) => ({
      result: r.result,
      at: r.at,
      run: `#${r.runId} ${r.suiteName}`,
      durationSeconds: r.durationMs == null ? null : Math.round(r.durationMs / 1000),
      positionInRun: r.positionInRun,
      ranAfter: r.ranAfter ? `${r.ranAfter.title} (${r.ranAfter.result ?? 'not run'})` : null,
      notes: r.notes,
    })),
  };
}

// Returns { hypothesis, evidence, confidence }. Throws an Error with a plain message on failure.
export async function writeHypothesisWithAi(evidence) {
  if (!isAiEnabled()) throw new Error('AI hypotheses are off: ANTHROPIC_API_KEY is not set.');

  let response;
  try {
    response = await getClient().beta.messages.create({
      model: AI_MODEL,
      max_tokens: 16000,
      // A safety decline on the main model is retried on a fallback model inside the same call.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
      system: SYSTEM,
      messages: [{ role: 'user', content: JSON.stringify(evidenceForPrompt(evidence), null, 1) }],
    });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) throw new Error('The Anthropic API key was rejected. Check ANTHROPIC_API_KEY.');
    if (err instanceof Anthropic.PermissionDeniedError) throw new Error("The Anthropic API key isn't allowed to use this model.");
    if (err instanceof Anthropic.RateLimitError) throw new Error('The Claude API is rate limiting requests. Try again in a minute.');
    if (err instanceof Anthropic.APIConnectionError) throw new Error('Could not reach the Claude API.');
    if (err instanceof Anthropic.APIError) {
      // QA-07: the status code is for developers (server log), not for the page.
      console.warn(`Claude API error ${err.status ?? '(no status)'} while writing a flaky-test hypothesis: ${err.message}`);
      throw new Error('The Claude API had a problem. Try again in a few minutes.');
    }
    throw err;
  }

  if (response.stop_reason === 'refusal') throw new Error('Claude declined to write a hypothesis for this test.');
  if (response.stop_reason === 'max_tokens') throw new Error('The answer was cut off before it finished.');
  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Claude's answer wasn't valid JSON.");
  }

  const hypothesis = String(parsed.hypothesis ?? '').trim();
  const evidenceText = String(parsed.evidence ?? '').trim();
  if (hypothesis.length < 20 || hypothesis.length > 500) throw new Error(`The hypothesis had ${hypothesis.length} characters (20–500 allowed).`);
  if (!['low', 'medium', 'high'].includes(parsed.confidence)) throw new Error('The answer had no valid confidence level.');
  return { hypothesis, evidence: evidenceText.slice(0, 1000) || null, confidence: parsed.confidence };
}
