import { WikiContrib, WikiUser, UserStatistics, Namespace, getNamespaceLabel } from '../types';

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

export const processStatistics = (user: WikiUser, contribs: WikiContrib[], referenceDate: Date = new Date()): UserStatistics => {
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

    hourCounts[hour]++;
    dayOfWeekCounts[day]++;
    dayOfMonthCounts[dayOfMonth]++;
    monthCounts[month] = (monthCounts[month] || 0) + 1;
    yearCounts[year] = (yearCounts[year] || 0) + 1;

    // Identifiers
    const monthKey = `${year}-${month}`;
    const dayKey = `${year}-${month}-${dayOfMonth}`;
    const mmddKey = `${String(month + 1).padStart(2, '0')}-${String(dayOfMonth).padStart(2, '0')}`;

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
  const currentMonthKey = `${currentYear}-${currentMonthIndex}`;
  const otherMonths = Object.keys(monthlyEditsMap).filter(k => k !== currentMonthKey);
  let avgMonthlyEdits = 0;
  if (otherMonths.length > 0) {
    const totalOther = otherMonths.reduce((sum, k) => sum + monthlyEditsMap[k], 0);
    avgMonthlyEdits = totalOther / otherMonths.length;
  }

  // 3. Generic Daily Average
  const currentDayKey = `${currentYear}-${currentMonthIndex}-${currentDayOfMonth}`;
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

  const editedPages = Object.entries(pageCounts)
    .map(([title, data]) => ({ title, count: data.count, ns: data.ns }))
    .sort((a, b) => b.count - a.count);

  return {
    user,
    totalFetched: contribs.length,
    createdArticlesByNs,
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
    currentMonthDailyStats,
    currentMonthName,
    weekdayHourStats,
    monthlyStats: [],
    nsBreakdown: nsCounts,
    firstEditInSample: contribs.length > 0 ? contribs[contribs.length - 1].timestamp : '',
    lastEditInSample: contribs.length > 0 ? contribs[0].timestamp : '',
    editedPages,
  };
};