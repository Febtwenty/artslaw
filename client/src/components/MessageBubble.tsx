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
        <div className="max-w-[75%] bg-stone-800 border border-stone-700/50 rounded-2xl rounded-tr-sm px-4 py-3">
          <p className="text-stone-200 text-sm font-light leading-relaxed">
            {message.content}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3 items-start">
      {/* ArtGuide avatar */}
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-amber-900/50 border border-amber-800/50 flex items-center justify-center mt-0.5">
        <span className="text-amber-300 text-xs font-serif font-semibold">A</span>
      </div>

      {/* Message content */}
      <div className="flex-1 min-w-0">
        <span className="text-amber-700/80 text-xs font-light tracking-widest uppercase block mb-2">
          ArtGuide
        </span>
        <div className="prose-art text-stone-300 text-sm">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {message.content}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
