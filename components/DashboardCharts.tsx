import React from 'react';
import {
  BarChart,
  ComposedChart,
  Bar,
  Line,
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
import { UserStatistics, HourComparisonStat, MIN_HOUR_SAMPLES } from '../types';

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
    if (count === 0) return { backgroundColor: 'var(--chart-empty-cell)', opacity: 1 };
    const intensity = Math.ceil((count / maxCount) * 10); // 1-10 scale
    // Use the theme's accent color with varying opacity
    // Start from 0.4 opacity so even 1 edit is visible
    return {
      backgroundColor: 'var(--accent-color)',
      opacity: 0.3 + (Math.min(intensity, 10) / 10) * 0.7
    };
  };

  return (
    <div className="w-full overflow-x-auto">
      <div className="min-w-[600px] text-xs">
        {/* Header Row (Hours) */}
        <div className="flex">
          <div className="w-12 flex-shrink-0"></div>
          {hours.map(h => (
            <div key={h} className="flex-1 text-center mb-1" style={{ color: 'var(--text-secondary)' }}>{h}</div>
          ))}
        </div>

        {/* Rows (Days) */}
        {days.map((day, dIndex) => (
          <div key={day} className="flex items-center mb-1">
            <div className="w-12 font-medium flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>{day}</div>
            {hours.map(hour => {
              const stat = stats.weekdayHourStats.find(s => s.weekday === dIndex && s.hour === hour);
              const count = stat ? stat.count : 0;
              const isCurrent = dIndex === currentLocalDay && hour === currentLocalHour;

              return (
                <div
                  key={`${day}-${hour}`}
                  className={`flex-1 aspect-square mx-[1px] rounded-sm relative group box-border transition-all duration-300 ${isCurrent ? 'z-10 ring-2 ring-orange-500' : ''}`}
                  style={getColor(count)}
                >
                  <div
                    className="opacity-0 group-hover:opacity-100 absolute bottom-full left-1/2 -translate-x-1/2 text-[10px] px-2 py-1 rounded whitespace-nowrap z-50 pointer-events-none mb-1 border shadow-xl"
                    style={{ backgroundColor: 'var(--bg-main)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                  >
                    {count} edits
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div className="flex justify-end items-center gap-2 mt-2 text-[10px]" style={{ color: 'var(--text-secondary)' }}>
        <span>Less</span>
        <div className="flex gap-1">
          <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: 'var(--chart-empty-cell)' }}></div>
          <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: 'var(--accent-color)', opacity: 0.3 }}></div>
          <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: 'var(--accent-color)', opacity: 0.5 }}></div>
          <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: 'var(--accent-color)', opacity: 0.7 }}></div>
          <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: 'var(--accent-color)', opacity: 1 }}></div>
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
      <div
        className="flex items-center h-48 w-full rounded-xl p-4 border"
        style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}
      >
        {/* Label */}
        <div className="w-32 flex flex-col justify-center border-r pr-4 mr-4" style={{ borderColor: 'var(--border-color)' }}>
          <div className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Activity on</div>
          <div className="text-xl font-bold text-orange-400">{dayName}s</div>
          <div className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>Based on local time</div>
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
                cursor={{ fill: 'var(--chart-grid)', opacity: 0.2 }}
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    return (
                      <div className="border rounded-lg p-2 text-xs shadow-xl" style={{ backgroundColor: 'var(--chart-tooltip-bg)', borderColor: 'var(--border-color)' }}>
                        <div className="font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>{dayName} @ {label}:00</div>
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

// How much weight an hour's average actually carries, as a colour. Below
// MIN_HOUR_SAMPLES the average is suppressed to zero, so these dots sit on the
// baseline and the colour says how far short the hour fell; green means the
// figure above it is a real average.
export const sampleColor = (samples: number): string => {
  if (samples >= MIN_HOUR_SAMPLES) return '#10b981'; // emerald — reported
  if (samples <= 0) return '#ef4444';                // red — nothing to average
  if (samples === 1) return '#f97316';               // orange — a single day
  return '#eab308';                                  // yellow — still short
};

// `radius` rather than `r`: recharts clones this element with its own props,
// and an `r` of ours would be overwritten on the active dot.
const SampleDot = (props: any) => {
  const { cx, cy, payload, radius } = props;
  if (typeof cx !== 'number' || typeof cy !== 'number') return <g />;

  return (
    <circle
      cx={cx}
      cy={cy}
      r={radius ?? 3.5}
      fill={sampleColor(payload?.samples ?? 0)}
      stroke="var(--chart-tooltip-bg)"
      strokeWidth={1.5}
    />
  );
};

export const HourlyPaceChart: React.FC<{
  data: HourComparisonStat[],
  sampleSize: number,
  referenceDate: Date
}> = ({ data, sampleSize, referenceDate }) => {
  const currentLocalHour = referenceDate.getHours();
  const hasBaseline = sampleSize > 0;

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={data}
          margin={{ top: 5, right: 10, left: -20, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
          <XAxis
            dataKey="key"
            tick={{ fill: 'var(--chart-label)', fontSize: 10 }}
            interval={2}
            tickFormatter={(val) => `${val}:00`}
          />
          <YAxis tick={{ fill: 'var(--chart-label)', fontSize: 12 }} />
          <Tooltip
            cursor={{ fill: 'var(--chart-grid)', opacity: 0.4 }}
            content={({ active, payload, label }) => {
              if (!active || !payload || !payload.length) return null;
              const row = payload[0].payload as HourComparisonStat;
              const diff = row.today - row.average;
              const rated = row.samples >= MIN_HOUR_SAMPLES;

              return (
                <div className="border rounded-lg p-2 text-xs shadow-xl" style={{ backgroundColor: 'var(--chart-tooltip-bg)', borderColor: 'var(--border-color)' }}>
                  <div className="font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>{label}:00</div>
                  <div style={{ color: 'var(--text-primary)' }}>Today: {row.today}</div>
                  {!hasBaseline && (
                    <div style={{ color: 'var(--text-secondary)' }}>Nothing earlier to compare</div>
                  )}
                  {hasBaseline && rated && (
                    <>
                      <div style={{ color: 'var(--text-secondary)' }}>Average: {row.average.toFixed(1)}</div>
                      <div className="flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
                        <span className="w-2 h-2 rounded-full inline-block shrink-0" style={{ backgroundColor: sampleColor(row.samples) }} />
                        from {row.samples} days worked at this hour
                      </div>
                      <div className={`mt-1 font-medium ${diff >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {diff >= 0 ? '+' : ''}{diff.toFixed(1)} vs average
                      </div>
                    </>
                  )}
                  {hasBaseline && !rated && (
                    <div className="flex items-start gap-1.5" style={{ color: 'var(--text-secondary)' }}>
                      <span className="w-2 h-2 rounded-full inline-block shrink-0 mt-1" style={{ backgroundColor: sampleColor(row.samples) }} />
                      <span>Only {row.samples} day{row.samples === 1 ? '' : 's'} worked at this hour — too few to average</span>
                    </div>
                  )}
                  {label === currentLocalHour && (
                    <div className="text-orange-400 text-[10px] mt-1 font-medium">Current Hour</div>
                  )}
                </div>
              );
            }}
          />
          <Bar dataKey="today" radius={[4, 4, 0, 0]}>
            {data.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={entry.key === currentLocalHour ? '#f97316' : '#a855f7'} // Orange if current hour, purple for others
              />
            ))}
          </Bar>
          {hasBaseline && (
            <Line
              type="monotone"
              dataKey="average"
              stroke="#94a3b8"
              strokeWidth={2}
              strokeDasharray="4 3"
              dot={<SampleDot />}
              activeDot={<SampleDot radius={5.5} />}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};
