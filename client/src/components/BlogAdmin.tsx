import { useState, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { authedFetch } from '../utils';

interface BlogPost {
  slug: string;
  title: string;
  metaDescription: string;
  body: string;
  exhibitionUrl: string;
  tags: string[];
  status: 'draft' | 'published';
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
}

type DraftPost = Partial<BlogPost> & { isNew?: boolean };

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function formatDate(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function BlogAdmin({ getToken }: { getToken: () => Promise<string | null> }) {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [draft, setDraft] = useState<DraftPost | null>(null);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exhibitionUrl, setExhibitionUrl] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [titleEdited, setTitleEdited] = useState(false);

  const loadPosts = useCallback(async () => {
    try {
      const res = await authedFetch(getToken, '/api/blog/posts');
      if (res.ok) setPosts(await res.json());
    } catch {
      // ignore
    }
  }, [getToken]);

  useEffect(() => { loadPosts(); }, [loadPosts]);

  // Sync tags string → draft.tags
  useEffect(() => {
    if (!draft) return;
    const tags = tagsInput.split(',').map(t => t.trim()).filter(Boolean);
    setDraft(prev => prev ? { ...prev, tags } : prev);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tagsInput]);

  function openNewDraft(initial: Partial<BlogPost> = {}) {
    const slug = initial.slug ?? (initial.title ? slugify(initial.title) : '');
    setDraft({ ...initial, slug, isNew: true });
    setTagsInput((initial.tags ?? []).join(', '));
    setTitleEdited(false);
    setShowPreview(false);
    setError(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function openEdit(post: BlogPost) {
    setDraft({ ...post, isNew: false });
    setTagsInput((post.tags ?? []).join(', '));
    setTitleEdited(true);
    setShowPreview(false);
    setError(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function generate() {
    if (!exhibitionUrl.trim()) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await authedFetch(getToken, '/api/blog/generate', {
        method: 'POST',
        body: JSON.stringify({ exhibitionUrl: exhibitionUrl.trim() }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      openNewDraft({
        title: data.title ?? '',
        metaDescription: data.metaDescription ?? '',
        body: data.body ?? '',
        tags: data.tags ?? [],
        slug: data.suggestedSlug ?? slugify(data.title ?? ''),
        exhibitionUrl: exhibitionUrl.trim(),
        status: 'draft',
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generation failed');
    } finally {
      setGenerating(false);
    }
  }

  async function save(status: 'draft' | 'published') {
    if (!draft || !draft.title || !draft.body || !draft.slug) {
      setError('Title, slug, and body are required');
      return;
    }
    setSaving(true);
    setError(null);
    const payload = { ...draft, status };
    try {
      let res: Response;
      if (draft.isNew) {
        res = await authedFetch(getToken, '/api/blog/posts', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      } else {
        res = await authedFetch(getToken, `/api/blog/posts/${draft.slug}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(body.error ?? 'Save failed');
      }
      setDraft(null);
      await loadPosts();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function deletePost(slug: string) {
    if (!window.confirm(`Delete "${slug}"? This cannot be undone.`)) return;
    await authedFetch(getToken, `/api/blog/posts/${slug}`, { method: 'DELETE' });
    setPosts(prev => prev.filter(p => p.slug !== slug));
    if (draft?.slug === slug) setDraft(null);
  }

  function updateDraftField<K extends keyof BlogPost>(key: K, value: BlogPost[K]) {
    setDraft(prev => {
      if (!prev) return prev;
      const next = { ...prev, [key]: value };
      if (key === 'title' && !titleEdited) {
        next.slug = slugify(value as string);
      }
      return next;
    });
  }

  const inputClass = 'w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-colors';
  const labelClass = 'block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1';
  const btnBase = 'px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40';

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 overflow-x-hidden w-full min-w-0">
      <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 mb-6">Blog Admin</h1>

      {/* Generator */}
      <section className="mb-8 p-5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 uppercase tracking-wide">Generate Review</h2>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="url"
            placeholder="https://www.tate.org.uk/whats-on/tate-modern/..."
            value={exhibitionUrl}
            onChange={e => setExhibitionUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && generate()}
            className={inputClass + ' flex-1'}
          />
          <button
            onClick={generate}
            disabled={generating || !exhibitionUrl.trim()}
            className={`${btnBase} bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center gap-2 sm:w-auto`}
          >
            {generating ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Generating…
              </>
            ) : 'Generate'}
          </button>
        </div>
        {generating && (
          <p className="text-xs text-slate-400 mt-2">Researching the exhibition — this takes about 30 seconds…</p>
        )}
      </section>

      {/* Error banner */}
      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Editor */}
      {draft !== null && (
        <section className="mb-8 p-5 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-slate-800">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4 uppercase tracking-wide truncate">
            {draft.isNew ? 'New Post' : `Editing: ${draft.slug}`}
          </h2>

          <div className="space-y-4">
            {/* Title */}
            <div>
              <label className={labelClass}>Title</label>
              <input
                type="text"
                value={draft.title ?? ''}
                onChange={e => updateDraftField('title', e.target.value)}
                className={inputClass}
              />
            </div>

            {/* Slug */}
            <div>
              <label className={labelClass}>Slug</label>
              <input
                type="text"
                value={draft.slug ?? ''}
                onChange={e => { setTitleEdited(true); updateDraftField('slug', e.target.value); }}
                className={inputClass}
              />
            </div>

            {/* Meta description */}
            <div>
              <label className={labelClass}>
                Meta Description
                <span className={`ml-2 font-mono ${(draft.metaDescription?.length ?? 0) > 160 ? 'text-red-500' : 'text-slate-400'}`}>
                  {draft.metaDescription?.length ?? 0}/160
                </span>
              </label>
              <input
                type="text"
                value={draft.metaDescription ?? ''}
                onChange={e => updateDraftField('metaDescription', e.target.value)}
                className={inputClass}
              />
            </div>

            {/* Tags */}
            <div>
              <label className={labelClass}>Tags (comma-separated)</label>
              <input
                type="text"
                value={tagsInput}
                onChange={e => setTagsInput(e.target.value)}
                placeholder="Marlene Dumas, Tate Modern, painting, London"
                className={inputClass}
              />
              {(draft.tags ?? []).length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {draft.tags!.map(tag => (
                    <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Body */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className={labelClass} style={{ marginBottom: 0 }}>Body (Markdown)</label>
                <button
                  type="button"
                  onClick={() => setShowPreview(p => !p)}
                  className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  {showPreview ? 'Hide preview' : 'Show preview'}
                </button>
              </div>
              <textarea
                value={draft.body ?? ''}
                onChange={e => updateDraftField('body', e.target.value)}
                rows={16}
                className={inputClass + ' font-mono text-base sm:text-xs resize-y'}
              />
            </div>

            {/* Preview */}
            {showPreview && draft.body && (
              <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 prose-art max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{draft.body}</ReactMarkdown>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <button
                onClick={() => save('draft')}
                disabled={saving}
                className={`${btnBase} bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600`}
              >
                {saving ? 'Saving…' : 'Save as Draft'}
              </button>
              <button
                onClick={() => save('published')}
                disabled={saving}
                className={`${btnBase} bg-indigo-600 hover:bg-indigo-700 text-white`}
              >
                {saving ? 'Publishing…' : 'Publish'}
              </button>
              {draft.status === 'published' && !draft.isNew && (
                <a
                  href={`/blog/${draft.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  Preview &rarr;
                </a>
              )}
              <button
                onClick={() => { setDraft(null); setError(null); }}
                className={`${btnBase} text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 ml-auto`}
              >
                Cancel
              </button>
            </div>
          </div>
        </section>
      )}

      {/* New post button */}
      {draft === null && (
        <button
          onClick={() => openNewDraft({ status: 'draft' })}
          className={`${btnBase} mb-6 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600`}
        >
          + New post
        </button>
      )}

      {/* Posts list */}
      <section>
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 uppercase tracking-wide">All Posts</h2>
        {posts.length === 0 ? (
          <p className="text-sm text-slate-400">No posts yet.</p>
        ) : (
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-x-auto">
            <table className="w-full text-sm min-w-[400px]">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                  <th className="text-left px-4 py-2.5 font-medium text-slate-600 dark:text-slate-400">Title</th>
                  <th className="text-left px-4 py-2.5 font-medium text-slate-600 dark:text-slate-400 hidden sm:table-cell">Status</th>
                  <th className="text-left px-4 py-2.5 font-medium text-slate-600 dark:text-slate-400 hidden md:table-cell">Date</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {posts.map((post, i) => (
                  <tr
                    key={post.slug}
                    className={`border-b last:border-b-0 border-slate-200 dark:border-slate-700 ${i % 2 === 0 ? 'bg-white dark:bg-slate-800' : 'bg-slate-50/50 dark:bg-slate-800/30'}`}
                  >
                    <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200 max-w-xs truncate">
                      {post.title}
                      <span className="block text-xs font-normal text-slate-400 truncate">{post.slug}</span>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        post.status === 'published'
                          ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400'
                          : 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400'
                      }`}>
                        {post.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs hidden md:table-cell">
                      {post.status === 'published' ? formatDate(post.publishedAt) : formatDate(post.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button
                        onClick={() => openEdit(post)}
                        className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline mr-3"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => deletePost(post.slug)}
                        className="text-xs text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 hover:underline"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
