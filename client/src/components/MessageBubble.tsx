import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Message } from '../App';

interface Props {
  message: Message;
}

export default function MessageBubble({ message }: Props) {
  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[75%] bg-indigo-600 rounded-2xl rounded-tr-sm px-4 py-3">
          <p className="text-white text-sm leading-relaxed">
            {message.content}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row md:gap-3 md:items-start">
      {/* Avatar + name: side-by-side on mobile, avatar-only column on desktop */}
      <div className="flex items-center gap-2 mb-2 md:mb-0 md:block">
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center md:mt-0.5">
          <span className="text-indigo-600 dark:text-indigo-400 text-xs font-semibold">A</span>
        </div>
        <span className="text-indigo-500 dark:text-indigo-400 text-xs font-medium md:hidden">ArtSlaw</span>
      </div>

      {/* Message content */}
      <div className="flex-1 min-w-0">
        <span className="hidden md:block text-indigo-500 dark:text-indigo-400 text-xs font-medium mb-2">
          ArtSlaw
        </span>
        <div className="prose-art text-slate-700 dark:text-slate-300 text-sm">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {message.content}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
