import { getDb } from '../db';

export interface CoverImage {
  type: 'uploaded' | 'external';
  url: string;
  alt?: string;
  source?: string;
}

export interface BlogPost {
  slug: string;
  title: string;
  metaDescription: string;
  body: string;
  exhibitionUrl: string;
  tags: string[];
  status: 'draft' | 'published';
  createdAt: Date;
  updatedAt: Date;
  publishedAt: Date | null;
  coverImage?: CoverImage;
}

export interface BlogPostUpdate {
  title?: string;
  metaDescription?: string;
  body?: string;
  exhibitionUrl?: string;
  tags?: string[];
  status?: 'draft' | 'published';
  coverImage?: CoverImage | null;
}

const COLLECTION = 'blog_posts';

export async function ensureBlogIndexes(): Promise<void> {
  const db = await getDb();
  await db.collection(COLLECTION).createIndex({ slug: 1 }, { unique: true });
}

export async function createPost(data: Omit<BlogPost, 'createdAt' | 'updatedAt'>): Promise<BlogPost> {
  const db = await getDb();
  const now = new Date();
  const doc: BlogPost = { ...data, createdAt: now, updatedAt: now };
  await db.collection(COLLECTION).insertOne(doc);
  return doc;
}

export async function getPost(slug: string): Promise<BlogPost | null> {
  const db = await getDb();
  return db.collection<BlogPost>(COLLECTION).findOne({ slug }) ?? null;
}

export async function updatePost(slug: string, update: BlogPostUpdate): Promise<BlogPost | null> {
  const db = await getDb();
  // Explicitly pick only the fields that are allowed to change.
  // The client sends back the full post object (including _id, createdAt, slug)
  // and MongoDB refuses to modify immutable fields like _id.
  const { title, metaDescription, body, exhibitionUrl, tags, status } = update;
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (title !== undefined) set.title = title;
  if (metaDescription !== undefined) set.metaDescription = metaDescription;
  if (body !== undefined) set.body = body;
  if (exhibitionUrl !== undefined) set.exhibitionUrl = exhibitionUrl;
  if (tags !== undefined) set.tags = tags;
  if (status !== undefined) set.status = status;
  if ('coverImage' in update) set.coverImage = update.coverImage ?? null;
  if (update.status === 'published') {
    const existing = await db.collection<BlogPost>(COLLECTION).findOne({ slug });
    if (existing && existing.status !== 'published') {
      set.publishedAt = new Date();
    }
  }
  const result = await db.collection<BlogPost>(COLLECTION).findOneAndUpdate(
    { slug },
    { $set: set },
    { returnDocument: 'after' }
  );
  return result ?? null;
}

export async function deletePost(slug: string): Promise<void> {
  const db = await getDb();
  await db.collection(COLLECTION).deleteOne({ slug });
}

export async function getAllPosts(): Promise<BlogPost[]> {
  const db = await getDb();
  return db.collection<BlogPost>(COLLECTION)
    .find()
    .sort({ createdAt: -1 })
    .toArray();
}

export async function getPublishedPosts(): Promise<Omit<BlogPost, 'body'>[]> {
  const db = await getDb();
  return db.collection<BlogPost>(COLLECTION)
    .find({ status: 'published' }, { projection: { body: 0 } })
    .sort({ publishedAt: -1 })
    .toArray() as Promise<Omit<BlogPost, 'body'>[]>;
}

export async function getPublishedPost(slug: string): Promise<BlogPost | null> {
  const db = await getDb();
  return db.collection<BlogPost>(COLLECTION).findOne({ slug, status: 'published' }) ?? null;
}
