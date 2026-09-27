import React, { useState } from 'react';
import { Calendar, Clock, BarChart2, TrendingUp, TrendingDown, CalendarDays, ExternalLink } from 'lucide-react';
import { UserStatistics, TopPeriod } from '../types';

interface TopPeriodsPanelProps {
    stats: UserStatistics;
    username: string;
    lang: string;
    namespaceFilter: string;
}

export const TopPeriodsPanel: React.FC<TopPeriodsPanelProps> = ({ stats, username, lang, namespaceFilter }) => {
    const [limit, setLimit] = useState<number>(10);
    const [includeZeroPeriods, setIncludeZeroPeriods] = useState(false);

    const renderList = (
        title: string,
        data: TopPeriod[],
        icon: React.ReactNode,
        type: 'day' | 'week' | 'month' | 'year' | 'dayOfYear',
        tone: 'top' | 'least'
    ) => {
        const list = data.slice(0, limit);
        const accentClasses = tone === 'top'
            ? 'bg-blue-500/10 text-blue-400'
            : 'bg-violet-500/10 text-violet-400';
        const countClasses = tone === 'top' ? 'text-blue-400' : 'text-violet-400';

        return (
            <div className="flex flex-col space-y-3">
                <div className="flex items-center gap-2 px-1">
                    <div className={`p-1.5 rounded-lg ${accentClasses}`}>
                        {icon}
                    </div>
                    <h3 className="font-semibold text-slate-200">{title}</h3>
                </div>

                <div className="bg-slate-900/40 rounded-xl border border-slate-800/50 overflow-hidden">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-800/50 text-slate-400 text-[10px] uppercase tracking-wider">
                            <tr>
                                <th className="px-4 py-2 font-medium">Period</th>
                                <th className="px-4 py-2 font-medium text-right">Edits</th>
                                <th className="px-4 py-2 w-10"><span className="sr-only">Contributions</span></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/50">
                            {list.map((item, idx) => {
                                const nsParam = namespaceFilter === 'all' ? '' : `&namespace=${namespaceFilter}`;
                                let start = item.date || '';
                                let end = item.date || '';

                                if (type === 'month') {
                                    const [y, m] = item.date?.split('-') || [];
                                    const daysInMonth = new Date(parseInt(y), parseInt(m), 0).getDate();
                                    start = `${y}-${m}-01`;
                                    end = `${y}-${m}-${daysInMonth}`;
                                } else if (type === 'year') {
                                    start = `${item.label}-01-01`;
                                    end = `${item.label}-12-31`;
                                } else if (type === 'week') {
                                    // date is Monday YYYY-MM-DD
                                    const [y, m, d] = item.date?.split('-').map(Number) || [];
                                    const startDay = new Date(y, m - 1, d);
                                    const endDay = new Date(startDay);
                                    endDay.setDate(startDay.getDate() + 6);

                                    start = item.date!;
                                    end = `${endDay.getFullYear()}-${String(endDay.getMonth() + 1).padStart(2, '0')}-${String(endDay.getDate()).padStart(2, '0')}`;
                                }

                                const wikiUrl = type === 'dayOfYear'
                                    ? null
                                    : `https://${lang}.wikipedia.org/w/index.php?title=Special:Contributions&target=${encodeURIComponent(username)}${nsParam}${start ? `&start=${start}` : ''}${end ? `&end=${end}` : ''}`;

                                return (
                                    <tr key={item.label} className="hover:bg-blue-500/5 group transition-colors">
                                        <td className="px-4 py-2.5 text-slate-300 font-medium">
                                            <span className="text-slate-500 mr-2 text-[10px]">{idx + 1}.</span>
                                            {item.label}
                                        </td>
                                        <td className={`px-4 py-2.5 text-right font-mono font-bold ${countClasses}`}>
                                            {item.count.toLocaleString()}
                                        </td>
                                        <td className="px-4 py-2.5 text-right">
                                            {wikiUrl && (
                                                <a
                                                    href={wikiUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    title={`View contributions for ${item.label}`}
                                                    className="text-slate-600 hover:text-blue-400 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                                                >
                                                    <ExternalLink className="w-3.5 h-3.5" />
                                                </a>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                            {list.length === 0 && (
                                <tr>
                                    <td colSpan={3} className="px-4 py-8 text-center text-slate-500 italic">No data found</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-10">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-xl font-bold text-slate-100">Productive Periods</h2>
                    <p className="text-slate-400 text-sm">Rankings use the currently selected range and namespace</p>
                </div>

                <div className="flex items-center gap-1 bg-slate-900 border border-slate-700 rounded-lg p-1">
                    {[10, 20, 50, 100, 500].map((v) => (
                        <button
                            key={v}
                            onClick={() => setLimit(v)}
                            className={`px-3 py-1 rounded text-xs font-medium transition-all ${limit === v
                                ? 'bg-blue-600 text-white shadow-md'
                                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                                }`}
                        >
                            Show {v}
                        </button>
                    ))}
                </div>
            </div>

            <section className="space-y-6">
                <div>
                    <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-blue-400" />
                        Top Productive Periods
                    </h2>
                    <p className="text-slate-400 text-sm">Busiest active periods by total edits</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5 gap-6">
                    {renderList("Days", stats.topDays, <Calendar className="w-4 h-4" />, 'day', 'top')}
                    {renderList("Weeks", stats.topWeeks, <Clock className="w-4 h-4" />, 'week', 'top')}
                    {renderList("Months", stats.topMonths, <CalendarDays className="w-4 h-4" />, 'month', 'top')}
                    {renderList("Years", stats.topYears, <BarChart2 className="w-4 h-4" />, 'year', 'top')}
                    {renderList("Days of Year", stats.topDaysOfYear, <CalendarDays className="w-4 h-4" />, 'dayOfYear', 'top')}
                </div>
            </section>

            <section className="space-y-6 border-t border-slate-700/50 pt-8">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                            <TrendingDown className="w-5 h-5 text-violet-400" />
                            Least Productive Periods
                        </h2>
                        <p className="text-slate-400 text-sm">
                            {includeZeroPeriods
                                ? 'Quietest periods, including periods with no edits'
                                : 'Quietest active periods; periods with zero edits are excluded'}
                        </p>
                    </div>

                    <button
                        type="button"
                        role="switch"
                        aria-checked={includeZeroPeriods}
                        aria-label="Include periods with zero edits"
                        onClick={() => setIncludeZeroPeriods(current => !current)}
                        className="inline-flex items-center gap-3 self-start sm:self-auto text-sm text-slate-300"
                    >
                        <span
                            className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border transition-colors ${includeZeroPeriods
                                ? 'bg-violet-600 border-violet-500'
                                : 'bg-slate-800 border-slate-600'
                                }`}
                        >
                            <span
                                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${includeZeroPeriods
                                    ? 'translate-x-5'
                                    : 'translate-x-0.5'
                                    }`}
                            />
                        </span>
                        Include zero-edit periods
                    </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5 gap-6">
                    {renderList("Days", includeZeroPeriods ? stats.leastDaysIncludingZero : stats.leastDays, <Calendar className="w-4 h-4" />, 'day', 'least')}
                    {renderList("Weeks", includeZeroPeriods ? stats.leastWeeksIncludingZero : stats.leastWeeks, <Clock className="w-4 h-4" />, 'week', 'least')}
                    {renderList("Months", includeZeroPeriods ? stats.leastMonthsIncludingZero : stats.leastMonths, <CalendarDays className="w-4 h-4" />, 'month', 'least')}
                    {renderList("Years", includeZeroPeriods ? stats.leastYearsIncludingZero : stats.leastYears, <BarChart2 className="w-4 h-4" />, 'year', 'least')}
                    {renderList("Days of Year", includeZeroPeriods ? stats.leastDaysOfYearIncludingZero : stats.leastDaysOfYear, <CalendarDays className="w-4 h-4" />, 'dayOfYear', 'least')}
                </div>
            </section>
        </div>
    );
};
