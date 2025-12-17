import React, { useState } from 'react';
import { UserStatistics } from '../types';
import { generateUserAnalysis } from '../services/geminiService';
import { Sparkles, Loader2, Send, RefreshCw } from 'lucide-react';

interface Props {
  stats: UserStatistics;
  lang: string;
  startDate: string;
  endDate: string;
}

const AnalysisSection: React.FC<Props> = ({ stats, lang, startDate, endDate }) => {
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [customFocus, setCustomFocus] = useState('');

  const handleGenerate = async () => {
    setLoading(true);
    const result = await generateUserAnalysis(stats, lang, startDate, endDate, customFocus);
    setAnalysis(result);
    setLoading(false);
    setGenerated(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleGenerate();
    }
  };

  if (!generated) {
    return (
      <div className="mt-8 p-6 bg-slate-800/50 rounded-xl border border-slate-700 flex flex-col items-center justify-center text-center">
        <Sparkles className="w-12 h-12 text-purple-400 mb-4" />
        <h3 className="text-xl font-bold text-white mb-2">AI-Powered Profile Analysis</h3>
        <p className="text-slate-400 max-w-lg mb-6">
          Use Gemini to analyze {stats.user.name}'s editing patterns, rhythm, and focus areas to generate a behavioral profile based on the selected data range ({startDate} to {endDate}).
        </p>
        <button
          onClick={handleGenerate}
          disabled={loading}
          className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-semibold rounded-full transition-all shadow-lg hover:shadow-purple-500/25 disabled:opacity-70 disabled:cursor-not-allowed"
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
          {loading ? "Analyzing..." : "Generate Analysis"}
        </button>
      </div>
    );
  }

  return (
    <div className="mt-8 p-6 bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl border border-purple-500/30 relative overflow-hidden transition-all duration-500 ease-in-out">
      <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
        <Sparkles className="w-32 h-32 text-purple-500" />
      </div>
      <div className="relative z-10">
        <h3 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400 mb-4 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-purple-400" />
          Editor Profile Analysis
        </h3>
        
        {loading ? (
             <div className="flex flex-col items-center justify-center py-12 text-purple-300/80 animate-pulse">
                <Loader2 className="w-8 h-8 animate-spin mb-3" />
                <span>{customFocus ? 'Analyzing request...' : 'Regenerating profile...'}</span>
             </div>
        ) : (
            <div className="prose prose-invert max-w-none text-slate-300 leading-relaxed space-y-4 animate-fade-in">
            {analysis?.split('\n').map((paragraph, idx) => (
                paragraph.trim() && <p key={idx}>{paragraph}</p>
            ))}
            </div>
        )}

        {/* Interaction Area */}
        <div className="mt-6 pt-5 border-t border-slate-700/50">
           <div className="flex flex-col gap-2">
              <label className="text-xs text-slate-400 font-medium ml-1">
                 Ask a specific question or refine analysis:
              </label>
              <div className="flex gap-2">
                <div className="relative flex-grow">
                    <input
                        type="text"
                        value={customFocus}
                        onChange={(e) => setCustomFocus(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="e.g., 'What are their main talk page arguments?' or 'Analyze weekend activity'"
                        disabled={loading}
                        className="w-full bg-slate-900/60 border border-slate-600 rounded-lg pl-4 pr-4 py-2 text-sm text-slate-200 focus:ring-1 focus:ring-purple-500 focus:border-purple-500 outline-none placeholder:text-slate-600 transition-all disabled:opacity-50"
                    />
                </div>
                <button 
                    onClick={handleGenerate}
                    disabled={loading}
                    className="flex items-center justify-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-medium rounded-lg border border-slate-600 hover:border-slate-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed min-w-[140px]"
                >
                    {loading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
                          <span>Thinking...</span>
                        </>
                    ) : (
                        <>
                          {customFocus ? <Send className="w-4 h-4 text-purple-400" /> : <RefreshCw className="w-4 h-4 text-purple-400" />}
                          <span>{customFocus ? 'Ask AI' : 'Regenerate'}</span>
                        </>
                    )}
                </button>
              </div>
           </div>
           <div className="text-[10px] text-slate-500 mt-2 text-right">
              Generated by Gemini 2.5 Flash
           </div>
        </div>
      </div>
    </div>
  );
};

export default AnalysisSection;