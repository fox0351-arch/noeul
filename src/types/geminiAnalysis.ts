export interface GeminiAnalysisResult {
  placeName: string;
  caption: string;
  peopleCount: string;
  mood: string;
  estimatedLocation: string;
  objects: string[];
  tags: string[];
  blogKeywords: string[];
  cardNewsCopy: string;
}

export const EMPTY_GEMINI_ANALYSIS: GeminiAnalysisResult = {
  placeName: '',
  caption: '',
  peopleCount: '',
  mood: '',
  estimatedLocation: '',
  objects: [],
  tags: [],
  blogKeywords: [],
  cardNewsCopy: '',
};
