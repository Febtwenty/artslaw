import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { clerkMiddleware } from '@clerk/express';
import chatRouter from './routes/chat';
import conversationsRouter from './routes/conversations';
import titleRouter from './routes/title';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(clerkMiddleware());

app.use('/api/chat', chatRouter);
app.use('/api/conversations', conversationsRouter);
app.use('/api/generate-title', titleRouter);

// Serve valid empty source maps for React DevTools extension files so Firefox
// doesn't throw a JSON.parse error when the SPA catch-all returns index.html.
const emptySourceMap = JSON.stringify({ version: 3, sources: [''], sourcesContent: [''], mappings: '', names: [] });
app.get(/\/(installHook|react_devtools_backend_compact)\.js\.map$/, (_req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(emptySourceMap);
});

// Serve the built React app in production
const clientDist = path.resolve(__dirname, '../../client/dist');
app.use(express.static(clientDist));
app.get('*', (_req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`ArtSlaw server running at http://localhost:${PORT}`);
});
