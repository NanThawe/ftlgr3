"use client";
import { useState, useEffect, useRef, useCallback } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

// CEFR color scheme
const CEFR_COLORS: Record<string, string> = {
  A1: "#90EE90", // Light Green
  A2: "#9ACD32", // Yellow Green
  B1: "#FFD700", // Yellow
  B2: "#FFA500", // Orange
  C1: "#F08080", // Light Coral
  C2: "#FF6B6B", // Red
};

// Get contrasting text color based on background
const getTextColor = (bgColor: string): string => {
  // For lighter backgrounds, use dark text
  if (["#90EE90", "#9ACD32", "#FFD700"].includes(bgColor)) {
    return "#1a1a1a";
  }
  return "#ffffff";
};

// Types
type WordAnnotation = {
  word: string;
  cefr_level: string;
  confidence: number;
  frequency: number;
  part_of_speech?: string;
  phonetic?: string;
  definition?: string;
  example?: string;
};

type CEFRLevelStats = {
  level: string;
  count: number;
  percentage: number;
  words: string[];
};

type CEFRStatistics = {
  total_words: number;
  unique_words: number;
  average_difficulty: number;
  approximate_level: string;
  level_distribution: CEFRLevelStats[];
  difficulty_interpretation: string;
};

type CEFRAnalyzeResponse = {
  annotations: WordAnnotation[];
  statistics: CEFRStatistics;
  elapsed_ms: number;
  from_cache: boolean;
};

type WordDefinition = {
  word: string;
  part_of_speech?: string;
  phonetic?: string;
  definition?: string;
  example?: string;
  found: boolean;
  elapsed_ms: number;
};

type CEFRComponentProps = {
  transcriptText: string;
};

// Tooltip Component
function WordTooltip({
  word,
  annotation,
  definition,
  isLoading,
  position,
  onClose,
}: {
  word: string;
  annotation: WordAnnotation | undefined;
  definition: WordDefinition | null;
  isLoading: boolean;
  position: { x: number; y: number };
  onClose: () => void;
}) {
  if (!annotation) return null;

  const level = annotation.cefr_level;
  const bgColor = CEFR_COLORS[level] || "#gray";

  return (
    <>
      {/* Backdrop overlay */}
      <div 
        className="fixed inset-0 bg-black/50 z-[100] animate-fadeIn"
        onClick={onClose}
      />
      
      {/* Centered modal */}
      <div
        className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-[101] bg-slate-800 rounded-xl shadow-2xl border border-slate-600 p-6 max-w-md w-full mx-4 animate-fadeInUp"
        onClick={(e) => e.stopPropagation()}
      >
      <button
        onClick={onClose}
        className="absolute top-3 right-3 text-slate-400 hover:text-slate-200 text-2xl leading-none transition-colors w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-700"
      >
        ×
      </button>

      <div className="flex items-center gap-3 mb-4">
        <span className="text-xl font-bold text-white">{word}</span>
        {definition?.phonetic && (
          <span className="text-slate-400 text-sm">{definition.phonetic}</span>
        )}
        <span
          className="px-2 py-1 rounded text-xs font-bold"
          style={{
            backgroundColor: bgColor,
            color: getTextColor(bgColor),
          }}
        >
          {level}
        </span>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-slate-400">
          <div className="animate-spin w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full"></div>
          Loading definition...
        </div>
      ) : (
        <>
          {definition?.found ? (
            <>
              {definition.part_of_speech && (
                <div className="text-sm text-slate-400 italic mb-2">
                  {definition.part_of_speech}
                </div>
              )}
              {definition.definition && (
                <div className="text-sm mb-2 text-slate-300">
                  <span className="font-semibold text-white">Definition: </span>
                  {definition.definition}
                </div>
              )}
              {definition.example && (
                <div className="text-sm text-slate-400 italic">
                  <span className="font-semibold not-italic text-white">Example: </span>
                  &quot;{definition.example}&quot;
                </div>
              )}
            </>
          ) : (
            <div className="text-sm text-slate-500">
              Definition not available
            </div>
          )}
        </>
      )}

      <div className="mt-4 pt-4 border-t border-slate-700 text-xs text-slate-500">
        <div>Frequency: {annotation.frequency}x in text</div>
        <div>Confidence: {(annotation.confidence * 100).toFixed(1)}%</div>
      </div>
      
      {/* Close button at bottom */}
      <button
        onClick={onClose}
        className="mt-4 w-full py-2 px-4 bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 rounded-lg transition-colors text-sm font-medium"
      >
        Close
      </button>
    </div>
    </>
  );
}

