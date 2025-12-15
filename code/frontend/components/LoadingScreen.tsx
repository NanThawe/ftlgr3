"use client";
import { useEffect, useState } from "react";

export default function LoadingScreen() {
  const [isLoading, setIsLoading] = useState(true);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(timer);
          setTimeout(() => setIsLoading(false), 300);
          return 100;
        }
        return prev + Math.random() * 30;
      });
    }, 150);

    return () => clearInterval(timer);
  }, []);

  if (!isLoading) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
      <div className="relative">
        {/* Animated background circles */}
        <div className="absolute -inset-40 opacity-30">
          <div className="absolute top-0 left-0 w-72 h-72 bg-purple-500 rounded-full mix-blend-multiply filter blur-xl animate-blob"></div>
          <div className="absolute top-0 right-0 w-72 h-72 bg-cyan-500 rounded-full mix-blend-multiply filter blur-xl animate-blob animation-delay-2000"></div>
          <div className="absolute bottom-0 left-20 w-72 h-72 bg-pink-500 rounded-full mix-blend-multiply filter blur-xl animate-blob animation-delay-4000"></div>
        </div>

        {/* Main content */}
        <div className="relative flex flex-col items-center">
          {/* Logo/Icon animation */}
          <div className="relative mb-8">
            <div className="w-24 h-24 rounded-2xl overflow-hidden animate-pulse-slow shadow-2xl shadow-purple-500/50">
              <img src="/icon.png" alt="Lecture Companion" className="w-full h-full object-cover" />
            </div>
          </div>

          {/* Text */}
          <h1 className="text-3xl font-bold text-white mb-2 tracking-wide">
            Lecture Companion
          </h1>
          <p className="text-gray-400 mb-8 text-sm">Preparing your learning experience...</p>

          {/* Progress bar */}
          <div className="w-64 h-1.5 bg-gray-800 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-purple-500 via-cyan-500 to-purple-500 rounded-full transition-all duration-300 ease-out animate-gradient-x"
              style={{ width: `${Math.min(progress, 100)}%` }}
            ></div>
          </div>
          
          {/* Loading dots */}
          <div className="flex gap-1.5 mt-6">
            <div className="w-2 h-2 rounded-full bg-purple-500 animate-bounce" style={{ animationDelay: "0ms" }}></div>
            <div className="w-2 h-2 rounded-full bg-cyan-500 animate-bounce" style={{ animationDelay: "150ms" }}></div>
            <div className="w-2 h-2 rounded-full bg-pink-500 animate-bounce" style={{ animationDelay: "300ms" }}></div>
          </div>
        </div>
      </div>
    </div>
  );
}
