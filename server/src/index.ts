import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'path';
import { clerkMiddleware } from '@clerk/express';
import { injectLandingContent } from './landingHtml';
import chatRouter from './routes/chat';
import conversationsRouter from './routes/conversations';
import titleRouter from './routes/title';
import tourRouter from './routes/tour';
import discoveriesRouter from './routes/discoveries';
import usageRouter from './routes/usage';
import { ensureUsageIndexes } from './db/usage';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

ensureUsageIndexes().catch(err => console.error('[usage] index setup failed:', err));

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(clerkMiddleware());

app.use('/api/chat', chatRouter);
app.use('/api/conversations', conversationsRouter);
app.use('/api/generate-title', titleRouter);
app.use('/api/tour', tourRouter);
app.use('/api/discoveries', discoveriesRouter);
app.use('/api/usage', usageRouter);

// Serve valid empty source maps for React DevTools extension files so Firefox
// doesn't throw a JSON.parse error when the SPA catch-all returns index.html.
const emptySourceMap = JSON.stringify({ version: 3, sources: [''], sourcesContent: [''], mappings: '', names: [] });
app.get(/\/(installHook|react_devtools_backend_compact)\.js\.map$/, (_req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(emptySourceMap);
});

// Serve the built React app in production
const clientDist = path.resolve(__dirname, '../../client/dist');
const clientIndexPath = path.join(clientDist, 'index.html');

// Pre-render the landing page at startup for SEO (Google sees real HTML, not empty #root)
let prerenderedLanding: string | null = null;
if (fs.existsSync(clientIndexPath)) {
  try {
    prerenderedLanding = injectLandingContent(fs.readFileSync(clientIndexPath, 'utf-8'));
  } catch {
    // fall through — catch-all will serve plain index.html
  }
}

// Serve pre-rendered landing for GET / before static middleware intercepts it
app.get('/', (_req, res) => {
  if (prerenderedLanding) {
    res.setHeader('Content-Type', 'text/html');
    return res.send(prerenderedLanding);
  }
  res.sendFile(clientIndexPath);
});

app.use(express.static(clientDist));
app.get('*', (_req, res) => {
  res.sendFile(clientIndexPath);
});

app.listen(PORT, () => {
  console.log(`ArtSlaw server running at http://localhost:${PORT}`);
});
