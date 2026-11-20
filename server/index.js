import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import testCasesRouter from './test-cases.js';
import testSuitesRouter from './test-suites.js';

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

// Unknown /api address.
function handleSendNotFound(req, res) {
  res.status(404).json({ success: false, data: null, error: 'Not found' });
}

// Anything that goes wrong inside an /api handler.
function handleReportError(err, req, res, next) {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, data: null, error: 'Request body is not valid JSON' });
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
