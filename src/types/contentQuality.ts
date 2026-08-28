export interface ContentQualityScore {
  seo: number;
  readability: number;
  emotion: number;
  travelInfo: number;
  galmaetgil: number;
  overall: number;
  rewritten: boolean;
  rewriteCount: number;
  reasons: string[];
}
