export interface LanguageResult {
  /** ISO 639-1 code (e.g. en, es, fr) or null if undetected */
  code: string | null;
  /** Confidence 0–1 from franc heuristic */
  confidence: number | null;
}

export interface LanguageDetectorPort {
  detectLanguage(text: string): LanguageResult;
}
