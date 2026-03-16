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
    <div className="flex gap-3 items-start">
      {/* ArtGuide avatar */}
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center mt-0.5">
        <span className="text-indigo-600 text-xs font-semibold">A</span>
      </div>

      {/* Message content */}
      <div className="flex-1 min-w-0">
        <span className="text-indigo-500 text-xs font-medium block mb-2">
          ArtGuide
        </span>
        <div className="prose-art text-slate-700 text-sm">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {message.content}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
