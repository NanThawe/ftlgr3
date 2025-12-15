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
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [adjustedPosition, setAdjustedPosition] = useState(position);

  useEffect(() => {
    if (tooltipRef.current) {
      const rect = tooltipRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let newX = position.x;
      let newY = position.y;

      // Adjust horizontal position
      if (rect.right > viewportWidth - 20) {
        newX = position.x - (rect.right - viewportWidth) - 40;
      }
      if (rect.left < 20) {
        newX = 20;
      }

      // Adjust vertical position
      if (rect.bottom > viewportHeight - 20) {
        newY = position.y - rect.height - 30;
      }

      setAdjustedPosition({ x: newX, y: newY });
    }
  }, [position]);

  if (!annotation) return null;

  const level = annotation.cefr_level;
  const bgColor = CEFR_COLORS[level] || "#gray";

  return (
    <div
      ref={tooltipRef}
      className="fixed z-50 bg-white rounded-lg shadow-xl border border-gray-200 p-4 max-w-sm animate-fadeIn"
      style={{
        left: adjustedPosition.x,
        top: adjustedPosition.y,
        animation: "fadeIn 0.2s ease-out",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        onClick={onClose}
        className="absolute top-2 right-2 text-gray-400 hover:text-gray-600 text-xl leading-none"
      >
        ×
      </button>

      <div className="flex items-center gap-3 mb-3">
        <span className="text-xl font-bold">{word}</span>
        {definition?.phonetic && (
          <span className="text-gray-500 text-sm">{definition.phonetic}</span>
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
        <div className="flex items-center gap-2 text-gray-500">
          <div className="animate-spin w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full"></div>
          Loading definition...
        </div>
      ) : (
        <>
          {definition?.found ? (
            <>
              {definition.part_of_speech && (
                <div className="text-sm text-gray-600 italic mb-2">
                  {definition.part_of_speech}
                </div>
              )}
              {definition.definition && (
                <div className="text-sm mb-2">
                  <span className="font-semibold">Definition: </span>
                  {definition.definition}
                </div>
              )}
              {definition.example && (
                <div className="text-sm text-gray-600 italic">
                  <span className="font-semibold not-italic">Example: </span>
                  &quot;{definition.example}&quot;
                </div>
              )}
            </>
          ) : (
            <div className="text-sm text-gray-500">
              Definition not available
            </div>
          )}
        </>
      )}

      <div className="mt-3 pt-3 border-t text-xs text-gray-500">
        <div>Frequency: {annotation.frequency}x in text</div>
        <div>Confidence: {(annotation.confidence * 100).toFixed(1)}%</div>
      </div>
    </div>
  );
}

// Statistics Dashboard Component
function StatisticsDashboard({ statistics }: { statistics: CEFRStatistics }) {
  const maxCount = Math.max(
    ...statistics.level_distribution.map((l) => l.count)
  );

  return (
    <div className="bg-white rounded-lg shadow p-4 mb-4">
      <h3 className="font-bold text-lg mb-4">📊 Vocabulary Statistics</h3>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-blue-50 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-blue-600">
            {statistics.total_words}
          </div>
          <div className="text-xs text-gray-600">Total Words</div>
        </div>
        <div className="bg-green-50 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-green-600">
            {statistics.unique_words}
          </div>
          <div className="text-xs text-gray-600">Unique Words</div>
        </div>
        <div className="bg-orange-50 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-orange-600">
            {statistics.average_difficulty.toFixed(1)}
          </div>
          <div className="text-xs text-gray-600">Avg. Difficulty</div>
        </div>
        <div
          className="rounded-lg p-3 text-center"
          style={{
            backgroundColor:
              CEFR_COLORS[statistics.approximate_level] + "40",
          }}
        >
          <div
            className="text-2xl font-bold"
            style={{ color: CEFR_COLORS[statistics.approximate_level] }}
          >
            {statistics.approximate_level}
          </div>
          <div className="text-xs text-gray-600">Overall Level</div>
        </div>
      </div>

      {/* Interpretation */}
      <div className="bg-gray-50 rounded p-3 mb-4 text-sm">
        <span className="font-semibold">📝 Assessment: </span>
        {statistics.difficulty_interpretation}
      </div>

      {/* Bar Chart */}
      <div className="mb-4">
        <h4 className="font-semibold mb-2 text-sm">Level Distribution</h4>
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
              <div className="flex-1 h-6 bg-gray-100 rounded overflow-hidden">
                <div
                  className="h-full transition-all duration-500"
                  style={{
                    width: `${maxCount > 0 ? (level.count / maxCount) * 100 : 0}%`,
                    backgroundColor: CEFR_COLORS[level.level],
                  }}
                ></div>
              </div>
              <span className="text-xs text-gray-600 w-20 text-right">
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
              <span>
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
    <div className="bg-white rounded-lg shadow p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold">🎯 Filter by Level</h3>
        <div className="flex gap-2">
          <button
            onClick={onSelectAll}
            className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
          >
            Select All
          </button>
          <button
            onClick={onDeselectAll}
            className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
          >
            Deselect All
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {levels.map((level) => (
          <label
            key={level}
            className="flex items-center gap-2 cursor-pointer px-3 py-2 rounded border transition-all"
            style={{
              backgroundColor: selectedLevels.has(level)
                ? CEFR_COLORS[level] + "40"
                : "transparent",
              borderColor: selectedLevels.has(level)
                ? CEFR_COLORS[level]
                : "#e5e7eb",
            }}
          >
            <input
              type="checkbox"
              checked={selectedLevels.has(level)}
              onChange={() => onToggleLevel(level)}
              className="rounded"
            />
            <span
              className="font-semibold text-sm"
              style={{
                color: selectedLevels.has(level)
                  ? CEFR_COLORS[level]
                  : "#6b7280",
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
    <div className="bg-white rounded-lg shadow p-4 mb-4">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between"
      >
        <h3 className="font-bold">📚 Advanced Vocabulary (B2-C2)</h3>
        <span className="text-gray-500">
          {advancedWords.length} words {isExpanded ? "▲" : "▼"}
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
                  backgroundColor: CEFR_COLORS[level] + "40",
                  color: CEFR_COLORS[level],
                }}
              >
                {level}: {count}
              </span>
            ))}
          </div>

          {/* Sort and Export */}
          <div className="flex justify-between mb-3">
            <div className="flex gap-2">
              <span className="text-sm text-gray-600">Sort by:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="text-sm border rounded px-2 py-1"
              >
                <option value="frequency">Frequency</option>
                <option value="alphabetical">Alphabetical</option>
                <option value="level">CEFR Level</option>
              </select>
            </div>
            <button
              onClick={handleExport}
              className="text-sm px-3 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200"
            >
              📥 Export CSV
            </button>
          </div>

          {/* Word list */}
          <div className="max-h-60 overflow-y-auto">
            <div className="flex flex-wrap gap-2">
              {sortedWords.slice(0, 100).map((word) => (
                <button
                  key={word.word}
                  onClick={(e) => onWordClick(word.word, e)}
                  className="px-2 py-1 rounded text-sm cursor-pointer hover:opacity-80 transition-opacity"
                  style={{
                    backgroundColor: CEFR_COLORS[word.cefr_level] + "40",
                    borderLeft: `3px solid ${CEFR_COLORS[word.cefr_level]}`,
                  }}
                >
                  {word.word}
                  <span className="text-xs text-gray-500 ml-1">
                    ({word.frequency}x)
                  </span>
                </button>
              ))}
            </div>
            {sortedWords.length > 100 && (
              <div className="text-center text-sm text-gray-500 mt-2">
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
  onWordHover,
  onWordClick,
}: {
  text: string;
  annotationMap: Map<string, WordAnnotation>;
  selectedLevels: Set<string>;
  onWordHover: (word: string | null, event: React.MouseEvent | null) => void;
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
              backgroundColor: isHighlighted ? bgColor + "60" : "transparent",
              borderBottom: isHighlighted
                ? `2px solid ${bgColor}`
                : "none",
            }}
            onMouseEnter={(e) => onWordHover(wordLower, e)}
            onMouseLeave={() => onWordHover(null, null)}
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
    <div className="bg-white rounded-lg shadow p-4 mb-4">
      <h3 className="font-bold mb-3">📖 Annotated Transcript</h3>
      <div className="border rounded p-4 bg-gray-50 max-h-96 overflow-y-auto text-sm leading-relaxed whitespace-pre-wrap">
        {renderAnnotatedText()}
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <span className="text-gray-500">Legend:</span>
        {["A1", "A2", "B1", "B2", "C1", "C2"].map((level) => (
          <span
            key={level}
            className="px-2 py-0.5 rounded"
            style={{
              backgroundColor: CEFR_COLORS[level] + "60",
              borderBottom: `2px solid ${CEFR_COLORS[level]}`,
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
    new Set(["A1", "A2", "B1", "B2", "C1", "C2"])
  );
  const [showAnnotated, setShowAnnotated] = useState(true);
  
  // Tooltip state
  const [hoveredWord, setHoveredWord] = useState<string | null>(null);
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

  // Handle word hover
  const handleWordHover = useCallback(
    (word: string | null, event: React.MouseEvent | null) => {
      if (clickedWord) return; // Don't show hover tooltip if clicked

      if (word && event) {
        setHoveredWord(word);
        setTooltipPosition({
          x: event.clientX + 10,
          y: event.clientY + 10,
        });
        fetchDefinition(word);
      } else {
        setHoveredWord(null);
        setWordDefinition(null);
      }
    },
    [clickedWord, fetchDefinition]
  );

  // Handle word click
  const handleWordClick = useCallback(
    (word: string, event: React.MouseEvent) => {
      event.stopPropagation();
      setClickedWord(word);
      setHoveredWord(null);
      setTooltipPosition({
        x: event.clientX + 10,
        y: event.clientY + 10,
      });
      fetchDefinition(word);
    },
    [fetchDefinition]
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
  const activeWord = clickedWord || hoveredWord;
  const activeAnnotation = activeWord ? annotationMap.get(activeWord) : undefined;

  return (
    <div className="mt-8 border-t pt-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold">🎓 CEFR Vocabulary Analysis</h2>
        {analysisResult && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={showAnnotated}
              onChange={(e) => setShowAnnotated(e.target.checked)}
              className="rounded"
            />
            Show annotations
          </label>
        )}
      </div>

      {/* Analyze Button */}
      {!analysisResult && (
        <button
          onClick={handleAnalyze}
          disabled={analyzing || !transcriptText.trim()}
          className="w-full py-3 bg-purple-600 text-white rounded-lg font-semibold hover:bg-purple-700 disabled:bg-gray-400 transition-colors"
        >
          {analyzing ? (
            <span className="flex items-center justify-center gap-2">
              <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full"></div>
              Analyzing vocabulary...
            </span>
          ) : (
            "🔍 Analyze Vocabulary Difficulty"
          )}
        </button>
      )}

      {/* Error */}
      {error && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Results */}
      {analysisResult && (
        <div className="mt-4">
          {/* Performance info */}
          <div className="text-xs text-gray-500 text-right mb-2">
            Analyzed in {(analysisResult.elapsed_ms / 1000).toFixed(2)}s
            {analysisResult.from_cache && " (cached)"}
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
              onWordHover={handleWordHover}
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
            className="w-full py-2 mt-4 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 disabled:bg-gray-300 transition-colors"
          >
            🔄 Re-analyze
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
            setHoveredWord(null);
            setWordDefinition(null);
          }}
        />
      )}

      {/* CSS for animation */}
      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(-5px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fadeIn {
          animation: fadeIn 0.2s ease-out;
        }
      `}</style>
    </div>
  );
}
