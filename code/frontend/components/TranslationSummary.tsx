"use client";
import { useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

type TranslationSummaryProps = {
  transcriptText: string;
};

type TranslationResponse = {
  source_language: string;
  target_language: string;
  translated_text: string;
  elapsed_ms: number;
  from_cache: boolean;
};

type SummaryResponse = {
  english_summary: string;
  burmese_summary: string;
  elapsed_ms: number;
  from_cache: boolean;
};

export default function TranslationSummary({ transcriptText }: TranslationSummaryProps) {
  const [translating, setTranslating] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [translationError, setTranslationError] = useState("");
  const [summaryError, setSummaryError] = useState("");
  const [translation, setTranslation] = useState<TranslationResponse | null>(null);
  const [summaries, setSummaries] = useState<SummaryResponse | null>(null);

  async function handleTranslate() {
    setTranslating(true);
    setTranslationError("");
    setTranslation(null);
    try {
      const res = await fetch(`${API_BASE}/api/llm/translate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript_text: transcriptText }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Translation failed");
      }
      setTranslation(await res.json());
    } catch (e: any) {
      setTranslationError(e.message || "Unknown error");
    } finally {
      setTranslating(false);
    }
  }

  async function handleSummarize() {
    setSummarizing(true);
    setSummaryError("");
    setSummaries(null);
    try {
      const res = await fetch(`${API_BASE}/api/llm/summarize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript_text: transcriptText }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Summarization failed");
      }
      setSummaries(await res.json());
    } catch (e: any) {
      setSummaryError(e.message || "Unknown error");
    } finally {
      setSummarizing(false);
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h2 className="section-title">
          <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-emerald-500 flex items-center justify-center text-lg">🌐</span>
          Translation & Summary
        </h2>
        <p className="section-subtitle">
          Translate the transcript and generate summaries in multiple languages
        </p>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <button
          onClick={handleTranslate}
          disabled={translating || !transcriptText}
          className="btn-primary flex-1 flex items-center justify-center gap-2"
        >
          {translating ? (
            <>
              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Translating...
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
              </svg>
              Translate to Burmese
            </>
          )}
        </button>
        <button
          onClick={handleSummarize}
          disabled={summarizing || !transcriptText}
          className="btn-success flex-1 flex items-center justify-center gap-2"
        >
          {summarizing ? (
            <>
              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Generating...
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Generate Summaries
            </>
          )}
        </button>
      </div>

      {/* Translation Result */}
      {translationError && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm mb-4 animate-fadeIn">
          {translationError}
        </div>
      )}
      {translation && (
        <div className="card mb-6 animate-fadeInUp">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-white flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-400"></span>
              Burmese Translation
            </h3>
            <span className="text-xs text-slate-500">
              {(translation.elapsed_ms / 1000).toFixed(2)}s
              {translation.from_cache && (
                <span className="ml-2 px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-400">cached</span>
              )}
            </span>
          </div>
          <div className="p-4 rounded-xl bg-slate-900/50 max-h-60 overflow-y-auto whitespace-pre-line text-sm text-slate-300">
            {translation.translated_text}
          </div>
        </div>
      )}

      {/* Summary Results */}
      {summaryError && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm mb-4 animate-fadeIn">
          {summaryError}
        </div>
      )}
      {summaries && (
        <div className="animate-fadeInUp">
          <div className="flex items-center justify-end mb-3">
            <span className="text-xs text-slate-500">
              {(summaries.elapsed_ms / 1000).toFixed(2)}s
              {summaries.from_cache && (
                <span className="ml-2 px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-400">cached</span>
              )}
            </span>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="card">
              <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
                <span className="w-6 h-6 rounded-lg bg-blue-500/20 flex items-center justify-center text-xs">🇬🇧</span>
                English Summary
              </h3>
              <div className="p-4 rounded-xl bg-slate-900/50 text-sm whitespace-pre-line max-h-60 overflow-y-auto text-slate-300">
                {summaries.english_summary}
              </div>
            </div>
            <div className="card">
              <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
                <span className="w-6 h-6 rounded-lg bg-emerald-500/20 flex items-center justify-center text-xs">🇲🇲</span>
                Burmese Summary
              </h3>
              <div className="p-4 rounded-xl bg-slate-900/50 text-sm whitespace-pre-line max-h-60 overflow-y-auto text-slate-300">
                {summaries.burmese_summary}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