// Statistics Dashboard Component
function StatisticsDashboard({ statistics }: { statistics: CEFRStatistics }) {
  const maxCount = Math.max(
    ...statistics.level_distribution.map((l) => l.count)
  );

  return (
    <div className="card">
      <h3 className="font-bold text-lg mb-4 text-white flex items-center gap-2">
        <span className="text-xl">📊</span> Vocabulary Statistics
      </h3>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="rounded-xl bg-blue-500/10 border border-blue-500/30 p-3 text-center">
          <div className="text-2xl font-bold text-blue-400">
            {statistics.total_words}
          </div>
          <div className="text-xs text-slate-400">Total Words</div>
        </div>
        <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-3 text-center">
          <div className="text-2xl font-bold text-emerald-400">
            {statistics.unique_words}
          </div>
          <div className="text-xs text-slate-400">Unique Words</div>
        </div>
        <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-3 text-center">
          <div className="text-2xl font-bold text-amber-400">
            {statistics.average_difficulty.toFixed(1)}
          </div>
          <div className="text-xs text-slate-400">Avg. Difficulty</div>
        </div>
        <div
          className="rounded-xl p-3 text-center border"
          style={{
            backgroundColor: CEFR_COLORS[statistics.approximate_level] + "20",
            borderColor: CEFR_COLORS[statistics.approximate_level] + "50",
          }}
        >
          <div
            className="text-2xl font-bold"
            style={{ color: CEFR_COLORS[statistics.approximate_level] }}
          >
            {statistics.approximate_level}
          </div>
          <div className="text-xs text-slate-400">Overall Level</div>
        </div>
      </div>

      {/* Interpretation */}
      <div className="rounded-xl bg-slate-900/50 p-4 mb-4 text-sm text-slate-300">
        <span className="font-semibold text-white">📝 Assessment: </span>
        {statistics.difficulty_interpretation}
      </div>

      {/* Bar Chart */}
      <div className="mb-4">
        <h4 className="font-semibold mb-3 text-sm text-white">Level Distribution</h4>
        <div className="space-y-2">
          {statistics.level_distribution.map((level) => (
            <div key={level.level} className="flex items-center gap-2">
              <span
                className="w-8 text-xs font-bold text-center py-1 rounded"
                style={{
                  backgroundColor: CEFR_COLORS[level.level],
                  color: getTextColor(CEFR_COLORS[level.level]),
                }}
              >
                {level.level}
              </span>
              <div className="flex-1 h-6 bg-slate-800 rounded overflow-hidden">
                <div
                  className="h-full transition-all duration-500"
                  style={{
                    width: `${maxCount > 0 ? (level.count / maxCount) * 100 : 0}%`,
                    backgroundColor: CEFR_COLORS[level.level],
                  }}
                ></div>
              </div>
              <span className="text-xs text-slate-400 w-20 text-right">
                {level.count} ({level.percentage.toFixed(1)}%)
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Pie Chart (CSS-based) */}
      <div className="flex items-center justify-center gap-6">
        <div className="relative w-32 h-32">
          <svg viewBox="0 0 100 100" className="transform -rotate-90">
            {(() => {
              let cumulative = 0;
              return statistics.level_distribution.map((level) => {
                const percentage = level.percentage;
                const start = cumulative;
                cumulative += percentage;
                const largeArc = percentage > 50 ? 1 : 0;
                const startAngle = (start / 100) * 2 * Math.PI;
                const endAngle = (cumulative / 100) * 2 * Math.PI;
                const x1 = 50 + 40 * Math.cos(startAngle);
                const y1 = 50 + 40 * Math.sin(startAngle);
                const x2 = 50 + 40 * Math.cos(endAngle);
                const y2 = 50 + 40 * Math.sin(endAngle);

                if (percentage === 0) return null;

                return (
                  <path
                    key={level.level}
                    d={`M 50 50 L ${x1} ${y1} A 40 40 0 ${largeArc} 1 ${x2} ${y2} Z`}
                    fill={CEFR_COLORS[level.level]}
                  />
                );
              });
            })()}
          </svg>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          {statistics.level_distribution.map((level) => (
            <div key={level.level} className="flex items-center gap-1">
              <div
                className="w-3 h-3 rounded"
                style={{ backgroundColor: CEFR_COLORS[level.level] }}
              ></div>
              <span className="text-slate-400">
                {level.level}: {level.percentage.toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Filter Panel Component
function FilterPanel({
  selectedLevels,
  onToggleLevel,
  onSelectAll,
  onDeselectAll,
}: {
  selectedLevels: Set<string>;
  onToggleLevel: (level: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
}) {
  const levels = ["A1", "A2", "B1", "B2", "C1", "C2"];

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-white flex items-center gap-2">
          <span className="text-lg">🎯</span> Filter by Level
        </h3>
        <div className="flex gap-2">
          <button
            onClick={onSelectAll}
            className="text-xs px-3 py-1.5 rounded-lg bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 transition-colors"
          >
            Select All
          </button>
          <button
            onClick={onDeselectAll}
            className="text-xs px-3 py-1.5 rounded-lg bg-slate-700/50 text-slate-400 hover:bg-slate-700 transition-colors"
          >
            Deselect All
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {levels.map((level) => (
          <label
            key={level}
            className="flex items-center gap-2 cursor-pointer px-3 py-2 rounded-lg border transition-all"
            style={{
              backgroundColor: selectedLevels.has(level)
                ? CEFR_COLORS[level] + "20"
                : "transparent",
              borderColor: selectedLevels.has(level)
                ? CEFR_COLORS[level]
                : "rgb(51 65 85 / 0.5)",
            }}
          >
            <input
              type="checkbox"
              checked={selectedLevels.has(level)}
              onChange={() => onToggleLevel(level)}
              className="rounded bg-slate-700 border-slate-600"
            />
            <span
              className="font-semibold text-sm"
              style={{
                color: selectedLevels.has(level)
                  ? CEFR_COLORS[level]
                  : "#94a3b8",
              }}
            >
              {level}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

// Advanced Words Panel Component
function AdvancedWordsPanel({
  annotations,
  onWordClick,
}: {
  annotations: WordAnnotation[];
  onWordClick: (word: string, event: React.MouseEvent) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [sortBy, setSortBy] = useState<"frequency" | "alphabetical" | "level">(
    "frequency"
  );

  const advancedWords = annotations.filter((a) =>
    ["B2", "C1", "C2"].includes(a.cefr_level)
  );

  const sortedWords = [...advancedWords].sort((a, b) => {
    if (sortBy === "frequency") return b.frequency - a.frequency;
    if (sortBy === "alphabetical") return a.word.localeCompare(b.word);
    if (sortBy === "level") {
      const levelOrder = { B2: 0, C1: 1, C2: 2 };
      return (
        (levelOrder[b.cefr_level as keyof typeof levelOrder] || 0) -
        (levelOrder[a.cefr_level as keyof typeof levelOrder] || 0)
      );
    }
    return 0;
  });

  const levelCounts = {
    B2: advancedWords.filter((w) => w.cefr_level === "B2").length,
    C1: advancedWords.filter((w) => w.cefr_level === "C1").length,
    C2: advancedWords.filter((w) => w.cefr_level === "C2").length,
  };

  const handleExport = () => {
    const csvContent = [
      ["Word", "CEFR Level", "Frequency", "Confidence"].join(","),
      ...sortedWords.map((w) =>
        [w.word, w.cefr_level, w.frequency, w.confidence.toFixed(4)].join(",")
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "advanced_vocabulary.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="card">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between"
      >
        <h3 className="font-bold text-white flex items-center gap-2">
          <span className="text-lg">📚</span> Advanced Vocabulary (B2-C2)
        </h3>
        <span className="text-slate-400 flex items-center gap-2">
          {advancedWords.length} words 
          <svg className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </span>
      </button>

      {isExpanded && (
        <div className="mt-4">
          {/* Level breakdown */}
          <div className="flex gap-4 mb-4 text-sm">
            {Object.entries(levelCounts).map(([level, count]) => (
              <span
                key={level}
                className="px-2 py-1 rounded"
                style={{
                  backgroundColor: CEFR_COLORS[level] + "20",
                  color: CEFR_COLORS[level],
                }}
              >
                {level}: {count}
              </span>
            ))}
          </div>

          {/* Sort and Export */}
          <div className="flex justify-between mb-3">
            <div className="flex gap-2 items-center">
              <span className="text-sm text-slate-400">Sort by:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="select-modern text-sm py-1.5"
              >
                <option value="frequency">Frequency</option>
                <option value="alphabetical">Alphabetical</option>
                <option value="level">CEFR Level</option>
              </select>
            </div>
            <button
              onClick={handleExport}
              className="text-sm px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors flex items-center gap-1"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Export CSV
            </button>
          </div>

          {/* Word list */}
          <div className="max-h-60 overflow-y-auto">
            <div className="flex flex-wrap gap-2">
              {sortedWords.slice(0, 100).map((word) => (
                <button
                  key={word.word}
                  onClick={(e) => onWordClick(word.word, e)}
                  className="px-2 py-1 rounded-lg text-sm cursor-pointer hover:opacity-80 transition-opacity"
                  style={{
                    backgroundColor: CEFR_COLORS[word.cefr_level] + "20",
                    borderLeft: `3px solid ${CEFR_COLORS[word.cefr_level]}`,
                  }}
                >
                  <span style={{ color: CEFR_COLORS[word.cefr_level] }}>{word.word}</span>
                  <span className="text-xs text-slate-500 ml-1">
                    ({word.frequency}x)
                  </span>
                </button>
              ))}
            </div>
            {sortedWords.length > 100 && (
              <div className="text-center text-sm text-slate-500 mt-2">
                ...and {sortedWords.length - 100} more words
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Annotated Transcript Display Component
function AnnotatedTranscript({
  text,
  annotationMap,
  selectedLevels,
  onWordClick,
}: {
  text: string;
  annotationMap: Map<string, WordAnnotation>;
  selectedLevels: Set<string>;
  onWordClick: (word: string, event: React.MouseEvent) => void;
}) {
  // Split text into words while preserving formatting
  const renderAnnotatedText = () => {
    // Split by word boundaries while keeping delimiters
    const parts = text.split(/(\b[a-zA-Z]+\b)/g);

    return parts.map((part, index) => {
      const wordLower = part.toLowerCase();
      const annotation = annotationMap.get(wordLower);

      if (annotation) {
        const isHighlighted = selectedLevels.has(annotation.cefr_level);
        const bgColor = CEFR_COLORS[annotation.cefr_level];

        return (
          <span
            key={index}
            className={`cursor-pointer transition-all duration-200 rounded px-0.5 ${
              isHighlighted ? "hover:opacity-80" : "opacity-40"
            }`}
            style={{
              backgroundColor: isHighlighted ? bgColor + "40" : "transparent",
              borderBottom: isHighlighted
                ? `2px solid ${bgColor}`
                : "none",
            }}
            onClick={(e) => onWordClick(wordLower, e)}
          >
            {part}
          </span>
        );
      }

      // Preserve whitespace and line breaks
      return <span key={index}>{part}</span>;
    });
  };

  return (
    <div className="card">
      <h3 className="font-bold mb-3 text-white flex items-center gap-2">
        <span className="text-lg">📖</span> Annotated Transcript
      </h3>
      <div className="rounded-xl p-4 bg-slate-900/50 max-h-96 overflow-y-auto text-sm leading-relaxed whitespace-pre-wrap text-slate-300">
        {renderAnnotatedText()}
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <span className="text-slate-500">Legend:</span>
        {["A1", "A2", "B1", "B2", "C1", "C2"].map((level) => (
          <span
            key={level}
            className="px-2 py-0.5 rounded"
            style={{
              backgroundColor: CEFR_COLORS[level] + "40",
              borderBottom: `2px solid ${CEFR_COLORS[level]}`,
              color: CEFR_COLORS[level],
            }}
          >
            {level}
          </span>
        ))}
      </div>
    </div>
  );
}

// Main CEFR Component
export default function CEFRComponent({ transcriptText }: CEFRComponentProps) {
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState("");
  const [analysisResult, setAnalysisResult] = useState<CEFRAnalyzeResponse | null>(null);
  const [annotationMap, setAnnotationMap] = useState<Map<string, WordAnnotation>>(new Map());
  const [selectedLevels, setSelectedLevels] = useState<Set<string>>(
    new Set(["B2", "C1", "C2"])
  );
  const [showAnnotated, setShowAnnotated] = useState(true);
  
  // Tooltip state
  const [clickedWord, setClickedWord] = useState<string | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const [wordDefinition, setWordDefinition] = useState<WordDefinition | null>(null);
  const [loadingDefinition, setLoadingDefinition] = useState(false);

  // Definition cache
  const definitionCache = useRef<Map<string, WordDefinition>>(new Map());

  // Analyze transcript
  const handleAnalyze = async () => {
    if (!transcriptText.trim()) return;

    setAnalyzing(true);
    setError("");
    setAnalysisResult(null);

    try {
      const res = await fetch(`${API_BASE}/api/cefr/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript_text: transcriptText }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Analysis failed");
      }

      const result: CEFRAnalyzeResponse = await res.json();
      setAnalysisResult(result);

      // Build annotation map for quick lookup
      const map = new Map<string, WordAnnotation>();
      result.annotations.forEach((ann) => {
        map.set(ann.word.toLowerCase(), ann);
      });
      setAnnotationMap(map);
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : "Unknown error";
      setError(errorMessage);
    } finally {
      setAnalyzing(false);
    }
  };

  // Fetch definition
  const fetchDefinition = useCallback(async (word: string) => {
    // Check cache first
    if (definitionCache.current.has(word)) {
      setWordDefinition(definitionCache.current.get(word)!);
      return;
    }

    setLoadingDefinition(true);
    try {
      const res = await fetch(`${API_BASE}/api/cefr/definition/${encodeURIComponent(word)}`);
      if (res.ok) {
        const data: WordDefinition = await res.json();
        definitionCache.current.set(word, data);
        setWordDefinition(data);
      }
    } catch {
      // Silently fail - tooltip will show without definition
    } finally {
      setLoadingDefinition(false);
    }
  }, []);



  // Handle word click
  const handleWordClick = useCallback(
    (word: string, event: React.MouseEvent) => {
      event.stopPropagation();
      // Toggle: if clicking the same word, close it; otherwise open new tooltip
      if (clickedWord === word) {
        setClickedWord(null);
        setWordDefinition(null);
      } else {
        setClickedWord(word);
        setTooltipPosition({
          x: event.clientX,
          y: event.clientY,
        });
        fetchDefinition(word);
      }
    },
    [clickedWord, fetchDefinition]
  );

  // Close tooltip on outside click
  useEffect(() => {
    const handleOutsideClick = () => {
      setClickedWord(null);
      setWordDefinition(null);
    };

    if (clickedWord) {
      document.addEventListener("click", handleOutsideClick);
      return () => document.removeEventListener("click", handleOutsideClick);
    }
  }, [clickedWord]);

  // Filter handlers
  const handleToggleLevel = (level: string) => {
    setSelectedLevels((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(level)) {
        newSet.delete(level);
      } else {
        newSet.add(level);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    setSelectedLevels(new Set(["A1", "A2", "B1", "B2", "C1", "C2"]));
  };

  const handleDeselectAll = () => {
    setSelectedLevels(new Set());
  };

  // Active word for tooltip
  const activeWord = clickedWord;
  const activeAnnotation = activeWord ? annotationMap.get(activeWord) : undefined;

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="section-title">
              <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center text-lg">📊</span>
              CEFR Vocabulary Analysis
            </h2>
            <p className="section-subtitle">
              Analyze the difficulty level of vocabulary in the transcript
            </p>
          </div>
          {analysisResult && (
            <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer">
              <input
                type="checkbox"
                checked={showAnnotated}
                onChange={(e) => setShowAnnotated(e.target.checked)}
                className="rounded bg-slate-700 border-slate-600 text-purple-500 focus:ring-purple-500"
              />
              Show annotations
            </label>
          )}
        </div>
      </div>

      {/* Analyze Button */}
      {!analysisResult && (
        <div className="card">
          <div className="flex flex-col items-center text-center py-8">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">Analyze Vocabulary Difficulty</h3>
            <p className="text-sm text-slate-400 mb-6 max-w-md">
              This will analyze every word in the transcript and classify them by CEFR level (A1-C2).
            </p>
            <button
              onClick={handleAnalyze}
              disabled={analyzing || !transcriptText.trim()}
              className="btn-primary flex items-center gap-2"
            >
              {analyzing ? (
                <>
                  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Analyzing vocabulary...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  Analyze Vocabulary Difficulty
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm animate-fadeIn">
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Results */}
      {analysisResult && (
        <div className="space-y-4 animate-fadeInUp">
          {/* Performance info */}
          <div className="text-xs text-slate-500 text-right">
            Analyzed in {(analysisResult.elapsed_ms / 1000).toFixed(2)}s
            {analysisResult.from_cache && (
              <span className="ml-2 px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-400">cached</span>
            )}
          </div>

          {/* Statistics Dashboard */}
          <StatisticsDashboard statistics={analysisResult.statistics} />

          {/* Filter Panel */}
          <FilterPanel
            selectedLevels={selectedLevels}
            onToggleLevel={handleToggleLevel}
            onSelectAll={handleSelectAll}
            onDeselectAll={handleDeselectAll}
          />

          {/* Annotated Transcript */}
          {showAnnotated && (
            <AnnotatedTranscript
              text={transcriptText}
              annotationMap={annotationMap}
              selectedLevels={selectedLevels}
              onWordClick={handleWordClick}
            />
          )}

          {/* Advanced Words Panel */}
          <AdvancedWordsPanel
            annotations={analysisResult.annotations}
            onWordClick={handleWordClick}
          />

          {/* Re-analyze button */}
          <button
            onClick={handleAnalyze}
            disabled={analyzing}
            className="btn-secondary w-full flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Re-analyze
          </button>
        </div>
      )}

      {/* Word Tooltip */}
      {activeWord && activeAnnotation && (
        <WordTooltip
          word={activeWord}
          annotation={activeAnnotation}
          definition={wordDefinition}
          isLoading={loadingDefinition}
          position={tooltipPosition}
          onClose={() => {
            setClickedWord(null);
            setWordDefinition(null);
          }}
        />
      )}
    </div>
  );
}
