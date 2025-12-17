import React, { useState, useRef } from 'react';
import { Upload, X, FileJson, TrendingUp, Calendar, Clock, AlertCircle, CheckCircle, BarChart2, Hash, Trash2 } from 'lucide-react';
import { UserStatistics } from '../types';

interface ReportMetrics {
  projectedYearly: number;
  projectedMonthly: number;
  projectedDaily: number;
  isYearlyProjectedUnder: boolean;
  isMonthlyProjectedUnder: boolean;
}

interface Report {
  id: string; // generated for key
  fileName: string;
  meta: {
    generatedAt: string;
    params: {
      username: string;
      lang: string;
      startDate: string;
      endDate: string;
      analysisReferenceDate: string;
    };
  };
  metrics: ReportMetrics;
  data: UserStatistics;
}

export const ComparisonView: React.FC = () => {
  const [reports, setReports] = useState<Report[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = (files: FileList) => {
    setError(null);
    const newReports: Report[] = [];
    const promises: Promise<void>[] = [];

    Array.from(files).forEach(file => {
      if (file.type !== 'application/json' && !file.name.endsWith('.json')) {
        return;
      }

      const promise = new Promise<void>((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const content = JSON.parse(e.target?.result as string);
            // Basic validation
            if (!content.meta || !content.metrics || !content.data) {
               console.warn(`Invalid format: ${file.name}`);
               resolve();
               return;
            }
            
            newReports.push({
              id: Math.random().toString(36).substr(2, 9),
              fileName: file.name,
              ...content
            });
          } catch (err) {
            console.error(`Failed to parse ${file.name}`, err);
          }
          resolve();
        };
        reader.readAsText(file);
      });
      promises.push(promise);
    });

    Promise.all(promises).then(() => {
      if (newReports.length === 0) {
        setError("No valid JSON reports found in selection.");
      } else {
        setReports(prev => [...prev, ...newReports]);
      }
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const removeReport = (id: string) => {
    setReports(prev => prev.filter(r => r.id !== id));
  };

  // Metric Helpers
  const getBusiest = (items: { label: string, count: number }[]) => {
    if (!items || items.length === 0) return { label: 'N/A', count: 0 };
    return items.reduce((a, b) => a.count > b.count ? a : b);
  };

  const formatNumber = (num: number) => num.toLocaleString();

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Upload Area */}
      <div 
        className={`relative border-2 border-dashed rounded-xl p-8 transition-all duration-200 text-center ${
          dragActive 
            ? 'border-blue-500 bg-blue-500/10' 
            : 'border-slate-700 bg-slate-800/50 hover:bg-slate-800 hover:border-slate-600'
        }`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <input 
          ref={fileInputRef}
          type="file" 
          multiple 
          accept=".json" 
          className="hidden" 
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />
        
        <div className="flex flex-col items-center gap-4">
          <div className="p-4 bg-slate-800 rounded-full border border-slate-700 shadow-xl">
            <Upload className="w-8 h-8 text-blue-400" />
          </div>
          <div>
             <h3 className="text-lg font-medium text-white">Upload Analysis Reports</h3>
             <p className="text-slate-400 text-sm mt-1">Drag and drop JSON files here, or click to browse</p>
          </div>
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Select Files
          </button>
        </div>
        
        {error && (
            <div className="mt-4 p-2 bg-red-900/30 text-red-300 text-sm rounded border border-red-900/50 inline-block">
                {error}
            </div>
        )}
      </div>

      {/* Comparison Content */}
      {reports.length > 0 && (
        <div className="overflow-x-auto pb-4">
           <div className="min-w-max">
             <div className="grid grid-cols-[200px_repeat(auto-fit,minmax(280px,1fr))] gap-4">
                
                {/* Header Column (Labels) */}
                <div className="space-y-4 pt-[76px]">
                    <div className="h-10 flex items-center text-slate-400 font-medium text-sm border-b border-slate-800">User</div>
                    <div className="h-10 flex items-center text-slate-400 font-medium text-sm border-b border-slate-800">Analysis Date</div>
                    <div className="h-10 flex items-center text-slate-400 font-medium text-sm border-b border-slate-800">Total Edits (Sample)</div>
                    <div className="h-10 flex items-center text-slate-400 font-medium text-sm border-b border-slate-800">Pages Created</div>
                    
                    <div className="h-8"></div> {/* Spacer for Projections Header */}
                    
                    <div className="h-10 flex items-center text-slate-400 font-medium text-sm border-b border-slate-800">Projected Yearly</div>
                    <div className="h-10 flex items-center text-slate-400 font-medium text-sm border-b border-slate-800">Projected Monthly</div>
                    
                    <div className="h-8"></div> {/* Spacer for Habits Header */}

                    <div className="h-10 flex items-center text-slate-400 font-medium text-sm border-b border-slate-800">Top Namespace</div>
                    <div className="h-10 flex items-center text-slate-400 font-medium text-sm border-b border-slate-800">Busiest Day</div>
                    <div className="h-10 flex items-center text-slate-400 font-medium text-sm border-b border-slate-800">Busiest Hour</div>
                </div>

                {/* Report Columns */}
                {reports.map((report) => {
                    const topNs = report.data.namespaceStats[0];
                    const busiestDay = getBusiest(report.data.dayOfWeekStats);
                    const busiestHour = getBusiest(report.data.hourlyStats);
                    const totalCreated = (Object.values(report.data.createdArticlesByNs) as number[]).reduce((a, b) => a + b, 0);

                    return (
                        <div key={report.id} className="relative bg-slate-800 rounded-xl border border-slate-700 p-5 space-y-4 min-w-[280px]">
                            {/* Remove Button */}
                            <button 
                                onClick={() => removeReport(report.id)}
                                className="absolute top-3 right-3 p-1.5 hover:bg-slate-700 rounded-lg text-slate-500 hover:text-red-400 transition-colors"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>

                            {/* Card Header */}
                            <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-700">
                                <div className="w-10 h-10 rounded-lg bg-blue-900/30 flex items-center justify-center text-blue-400">
                                    <FileJson className="w-5 h-5" />
                                </div>
                                <div className="overflow-hidden">
                                    <h4 className="text-white font-medium truncate" title={report.fileName}>{report.fileName}</h4>
                                    <div className="text-xs text-slate-500 truncate">
                                        Generated: {new Date(report.meta.generatedAt).toLocaleDateString()}
                                    </div>
                                </div>
                            </div>
                            
                            {/* Metrics Rows */}
                            <div className="h-10 flex items-center text-slate-200 text-sm border-b border-slate-700/50">
                                <span className="font-semibold">{report.meta.params.username}</span>
                                <span className="text-slate-500 ml-2">({report.meta.params.lang})</span>
                            </div>
                            
                            <div className="h-10 flex items-center text-slate-200 text-sm border-b border-slate-700/50 gap-2">
                                <Calendar className="w-3.5 h-3.5 text-slate-500" />
                                {report.meta.params.analysisReferenceDate}
                            </div>

                            <div className="h-10 flex items-center text-slate-200 text-sm border-b border-slate-700/50 gap-2">
                                <Hash className="w-3.5 h-3.5 text-slate-500" />
                                {formatNumber(report.data.totalFetched)}
                            </div>

                            <div className="h-10 flex items-center text-slate-200 text-sm border-b border-slate-700/50 gap-2">
                                <CheckCircle className="w-3.5 h-3.5 text-green-500/70" />
                                {formatNumber(totalCreated)}
                            </div>

                            {/* Projections Section Header */}
                            <div className="h-8 flex items-end pb-1 text-xs font-semibold text-blue-400 uppercase tracking-wider">
                                Projections
                            </div>

                            <div className="h-10 flex items-center border-b border-slate-700/50 gap-2">
                                {report.metrics.isYearlyProjectedUnder ? (
                                    <AlertCircle className="w-4 h-4 text-red-400" />
                                ) : (
                                    <TrendingUp className="w-4 h-4 text-green-400" />
                                )}
                                <span className={`text-sm font-medium ${report.metrics.isYearlyProjectedUnder ? 'text-red-200' : 'text-green-200'}`}>
                                    {formatNumber(report.metrics.projectedYearly)}
                                </span>
                            </div>

                            <div className="h-10 flex items-center border-b border-slate-700/50 gap-2">
                                {report.metrics.isMonthlyProjectedUnder ? (
                                    <AlertCircle className="w-4 h-4 text-red-400" />
                                ) : (
                                    <BarChart2 className="w-4 h-4 text-green-400" />
                                )}
                                <span className={`text-sm font-medium ${report.metrics.isMonthlyProjectedUnder ? 'text-red-200' : 'text-green-200'}`}>
                                    {formatNumber(report.metrics.projectedMonthly)}
                                </span>
                            </div>

                            {/* Habits Section Header */}
                            <div className="h-8 flex items-end pb-1 text-xs font-semibold text-purple-400 uppercase tracking-wider">
                                Habits
                            </div>

                            <div className="h-10 flex items-center text-slate-200 text-sm border-b border-slate-700/50">
                                <span className="truncate" title={`${topNs.name} (${topNs.percentage.toFixed(1)}%)`}>
                                    {topNs.name} <span className="text-slate-500 text-xs">({topNs.percentage.toFixed(0)}%)</span>
                                </span>
                            </div>

                            <div className="h-10 flex items-center text-slate-200 text-sm border-b border-slate-700/50">
                                {busiestDay.label}
                            </div>

                            <div className="h-10 flex items-center text-slate-200 text-sm border-b border-slate-700/50 gap-2">
                                <Clock className="w-3.5 h-3.5 text-slate-500" />
                                {busiestHour.label}
                            </div>

                        </div>
                    );
                })}
             </div>
           </div>
        </div>
      )}
      
      {reports.length === 0 && (
         <div className="text-center py-12 text-slate-500">
            <p>Load JSON reports generated by WikiAnalytics to compare user performance side-by-side.</p>
         </div>
      )}
    </div>
  );
};