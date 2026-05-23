import { franc, francAll } from "franc";
import type { LanguageDetectorPort, LanguageResult } from "../ports/language-detector.port.js";

/** ISO 639-3 (franc) ? ISO 639-1 for CSV metadata */
const ISO3_TO_ISO1: Record<string, string> = {
  eng: "en",
  spa: "es",
  fra: "fr",
  glg: "gl",
  por: "pt",
  cat: "ca",
};

/**
 * Confidence from francAll top-2 scores:
 * primary score minus runner-up, clamped to [0, 1].
 * Documented heuristic for metadata/debugging only.
 */
function computeLanguageConfidence(text: string): number | null {
  const scores = francAll(text, { minLength: 10 });
  if (scores.length === 0) return null;

  const top = scores[0]![1];
  const second = scores[1]?.[1] ?? 0;
  const gap = top - second;
  return Math.max(0, Math.min(1, gap + top * 0.5));
}

function toIso6391(iso3: string): string | null {
  if (iso3 === "und") return null;
  return ISO3_TO_ISO1[iso3] ?? iso3.slice(0, 2);
}

export class FrancLanguageDetector implements LanguageDetectorPort {
  detectLanguage(text: string): LanguageResult {
    if (!text.trim()) {
      return { code: null, confidence: null };
    }

    const iso3 = franc(text, { minLength: 10 });
    const code = toIso6391(iso3);
    const confidence = code ? computeLanguageConfidence(text) : null;

    return { code, confidence };
  }
}

export function createLanguageDetector(): LanguageDetectorPort {
  return new FrancLanguageDetector();
}
