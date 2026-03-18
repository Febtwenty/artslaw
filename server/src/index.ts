import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { clerkMiddleware } from '@clerk/express';
import chatRouter from './routes/chat';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(clerkMiddleware());

app.use('/api/chat', chatRouter);

// Serve the built React app in production
const clientDist = path.resolve(__dirname, '../../client/dist');
app.use(express.static(clientDist));
app.get('*', (_req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`ArtSlaw server running at http://localhost:${PORT}`);
});
