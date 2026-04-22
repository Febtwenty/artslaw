import { useState, useEffect } from 'react';
import { useClerk } from '@clerk/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface CoverImage {
  type: 'uploaded' | 'external';
  url: string;
  alt?: string;
  source?: string;
}

interface PostSummary {
  slug: string;
  title: string;
  metaDescription: string;
  tags: string[];
  publishedAt: string | null;
  coverImage?: CoverImage;
}

interface FullPost extends PostSummary {
  body: string;
  exhibitionUrl: string;
}

function formatDate(d: string | null | undefined): string {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

function PostList({ onSelect }: { onSelect: (slug: string) => void }) {
  const [posts, setPosts] = useState<PostSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/blog/published')
      .then(r => r.ok ? r.json() : [])
      .then(setPosts)
      .catch(() => setPosts([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center py-16">
      <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="font-serif text-3xl font-semibold text-slate-900 dark:text-slate-100 mb-1">
        Exhibition Reviews
      </h1>
      <p className="text-slate-500 dark:text-slate-400 text-sm mb-8">
        Expert reviews of current and upcoming exhibitions — written by ArtSlaw.
      </p>

      {posts.length === 0 ? (
        <p className="text-slate-400 text-sm">No posts published yet.</p>
      ) : (
        <div className="space-y-0">
          {posts.map(post => (
            <article
              key={post.slug}
              className="py-5 border-b border-slate-200 dark:border-slate-700 last:border-b-0 flex gap-4 items-start"
            >
              <div className="flex-1 min-w-0">
                <button
                  onClick={() => onSelect(post.slug)}
                  className="text-left group w-full"
                >
                  <h2 className="font-serif text-xl font-semibold text-slate-900 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors leading-snug mb-1.5">
                    {post.title}
                  </h2>
                </button>
                <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed mb-3">
                  {post.metaDescription}
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-slate-400">{formatDate(post.publishedAt)}</span>
                  {post.tags.slice(0, 4).map(tag => (
                    <span
                      key={tag}
                      className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
              {post.coverImage && (
                <div className="shrink-0">
                  <img
                    src={post.coverImage.url}
                    alt={post.coverImage.alt ?? ''}
                    className="w-20 h-20 object-cover rounded-lg"
                  />
                  {post.coverImage.type === 'external' && post.coverImage.source && (
                    <p className="text-right text-[10px] text-slate-400 mt-0.5 max-w-[80px] truncate">
                      {post.coverImage.source}
                    </p>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function PostDetail({ slug, onBack, onStartTour }: { slug: string; onBack: () => void; onStartTour?: (url: string) => void }) {
  const { openSignUp } = useClerk();
  const [post, setPost] = useState<FullPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    setLoading(true);
    setNotFound(false);
    fetch(`/api/blog/published/${encodeURIComponent(slug)}`)
      .then(r => {
        if (r.status === 404) { setNotFound(true); return null; }
        return r.ok ? r.json() : null;
      })
      .then(d => { if (d) setPost(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) return (
    <div className="flex items-center justify-center py-16">
      <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (notFound || !post) return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <button onClick={onBack} className="text-sm text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors mb-6 flex items-center gap-1.5">
        ← All reviews
      </button>
      <p className="text-slate-500">Post not found.</p>
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <button
        onClick={onBack}
        className="text-sm text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors mb-6 flex items-center gap-1.5"
      >
        ← All reviews
      </button>

      <h1 className="font-serif text-2xl sm:text-3xl font-semibold text-slate-900 dark:text-slate-100 leading-snug mb-3">
        {post.title}
      </h1>

      <div className="flex items-center gap-2 flex-wrap mb-4">
        <span className="text-xs text-slate-400">{formatDate(post.publishedAt)}</span>
        {post.tags.map(tag => (
          <span
            key={tag}
            className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400"
          >
            {tag}
          </span>
        ))}
      </div>

      {post.coverImage && (
        <figure className="mb-8">
          <img
            src={post.coverImage.url}
            alt={post.coverImage.alt ?? ''}
            className="w-full aspect-square object-cover rounded-xl"
          />
          {post.coverImage.type === 'external' && post.coverImage.source && (
            <figcaption className="text-right text-xs text-slate-400 mt-1.5">
              {post.coverImage.source}
            </figcaption>
          )}
        </figure>
      )}

      {post.exhibitionUrl && (
        <a
          href={post.exhibitionUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors mb-8 truncate max-w-full"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5 shrink-0">
            <path fillRule="evenodd" d="M15.75 2.25H21a.75.75 0 0 1 .75.75v5.25a.75.75 0 0 1-1.5 0V4.81L8.03 17.03a.75.75 0 0 1-1.06-1.06L19.19 3.75h-3.44a.75.75 0 0 1 0-1.5Zm-10.5 4.5a1.5 1.5 0 0 0-1.5 1.5v10.5a1.5 1.5 0 0 0 1.5 1.5h10.5a1.5 1.5 0 0 0 1.5-1.5V10.5a.75.75 0 0 1 1.5 0v8.25a3 3 0 0 1-3 3H5.25a3 3 0 0 1-3-3V8.25a3 3 0 0 1 3-3h8.25a.75.75 0 0 1 0 1.5H5.25Z" clipRule="evenodd" />
          </svg>
          {post.exhibitionUrl}
        </a>
      )}

      <div className="prose-art">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{post.body}</ReactMarkdown>
      </div>

      {post.exhibitionUrl && (
        <div className="mt-10 p-5 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800 text-center">
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
            Want to explore this exhibition with an expert guide?
          </p>
          {onStartTour ? (
            <button
              onClick={() => onStartTour(post.exhibitionUrl)}
              className="inline-block px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Start Tour →
            </button>
          ) : (
            <button
              onClick={() => openSignUp()}
              className="inline-block px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Sign up to start a tour →
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function BlogPage({
  initialSlug,
  onNavigatePost,
  onStartTour,
}: {
  initialSlug: string | null;
  onNavigatePost: (slug: string | null) => void;
  onStartTour?: (url: string) => void;
}) {
  if (initialSlug) {
    return <PostDetail slug={initialSlug} onBack={() => onNavigatePost(null)} onStartTour={onStartTour} />;
  }
  return <PostList onSelect={(slug) => onNavigatePost(slug)} />;
}
