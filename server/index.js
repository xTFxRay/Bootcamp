import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = express();
const PORT = process.env.SERVER_PORT || 3001;

app.use(express.json());

// --- API routes ---------------------------------------------------------
// Add new endpoints here, all under /api.
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Hello from the server!' });
});

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
