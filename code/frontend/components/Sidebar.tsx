"use client";
import { useState } from "react";

type SidebarProps = {
  activeSection: string;
  onSectionChange: (section: string) => void;
  hasTranscript: boolean;
};

const sections = [
  { id: "transcript", label: "Transcript", icon: "📝", description: "Generate or upload transcript" },
  { id: "translation", label: "Translation & Summary", icon: "🌐", description: "Translate and summarize content" },
  { id: "cefr", label: "CEFR Analysis", icon: "📊", description: "Analyze vocabulary difficulty" },
  { id: "rag", label: "Ask Questions", icon: "💬", description: "Query the transcript with AI" },
];

export default function Sidebar({ activeSection, onSectionChange, hasTranscript }: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <>
      {/* Mobile toggle button */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 rounded-xl bg-slate-800/80 backdrop-blur-sm border border-slate-700/50 text-white hover:bg-slate-700/80 transition-all duration-300"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          {isCollapsed ? (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          )}
        </svg>
      </button>

      {/* Overlay for mobile */}
      {!isCollapsed && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 backdrop-blur-sm z-30"
          onClick={() => setIsCollapsed(true)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:sticky top-0 left-0 h-screen z-40 transition-all duration-300 ease-in-out ${
          isCollapsed ? "-translate-x-full lg:translate-x-0" : "translate-x-0"
        }`}
      >
        <div className="h-full w-72 bg-gradient-to-b from-slate-900 via-slate-900 to-slate-800 border-r border-slate-700/50 flex flex-col">
          {/* Logo section */}
          <div className="p-6 border-b border-slate-700/50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl overflow-hidden shadow-lg shadow-purple-500/25">
                <img src="/icon.png" alt="Lecture Companion" className="w-full h-full object-cover" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white">Lecture Companion</h1>
                <p className="text-xs text-slate-400">AI-Powered Learning</p>
              </div>
            </div>
          </div>

          {/* Breadcrumb / Progress indicator */}
          <div className="px-6 py-4">
            <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">Navigation</div>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span className="text-purple-400">Home</span>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              <span className="text-white">{sections.find(s => s.id === activeSection)?.label || "Transcript"}</span>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 py-2 space-y-1 overflow-y-auto">
            {sections.map((section, index) => {
              const isActive = activeSection === section.id;
              const isDisabled = section.id !== "transcript" && !hasTranscript;

              return (
                <button
                  key={section.id}
                  onClick={() => {
                    if (!isDisabled) {
                      onSectionChange(section.id);
                      setIsCollapsed(true);
                    }
                  }}
                  disabled={isDisabled}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all duration-300 group relative overflow-hidden ${
                    isActive
                      ? "bg-gradient-to-r from-purple-500/20 to-cyan-500/20 border border-purple-500/30 text-white"
                      : isDisabled
                      ? "text-slate-600 cursor-not-allowed"
                      : "text-slate-400 hover:text-white hover:bg-slate-800/50"
                  }`}
                >
                  {/* Active indicator */}
                  {isActive && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-gradient-to-b from-purple-500 to-cyan-500 rounded-r-full" />
                  )}
                  
                  {/* Step number */}
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-medium transition-all duration-300 ${
                    isActive 
                      ? "bg-gradient-to-br from-purple-500 to-cyan-500 text-white shadow-lg shadow-purple-500/25" 
                      : isDisabled
                      ? "bg-slate-800 text-slate-600"
                      : "bg-slate-800 text-slate-400 group-hover:bg-slate-700 group-hover:text-white"
                  }`}>
                    {index + 1}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span>{section.icon}</span>
                      <span className="font-medium truncate">{section.label}</span>
                    </div>
                    <p className={`text-xs truncate mt-0.5 ${isActive ? "text-slate-300" : "text-slate-500"}`}>
                      {section.description}
                    </p>
                  </div>

                  {/* Lock icon for disabled */}
                  {isDisabled && (
                    <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  )}

                  {/* Checkmark for completed */}
                  {hasTranscript && section.id === "transcript" && !isActive && (
                    <div className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center">
                      <svg className="w-3 h-3 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Footer */}
          <div className="p-4 border-t border-slate-700/50">
            <div className="rounded-xl bg-gradient-to-r from-purple-500/10 to-cyan-500/10 border border-slate-700/50 p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">✨</span>
                <span className="text-sm font-medium text-white">Pro Tip</span>
              </div>
              <p className="text-xs text-slate-400">
                Generate a transcript first to unlock all features like translation, CEFR analysis, and Q&A.
              </p>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
