import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import testCasesRouter from './test-cases.js';
import testSuitesRouter from './test-suites.js';
import bugsRouter from './bugs.js';
import testRunsRouter from './test-runs.js';

// Load secrets such as DISCORD_WEBHOOK_URL from the project's .env file (git-ignored).
// Built into Node; a missing .env just means those features are off.
try {
  process.loadEnvFile(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env'));
} catch (err) {
  if (err.code !== 'ENOENT') console.warn('Could not read .env:', err.message);
}

const app = express();
const PORT = process.env.SERVER_PORT || 3001;

app.use(express.json());

// --- API routes ---------------------------------------------------------
// Add new endpoints here, all under /api.
// Every endpoint replies with { success, data, error } (see CLAUDE.md).
function handleGetHealth(req, res) {
  res.json({
    success: true,
    data: { message: 'Hello from the server!' },
    error: null,
  });
}

app.get('/api/health', handleGetHealth);
app.use('/api/test-cases', testCasesRouter);
app.use('/api/test-suites', testSuitesRouter);
app.use('/api/bugs', bugsRouter);
app.use('/api/test-runs', testRunsRouter);

// Unknown /api address.
function handleSendNotFound(req, res) {
  res.status(404).json({ success: false, data: null, error: 'Not found' });
}

// Anything that goes wrong inside an /api handler.
function handleReportError(err, req, res, next) {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, data: null, error: 'Request body is not valid JSON' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({
      success: false,
      data: null,
      error: 'The request is too large (over 100 KB). Shorten the text and try again.',
    });
  }
  // Other problems with the request itself (reported by express.json with a 4xx status):
  // reply with that status and a message that says what to change, not a generic 500.
  if (err.expose && err.status >= 400 && err.status < 500) {
    const messages = {
      'charset.unsupported': "The request uses a character set the server doesn't support. Send it as UTF-8.",
      'encoding.unsupported': "The request is compressed in a way the server doesn't support. Send it uncompressed.",
      'request.aborted': 'The request was cut off before it finished. Try again.',
      'request.size.invalid': "The request's size didn't match its content. Try again.",
    };
    return res.status(err.status).json({
      success: false,
      data: null,
      error: messages[err.type] ?? "The request couldn't be read. Check it and try again.",
    });
  }
  console.error(err);
  res.status(500).json({ success: false, data: null, error: 'Something went wrong on the server' });
}

app.use('/api', handleSendNotFound);
app.use('/api', handleReportError);

// --- Production: serve the built React app -------------------------------
// In development the React dev server (Vite) handles the webpage instead.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get(/^\/(?!api).*/, (req, res, next) => {
  res.sendFile(path.join(clientDist, 'index.html'), (err) => err && next());
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
