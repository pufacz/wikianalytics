// API Response Types
export interface WikiContrib {
  userid: number;
  user: string;
  pageid: number;
  revid: number;
  parentid: number;
  ns: number;
  title: string;
  timestamp: string; // ISO 8601
  comment: string;
  size: number;
  new?: string; // Present if it's a new page creation
  top?: string;
}

export interface WikiUser {
  userid: number;
  name: string;
  editcount: number;
  registration: string;
  groups?: string[];
  gender?: string;
}

// Processed Statistics Types
export interface NamespaceStat {
  id: number;
  name: string;
  count: number;
  percentage: number;
}

export interface TimeStat {
  key: string | number; // Hour (0-23), Day name, etc.
  count: number;
  label: string;
}

export interface EditedPage {
  title: string;
  count: number;
  ns: number;
}

// An hour needs edits on at least this many earlier days before its average is
// reported. One or two stray sessions would otherwise show up as a peak.
export const MIN_HOUR_SAMPLES = 3;

export interface HourComparisonStat {
  key: number;     // Hour of day, 0-23
  today: number;   // Edits made at this hour on the reference date itself
  samples: number; // Earlier days that saw an edit in THIS hour — the average's divisor
  average: number; // Mean edits per sampled day, or 0 below MIN_HOUR_SAMPLES
}

export interface WeekdayHourStat {
  weekday: number; // 0-6
  hour: number;    // 0-23
  count: number;
}

export interface TopPeriod {
  label: string;
  count: number;
  date?: string; // Optional full ISO date or start date of period
}

export interface UserStatistics {
  user: WikiUser;
  totalFetched: number;
  createdArticlesByNs: Record<number, number>; // Breakdown of creations
  thisDayEdits: number;      // Edits today
  thisMonthEdits: number;
  thisYearEdits: number;

  // Averages
  avgDailyEdits: number;     // Generic average per active day (kept for reference if needed)
  avgMonthlyEdits: number;   // Average edits per active month
  averagePreviousYearsEdits: number;

  // New specific averages
  avgEditsOnCurrentWeekday: number; // e.g., Average on Mondays
  avgEditsOnCurrentDate: number;    // e.g., Average on Oct 25ths

  namespaceStats: NamespaceStat[];
  hourlyStats: TimeStat[];
  dayOfWeekStats: TimeStat[];
  dayOfMonthStats: TimeStat[];
  // Reference date's hour-by-hour edits set against the same calendar date in earlier years
  currentDateHourlyStats: HourComparisonStat[];
  currentDateAverageYears: number; // Earlier years that edited this date — the average's denominator

  // Same idea against the reference date's weekday: every earlier Wednesday, say
  currentWeekdayHourlyStats: HourComparisonStat[];
  currentWeekdayAverageDays: number; // Earlier same-weekday days that had edits
  currentMonthDailyStats: TimeStat[];
  currentMonthName: string;
  weekdayHourStats: WeekdayHourStat[];
  monthlyStats: TimeStat[];
  nsBreakdown: Record<number, number>;
  firstEditInSample: string;
  lastEditInSample: string;
  editedPages: EditedPage[];

  // Top Periods
  topDays: TopPeriod[];
  topWeeks: TopPeriod[];
  topMonths: TopPeriod[];
  topYears: TopPeriod[];
}

// Enum for Namespaces
export enum Namespace {
  MAIN = 0,
  TALK = 1,
  USER = 2,
  USER_TALK = 3,
  PROJECT = 4,
  PROJECT_TALK = 5,
  FILE = 6,
  FILE_TALK = 7,
  MEDIAWIKI = 8,
  MEDIAWIKI_TALK = 9,
  TEMPLATE = 10,
  TEMPLATE_TALK = 11,
  HELP = 12,
  HELP_TALK = 13,
  CATEGORY = 14,
  CATEGORY_TALK = 15,
}

export const NAMESPACE_LABELS: Record<number, string> = {
  0: 'Main (Article)',
  1: 'Talk',
  2: 'User',
  3: 'User talk',
  4: 'Project',
  5: 'Project talk',
  6: 'File',
  7: 'File talk',
  8: 'MediaWiki',
  9: 'MediaWiki talk',
  10: 'Template',
  11: 'Template talk',
  12: 'Help',
  13: 'Help talk',
  14: 'Category',
  15: 'Category talk',
};

export const getNamespaceLabel = (ns: number): string => {
  return NAMESPACE_LABELS[ns] || `NS:${ns}`;
};

// Category Analysis Types

// Categories as they are held for one page. `categories` is stripped of the
// namespace prefix ("Kategoria:"/"Category:"), so the names read the same
// whichever language edition the page came from.
export interface PageCategories {
  pageid: number;
  title: string;
  categories: string[];
}

// One page under a category, with the user's edit count on it.
export interface CategoryPageRef {
  pageid: number;
  title: string;
  count: number;
}

export interface CategoryStat {
  name: string;
  editCount: number; // The user's edits to pages carrying this category
  pageCount: number; // Distinct pages carrying it that the user touched
  pages: CategoryPageRef[]; // Drill-down list, busiest page first
}

// How much of the editor's article work the analysis actually speaks for.
// Only pages we hold categories for can contribute, so this is the honest
// denominator for every number in the view.
export interface CategoryCoverage {
  pagesResolved: number; // Distinct ns-0 pages we have categories for
  pagesTotal: number;    // Distinct ns-0 pages in the whole sample
  editsCovered: number;  // Edits landing on resolved pages
  editsTotal: number;    // All ns-0 edits in the sample
}

export interface CategoryAnalysis {
  categories: CategoryStat[];
  coverage: CategoryCoverage;
  filteredOut: number; // Categories the noise filter removed
}
