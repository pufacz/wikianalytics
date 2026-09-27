import { WikiContrib, WikiUser, UserStatistics, Namespace, getNamespaceLabel, MIN_HOUR_SAMPLES } from '../types';

// Increased safety limit to allow large ranges (approx 1 million edits)
const MAX_SAFETY_REQUESTS = 2000;
const BATCH_SIZE = 500; // Max allowed by standard API for non-bots

export const fetchWikiUser = async (username: string, lang: string = 'pl'): Promise<WikiUser | null> => {
  const endpoint = `https://${lang}.wikipedia.org/w/api.php`;
  const params = new URLSearchParams({
    action: 'query',
    list: 'users',
    ususers: username,
    usprop: 'editcount|registration|groups|gender',
    format: 'json',
    origin: '*',
    _: Date.now().toString(), // Cache buster
  });

  try {
    const response = await fetch(`${endpoint}?${params.toString()}`);
    const data = await response.json();
    const user = data.query?.users?.[0];

    if (!user || user.missing !== undefined) {
      return null;
    }

    return user as WikiUser;
  } catch (error) {
    console.error("Error fetching user:", error);
    throw new Error("Failed to connect to Wikipedia API");
  }
};

// Returns the UTC date (YYYY-MM-DD) of the user's oldest contribution, or null if they have none.
export const fetchFirstEditDate = async (username: string, lang: string = 'pl'): Promise<string | null> => {
  const endpoint = `https://${lang}.wikipedia.org/w/api.php`;
  const params = new URLSearchParams({
    action: 'query',
    list: 'usercontribs',
    ucuser: username,
    ucprop: 'timestamp',
    uclimit: '1',
    ucdir: 'newer',
    format: 'json',
    origin: '*',
  });

  const response = await fetch(`${endpoint}?${params.toString()}`);
  const data = await response.json();
  const oldest = data.query?.usercontribs?.[0];

  return oldest ? oldest.timestamp.split('T')[0] : null;
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const fetchUserContributions = async (
  username: string,
  lang: string = 'pl',
  startDate: string,
  endDate: string,
  onProgress?: (count: number) => void
): Promise<WikiContrib[]> => {
  const endpoint = `https://${lang}.wikipedia.org/w/api.php`;
  let contribs: WikiContrib[] = [];
  let continueToken: string | null = null;

  // Configure Time Range for API (UTC)
  // Wikipedia API expects UTC ISO strings
  const ucstart = `${endDate}T23:59:59Z`;
  const ucend = `${startDate}T00:00:00Z`;

  try {
    let requests = 0;

    do {
      const params: Record<string, string> = {
        action: 'query',
        list: 'usercontribs',
        ucuser: username,
        ucprop: 'title|timestamp|flags|size|comment|ids',
        uclimit: BATCH_SIZE.toString(),
        ucstart: ucstart,
        ucend: ucend,
        format: 'json',
        origin: '*',
        _: Date.now().toString(), // Cache buster
      };

      if (continueToken) {
        params.uccontinue = continueToken;
      }

      const queryString = new URLSearchParams(params).toString();

      // Retry Loop with Backoff
      let retries = 0;
      let success = false;
      let data: any = null;

      while (!success && retries < 3) {
        try {
          const response = await fetch(`${endpoint}?${queryString}`);
          if (response.status === 429 || response.status === 503) {
            const waitTime = Math.pow(2, retries) * 1000;
            console.warn(`Rate limited. Waiting ${waitTime}ms...`);
            await sleep(waitTime);
            retries++;
            continue;
          }
          if (!response.ok) {
            throw new Error(`HTTP Error: ${response.status}`);
          }
          data = await response.json();
          success = true;
        } catch (err) {
          if (retries === 2) throw err;
          const waitTime = Math.pow(2, retries) * 1000;
          console.warn(`Fetch error. Waiting ${waitTime}ms...`, err);
          await sleep(waitTime);
          retries++;
        }
      }

      if (!data) throw new Error("Failed to fetch data after retries.");

      if (data.error) {
        throw new Error(data.error.info);
      }

      if (data.query && data.query.usercontribs) {
        contribs = [...contribs, ...data.query.usercontribs];
      }

      if (onProgress) {
        onProgress(contribs.length);
      }

      if (data.continue && data.continue.uccontinue) {
        continueToken = data.continue.uccontinue;
      } else {
        continueToken = null;
      }

      requests++;
    } while (continueToken && requests < MAX_SAFETY_REQUESTS);

    return contribs;
  } catch (error) {
    console.error("Error fetching contributions:", error);
    throw error;
  }
};

interface StatisticsDateRange {
  startDate: string;
  endDate: string;
}

const getISOWeekParts = (date: Date) => {
  const normalized = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNumber = normalized.getUTCDay() || 7;
  normalized.setUTCDate(normalized.getUTCDate() + 4 - dayNumber);
  const weekYear = normalized.getUTCFullYear();
  const yearStart = new Date(Date.UTC(weekYear, 0, 1));
  const week = Math.ceil((((normalized.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return { weekYear, week };
};

const getISOWeekKey = (date: Date) => {
  const { weekYear, week } = getISOWeekParts(date);
  return `${weekYear}-W${String(week).padStart(2, '0')}`;
};

export const processStatistics = (
  user: WikiUser,
  contribs: WikiContrib[],
  referenceDate: Date = new Date(),
  selectedRange?: StatisticsDateRange
): UserStatistics => {
  const nsCounts: Record<number, number> = {};
  const hourCounts: Record<number, number> = {};
  const dayOfWeekCounts: Record<number, number> = {}; // 0=Sunday
  const dayOfMonthCounts: Record<number, number> = {}; // 1-31
  const currentMonthDailyCounts: Record<number, number> = {}; // 1-31 for current month
  const monthCounts: Record<number, number> = {};
  const pageCounts: Record<string, { count: number; ns: number }> = {};
  const yearCounts: Record<number, number> = {};

  // Creation stats breakdown
  const createdArticlesByNs: Record<number, number> = {};

  // Maps to calculate averages (Key -> Count)
  const monthlyEditsMap: Record<string, number> = {};
  const dailyEditsMap: Record<string, number> = {};

  // For Specific Averages
  const weekdayEditsMap: Record<number, number> = {}; // Total edits per weekday index
  const weekdayUniqueDaysMap: Record<number, Set<string>> = {}; // 0 -> Set('2023-01-01', '2023-01-08')

  const calendarDateEditsMap: Record<string, number> = {}; // "10-25" -> Total edits
  const calendarDateUniqueYearsMap: Record<string, Set<number>> = {}; // "10-25" -> Set(2021, 2022)

  // Initialize helper structures
  for (let i = 0; i < 7; i++) {
    weekdayEditsMap[i] = 0;
    weekdayUniqueDaysMap[i] = new Set();
  }

  // Matrix: weekday (0-6) -> hour (0-23) -> count
  const weekdayHourMatrix: number[][] = Array(7).fill(0).map(() => Array(24).fill(0));

  // Edits made on the reference date itself, hour by hour. Serves as the "today"
  // series for every pace chart, and is kept out of the baselines it is compared to.
  const referenceDayHourly: number[] = Array(24).fill(0);

  // Per hour, the earlier days that saw an edit in that same hour. These are the
  // divisors: an hour is averaged only over days when it was actually worked, so
  // days spent editing at other times never drag it down.
  const weekdayHourSampleDays: Set<string>[] = Array.from({ length: 24 }, () => new Set<string>());
  const dateHourSampleYears: Set<number>[] = Array.from({ length: 24 }, () => new Set<number>());
  const currentDateHourEarlier: number[] = Array(24).fill(0);
  const currentDateEarlierYears = new Set<number>();

  let thisMonthEdits = 0;

  // Initialize counters
  for (let i = 0; i < 24; i++) hourCounts[i] = 0;
  for (let i = 0; i < 7; i++) dayOfWeekCounts[i] = 0;
  for (let i = 1; i <= 31; i++) {
    dayOfMonthCounts[i] = 0;
    currentMonthDailyCounts[i] = 0;
  }

  // Use the provided reference date as "Now"
  const now = referenceDate;

  // Use LOCAL time of the reference date
  const currentMonthIndex = now.getMonth();
  const currentYear = now.getFullYear();
  const currentDayOfMonth = now.getDate();
  const currentMonthName = now.toLocaleString('default', { month: 'long' });
  const currentDayOfWeek = now.getDay();
  const currentMMDD = `${String(currentMonthIndex + 1).padStart(2, '0')}-${String(currentDayOfMonth).padStart(2, '0')}`;
  const currentDayKey = `${currentYear}-${String(currentMonthIndex + 1).padStart(2, '0')}-${String(currentDayOfMonth).padStart(2, '0')}`;
  const referenceIsoWeek = getISOWeekParts(now).week;

  let editsOnReferenceDate = 0;
  let editsInReferenceWeek = 0;
  let editsInReferenceMonth = 0;
  let createdOnReferenceDate = 0;
  let createdInReferenceWeek = 0;
  let createdInReferenceMonth = 0;

  contribs.forEach((c) => {
    // Namespace Stats
    nsCounts[c.ns] = (nsCounts[c.ns] || 0) + 1;

    // Time Stats (Using LOCAL time relative to the browser, but we group by simple date parts)
    const date = new Date(c.timestamp);
    const hour = date.getHours();
    const day = date.getDay(); // 0-6
    const dayOfMonth = date.getDate();
    const month = date.getMonth(); // 0-11
    const year = date.getFullYear();
    const isoWeek = getISOWeekParts(date).week;

    hourCounts[hour]++;
    dayOfWeekCounts[day]++;
    dayOfMonthCounts[dayOfMonth]++;
    monthCounts[month] = (monthCounts[month] || 0) + 1;
    yearCounts[year] = (yearCounts[year] || 0) + 1;

    // Identifiers
    const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
    const dayKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayOfMonth).padStart(2, '0')}`;
    const mmddKey = `${String(month + 1).padStart(2, '0')}-${String(dayOfMonth).padStart(2, '0')}`;

    if (mmddKey === currentMMDD) editsOnReferenceDate++;
    if (isoWeek === referenceIsoWeek) editsInReferenceWeek++;
    if (month === currentMonthIndex) editsInReferenceMonth++;

    // General Maps
    monthlyEditsMap[monthKey] = (monthlyEditsMap[monthKey] || 0) + 1;
    dailyEditsMap[dayKey] = (dailyEditsMap[dayKey] || 0) + 1;

    // Specific Average Calculation Helpers

    // 1. Weekday Data
    weekdayEditsMap[day] = (weekdayEditsMap[day] || 0) + 1;
    weekdayUniqueDaysMap[day].add(dayKey);

    // 2. Calendar Date Data
    calendarDateEditsMap[mmddKey] = (calendarDateEditsMap[mmddKey] || 0) + 1;
    if (!calendarDateUniqueYearsMap[mmddKey]) {
      calendarDateUniqueYearsMap[mmddKey] = new Set();
    }
    calendarDateUniqueYearsMap[mmddKey].add(year);

    // 3. Per-hour sample days for the two pace baselines
    if (day === currentDayOfWeek && dayKey !== currentDayKey) {
      weekdayHourSampleDays[hour].add(dayKey);
    }
    if (mmddKey === currentMMDD && year !== currentYear) {
      dateHourSampleYears[hour].add(year);
    }

    // 4. Hour profile for this exact calendar date
    if (mmddKey === currentMMDD) {
      if (year === currentYear) {
        referenceDayHourly[hour]++;
      } else {
        currentDateHourEarlier[hour]++;
        currentDateEarlierYears.add(year);
      }
    }

    // Heatmap Matrix
    weekdayHourMatrix[day][hour]++;

    // This Month Stats (Based on Reference Date)
    if (month === currentMonthIndex && year === currentYear) {
      thisMonthEdits++;
    }

    // Stats for "Actual Month" across all years (relative to reference month)
    if (month === currentMonthIndex) {
      currentMonthDailyCounts[dayOfMonth]++;
    }

    // Creation Stats - track by namespace
    if (c.new !== undefined) {
      createdArticlesByNs[c.ns] = (createdArticlesByNs[c.ns] || 0) + 1;
      if (mmddKey === currentMMDD) createdOnReferenceDate++;
      if (isoWeek === referenceIsoWeek) createdInReferenceWeek++;
      if (month === currentMonthIndex) createdInReferenceMonth++;
    }

    // Page Counts
    if (!pageCounts[c.title]) {
      pageCounts[c.title] = { count: 0, ns: c.ns };
    }
    pageCounts[c.title].count++;
  });

  // --- Calculations ---

  // 1. Yearly Average
  const thisYearEdits = yearCounts[currentYear] || 0;
  const previousYears = Object.keys(yearCounts)
    .map(y => parseInt(y))
    .filter(y => y < currentYear);

  let averagePreviousYearsEdits = 0;
  if (previousYears.length > 0) {
    const totalPreviousEdits = previousYears.reduce((sum, y) => sum + yearCounts[y], 0);
    averagePreviousYearsEdits = totalPreviousEdits / previousYears.length;
  }

  // 2. Monthly Average
  const currentMonthKey = `${currentYear}-${String(currentMonthIndex + 1).padStart(2, '0')}`;
  const otherMonths = Object.keys(monthlyEditsMap).filter(k => k !== currentMonthKey);
  let avgMonthlyEdits = 0;
  if (otherMonths.length > 0) {
    const totalOther = otherMonths.reduce((sum, k) => sum + monthlyEditsMap[k], 0);
    avgMonthlyEdits = totalOther / otherMonths.length;
  }

  // 3. Generic Daily Average
  const otherDays = Object.keys(dailyEditsMap).filter(k => k !== currentDayKey);
  let avgDailyEdits = 0;
  if (otherDays.length > 0) {
    const totalOther = otherDays.reduce((sum, k) => sum + dailyEditsMap[k], 0);
    avgDailyEdits = totalOther / otherDays.length;
  }

  const thisDayEdits = dailyEditsMap[currentDayKey] || 0;

  // 4. Specific Weekday Average (e.g., Average for all Mondays)
  let avgEditsOnCurrentWeekday = 0;
  const totalEditsCurrentWeekday = weekdayEditsMap[currentDayOfWeek] || 0;
  const uniqueDaysCurrentWeekday = weekdayUniqueDaysMap[currentDayOfWeek].size;

  const hasTodayData = weekdayUniqueDaysMap[currentDayOfWeek].has(currentDayKey);

  const historicWeekdayEdits = hasTodayData ? (totalEditsCurrentWeekday - thisDayEdits) : totalEditsCurrentWeekday;
  const historicWeekdayCount = hasTodayData ? (uniqueDaysCurrentWeekday - 1) : uniqueDaysCurrentWeekday;

  if (historicWeekdayCount > 0) {
    avgEditsOnCurrentWeekday = historicWeekdayEdits / historicWeekdayCount;
  }

  // Hourly pace against the same weekday. Each hour is divided by the earlier
  // days that were worked in THAT hour, not by every active day, so an hour keeps
  // its real intensity instead of being averaged down by days spent elsewhere.
  // Hour totals already exist, so the reference day is just subtracted back out.
  const currentWeekdayAverageDays = historicWeekdayCount;
  const currentWeekdayHourlyStats = Array.from({ length: 24 }, (_, h) => {
    const samples = weekdayHourSampleDays[h].size;
    const earlierEdits = weekdayHourMatrix[currentDayOfWeek][h] - referenceDayHourly[h];
    return {
      key: h,
      today: referenceDayHourly[h],
      samples,
      average: samples >= MIN_HOUR_SAMPLES ? earlierEdits / samples : 0,
    };
  });

  // 5. Specific Calendar Date Average (e.g., Average for Oct 25ths)
  let avgEditsOnCurrentDate = 0;
  const totalEditsCurrentDate = calendarDateEditsMap[currentMMDD] || 0;
  const uniqueYearsCurrentDate = calendarDateUniqueYearsMap[currentMMDD] ? calendarDateUniqueYearsMap[currentMMDD].size : 0;

  const hasTodayYearData = calendarDateUniqueYearsMap[currentMMDD] && calendarDateUniqueYearsMap[currentMMDD].has(currentYear);

  const historicDateEdits = hasTodayYearData ? (totalEditsCurrentDate - thisDayEdits) : totalEditsCurrentDate;
  const historicDateCount = hasTodayYearData ? (uniqueYearsCurrentDate - 1) : uniqueYearsCurrentDate;

  if (historicDateCount > 0) {
    avgEditsOnCurrentDate = historicDateEdits / historicDateCount;
  }

  // --- Transform Stats for Charts ---

  const namespaceStats = Object.keys(nsCounts).map((key) => {
    const id = parseInt(key);
    return {
      id,
      name: getNamespaceLabel(id),
      count: nsCounts[id],
      percentage: (nsCounts[id] / contribs.length) * 100,
    };
  }).sort((a, b) => b.count - a.count);

  const hourlyStats = Object.keys(hourCounts).map((key) => ({
    key: parseInt(key),
    label: `${key}:00`,
    count: hourCounts[parseInt(key)],
  }));

  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayOfWeekStats = Object.keys(dayOfWeekCounts).map((key) => ({
    key: parseInt(key),
    label: days[parseInt(key)],
    count: dayOfWeekCounts[parseInt(key)],
  }));

  const dayOfMonthStats = Object.keys(dayOfMonthCounts).map((key) => ({
    key: parseInt(key),
    label: key,
    count: dayOfMonthCounts[parseInt(key)],
  }));

  const currentMonthDailyStats = Object.keys(currentMonthDailyCounts).map((key) => ({
    key: parseInt(key),
    label: key,
    count: currentMonthDailyCounts[parseInt(key)],
  }));

  const weekdayHourStats = [];
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      weekdayHourStats.push({
        weekday: d,
        hour: h,
        count: weekdayHourMatrix[d][h]
      });
    }
  }

  // Hourly pace for the reference date, against the same calendar date in earlier
  // years. Same per-hour divisor rule as the weekday chart: only years that were
  // worked in that hour count. The pool below feeds the header badge.
  const currentDateAverageYears = currentDateEarlierYears.size;
  const currentDateHourlyStats = Array.from({ length: 24 }, (_, h) => {
    const samples = dateHourSampleYears[h].size;
    return {
      key: h,
      today: referenceDayHourly[h],
      samples,
      average: samples >= MIN_HOUR_SAMPLES ? currentDateHourEarlier[h] / samples : 0,
    };
  });

  const editedPages = Object.entries(pageCounts)
    .map(([title, data]) => ({ title, count: data.count, ns: data.ns }))
    .sort((a, b) => b.count - a.count);

  // Group by week
  const weekCounts: Record<string, number> = {};
  const weekStartMap: Record<string, string> = {};
  contribs.forEach(c => {
    const date = new Date(c.timestamp);
    const weekKey = getISOWeekKey(date);
    weekCounts[weekKey] = (weekCounts[weekKey] || 0) + 1;

    if (!weekStartMap[weekKey]) {
      // Find Monday of this week in local time
      const d = new Date(date);
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(d.setDate(diff));
      weekStartMap[weekKey] = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
    }
  });

  type RankedPeriod = { label: string; count: number; date?: string };
  type RankingDirection = 'most' | 'least';

  const rankPeriods = (periods: RankedPeriod[], direction: RankingDirection, limit: number = 500) => {
    return periods
      .sort((a, b) => {
        const countDifference = direction === 'most' ? b.count - a.count : a.count - b.count;
        return countDifference || (a.date || a.label).localeCompare(b.date || b.label);
      })
      .slice(0, limit);
  };

  const getWeeks = (counts: Record<string, number>, direction: RankingDirection, limit: number = 500) => {
    const periods = Object.entries(counts)
      .map(([label, count]) => ({
        label,
        count,
        date: weekStartMap[label]
      }));
    return rankPeriods(periods, direction, limit);
  };

  const getMonths = (counts: Record<string, number>, direction: RankingDirection, limit: number = 500) => {
    const periods = Object.entries(counts)
      .map(([key, count]) => {
        const [y, m] = key.split('-');
        const date = new Date(parseInt(y), parseInt(m) - 1, 1);
        const label = date.toLocaleString('default', { month: 'long', year: 'numeric' });
        return { label, count, date: `${y}-${m}-01` };
      });
    return rankPeriods(periods, direction, limit);
  };

  const getYears = (counts: Record<string, number>, direction: RankingDirection, limit: number = 500) => {
    const periods = Object.entries(counts)
      .map(([key, count]) => ({ label: key, count, date: `${key}-01-01` }));
    return rankPeriods(periods, direction, limit);
  };

  const polishDays = ['nd', 'pn', 'wt', 'sr', 'cz', 'pt', 'sb'];
  const getDayPeriods = (counts: Record<string, number>) => Object.entries(counts)
    .map(([dateKey, count]) => {
      const [year, month, day] = dateKey.split('-').map(Number);
      const date = new Date(year, month - 1, day);
      const dayName = polishDays[date.getDay()];
      return {
        label: `${dateKey} (${dayName})`,
        count,
        date: dateKey
      };
    });

  const monthAbbreviations = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const getDayOfYearPeriods = (counts: Record<string, number>) => Object.entries(counts)
    .map(([dateKey, count]) => {
      const [month, day] = dateKey.split('-').map(Number);
      return {
        label: `${monthAbbreviations[month - 1]} ${String(day).padStart(2, '0')}`,
        count,
        date: dateKey
      };
    });

  // Build complete calendars only for the optional zero-inclusive ranking. The
  // existing maps intentionally remain active-only so averages and top lists do
  // not change meaning.
  const dailyEditsIncludingZero = { ...dailyEditsMap };
  const weekCountsIncludingZero = { ...weekCounts };
  const monthlyEditsIncludingZero = { ...monthlyEditsMap };
  const yearCountsIncludingZero: Record<string, number> = { ...yearCounts };
  const calendarDateEditsIncludingZero = { ...calendarDateEditsMap };

  const parseLocalDate = (value: string | undefined) => {
    const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const [, yearText, monthText, dayText] = match;
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    const date = new Date(year, month - 1, day, 12, 0, 0);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
    return date;
  };

  const activeDateKeys = Object.keys(dailyEditsMap).sort();
  const rangeStart = parseLocalDate(selectedRange?.startDate || activeDateKeys[0]);
  const rangeEnd = parseLocalDate(selectedRange?.endDate || activeDateKeys[activeDateKeys.length - 1]);

  if (rangeStart && rangeEnd && rangeStart <= rangeEnd) {
    const cursor = new Date(rangeStart);
    while (cursor <= rangeEnd) {
      const year = cursor.getFullYear();
      const month = cursor.getMonth() + 1;
      const day = cursor.getDate();
      const monthText = String(month).padStart(2, '0');
      const dayText = String(day).padStart(2, '0');
      const dayKey = `${year}-${monthText}-${dayText}`;
      const monthKey = `${year}-${monthText}`;
      const yearKey = String(year);
      const calendarDateKey = `${monthText}-${dayText}`;
      const weekKey = getISOWeekKey(cursor);

      dailyEditsIncludingZero[dayKey] ??= 0;
      weekCountsIncludingZero[weekKey] ??= 0;
      monthlyEditsIncludingZero[monthKey] ??= 0;
      yearCountsIncludingZero[yearKey] ??= 0;
      calendarDateEditsIncludingZero[calendarDateKey] ??= 0;

      if (!weekStartMap[weekKey]) {
        const monday = new Date(cursor);
        const weekday = monday.getDay();
        monday.setDate(monday.getDate() - weekday + (weekday === 0 ? -6 : 1));
        weekStartMap[weekKey] = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
      }

      cursor.setDate(cursor.getDate() + 1);
    }
  }

  const dayPeriods = getDayPeriods(dailyEditsMap);
  const dayOfYearPeriods = getDayOfYearPeriods(calendarDateEditsMap);

  const topDays = rankPeriods([...dayPeriods], 'most');
  const topWeeks = getWeeks(weekCounts, 'most');
  const topMonths = getMonths(monthlyEditsMap, 'most');
  const topYears = getYears(yearCounts, 'most');
  const topDaysOfYear = rankPeriods([...dayOfYearPeriods], 'most');
  const leastDays = rankPeriods([...dayPeriods], 'least');
  const leastWeeks = getWeeks(weekCounts, 'least');
  const leastMonths = getMonths(monthlyEditsMap, 'least');
  const leastYears = getYears(yearCounts, 'least');
  const leastDaysOfYear = rankPeriods([...dayOfYearPeriods], 'least');
  const leastDaysIncludingZero = rankPeriods(getDayPeriods(dailyEditsIncludingZero), 'least');
  const leastWeeksIncludingZero = getWeeks(weekCountsIncludingZero, 'least');
  const leastMonthsIncludingZero = getMonths(monthlyEditsIncludingZero, 'least');
  const leastYearsIncludingZero = getYears(yearCountsIncludingZero, 'least');
  const leastDaysOfYearIncludingZero = rankPeriods(getDayOfYearPeriods(calendarDateEditsIncludingZero), 'least');

  return {
    user,
    totalFetched: contribs.length,
    createdArticlesByNs,
    editsOnReferenceDate,
    editsInReferenceWeek,
    editsInReferenceMonth,
    createdOnReferenceDate,
    createdInReferenceWeek,
    createdInReferenceMonth,
    referenceIsoWeek,
    thisDayEdits,
    thisMonthEdits,
    thisYearEdits,
    avgDailyEdits,
    avgMonthlyEdits,
    averagePreviousYearsEdits,
    avgEditsOnCurrentWeekday,
    avgEditsOnCurrentDate,
    namespaceStats,
    hourlyStats,
    dayOfWeekStats,
    dayOfMonthStats,
    currentDateHourlyStats,
    currentDateAverageYears,
    currentWeekdayHourlyStats,
    currentWeekdayAverageDays,
    currentMonthDailyStats,
    currentMonthName,
    weekdayHourStats,
    monthlyStats: [],
    nsBreakdown: nsCounts,
    firstEditInSample: contribs.length > 0 ? contribs[contribs.length - 1].timestamp : '',
    lastEditInSample: contribs.length > 0 ? contribs[0].timestamp : '',
    editedPages,
    topDays,
    topWeeks,
    topMonths,
    topYears,
    topDaysOfYear,
    leastDays,
    leastWeeks,
    leastMonths,
    leastYears,
    leastDaysOfYear,
    leastDaysIncludingZero,
    leastWeeksIncludingZero,
    leastMonthsIncludingZero,
    leastYearsIncludingZero,
    leastDaysOfYearIncludingZero
  };
};
