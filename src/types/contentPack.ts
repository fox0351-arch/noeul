import type { BlogDraft, TravelStory } from './blog';
import type { ContentQualityScore } from './contentQuality';

export interface CardNewsSlide {
  index: number;
  title: string;
  body: string;
}

export interface ShortsBeat {
  startSec: number;
  endSec: number;
  line: string;
}

export interface ShortsScript {
  durationSec: number;
  hook: string;
  beats: ShortsBeat[];
  fullScript: string;
}

export interface YoutubeCopy {
  title: string;
  description: string;
}

export interface ContentPack {
  story: TravelStory;
  blog: BlogDraft;
  cardNews: CardNewsSlide[];
  shorts: ShortsScript;
  youtube: YoutubeCopy;
  seoKeywords: string[];
  hashtags: string[];
  quality?: ContentQualityScore;
}
