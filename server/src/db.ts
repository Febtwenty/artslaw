import { MongoClient, Db } from 'mongodb';

let connectingPromise: Promise<Db> | null = null;

export function getDb(): Promise<Db> {
  if (!connectingPromise) {
    const client = new MongoClient(process.env.MONGODB_URI!);
    connectingPromise = client.connect().then(() => client.db());
  }
  return connectingPromise;
}
