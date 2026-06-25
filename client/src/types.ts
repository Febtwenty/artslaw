export interface Source {
  title: string;
  url: string;
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  sources?: Source[];
}

export interface SuggestedTour {
  artistName: string;
  exhibitionTitle: string;
  gallery: string;
  url: string;
  imageUrl?: string | null;
  blogSlug?: string;
}

export interface Conversation {
  id: string;
  title: string;
  exhibitionUrl: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
  provider?: 'claude' | 'mistral';
}
