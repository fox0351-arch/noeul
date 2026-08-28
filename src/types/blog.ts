export interface PhotoAnalysis {
  driveFileId: string;
  fileName: string;
  place: string;
  description: string;
  objects: string[];
  mood: string;
  keywords: string[];
  status: 'pending' | 'uploading' | 'analyzing' | 'analyzed' | 'failed';
  error?: string;
  capturedAt?: string;
  lastModified?: number;
}

export interface TravelStory {
  route: string[];
  summary: string;
}

export interface BlogSeo {
  keywords: string[];
  hashtags: string[];
  searchQueries: string[];
}

export interface BlogDraft {
  title: string;
  summary: string;
  intro: string;
  story: string;
  places: string;
  closing: string;
  body: string;
  markdown: string;
  html: string;
  seo: BlogSeo;
  charCount: number;
}
