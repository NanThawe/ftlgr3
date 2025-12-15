"use client";
import { useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

type RAGProps = {
  transcriptText: string;
  segments?: any[];
};

type ChunkInfo = {
  chunk_id: string;
  score: number;
  text_preview: string;
  start_time?: number;
  end_time?: number;
  source_type?: string;
};

type RAGResponse = {
  answer: string;
  elapsed_ms: number;
  top_chunks: ChunkInfo[];
  from_cache: boolean;
};

export default function RAGComponent({ transcriptText, segments }: RAGProps) {
  const [question, setQuestion] = useState("");
  const [indexing, setIndexing] = useState(false);
  const [querying, setQuerying] = useState(false);
  const [indexed, setIndexed] = useState(false);
  const [error, setError] = useState("");
  const [response, setResponse] = useState<RAGResponse | null>(null);
  const [showChunks, setShowChunks] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);

  async function handleIndex() {
    setIndexing(true);
    setError("");
    try {
      // First, generate summaries (they provide more organized information)
      console.log("Generating summaries for RAG indexing...");
      let summaryEn = null;
      let summaryMm = null;
      
      try {
        const summaryRes = await fetch(`${API_BASE}/api/llm/summarize`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transcript_text: transcriptText }),
        });
        
        if (summaryRes.ok) {
          const summaryData = await summaryRes.json();
          summaryEn = summaryData.english_summary;
          summaryMm = summaryData.burmese_summary;
          console.log("Summaries generated successfully");
        } else {
          console.log("Couldn't generate summaries, indexing transcript only");
        }
      } catch (summaryError) {
        console.log("Summary generation failed, continuing with transcript only");
      }
      
      // Only send segments if they have valid timestamps (YouTube, SRT, VTT)
      // PDF/TXT files don't have timestamps, so we skip sending segments for them
      const hasValidTimestamps = segments && segments.length > 0 && 
        segments.some(seg => seg.start !== null || seg.end !== null);
      
      // Now index with both transcript and summaries
      const res = await fetch(`${API_BASE}/api/llm/rag/index`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          transcript_text: transcriptText,
          segments: hasValidTimestamps ? segments : undefined,
          summary_en: summaryEn,
          summary_mm: summaryMm
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Index failed");
      }
      setIndexed(true);
    } catch (e: any) {
      setError(e.message || "Unknown error");
    } finally {
      setIndexing(false);
    }
  }

  async function handleQuery() {
    if (!question.trim()) return;
    setQuerying(true);
    setError("");
    setResponse(null);
    try {
      const res = await fetch(`${API_BASE}/api/llm/rag/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Query failed");
      }
      setResponse(await res.json());
    } catch (e: any) {
      setError(e.message || "Unknown error");
    } finally {
      setQuerying(false);
    }
  }

  function formatTime(s?: number) {
    if (s == null) return "";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60).toString().padStart(2, "0");
    return `${m}:${sec}`;
  }

  function formatMarkdown(text: string) {
    // Simple markdown renderer for bold and basic formatting
    return text
      .split('\n')
      .map((line, i) => {
        // Convert **bold** to <strong>
        const formatted = line.replace(/\*\*(.+?)\*\*/g, '<strong class="text-purple-400">$1</strong>');
        return <span key={i} dangerouslySetInnerHTML={{ __html: formatted }} />;
      })
      .reduce<React.ReactNode[]>((acc, curr, i) => {
        if (i > 0) acc.push(<br key={`br-${i}`} />);
        acc.push(curr);
        return acc;
      }, []);
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h2 className="section-title">
          <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-pink-500 flex items-center justify-center text-lg">💬</span>
          Ask Questions (RAG)
        </h2>
        <p className="section-subtitle">
          Query the transcript using AI-powered retrieval augmented generation
        </p>
      </div>

      {/* Collapsible Transcript Reference */}
      <div className="card mb-6">
        <button
          onClick={() => setShowTranscript(!showTranscript)}
          className="w-full flex items-center justify-between"
        >
          <h3 className="font-bold text-white flex items-center gap-2">
            <span className="text-lg">📄</span> Transcript Reference
          </h3>
          <span className="text-slate-400 flex items-center gap-2">
            {showTranscript ? "Hide" : "Show"}
            <svg className={`w-4 h-4 transition-transform ${showTranscript ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </span>
        </button>
        
        {showTranscript && (
          <div className="mt-4 animate-fadeIn">
            <div className="p-4 rounded-xl bg-slate-900/50 max-h-60 overflow-y-auto text-sm text-slate-300 whitespace-pre-line">
              {transcriptText}
            </div>
            {segments && segments.length > 0 && segments.some(seg => seg.start !== null || seg.end !== null) && (
              <div className="mt-3">
                <h4 className="text-sm font-medium text-slate-400 mb-2">Segments with Timestamps</h4>
                <ul className="space-y-1 max-h-40 overflow-y-auto text-xs">
                  {segments.map((seg, i) => (
                    <li key={i} className="flex gap-3 p-2 rounded-lg hover:bg-slate-700/30 transition-colors">
                      <span className="text-purple-400 font-mono whitespace-nowrap">
                        {formatTime(seg.start)} - {formatTime(seg.end)}
                      </span>
                      <span className="text-slate-400">{seg.text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
      
      {!indexed && (
        <div className="card mb-6">
          <div className="flex flex-col items-center text-center py-8">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500/20 to-cyan-500/20 flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">Index Your Transcript</h3>
            <p className="text-sm text-slate-400 mb-6 max-w-md">
              Before you can ask questions, the transcript needs to be indexed. This creates a searchable knowledge base from your content.
            </p>
            <button
              onClick={handleIndex}
              disabled={indexing || !transcriptText}
              className="btn-primary flex items-center gap-2"
            >
              {indexing ? (
                <>
                  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Indexing transcript...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Index Transcript for Q&A
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {indexed && (
        <div className="space-y-6">
          {/* Success message */}
          <div className="card bg-emerald-500/10 border-emerald-500/30">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <h4 className="font-medium text-emerald-400">Transcript Indexed Successfully</h4>
                <p className="text-sm text-slate-400">You can now ask questions about the content</p>
              </div>
            </div>
          </div>

          {/* Question input */}
          <div className="card">
            <div className="flex gap-3">
              <input
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleQuery()}
                placeholder="Ask a question about the transcript..."
                className="input-modern flex-1"
              />
              <button
                onClick={handleQuery}
                disabled={querying || !question.trim()}
                className="btn-primary px-6 flex items-center gap-2"
              >
                {querying ? (
                  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                )}
                Ask
              </button>
            </div>
          </div>

          {error && (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm animate-fadeIn">
              {error}
            </div>
          )}

          {response && (
            <div className="card animate-fadeInUp">
              <div className="flex justify-between items-start mb-4">
                <h3 className="font-semibold text-white flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-purple-400"></span>
                  Answer
                </h3>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-500">
                    {(response.elapsed_ms / 1000).toFixed(2)}s
                    {response.from_cache && (
                      <span className="ml-2 px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-400">cached</span>
                    )}
                  </span>
                  {response.top_chunks.length > 0 && (
                    <button
                      onClick={() => setShowChunks(!showChunks)}
                      className="px-3 py-1 rounded-lg bg-slate-700/50 hover:bg-slate-700 text-slate-300 text-xs transition-colors flex items-center gap-1"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Sources
                    </button>
                  )}
                </div>
              </div>
              <div className="p-4 rounded-xl bg-slate-900/50 text-sm text-slate-300" style={{ lineHeight: '1.8' }}>
                {formatMarkdown(response.answer)}
              </div>

              {showChunks && response.top_chunks.length > 0 && (
                <div className="mt-4 pt-4 border-t border-slate-700/50">
                  <h4 className="font-medium text-sm mb-3 text-slate-300">Top {response.top_chunks.length} Source Chunks:</h4>
                  <div className="space-y-2">
                    {response.top_chunks.map((chunk, i) => {
                      const isSummary = chunk.source_type?.includes("summary");
                      return (
                        <div key={chunk.chunk_id} className="p-3 rounded-xl bg-slate-900/50 text-xs">
                          <div className="flex justify-between mb-2">
                            <div className="flex gap-2 items-center">
                              <span className="font-medium text-slate-300">Chunk {i + 1}</span>
                              <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-400">
                                score: {chunk.score.toFixed(2)}
                              </span>
                              {isSummary && (
                                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400">
                                  Summary
                                </span>
                              )}
                            </div>
                            {(chunk.start_time != null || chunk.end_time != null) && (
                              <span className="text-slate-500 font-mono">
                                {formatTime(chunk.start_time)} - {formatTime(chunk.end_time)}
                              </span>
                            )}
                          </div>
                          <div className="text-slate-400">{chunk.text_preview}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
