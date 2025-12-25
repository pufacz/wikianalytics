import React, { useState } from 'react';
import { Calendar, Clock, BarChart2, TrendingUp, CalendarDays, ExternalLink } from 'lucide-react';
import { UserStatistics, TopPeriod } from '../types';

interface TopPeriodsPanelProps {
    stats: UserStatistics;
    username: string;
    lang: string;
    namespaceFilter: string;
}

export const TopPeriodsPanel: React.FC<TopPeriodsPanelProps> = ({ stats, username, lang, namespaceFilter }) => {
    const [limit, setLimit] = useState<number>(10);

    const renderList = (title: string, data: TopPeriod[], icon: React.ReactNode, type: 'day' | 'week' | 'month' | 'year') => {
        const list = data.slice(0, limit);

        return (
            <div className="flex flex-col space-y-3">
                <div className="flex items-center gap-2 px-1">
                    <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-400">
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
                                <th className="px-4 py-2 w-10"></th>
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

                                const wikiUrl = `https://${lang}.wikipedia.org/w/index.php?title=Special:Contributions&target=${encodeURIComponent(username)}${nsParam}${start ? `&start=${start}` : ''}${end ? `&end=${end}` : ''}`;

                                return (
                                    <tr key={item.label} className="hover:bg-blue-500/5 group transition-colors">
                                        <td className="px-4 py-2.5 text-slate-300 font-medium">
                                            <span className="text-slate-500 mr-2 text-[10px]">{idx + 1}.</span>
                                            {item.label}
                                        </td>
                                        <td className="px-4 py-2.5 text-right font-mono text-blue-400 font-bold">
                                            {item.count.toLocaleString()}
                                        </td>
                                        <td className="px-4 py-2.5 text-right">
                                            <a
                                                href={wikiUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-slate-600 hover:text-blue-400 transition-colors opacity-0 group-hover:opacity-100"
                                            >
                                                <ExternalLink className="w-3.5 h-3.5" />
                                            </a>
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
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-blue-400" />
                        Top Productive Periods
                    </h2>
                    <p className="text-slate-400 text-sm">Busiest days, weeks, months, and years</p>
                </div>

                <div className="flex items-center gap-1 bg-slate-900 border border-slate-700 rounded-lg p-1">
                    {[10, 20, 50].map((v) => (
                        <button
                            key={v}
                            onClick={() => setLimit(v)}
                            className={`px-3 py-1 rounded text-xs font-medium transition-all ${limit === v
                                ? 'bg-blue-600 text-white shadow-md'
                                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                                }`}
                        >
                            Top {v}
                        </button>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {renderList("Top Days", stats.topDays, <Calendar className="w-4 h-4" />, 'day')}
                {renderList("Top Weeks", stats.topWeeks, <Clock className="w-4 h-4" />, 'week')}
                {renderList("Top Months", stats.topMonths, <CalendarDays className="w-4 h-4" />, 'month')}
                {renderList("Top Years", stats.topYears, <BarChart2 className="w-4 h-4" />, 'year')}
            </div>
        </div>
    );
};
