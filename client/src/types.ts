export interface Source {
  title: string;
  url: string;
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  sources?: Source[];
  // Exhibition options from a free-text discovery search, rendered as cards
  candidates?: DiscoveredExhibition[];
}

export interface SuggestedTour {
  artistName: string;
  exhibitionTitle: string;
  gallery: string;
  url: string;
  imageUrl?: string | null;
  blogSlug?: string;
}

// Candidate returned by POST /api/exhibition-search for free-text queries
export interface DiscoveredExhibition {
  title: string;
  artist?: string;
  venue?: string;
  url: string;
  snippet?: string;
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
