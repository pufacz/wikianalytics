import React, { useMemo, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { Tags, Loader2, AlertCircle, ExternalLink, Download, Eye, EyeOff, ChevronRight, ArrowDown } from 'lucide-react';
import { WikiContrib, PageCategories, CategoryStat, CategoryMetric } from '../types';
import { fetchCategoriesForPages, estimateRequests, CategoryFetchProgress } from '../services/categories';
import { selectArticlePages, computeCategoryAnalysis, rankCategories } from '../services/categoryStats';

// The batch sizes offered, both for the first pass and for each expansion.
const PAGE_LIMIT_STEPS = [200, 500, 1000];
const CHART_ROWS = 15;

// The step sizes worth offering when `remaining` pages are still unanalyzed.
// The last one is clamped to what is actually left, so the final button always
// reads as "analyze the rest" rather than promising pages that do not exist.
const availableSteps = (remaining: number): number[] => {
  const steps: number[] = [];
  for (const step of PAGE_LIMIT_STEPS) {
    const size = Math.min(step, remaining);
    if (size > 0 && !steps.includes(size)) steps.push(size);
    if (step >= remaining) break;
  }
  return steps;
};

interface CategoriesViewProps {
  contribs: WikiContrib[];
  lang: string;
  username: string;
}

const truncate = (text: string, max = 30) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

export const CategoriesView: React.FC<CategoriesViewProps> = ({ contribs, lang, username }) => {
  const [categoryMap, setCategoryMap] = useState<Map<number, PageCategories>>(new Map());
  const [analyzedLimit, setAnalyzedLimit] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<CategoryFetchProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [metric, setMetric] = useState<CategoryMetric>('edits');
  const [showAll, setShowAll] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  // Every distinct article in the sample, busiest first. The lookup walks this
  // list from the top, so the pages carrying the most edits are covered first.
  const articlePages = useMemo(() => selectArticlePages(contribs), [contribs]);

  const analysis = useMemo(
    () => computeCategoryAnalysis(contribs, categoryMap, { includeNoise: showAll }),
    [contribs, categoryMap, showAll]
  );

  const ranked = useMemo(
    () => rankCategories(analysis.categories, metric),
    [analysis, metric]
  );

  const selectedStat: CategoryStat | undefined = useMemo(
    () => ranked.find(stat => stat.name === selected),
    [ranked, selected]
  );

  const runAnalysis = async (limit: number) => {
    setLoading(true);
    setError(null);
    try {
      const pageids = articlePages.slice(0, limit).map(page => page.pageid);
      const map = await fetchCategoriesForPages(pageids, lang, setProgress);
      setCategoryMap(map);
      setAnalyzedLimit(Math.min(limit, articlePages.length));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Category lookup failed');
    } finally {
      setLoading(false);
      setProgress(null);
    }
  };

  const value = (stat: CategoryStat) => (metric === 'edits' ? stat.editCount : stat.pageCount);
  const metricLabel = metric === 'edits' ? 'Edits' : 'Pages';

  if (articlePages.length === 0) {
    return (
      <div className="backdrop-blur-md border rounded-2xl p-10 text-center shadow-xl"
        style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
        <Tags className="w-10 h-10 mx-auto mb-3 text-slate-600" />
        <p className="text-slate-400">
          No article-namespace edits in the current sample. Run an analysis on the dashboard first.
        </p>
      </div>
    );
  }

  const { coverage } = analysis;
  const editShare = coverage.editsTotal > 0 ? (coverage.editsCovered / coverage.editsTotal) * 100 : 0;
  const chartData = ranked.slice(0, CHART_ROWS).map(stat => ({
    name: stat.name,
    value: value(stat),
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <Tags className="w-5 h-5 text-blue-400" />
            Subject Areas
          </h2>
          <p className="text-slate-400 text-sm">
            Which Wikipedia categories {username || 'this editor'} contributes to most
          </p>
        </div>

        {analyzedLimit !== null && (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-slate-900 border border-slate-700 rounded-lg p-1">
              {(['edits', 'pages'] as CategoryMetric[]).map(m => (
                <button
                  key={m}
                  onClick={() => setMetric(m)}
                  className={`px-3 py-1 rounded text-xs font-medium transition-all ${metric === m
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                    }`}
                >
                  By {m}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowAll(v => !v)}
              title={showAll
                ? 'Hiding nothing — year-of-birth and maintenance categories included'
                : `${analysis.filteredOut} non-topical categories hidden`}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-slate-700 bg-slate-900 text-slate-400 hover:text-slate-200 transition-all"
            >
              {showAll ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              {showAll ? 'All categories' : 'Topical only'}
            </button>
          </div>
        )}
      </div>

      {/* Idle: nothing has been requested from Wikipedia yet */}
      {analyzedLimit === null && !loading && (
        <div className="backdrop-blur-md border rounded-2xl p-8 shadow-xl text-center space-y-4"
          style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
          <Tags className="w-10 h-10 mx-auto text-blue-400/70" />
          <div className="space-y-1">
            <p className="text-slate-200 font-medium">
              {articlePages.length.toLocaleString()} distinct articles in this sample
            </p>
            <p className="text-slate-400 text-sm max-w-lg mx-auto">
              Categories are not part of contribution data, so they have to be looked up. The lookup
              starts at the most recently edited article and works backwards, so a small pass already
              describes what this editor has been working on lately. Results are cached and shared
              across every report, so repeating this later is free.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {availableSteps(articlePages.length).map((size, idx) => (
              <button
                key={size}
                onClick={() => runAnalysis(size)}
                title={`At least ${estimateRequests(size)} requests to Wikipedia, more where articles carry long category lists`}
                className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${idx === 0
                  ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg'
                  : 'border border-slate-700 bg-slate-900 text-slate-300 hover:text-white hover:border-blue-500/50'
                  }`}
              >
                <Download className="w-4 h-4" />
                Analyze {size.toLocaleString()}
              </button>
            ))}
          </div>
          <p className="text-slate-500 text-xs">
            Newest edits first · at least one request per 50 articles
          </p>
        </div>
      )}

      {loading && (
        <div className="backdrop-blur-md border rounded-2xl p-8 shadow-xl text-center"
          style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
          <Loader2 className="w-8 h-8 mx-auto mb-3 text-blue-400 animate-spin" />
          <p className="text-slate-300 text-sm">
            {progress
              ? `Resolving categories… ${progress.resolved.toLocaleString()} / ${progress.total.toLocaleString()} pages`
              : 'Checking the local cache…'}
          </p>
          {progress && progress.fromCache > 0 && (
            <p className="text-slate-500 text-xs mt-1">
              {progress.fromCache.toLocaleString()} already cached — no request needed
            </p>
          )}
        </div>
      )}

      {error && (
        <div className="flex items-start gap-3 bg-rose-500/10 border border-rose-500/30 rounded-xl p-4 text-sm text-rose-300">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {analyzedLimit !== null && !loading && (
        <>
          {/* Coverage — the denominator behind every number below */}
          <div className="backdrop-blur-md border rounded-2xl p-5 shadow-xl space-y-3"
            style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <p className="text-sm text-slate-300">
                <span className="font-semibold text-slate-100">{coverage.pagesResolved.toLocaleString()}</span>
                {' of '}{coverage.pagesTotal.toLocaleString()} articles analyzed, covering{' '}
                <span className="font-semibold text-slate-100">{coverage.editsCovered.toLocaleString()}</span>
                {' of '}{coverage.editsTotal.toLocaleString()} article edits
                <span className="text-blue-400 font-mono ml-2">{editShare.toFixed(1)}%</span>
              </p>
              {analyzedLimit < articlePages.length && (
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <span className="text-xs text-slate-500">Go further back:</span>
                  {availableSteps(articlePages.length - analyzedLimit).map(size => (
                    <button
                      key={size}
                      onClick={() => runAnalysis(analyzedLimit + size)}
                      title={`Analyze ${size.toLocaleString()} older articles — at least ${estimateRequests(size)} more requests`}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium border border-slate-700 bg-slate-900 text-slate-300 hover:text-white hover:border-blue-500/50 transition-all"
                    >
                      <Download className="w-3.5 h-3.5" />
                      +{size.toLocaleString()}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${editShare}%` }} />
            </div>
          </div>

          {ranked.length === 0 ? (
            <div className="backdrop-blur-md border rounded-2xl p-10 text-center text-slate-400"
              style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
              No categories left to show. {analysis.filteredOut > 0 && 'Try switching to "All categories".'}
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Ranked chart */}
              <div className="backdrop-blur-md border rounded-2xl p-5 shadow-xl"
                style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
                <h3 className="font-semibold text-slate-200 mb-4">Top {chartData.length} categories by {metric}</h3>
                <div style={{ height: chartData.length * 28 + 30 }} className="w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" horizontal={false} />
                      <XAxis type="number" tick={{ fill: 'var(--chart-label)', fontSize: 11 }} />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={170}
                        tickFormatter={truncate}
                        tick={{ fill: 'var(--chart-label)', fontSize: 11 }}
                      />
                      <Tooltip
                        cursor={{ fill: 'var(--chart-grid)', opacity: 0.4 }}
                        contentStyle={{ backgroundColor: 'var(--chart-tooltip-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)' }}
                        formatter={(val: number) => [val.toLocaleString(), metricLabel]}
                        labelFormatter={(_, payload) => payload?.[0]?.payload?.name ?? ''}
                      />
                      <Bar dataKey="value" radius={[0, 4, 4, 0]} onClick={(entry: any) => setSelected(entry.name)}>
                        {chartData.map(entry => (
                          <Cell
                            key={entry.name}
                            fill={entry.name === selected ? '#f59e0b' : '#3b82f6'}
                            cursor="pointer"
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Full ranking + drill-down */}
              <div className="space-y-6">
                <div className="bg-slate-900/40 rounded-xl border border-slate-800/50 overflow-hidden">
                  <div className="max-h-96 overflow-y-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-800/50 text-slate-400 text-[10px] uppercase tracking-wider sticky top-0">
                        <tr>
                          <th className="px-4 py-2 font-medium">Category</th>
                          {([['edits', 'Edits'], ['pages', 'Pages']] as [CategoryMetric, string][]).map(([key, label]) => (
                            <th
                              key={key}
                              onClick={() => setMetric(key)}
                              title={`Sort by ${label.toLowerCase()}`}
                              className={`px-4 py-2 font-medium text-right cursor-pointer select-none transition-colors ${metric === key ? 'text-blue-400' : 'hover:text-slate-200'
                                }`}
                            >
                              <span className="inline-flex items-center gap-1">
                                {label}
                                <ArrowDown className={`w-3 h-3 ${metric === key ? 'opacity-100' : 'opacity-0'}`} />
                              </span>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/50">
                        {ranked.slice(0, 100).map((stat, idx) => (
                          <tr
                            key={stat.name}
                            onClick={() => setSelected(stat.name === selected ? null : stat.name)}
                            className={`cursor-pointer transition-colors ${stat.name === selected ? 'bg-amber-500/10' : 'hover:bg-blue-500/5'}`}
                          >
                            <td className="px-4 py-2.5 text-slate-300 font-medium">
                              <span className="text-slate-500 mr-2 text-[10px]">{idx + 1}.</span>
                              {stat.name}
                            </td>
                            <td className={`px-4 py-2.5 text-right font-mono ${metric === 'edits' ? 'text-blue-400 font-bold' : 'text-slate-400'}`}>
                              {stat.editCount.toLocaleString()}
                            </td>
                            <td className={`px-4 py-2.5 text-right font-mono ${metric === 'pages' ? 'text-blue-400 font-bold' : 'text-slate-400'}`}>
                              {stat.pageCount.toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Drill-down runs entirely on data already fetched */}
                {selectedStat && (
                  <div className="bg-slate-900/40 rounded-xl border border-slate-800/50 overflow-hidden">
                    <div className="px-4 py-3 bg-slate-800/40 flex items-center justify-between gap-2">
                      <h4 className="font-semibold text-slate-200 text-sm flex items-center gap-1.5 min-w-0">
                        <ChevronRight className="w-4 h-4 text-amber-400 shrink-0" />
                        <span className="truncate">{selectedStat.name}</span>
                      </h4>
                      <a
                        href={`https://${lang}.wikipedia.org/wiki/${encodeURIComponent(selectedStat.name)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-slate-500 hover:text-blue-400 transition-colors shrink-0"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                    <div className="max-h-80 overflow-y-auto divide-y divide-slate-800/50">
                      {selectedStat.pages.map(page => (
                        <div key={page.pageid} className="px-4 py-2.5 flex items-center justify-between gap-3 group hover:bg-blue-500/5">
                          <a
                            href={`https://${lang}.wikipedia.org/?curid=${page.pageid}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-slate-300 text-sm truncate hover:text-blue-400 transition-colors"
                          >
                            {page.title}
                          </a>
                          <span className="font-mono text-xs text-slate-400 shrink-0">
                            {page.count.toLocaleString()} edits
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
