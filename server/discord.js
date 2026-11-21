// Posts alerts to a Discord channel through the webhook in .env (DISCORD_WEBHOOK_URL).
// The URL is a secret: it's read from the environment only and never logged or sent to the page.

const APP_URL = () => (process.env.APP_URL || 'http://localhost:5173').replace(/\/+$/, '');
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

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'Bootcamp App',
        content: header + shortNotes + footer,
        allowed_mentions: { parse: [] }, // text like @everyone in the notes must not ping anyone
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
