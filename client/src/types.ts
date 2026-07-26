export interface Source {
  title: string;
  url: string;
}

export type Rating = 'up' | 'down';

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  sources?: Source[];
  // Exhibition options from a free-text discovery search, rendered as cards
  candidates?: DiscoveredExhibition[];
  // Stable id, assigned to rateable assistant messages (used to key feedback)
  id?: string;
  // This user's current thumbs selection, persisted with the conversation
  feedback?: Rating;
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
