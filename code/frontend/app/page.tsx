"use client";
import { useState, useEffect } from "react";
import TranslationSummary from "@/components/TranslationSummary";
import RAGComponent from "@/components/RAGComponent";
import CEFRComponent from "@/components/CEFRComponent";
import Sidebar from "@/components/Sidebar";
import LoadingScreen from "@/components/LoadingScreen";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

type Segment = { start: number | null; end: number | null; text: string };
type TranscriptResponse = {
  source: string;
  transcript_text: string;
  segments: Segment[];
  file_type?: string;
};

function formatTime(s: number | null) {
  if (s == null) return "";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
}

export default function Home() {
  const [activeSection, setActiveSection] = useState("transcript");
  const [tab, setTab] = useState<"youtube" | "upload">("youtube");
  
  // YouTube
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [modelSize, setModelSize] = useState<"small" | "medium">("small");
  const [ytLoading, setYtLoading] = useState(false);
  const [ytError, setYtError] = useState("");
  const [ytResult, setYtResult] = useState<TranscriptResponse | null>(null);
  
  // Upload
  const [file, setFile] = useState<File | null>(null);
  const [upLoading, setUpLoading] = useState(false);
  const [upError, setUpError] = useState("");
  const [upResult, setUpResult] = useState<TranscriptResponse | null>(null);

  const hasTranscript = !!(ytResult || upResult);
  const transcriptText = ytResult?.transcript_text || upResult?.transcript_text || "";
  const segments = ytResult?.segments || upResult?.segments;

  async function handleYoutube() {
    setYtLoading(true);
    setYtError("");
    setYtResult(null);
    try {
      const res = await fetch(`${API_BASE}/api/transcribe/youtube`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ youtube_url: youtubeUrl, model_size: modelSize }),
      });
      if (!res.ok) throw new Error((await res.json()).detail || "Error");
      setYtResult(await res.json());
    } catch (e: any) {
      setYtError(e.message || "Unknown error");
    } finally {
      setYtLoading(false);
    }
  }

  async function handleUpload() {
    if (!file) return;
    setUpLoading(true);
    setUpError("");
    setUpResult(null);
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch(`${API_BASE}/api/transcribe/upload`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) throw new Error((await res.json()).detail || "Error");
      setUpResult(await res.json());
    } catch (e: any) {
      setUpError(e.message || "Unknown error");
    } finally {
      setUpLoading(false);
    }
  }

  const renderSection = () => {
    switch (activeSection) {
      case "transcript":
        return (
          <div className="animate-fadeInUp">
            {/* Header */}
            <div className="mb-8">
              <h2 className="section-title">
                <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-cyan-500 flex items-center justify-center text-lg">📝</span>
                Generate Transcript
              </h2>
              <p className="section-subtitle">
                Extract text from YouTube videos or upload your own transcript files
              </p>
            </div>

            {/* Tab Buttons */}
            <div className="flex gap-3 mb-6">
              <button
                className={tab === "youtube" ? "tab-button-active" : "tab-button"}
                onClick={() => setTab("youtube")}
              >
                <span className="flex items-center gap-2">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                  </svg>
                  From YouTube
                </span>
              </button>
              <button
                className={tab === "upload" ? "tab-button-active" : "tab-button"}
                onClick={() => setTab("upload")}
              >
                <span className="flex items-center gap-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  Upload File
                </span>
              </button>
            </div>

            {/* Content Card */}
            <div className="card">
              {tab === "youtube" ? (
                <div className="space-y-5">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">YouTube URL</label>
                    <input
                      className="input-modern"
                      value={youtubeUrl}
                      onChange={(e) => setYoutubeUrl(e.target.value)}
                      placeholder="https://youtube.com/watch?v=..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Model Size</label>
                    <select
                      className="select-modern"
                      value={modelSize}
                      onChange={(e) => setModelSize(e.target.value as any)}
                    >
                      <option value="small">Small (Faster)</option>
                      <option value="medium">Medium (Better Quality)</option>
                    </select>
                  </div>
                  <button
                    className="btn-primary w-full flex items-center justify-center gap-2"
                    onClick={handleYoutube}
                    disabled={ytLoading || !youtubeUrl}
                  >
                    {ytLoading ? (
                      <>
                        <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Generating Transcript...
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        Generate Transcript
                      </>
                    )}
                  </button>
                  {ytError && (
                    <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm animate-fadeIn">
                      {ytError}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-5">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Upload File</label>
                    <div className="relative">
                      <input
                        type="file"
                        accept=".pdf,.txt,.srt,.vtt"
                        className="hidden"
                        id="file-upload"
                        onChange={(e) => setFile(e.target.files?.[0] || null)}
                      />
                      <label
                        htmlFor="file-upload"
                        className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-slate-700 rounded-xl cursor-pointer hover:border-purple-500/50 transition-all duration-300 hover:bg-slate-800/30"
                      >
                        <svg className="w-10 h-10 text-slate-500 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                        {file ? (
                          <span className="text-purple-400 font-medium">{file.name}</span>
                        ) : (
                          <>
                            <span className="text-slate-400">Drop your file here or click to browse</span>
                            <span className="text-xs text-slate-500 mt-1">.pdf, .txt, .srt, .vtt</span>
                          </>
                        )}
                      </label>
                    </div>
                  </div>
                  <button
                    className="btn-primary w-full flex items-center justify-center gap-2"
                    onClick={handleUpload}
                    disabled={upLoading || !file}
                  >
                    {upLoading ? (
                      <>
                        <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Parsing File...
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Parse Transcript
                      </>
                    )}
                  </button>
                  {upError && (
                    <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm animate-fadeIn">
                      {upError}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Result Section */}
            {(ytResult || upResult) && (
              <div className="mt-6 space-y-4 animate-fadeInUp">
                <div className="card">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-white flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-green-400"></span>
                      Transcript Generated
                    </h3>
                    <span className="px-3 py-1 rounded-full bg-green-500/20 text-green-400 text-xs font-medium">
                      Success
                    </span>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-900/50 max-h-60 overflow-y-auto text-sm text-slate-300 whitespace-pre-line">
                    {(ytResult || upResult)?.transcript_text}
                  </div>
                </div>

                {/* Segments */}
                {(ytResult || upResult)?.segments.some(seg => seg.start !== null || seg.end !== null) && (
                  <div className="card">
                    <h3 className="font-semibold text-white mb-4">Segments</h3>
                    <ul className="space-y-2 max-h-40 overflow-y-auto text-sm">
                      {(ytResult || upResult)?.segments.map((seg, i) => (
                        <li key={i} className="flex gap-3 p-2 rounded-lg hover:bg-slate-700/30 transition-colors">
                          <span className="text-purple-400 font-mono text-xs whitespace-nowrap">
                            {formatTime(seg.start)} - {formatTime(seg.end)}
                          </span>
                          <span className="text-slate-300">{seg.text}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Continue Button */}
                <button
                  className="btn-success w-full flex items-center justify-center gap-2"
                  onClick={() => setActiveSection("translation")}
                >
                  Continue to Translation & Summary
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        );

      case "translation":
        return (
          <div className="animate-fadeInUp">
            <TranslationSummary transcriptText={transcriptText} />
            <div className="mt-6 flex gap-3">
              <button
                className="btn-secondary flex-1 flex items-center justify-center gap-2"
                onClick={() => setActiveSection("transcript")}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 17l-5-5m0 0l5-5m-5 5h12" />
                </svg>
                Back
              </button>
              <button
                className="btn-success flex-1 flex items-center justify-center gap-2"
                onClick={() => setActiveSection("cefr")}
              >
                Continue to CEFR
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </button>
            </div>
          </div>
        );

      case "cefr":
        return (
          <div className="animate-fadeInUp">
            <CEFRComponent transcriptText={transcriptText} />
            <div className="mt-6 flex gap-3">
              <button
                className="btn-secondary flex-1 flex items-center justify-center gap-2"
                onClick={() => setActiveSection("translation")}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 17l-5-5m0 0l5-5m-5 5h12" />
                </svg>
                Back
              </button>
              <button
                className="btn-success flex-1 flex items-center justify-center gap-2"
                onClick={() => setActiveSection("rag")}
              >
                Continue to Q&A
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </button>
            </div>
          </div>
        );

      case "rag":
        return (
          <div className="animate-fadeInUp">
            <RAGComponent transcriptText={transcriptText} segments={segments} />
            <div className="mt-6">
              <button
                className="btn-secondary flex items-center justify-center gap-2"
                onClick={() => setActiveSection("cefr")}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 17l-5-5m0 0l5-5m-5 5h12" />
                </svg>
                Back to CEFR
              </button>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <>
      <LoadingScreen />
      <div className="flex min-h-screen">
        <Sidebar
          activeSection={activeSection}
          onSectionChange={setActiveSection}
          hasTranscript={hasTranscript}
        />
        <main className="flex-1 lg:ml-0 min-h-screen">
          <div className="max-w-4xl mx-auto px-6 py-10 lg:py-16">
            {renderSection()}
          </div>
        </main>
      </div>
    </>
  );
}
