// Posts alerts to a Discord channel through the webhook in .env (DISCORD_WEBHOOK_URL).
// The URL is a secret: it's read from the environment only and never logged or sent to the page.

// Link in alerts: APP_URL if set, else the public address Render gives the service, else local dev.
const APP_URL = () =>
  (process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:5173').replace(/\/+$/, '');
const MAX_LENGTH = 2000; // Discord's limit for a message

// Sends the alert for a failed test case. Never throws: returns { ok: true } or { ok: false, error }.
export async function sendTestFailureAlert({ runId, suiteName, title, notes }) {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) return { ok: false, error: 'Discord alerts are off: DISCORD_WEBHOOK_URL is not set in .env.' };

  const link = `${APP_URL()}/test-runs/${runId}`;
  const header = `❌ **Test failed:** ${title}\n**Run:** #${runId} · ${suiteName}\n**Notes:** `;
  const footer = `\n${link}`;
  const room = MAX_LENGTH - header.length - footer.length;
  const shortNotes = notes.length > room ? `${notes.slice(0, room - 1)}…` : notes;

  return postToDiscord(url, header + shortNotes + footer);
}

// Sends the alert for a test case that just turned flaky. Never throws: returns { ok: true } or { ok: false, error }.
// history: the test's recent results, oldest first ('passed' | 'failed').
export async function sendFlakeAlert({ title, score, history, runId, suiteName }) {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) return { ok: false, error: 'Discord alerts are off: DISCORD_WEBHOOK_URL is not set in .env.' };

  const strip = history.map((r) => (r === 'passed' ? '✓' : '✕')).join(' ');
  const content = [
    `⚠️ **New flaky test:** ${title.length > 300 ? `${title.slice(0, 299)}…` : title}`,
    `**Flakiness:** ${score}% (the result changed in ${score}% of consecutive runs)`,
    `**Last ${history.length} results, oldest first:** ${strip}`,
    `**Turned flaky in:** run #${runId} · ${suiteName}`,
    `${APP_URL()}/flaky`,
  ].join('\n');
  return postToDiscord(url, content.slice(0, MAX_LENGTH));
}

async function postToDiscord(url, content) {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'Bootcamp App',
        content,
        allowed_mentions: { parse: [] }, // text like @everyone in titles or notes must not ping anyone
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) return { ok: true };
    return { ok: false, error: `Discord didn't accept the alert (HTTP ${res.status}).` };
  } catch (err) {
    return {
      ok: false,
      error: err.name === 'TimeoutError' ? 'Discord took too long to answer.' : 'Could not reach Discord.',
    };
  }
}
