import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';
import { UserStatistics } from '../types';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6366f1'];

export const NamespaceChart: React.FC<{ stats: UserStatistics }> = ({ stats }) => {
  const data = stats.namespaceStats.slice(0, 6); // Top 6
  const others = stats.namespaceStats.slice(6).reduce((acc, curr) => acc + curr.count, 0);

  if (others > 0) {
    data.push({ id: -1, name: 'Others', count: others, percentage: 0 });
  }

  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            labelLine={false}
            outerRadius={100}
            fill="#8884d8"
            dataKey="count"
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{ backgroundColor: 'var(--chart-tooltip-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)' }}
            itemStyle={{ color: 'var(--text-primary)' }}
          />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
};

export const HourlyActivityChart: React.FC<{ stats: UserStatistics, referenceDate: Date }> = ({ stats, referenceDate }) => {
  const currentLocalHour = referenceDate.getHours();

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={stats.hourlyStats}
          margin={{ top: 5, right: 10, left: -20, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
          <XAxis
            dataKey="key"
            tick={{ fill: 'var(--chart-label)', fontSize: 12 }}
            interval={3}
            tickFormatter={(val) => `${val}:00`}
          />
          <YAxis tick={{ fill: 'var(--chart-label)', fontSize: 12 }} />
          <Tooltip
            cursor={{ fill: 'var(--chart-grid)', opacity: 0.4 }}
            contentStyle={{ backgroundColor: 'var(--chart-tooltip-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)' }}
          />
          <Bar dataKey="count" radius={[4, 4, 0, 0]}>
            {stats.hourlyStats.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={entry.key === currentLocalHour ? '#f97316' : '#3b82f6'} // Orange if current hour of ref date
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export const WeeklyActivityChart: React.FC<{ stats: UserStatistics, referenceDate: Date }> = ({ stats, referenceDate }) => {
  const currentLocalDay = referenceDate.getDay();

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={stats.dayOfWeekStats}
          margin={{ top: 5, right: 10, left: -20, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: 'var(--chart-label)', fontSize: 12 }}
            tickFormatter={(val) => val.substring(0, 3)}
          />
          <YAxis tick={{ fill: 'var(--chart-label)', fontSize: 12 }} />
          <Tooltip
            cursor={{ fill: 'var(--chart-grid)', opacity: 0.4 }}
            contentStyle={{ backgroundColor: 'var(--chart-tooltip-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)' }}
          />
          <Bar dataKey="count" radius={[4, 4, 0, 0]}>
            {stats.dayOfWeekStats.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={entry.key === currentLocalDay ? '#f97316' : '#10b981'} // Orange if current day of ref date
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export const DayOfMonthChart: React.FC<{ stats: UserStatistics, referenceDate: Date }> = ({ stats, referenceDate }) => {
  const currentDayOfMonth = referenceDate.getDate();

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={stats.dayOfMonthStats}
          margin={{ top: 5, right: 10, left: -20, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
          <XAxis
            dataKey="key"
            tick={{ fill: 'var(--chart-label)', fontSize: 10 }}
            interval={2}
          />
          <YAxis tick={{ fill: 'var(--chart-label)', fontSize: 12 }} />
          <Tooltip
            cursor={{ fill: 'var(--chart-grid)', opacity: 0.4 }}
            contentStyle={{ backgroundColor: 'var(--chart-tooltip-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)' }}
          />
          <Bar dataKey="count" radius={[2, 2, 0, 0]}>
            {stats.dayOfMonthStats.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={entry.key === currentDayOfMonth ? '#f97316' : '#8b5cf6'} // Orange if current day of ref date
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export const CurrentMonthDailyChart: React.FC<{ stats: UserStatistics, referenceDate: Date }> = ({ stats, referenceDate }) => {
  const currentDayOfMonth = referenceDate.getDate();

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={stats.currentMonthDailyStats}
          margin={{ top: 5, right: 10, left: -20, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
          <XAxis
            dataKey="key"
            tick={{ fill: 'var(--chart-label)', fontSize: 10 }}
            interval={2}
          />
          <YAxis tick={{ fill: 'var(--chart-label)', fontSize: 12 }} />
          <Tooltip
            cursor={{ fill: 'var(--chart-grid)', opacity: 0.4 }}
            contentStyle={{ backgroundColor: 'var(--chart-tooltip-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)' }}
            labelFormatter={(label) => `${stats.currentMonthName} ${label}`}
          />
          <Bar dataKey="count" radius={[2, 2, 0, 0]}>
            {stats.currentMonthDailyStats.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={entry.key === currentDayOfMonth ? '#f97316' : '#ec4899'} // Orange if current day of ref date
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export const ActivityHeatmap: React.FC<{ stats: UserStatistics, referenceDate: Date }> = ({ stats, referenceDate }) => {
  const maxCount = Math.max(...stats.weekdayHourStats.map(s => s.count));
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const hours = Array.from({ length: 24 }, (_, i) => i);

  const currentLocalDay = referenceDate.getDay();
  const currentLocalHour = referenceDate.getHours();

  const getColor = (count: number) => {
    if (count === 0) return 'opacity-20 bg-slate-800';
    const intensity = Math.ceil((count / maxCount) * 10); // 1-10 scale
    // Tail wind shades from blue-900 to blue-300
    // Using a more generic approach that works with themes
    const opacities = [
      'opacity-10', 'opacity-20', 'opacity-30', 'opacity-40',
      'opacity-50', 'opacity-60', 'opacity-70', 'opacity-80',
      'opacity-90', 'opacity-100'
    ];
    return `bg-blue-500 ${opacities[Math.min(intensity, 9)]}`;
  };

  return (
    <div className="w-full overflow-x-auto">
      <div className="min-w-[600px] text-xs">
        {/* Header Row (Hours) */}
        <div className="flex">
          <div className="w-12 flex-shrink-0"></div>
          {hours.map(h => (
            <div key={h} className="flex-1 text-center text-slate-500 mb-1">{h}</div>
          ))}
        </div>

        {/* Rows (Days) */}
        {days.map((day, dIndex) => (
          <div key={day} className="flex items-center mb-1">
            <div className="w-12 text-slate-400 font-medium flex-shrink-0">{day}</div>
            {hours.map(hour => {
              const stat = stats.weekdayHourStats.find(s => s.weekday === dIndex && s.hour === hour);
              const count = stat ? stat.count : 0;
              const isCurrent = dIndex === currentLocalDay && hour === currentLocalHour;

              return (
                <div
                  key={`${day}-${hour}`}
                  className={`flex-1 aspect-square mx-[1px] rounded-sm ${getColor(count)} relative group box-border ${isCurrent ? 'border-2 border-orange-500 z-10' : ''}`}
                >
                  <div className="opacity-0 group-hover:opacity-100 absolute bottom-full left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap z-10 pointer-events-none mb-1 border border-slate-700">
                    {count} edits
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div className="flex justify-end items-center gap-2 mt-2 text-[10px] text-slate-500">
        <span>Less</span>
        <div className="flex gap-1">
          <div className="w-3 h-3 bg-slate-800 rounded-sm"></div>
          <div className="w-3 h-3 bg-blue-900/60 rounded-sm"></div>
          <div className="w-3 h-3 bg-blue-700 rounded-sm"></div>
          <div className="w-3 h-3 bg-blue-400 rounded-sm"></div>
        </div>
        <span>More</span>
      </div>
    </div>
  );
};

export const WeekdayHourlyActivityChart: React.FC<{ stats: UserStatistics, referenceDate: Date }> = ({ stats, referenceDate }) => {
  const currentLocalDay = referenceDate.getDay();
  const currentLocalHour = referenceDate.getHours();
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayName = days[currentLocalDay];

  // filter stats for this day and ensure all hours 0-23 are present
  const dayStats = Array.from({ length: 24 }, (_, h) => {
    const found = stats.weekdayHourStats.find(s => s.weekday === currentLocalDay && s.hour === h);
    return { key: h, count: found ? found.count : 0 };
  });

  return (
    <div className="w-full">
      <div className="flex items-center h-48 w-full bg-slate-900/30 rounded-xl p-4 border border-slate-700/50">
        {/* Label */}
        <div className="w-32 flex flex-col justify-center border-r border-slate-700/50 pr-4 mr-4">
          <div className="text-sm text-slate-400 font-medium">Activity on</div>
          <div className="text-xl font-bold text-orange-400">{dayName}s</div>
          <div className="text-xs text-slate-500 mt-1">Based on local time</div>
        </div>

        {/* Chart */}
        <div className="flex-grow h-full pt-2 pb-1">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dayStats}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
              <Bar dataKey="count" radius={[2, 2, 0, 0]}>
                {dayStats.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={entry.key === currentLocalHour ? '#f97316' : 'var(--accent-color)'} // Orange for current hour, Theme accent for others
                  />
                ))}
              </Bar>
              <Tooltip
                cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    return (
                      <div className="bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-slate-200 shadow-xl" style={{ backgroundColor: 'var(--chart-tooltip-bg)', borderColor: 'var(--border-color)' }}>
                        <div className="font-semibold text-slate-400 mb-1" style={{ color: 'var(--text-secondary)' }}>{dayName} @ {label}:00</div>
                        <div style={{ color: 'var(--text-primary)' }}>{payload[0].value} edits</div>
                        {label === currentLocalHour && (
                          <div className="text-orange-400 text-[10px] mt-1 font-medium">Current Hour</div>
                        )}
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <XAxis
                dataKey="key"
                tick={{ fill: 'var(--chart-label)', fontSize: 10 }}
                interval={2}
                tickFormatter={(val) => `${val}:00`}
              />
              <YAxis tick={{ fill: 'var(--chart-label)', fontSize: 10 }} width={30} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};