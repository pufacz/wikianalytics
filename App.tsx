import React, { useState, FormEvent, useMemo, useEffect, useRef } from 'react';
import { Search, Globe, User, Clock, FileText, Calendar, AlertCircle, BarChart2, TrendingUp, Filter, Grid, List, RefreshCw, Info, CalendarDays, Download, LayoutDashboard, GitCompare, ArrowRight, ChevronLeft, ChevronRight, Tags } from 'lucide-react';
import { fetchWikiUser, fetchUserContributions, fetchFirstEditDate, processStatistics } from './services/wikipedia';
import { getNamespaceLabel, MIN_HOUR_SAMPLES, WikiContrib, WikiUser } from './types';
import { NamespaceChart, HourlyActivityChart, WeeklyActivityChart, DayOfMonthChart, ActivityHeatmap, CurrentMonthDailyChart, WeekdayHourlyActivityChart, HourlyPaceChart } from './components/DashboardCharts';
import AnalysisSection from './components/AnalysisSection';
import { ComparisonView } from './components/ComparisonView';
import { HistoryPanel } from './components/HistoryPanel';
import { storage } from './services/storage';
import { ErrorBoundary } from './components/ErrorBoundary';
import { TopPeriodsPanel } from './components/TopPeriodsPanel';
import { CategoriesView } from './components/CategoriesView';

// Wikipedia Groups Mapping (Standard names to readable labels)
const GROUP_LABELS: Record<string, Record<string, string>> = {
  pl: {
    sysop: 'Administrator',
    bureaucrat: 'Biurokrata',
    bot: 'Bot',
    'interface-admin': 'Adm. interfejsu',
    checkuser: 'Weryfikator',
    suppress: 'Rewizor',
    editor: 'Redaktor',
    autopatrolled: 'Autoprzeglądający',
    bureaucrat_short: 'Biurokr.',
    'extendedconfirmed': 'Rozszerzony użytkownik',
  },
  en: {
    sysop: 'Administrator',
    bureaucrat: 'Bureaucrat',
    bot: 'Bot',
    'interface-admin': 'Interface Admin',
    checkuser: 'CheckUser',
    suppress: 'Oversight',
    editor: 'Editor',
    autopatrolled: 'Autopatrolled',
    extendedconfirmed: 'Extended Confirmed',
  }
};

const UserStatusBadge: React.FC<{ group: string; lang: string }> = ({ group, lang }) => {
  // Hide basic groups
  if (['*', 'user', 'autoconfirmed'].includes(group)) return null;

  const label = GROUP_LABELS[lang]?.[group] || GROUP_LABELS['en']?.[group] || group;

  // Different styles for different levels
  let colors = 'bg-slate-700/50 text-slate-300 border-slate-600/50';
  if (group === 'sysop') colors = 'bg-rose-500/10 text-rose-400 border-rose-500/30';
  if (group === 'bureaucrat') colors = 'bg-purple-500/10 text-purple-400 border-purple-500/30';
  if (group === 'bot') colors = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
  if (group === 'checkuser' || group === 'suppress') colors = 'bg-amber-500/10 text-amber-400 border-amber-500/30';

  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase font-bold border ${colors} whitespace-nowrap`}>
      {label}
    </span>
  );
};

// Simple Tooltip Component
const InfoTooltip = ({ text }: { text: string }) => (
  <div className="group relative ml-2 inline-flex items-center">
    <Info className="w-3.5 h-3.5 text-slate-500 hover:text-slate-300 cursor-help" />
    <div className="absolute bottom-full right-[-10px] mb-2 w-72 p-3 bg-slate-900 border border-slate-600 rounded-lg text-xs text-slate-200 shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 leading-relaxed pointer-events-none whitespace-pre-wrap font-mono">
      {text}
      <div className="absolute -bottom-1 right-4 w-2 h-2 bg-slate-900 border-r border-b border-slate-600 rotate-45"></div>
    </div>
  </div>
);

export function App() {
  // Initialize state from URL
  const query = new URLSearchParams(window.location.search);

  const [activeTab, setActiveTab] = useState<'dashboard' | 'compare' | 'categories'>('dashboard');
  const [theme, setTheme] = useState(query.get('theme') || 'midnight');
  const analysisDateInputRef = useRef<HTMLInputElement>(null);
  const headerDateInputRef = useRef<HTMLInputElement>(null);

  const [username, setUsername] = useState(query.get('user') || '');
  const [lang, setLang] = useState(query.get('lang') || 'pl');
  // Default start date: January 1, 2001
  const [startDate, setStartDate] = useState(query.get('start') || '2001-01-01');
  // Default end date: Today
  const [endDate, setEndDate] = useState(query.get('end') || new Date().toISOString().split('T')[0]);

  // Reference Date: Defaults to Today. Used as "Now" for statistics.
  const [analysisDate, setAnalysisDate] = useState(query.get('ref') || new Date().toISOString().split('T')[0]);

  const [loading, setLoading] = useState(false);
  const [checkingUser, setCheckingUser] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Data State
  const [user, setUser] = useState<WikiUser | null>(null);
  const [rawContribs, setRawContribs] = useState<WikiContrib[]>([]);

  // Filters
  const [globalNamespaceFilter, setGlobalNamespaceFilter] = useState<string>('all');
  const [topPagesLimit, setTopPagesLimit] = useState<number>(10);

  // Storage State
  const [savedProfiles, setSavedProfiles] = useState<any[]>([]);
  const [currentProfileId, setCurrentProfileId] = useState<string | null>(null);
  const loadedUserKeyRef = useRef<string | null>(null);

  const [detectingFirstEdit, setDetectingFirstEdit] = useState(false);

  useEffect(() => {
    loadSavedProfiles();
  }, []);

  // Every editor or wiki change gets a fresh oldest-edit lookup. The result
  // deliberately replaces any previous From value, including a manually entered
  // one; after the lookup settles, the user can still adjust the field again.
  useEffect(() => {
    const name = username.trim();
    if (!name) {
      setDetectingFirstEdit(false);
      return;
    }

    setDetectingFirstEdit(true);
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const firstEdit = await fetchFirstEditDate(name, lang);
        if (cancelled) return;
        if (firstEdit) setStartDate(firstEdit);
      } catch {
        // Best effort only — the field stays editable by hand.
      } finally {
        if (!cancelled) setDetectingFirstEdit(false);
      }
    }, 600);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [username, lang]);

  const loadSavedProfiles = async () => {
    const list = await storage.listUsers();
    setSavedProfiles(list);
  };

  // Computed: Available Namespaces from Raw Data
  const availableNamespaces = useMemo(() => {
    if (rawContribs.length === 0) return [];
    const uniqueNs = new Set<number>(rawContribs.map(c => c.ns));
    return Array.from(uniqueNs).map((id: number) => ({
      id,
      name: getNamespaceLabel(id)
    })).sort((a, b) => a.id - b.id);
  }, [rawContribs]);

  // Computed: Filtered Contribs based on Global Filter
  const filteredContribs = useMemo(() => {
    if (globalNamespaceFilter === 'all') return rawContribs;
    const nsId = parseInt(globalNamespaceFilter);
    return rawContribs.filter(c => c.ns === nsId);
  }, [rawContribs, globalNamespaceFilter]);

  // Computed: Stats derived from Filtered Contribs and Analysis Date
  const stats = useMemo(() => {
    if (!user) return null;

    const now = new Date();
    const [y, m, d] = analysisDate.split('-').map(Number);

    // Check if selected date is today (ignoring time) to use current clock time
    // Otherwise default to end of day to show full stats for past dates
    let refDateObj: Date;
    if (now.getFullYear() === y && now.getMonth() + 1 === m && now.getDate() === d) {
      refDateObj = now;
    } else {
      refDateObj = new Date(y, m - 1, d, 23, 59, 59);
    }

    return processStatistics(user, filteredContribs, refDateObj, { startDate, endDate });
  }, [user, filteredContribs, analysisDate, startDate, endDate]);

  // The reference date spelled out for the header bar. Parsed field by field
  // rather than through Date(string): a bare "YYYY-MM-DD" parses as UTC, which
  // lands on the previous day for anyone west of Greenwich.
  const referenceDateLabel = useMemo(() => {
    const [y, m, d] = analysisDate.split('-').map(Number);
    if (!y || !m || !d) return analysisDate;

    return new Date(y, m - 1, d).toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }, [analysisDate]);

  // Initial Analysis
  const performAnalysis = async (
    targetStartDate: string,
    targetEndDate: string,
    fetchedUser: WikiUser,
    targetUsername: string,
    targetLang: string
  ) => {
    if (!targetUsername) return;

    // Sync URL
    const urlParams = new URLSearchParams(window.location.search);
    urlParams.set('user', targetUsername);
    urlParams.set('lang', targetLang);
    urlParams.set('start', targetStartDate);
    urlParams.set('end', targetEndDate);
    urlParams.set('ref', analysisDate);
    window.history.pushState({}, '', '?' + urlParams.toString());

    setLoading(true);
    setError(null);
    setUser(null);
    setRawContribs([]);
    setProgress(0);
    setGlobalNamespaceFilter('all'); // Reset filter on new search
    setActiveTab('dashboard'); // Switch to dashboard on new search

    try {
      setUser(fetchedUser);

      // Fetch contributions only after the user summary has been approved.
      const contribs = await fetchUserContributions(targetUsername, targetLang, targetStartDate, targetEndDate, (count) => {
        setProgress(count);
      });

      if (contribs.length === 0) {
        throw new Error("User found, but has no contributions in the selected range.");
      }

      // Set Raw Data (Stats are computed automatically via useMemo)
      setRawContribs(contribs);
      setTopPagesLimit(10);
      loadedUserKeyRef.current = `${targetUsername.toLowerCase()}@${targetLang}`;

    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  // Safari has no showPicker(), and Firefox only gained it in 101; focusing the
  // field is the next best thing there rather than the button doing nothing.
  const openDatePicker = (input: HTMLInputElement | null) => {
    if (!input) return;
    if (typeof input.showPicker === 'function') {
      input.showPicker();
    } else {
      input.focus();
    }
  };

  const handlePrevDate = () => {
    const d = new Date(analysisDate);
    d.setDate(d.getDate() - 1);
    setAnalysisDate(d.toISOString().split('T')[0]);
  };

  const handleNextDate = () => {
    const d = new Date(analysisDate);
    d.setDate(d.getDate() + 1);
    setAnalysisDate(d.toISOString().split('T')[0]);
  };

  const handleToday = () => {
    const today = new Date();
    setAnalysisDate(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`);
  };

  // Left/Right steps the reference date by a day and Home returns to the local
  // current date. Disabled while focus sits in an editable control (most
  // importantly the reference date's own <input type="date">, whose native
  // keyboard navigation must keep working) and while a modifier key
  // is held, so browser/OS shortcuts (e.g. Alt+Left to go back a page) pass
  // through untouched.
  useEffect(() => {
    if (activeTab !== 'dashboard') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home') return;
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;

      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) return;

      e.preventDefault();
      if (e.key === 'Home') {
        handleToday();
      } else if (e.key === 'ArrowLeft') {
        handlePrevDate();
      } else {
        handleNextDate();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, analysisDate]);

  const confirmAndPerformAnalysis = async (targetStartDate: string, targetEndDate: string) => {
    const targetUsername = username.trim();
    const targetLang = lang;
    if (!targetUsername || checkingUser) return;

    setCheckingUser(true);
    setError(null);
    try {
      const fetchedUser = await fetchWikiUser(targetUsername, targetLang);
      if (!fetchedUser) {
        setError(`User "${targetUsername}" not found on ${targetLang}.wikipedia.org`);
        return;
      }

      const approved = window.confirm(
        `User "${fetchedUser.name}" has ${fetchedUser.editcount.toLocaleString()} lifetime edits on ${targetLang}.wikipedia.org.\n\nLoad this user's contributions?`
      );
      if (!approved) return;

      await performAnalysis(targetStartDate, targetEndDate, fetchedUser, targetUsername, targetLang);
    } catch (err: any) {
      setError(err.message || "Failed to check the Wikipedia user.");
    } finally {
      setCheckingUser(false);
    }
  };

  const handleSmartAnalyze = async (e: FormEvent) => {
    e.preventDefault();
    const targetUserKey = `${username.trim().toLowerCase()}@${lang}`;
    if (!username.trim() || checkingUser || detectingFirstEdit) return;

    // Check if we are updating the CURRENTLY loaded profile
    // Logic: Same User, Same Lang
    // AND: We have data already
    if (loadedUserKeyRef.current === targetUserKey && user && rawContribs.length > 0) {
      // Incremental Update Mode
      const currentMaxTimestamp = rawContribs[0].timestamp; // Assumes desc sort

      // If target start date is BEFORE current start date, we need to fetch the gap. 
      // But for now, let's focus on "Doładowywanie nowych" (Forward update) as requested.
      // If the user wants to fetch OLDER data, it's safer to do a full re-fetch or complex merge.
      // For simplicity/safety: If StartDate changed to be OLDER -> Full Refetch.
      // If StartDate is same/newer -> Incremental Forward.

      const lastKnownEnd = new Date(currentMaxTimestamp);
      const targetEnd = new Date(endDate);

      // If we already have up to targetEnd, do nothing/re-calc
      if (lastKnownEnd >= targetEnd && startDate === query.get('start')) {
        // Just re-run processStatistics (handled by useMemo)
        return;
      }

      setLoading(true);
      setError(null);

      try {
        // 1. Fetch only NEW edits: From (Latest in DB) to (Target End)
        // We add 1 second to avoid duplicate of the last edit, or handle dedupe.
        // fetchUserContributions uses "inclusive" logic usually.
        // Let's fetch from `currentMaxTimestamp` to `endDate`

        // Safety: If the new range is effectively empty (e.g. user updated 1 min ago), API returns empty.

        let newEdits: WikiContrib[] = [];

        // Only fetch if target end is actually after our last edit
        if (targetEnd > lastKnownEnd) {
          const fetchStart = currentMaxTimestamp.split('T')[0]; // Simple date part
          // The API takes full timestamps often, but our `fetchUserContributions` 
          // currently takes `YYYY-MM-DD` strings for start/end.
          // To support precise timestamps, we might need to patch `fetchUserContributions` 
          // OR just use the date and dedupe. 
          // Strategy: Use Date Part of last edit.

          newEdits = await fetchUserContributions(username, lang, fetchStart, endDate, (c) => setProgress(c));
        }

        // 2. Merge
        const combined = [...newEdits, ...rawContribs];

        // 3. Dedupe
        const uniqueMap = new Map();
        combined.forEach(c => uniqueMap.set(c.revid, c));
        const finalContribs = Array.from(uniqueMap.values())
          .sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

        setRawContribs(finalContribs);

        // 4. Save to DB
        // We save the NEW full range.
        // The "start date" of the dataset is technically what the user asked for originally (or `startDate` state).
        await storage.save(username, lang, user, finalContribs, startDate, endDate);
        await loadSavedProfiles();

      } catch (err: any) {
        setError("Incremental update failed: " + err.message);
      } finally {
        setLoading(false);
      }

    } else {
      // Full Analysis (New User or Complete Replace)
      await confirmAndPerformAnalysis(startDate, endDate);

      // After full analysis, save if successful
      // We need to access the state... but state updates are async.
      // Better to return the data from performAnalysis or use a useEffect to save when ready.
      // Using a "Post-Fetch" saver in useEffect is risky if it triggers on every state change.
      // Let's rely on performAnalysis filling the state, then we manually save HERE if we can access the data...
      // actually `performAnalysis` sets state. We can't see the new state yet.

      // Alternative: Refactor performAnalysis to return the data.
      // Or: Use a dedicated "Success" effect.
    }
  };

  // Save after successful fresh analysis
  useEffect(() => {
    if (user && rawContribs.length > 0 && !loading) {
      // Check if this is a "fresh" load that needs saving
      // To avoid re-saving when just loading from DB, we can compare with currentProfileId
      // But saving again is cheap (overwrite).
      storage.save(user.name, lang, user, rawContribs, startDate, endDate).then(() => {
        loadSavedProfiles();
      });
    }
  }, [user, rawContribs, loading, lang]); // Dependencies need care

  const handleProfileLoad = async (u: string, l: string) => {
    const data = await storage.load(u, l);
    if (data) {
      setLoading(true);
      try {
        setUsername(data.username);
        setLang(data.lang);
        setStartDate(data.rangeStart);
        setEndDate(data.rangeEnd);
        setUser(data.user);
        setRawContribs(data.contributions);
        setCurrentProfileId(data.id);
        loadedUserKeyRef.current = `${data.username.trim().toLowerCase()}@${data.lang}`;
        setGlobalNamespaceFilter('all');
        setActiveTab('dashboard');
      } finally {
        setLoading(false);
      }
    }
  };

  const handleProfileDelete = async (u: string, l: string) => {
    if (confirm(`Delete history for ${u} (${l})?`)) {
      await storage.delete(u, l);
      await loadSavedProfiles();
      if (currentProfileId === `${u}@${l}`) {
        setCurrentProfileId(null);
        // Optional: Clear screen?
      }
    }
  };


  // Optimized Refresh: Only fetches new data from last endDate to Now
  const handleRefresh = async () => {
    if (!user || !username || rawContribs.length === 0) return;

    const today = new Date().toISOString().split('T')[0];
    const fetchStart = endDate;

    setLoading(true);
    setError(null);

    try {
      // Fetch new contributions
      const newContribs = await fetchUserContributions(username, lang, fetchStart, today, (count) => {
        setProgress(count);
      });

      // Merge new data
      const combinedContribs = [...newContribs, ...rawContribs];

      // Deduplicate
      const uniqueMap = new Map();
      combinedContribs.forEach(c => uniqueMap.set(c.revid, c));

      const uniqueContribs = Array.from(uniqueMap.values())
        .sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      // Update State
      setRawContribs(uniqueContribs);
      setEndDate(today);

    } catch (err: any) {
      setError(err.message || "Failed to refresh data.");
    } finally {
      setLoading(false);
    }
  };

  // Refresh the loaded Wikipedia data without reloading the application. Keep
  // the browser's native Ctrl+R behavior when there is no dashboard dataset to
  // update, or while another refresh is already running.
  useEffect(() => {
    const handleRefreshShortcut = (e: KeyboardEvent) => {
      const isCtrlRefresh = e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey && e.key.toLowerCase() === 'r';
      if (!isCtrlRefresh) return;
      if (activeTab !== 'dashboard' || !user || !username || rawContribs.length === 0 || loading) return;

      e.preventDefault();
      void handleRefresh();
    };

    window.addEventListener('keydown', handleRefreshShortcut);
    return () => window.removeEventListener('keydown', handleRefreshShortcut);
  }, [activeTab, user, username, rawContribs, loading, endDate, lang]);

  const handleDownloadReport = () => {
    if (!stats || !performanceMetrics) return;

    const report = {
      meta: {
        generatedAt: new Date().toISOString(),
        app: "WikiAnalytics",
        params: {
          username,
          lang,
          startDate,
          endDate,
          analysisReferenceDate: analysisDate
        }
      },
      metrics: {
        projectedYearly: performanceMetrics.projectedYearly,
        projectedMonthly: performanceMetrics.projectedMonthly,
        projectedDaily: performanceMetrics.projectedDaily,
        isYearlyProjectedUnder: performanceMetrics.isYearlyProjectedUnder,
        isMonthlyProjectedUnder: performanceMetrics.isMonthlyProjectedUnder,
      },
      data: stats
    };

    const jsonString = JSON.stringify(report, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `wiki-report-${username}-${analysisDate}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const performanceMetrics = useMemo(() => {
    if (!stats) return null;

    const [y, m, d] = analysisDate.split('-').map(Number);
    const refDate = new Date(y, m - 1, d);
    const now = new Date();
    if (now.getFullYear() === y && now.getMonth() + 1 === m && now.getDate() === d) {
      refDate.setHours(now.getHours());
    } else {
      refDate.setHours(23);
    }

    const dayOfWeekNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const currentDayName = dayOfWeekNames[refDate.getDay()];
    const currentDateName = refDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    const startOfYear = new Date(refDate.getFullYear(), 0, 0);
    const diff = Number(refDate) - Number(startOfYear);
    const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));
    const projectedYearly = Math.round((stats.thisYearEdits / Math.max(1, dayOfYear)) * 365);
    const isYearlyPositive = stats.thisYearEdits > stats.averagePreviousYearsEdits;
    const isYearlyProjectedUnder = !isYearlyPositive && (projectedYearly < stats.averagePreviousYearsEdits);

    const dayOfMonth = refDate.getDate();
    const daysInMonth = new Date(refDate.getFullYear(), refDate.getMonth() + 1, 0).getDate();
    const projectedMonthly = Math.round((stats.thisMonthEdits / Math.max(1, dayOfMonth)) * daysInMonth);
    const isMonthlyPositive = stats.thisMonthEdits > stats.avgMonthlyEdits;
    const isMonthlyProjectedUnder = !isMonthlyPositive && (projectedMonthly < stats.avgMonthlyEdits);

    const currentHour = refDate.getHours();
    const hourFactor = Math.max(0.5, (currentHour + 1));
    const projectedDaily = Math.round((stats.thisDayEdits / hourFactor) * 24);

    const isWeekdayPositive = stats.thisDayEdits > stats.avgEditsOnCurrentWeekday;
    const isDatePositive = stats.thisDayEdits > stats.avgEditsOnCurrentDate;

    const isWeekdayProjectedUnder = !isWeekdayPositive && (projectedDaily < stats.avgEditsOnCurrentWeekday);
    const isDateProjectedUnder = !isDatePositive && (projectedDaily < stats.avgEditsOnCurrentDate);

    return {
      currentDayName,
      currentDateName,
      projectedYearly,
      isYearlyPositive,
      isYearlyProjectedUnder,
      projectedMonthly,
      isMonthlyPositive,
      isMonthlyProjectedUnder,
      projectedDaily,
      isWeekdayPositive,
      isWeekdayProjectedUnder,
      isDatePositive,
      isDateProjectedUnder,
      refDate
    };
  }, [stats, analysisDate]);

  const handleCardClick = (type: 'year' | 'month' | 'day') => {
    if (!username) return;

    const [y, m, d] = analysisDate.split('-').map(Number);
    let start = '';
    let end = '';

    if (type === 'year') {
      start = `${y}-01-01`;
      end = `${y}-12-31`;
    } else if (type === 'month') {
      const daysInMonth = new Date(y, m, 0).getDate();
      start = `${y}-${String(m).padStart(2, '0')}-01`;
      end = `${y}-${String(m).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;
    } else if (type === 'day') {
      start = analysisDate;
      end = analysisDate;
    }

    const nsParam = globalNamespaceFilter === 'all' ? '' : `&namespace=${globalNamespaceFilter}`;
    const url = `https://${lang}.wikipedia.org/w/index.php?title=Special:Contributions&target=${encodeURIComponent(username)}${nsParam}&start=${start}&end=${end}`;
    window.open(url, '_blank');
  };

  const filteredPages = useMemo(() => {
    if (!stats) return [];
    return stats.editedPages.slice(0, topPagesLimit);
  }, [stats, topPagesLimit]);

  const createdArticlesCount = useMemo(() => {
    if (!stats) return 0;
    return (Object.values(stats.createdArticlesByNs) as number[]).reduce((a, b) => a + b, 0);
  }, [stats]);

  const getCardStyle = (isPositive: boolean, isProjectedUnder: boolean) => {
    if (isPositive) return 'bg-emerald-900/10 border-emerald-500/30';
    if (isProjectedUnder) return 'bg-rose-900/10 border-rose-500/30';
    return '';
  };

  const getIconColor = (isPositive: boolean, isProjectedUnder: boolean, defaultColor: string) => {
    if (isPositive) return 'text-emerald-400';
    if (isProjectedUnder) return 'text-rose-400';
    return defaultColor;
  };

  const getTextColor = (isPositive: boolean, isProjectedUnder: boolean) => {
    if (isPositive) return 'text-emerald-200';
    if (isProjectedUnder) return 'text-rose-200';
    return '';
  };

  return (
    <div
      className={`min-h-screen theme-${theme} font-sans transition-colors duration-300`}
      style={{ backgroundColor: 'var(--bg-main)', color: 'var(--text-primary)' }}
    >
      {/* Background ambient glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute -top-[10%] -left-[10%] w-[50%] h-[50%] rounded-full blur-3xl transition-colors duration-1000"
          style={{ backgroundColor: 'var(--glow-primary)' }}
        ></div>
        <div
          className="absolute top-[20%] right-[-10%] w-[40%] h-[40%] rounded-full blur-3xl transition-colors duration-1000"
          style={{ backgroundColor: 'var(--glow-secondary)' }}
        ></div>
      </div>

      <div className="max-w-7xl mx-auto p-4 md:p-8 relative z-10 space-y-6">

        {/* Sticky bar: brand, the day under analysis, and the tab switcher.
            Pulled out to the container's edges so it covers the content
            scrolling beneath it, and up by the container's own top padding so
            it starts flush against the top of the page. */}
        <header
          className="sticky top-0 z-30 -mx-4 md:-mx-8 -mt-4 md:-mt-8 px-4 md:px-8 py-3 border-b backdrop-blur-xl"
          style={{ backgroundColor: 'var(--bg-main)', borderColor: 'var(--border-color)' }}
        >
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-3">
            <div className="flex items-center gap-4 min-w-0">
              <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-indigo-400 to-teal-400 shrink-0">
                WikiAnalytics
              </h1>

              {/* The day being analysed, kept in view while the charts scroll
                  past. Only on the dashboard: the reference date has no
                  bearing on the comparison or category views. */}
              {activeTab === 'dashboard' && stats && (
                <div
                  className="relative flex items-center rounded-xl border min-w-0"
                  style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-color)' }}
                >
                  <button
                    type="button"
                    onClick={handlePrevDate}
                    title="Previous day (Left arrow)"
                    aria-label="Previous day"
                    className="px-1.5 py-2 text-slate-500 hover:text-blue-400 transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => openDatePicker(headerDateInputRef.current)}
                    title="Pick a date"
                    className="flex items-center gap-2 px-1.5 py-1 text-sm min-w-0 group"
                  >
                    <span className="hidden sm:inline font-semibold text-slate-200 truncate max-w-[12rem]">
                      {stats.user.name}
                    </span>
                    <span className="hidden sm:inline text-slate-600">·</span>
                    <span className="text-slate-300 whitespace-nowrap group-hover:text-blue-400 transition-colors">
                      {referenceDateLabel}
                    </span>
                    <span className="text-slate-600">·</span>
                    <span className="font-mono font-bold text-blue-400 whitespace-nowrap">
                      {stats.thisDayEdits.toLocaleString()}
                    </span>
                    <span className="text-slate-500 text-xs">edits</span>
                  </button>

                  {/* Backs the button above: showPicker() needs a real, rendered
                      date input, and the one in the form below is often scrolled
                      out of view by the time this bar is used. */}
                  <input
                    type="date"
                    ref={headerDateInputRef}
                    value={analysisDate}
                    onChange={(e) => setAnalysisDate(e.target.value)}
                    tabIndex={-1}
                    aria-hidden="true"
                    className="absolute left-1/2 bottom-0 w-px h-px opacity-0 pointer-events-none"
                  />

                  <button
                    type="button"
                    onClick={handleNextDate}
                    title="Next day (Right arrow)"
                    aria-label="Next day"
                    className="px-1.5 py-2 text-slate-500 hover:text-blue-400 transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            <div className="flex bg-slate-900/50 backdrop-blur rounded-xl p-1.5 border border-slate-800 shadow-lg">
              <button
                onClick={() => setActiveTab('dashboard')}
                className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-all ${activeTab === 'dashboard'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                  }`}
              >
                <LayoutDashboard className="w-4 h-4" />
                Live Analysis
              </button>
              <button
                onClick={() => setActiveTab('compare')}
                className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-all ${activeTab === 'compare'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                  }`}
              >
                <GitCompare className="w-4 h-4" />
                Compare Reports
              </button>
              <button
                onClick={() => setActiveTab('categories')}
                className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-all ${activeTab === 'categories'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                  }`}
              >
                <Tags className="w-4 h-4" />
                Subject Areas
              </button>
            </div>
          </div>
        </header>

        {/* Tagline and theme, free to scroll away */}
        <div className="flex flex-wrap justify-between items-center gap-4 -mt-2">
          <p className="text-slate-400 text-sm">Deep dive into Wikipedia editor habits</p>
          {/* Theme Selector */}
          <div
            className="flex items-center gap-1 p-1 rounded-xl border shadow-lg backdrop-blur"
            style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-color)' }}
          >
            {[
              { id: 'midnight', icon: '🌑', label: 'Midnight' },
              { id: 'forest', icon: '🌲', label: 'Forest' },
              { id: 'crimson', icon: '🌹', label: 'Crimson' },
              { id: 'nord', icon: '❄️', label: 'Nord' },
              { id: 'light', icon: '☀️', label: 'Light' }
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setTheme(t.id)}
                title={t.label}
                className={`w-8 h-8 flex items-center justify-center rounded-lg transition-all ${theme === t.id ? 'text-white shadow-md scale-110' : 'hover:bg-white/10'}`}
                style={{ backgroundColor: theme === t.id ? 'var(--accent-color)' : 'transparent', color: theme === t.id ? '#ffffff' : 'var(--text-secondary)' }}
              >
                <span className="text-sm">{t.icon}</span>
              </button>
            ))}
          </div>
        </div>

        {/* COMPARISON VIEW */}
        {activeTab === 'compare' && (
          <ComparisonView />
        )}

        {/* SUBJECT AREAS VIEW */}
        {activeTab === 'categories' && (
          <CategoriesView contribs={rawContribs} lang={lang} username={username} />
        )}

        {/* DASHBOARD VIEW */}
        {activeTab === 'dashboard' && (
          <>
            <HistoryPanel
              profiles={savedProfiles}
              currentProfileId={currentProfileId}
              onLoad={handleProfileLoad}
              onDelete={handleProfileDelete}
            />

            {/* Search Control Panel */}
            <div
              className="backdrop-blur-md border rounded-2xl p-5 shadow-xl transition-all"
              style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}
            >
              <form onSubmit={handleSmartAnalyze} className="space-y-4">

                {/* Top Row: User Definition */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                  <div className="md:col-span-6 relative">
                    <User className="absolute left-3.5 top-3 w-4 h-4 text-slate-500" />
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Enter Username..."
                      className="w-full pl-10 pr-4 py-2.5 border rounded-xl focus:ring-2 focus:outline-none text-sm transition-all"
                      style={{
                        backgroundColor: 'var(--bg-input)',
                        borderColor: 'var(--border-color)',
                        color: 'var(--text-primary)',
                        '--tw-ring-color': 'var(--accent-color)'
                      } as React.CSSProperties}
                    />
                  </div>

                  <div className="md:col-span-3 relative">
                    <Globe className="absolute left-3.5 top-3 w-4 h-4 text-slate-500" />
                    <select
                      value={lang}
                      onChange={(e) => setLang(e.target.value)}
                      className="w-full pl-10 pr-8 py-2.5 bg-slate-900/50 border border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 focus:outline-none appearance-none cursor-pointer text-sm transition-all"
                    >
                      <option value="pl">Polish (pl)</option>
                      <option value="en">English (en)</option>
                      <option value="de">German (de)</option>
                      <option value="fr">French (fr)</option>
                      <option value="es">Spanish (es)</option>
                      <option value="it">Italian (it)</option>
                      <option value="ja">Japanese (ja)</option>
                      <option value="ru">Russian (ru)</option>
                    </select>
                  </div>

                  <div className="md:col-span-3 relative">
                    <Filter className="absolute left-3.5 top-3 w-4 h-4 text-slate-500" />
                    <select
                      value={globalNamespaceFilter}
                      onChange={(e) => setGlobalNamespaceFilter(e.target.value)}
                      disabled={availableNamespaces.length === 0}
                      className="w-full pl-10 pr-8 py-2.5 bg-slate-900/50 border border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 focus:outline-none appearance-none cursor-pointer text-sm disabled:opacity-50 transition-all"
                    >
                      <option value="all">All Namespaces</option>
                      {availableNamespaces.map(ns => (
                        <option key={ns.id} value={ns.id.toString()}>{ns.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Bottom Row: Time & Actions */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                  {/* Date Range */}
                  <div className="md:col-span-6 flex items-center bg-slate-900/50 border border-slate-700 rounded-xl p-1">
                    <div className="relative flex-grow">
                      <span className="absolute left-3 top-2 text-[10px] uppercase text-slate-500 font-semibold tracking-wider">
                        From {detectingFirstEdit && <span className="text-blue-400 normal-case tracking-normal">· finding first edit…</span>}
                      </span>
                      <input
                        type="date"
                        aria-label="From"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="w-full pl-3 pt-5 pb-1 pr-2 bg-transparent border-none rounded-lg focus:ring-0 text-sm text-slate-200"
                      />
                    </div>
                    <div className="px-2 text-slate-600"><ArrowRight className="w-4 h-4" /></div>
                    <div className="relative flex-grow">
                      <span className="absolute left-3 top-2 text-[10px] uppercase text-slate-500 font-semibold tracking-wider">To</span>
                      <input
                        type="date"
                        aria-label="To"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="w-full pl-3 pt-5 pb-1 pr-2 bg-transparent border-none rounded-lg focus:ring-0 text-sm text-slate-200"
                      />
                    </div>
                  </div>

                  {/* Reference Date */}
                  <div className="md:col-span-3 relative group">
                    <span className="absolute left-3 top-1.5 text-[10px] text-slate-500 font-semibold uppercase tracking-wider z-10">
                      Analysis Ref Date
                      <span className="hidden sm:inline normal-case font-normal text-slate-600 ml-1.5" title="Use Left/Right to browse days and Home to return to today">
                        (← → browse · Home today)
                      </span>
                    </span>
                    <div className="flex items-center bg-slate-900/50 border border-slate-700 rounded-xl transition-all focus-within:ring-2 focus-within:ring-blue-500/50 focus-within:border-blue-500 overflow-hidden">
                      <button
                        type="button"
                        onClick={handlePrevDate}
                        className="pl-3 pr-1 py-1.5 text-slate-500 hover:text-blue-400 transition-colors mt-2"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <input
                        type="date"
                        aria-label="Analysis Ref Date"
                        ref={analysisDateInputRef}
                        value={analysisDate}
                        onChange={(e) => setAnalysisDate(e.target.value)}
                        className="flex-grow pt-5 pb-1.5 px-1 bg-transparent border-none focus:ring-0 text-sm text-slate-200 transition-all text-center"
                      />
                      <button
                        type="button"
                        onClick={() => openDatePicker(analysisDateInputRef.current)}
                        className="pr-2 py-1.5 text-slate-500 hover:text-blue-400 transition-colors mt-2"
                        title="Pick from calendar"
                      >
                        <Calendar className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={handleNextDate}
                        className="pr-3 pl-1 py-1.5 text-slate-500 hover:text-blue-400 transition-colors mt-2"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>

                  </div>

                  {/* Actions */}
                  <div className="md:col-span-3 flex gap-2">
                    <button
                      type="submit"
                      disabled={loading || checkingUser || detectingFirstEdit}
                      className="flex-grow bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-medium px-4 py-2.5 rounded-xl transition-all shadow-lg hover:shadow-blue-500/20 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {loading || checkingUser ? <span className="animate-spin">⌛</span> : <Search className="w-4 h-4" />}
                      {checkingUser ? 'Checking...' : 'Analyze'}
                    </button>
                    <button
                      type="button"
                      onClick={handleRefresh}
                      disabled={loading || !user}
                      title="Fetch new edits (Ctrl+R)"
                      className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 px-3 py-2.5 rounded-xl transition-all flex items-center justify-center disabled:opacity-50"
                    >
                      <RefreshCw className={`w-4 h-4 ${loading && user ? 'animate-spin' : ''}`} />
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadReport}
                      disabled={loading || !stats}
                      title="Download JSON Report"
                      className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 px-3 py-2.5 rounded-xl transition-all flex items-center justify-center disabled:opacity-50"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                  </div>
                </div>

              </form>
            </div>

            {/* Loading State */}
            {loading && (
              <div className="text-center py-20 animate-pulse">
                <div className="text-blue-400 text-xl font-medium mb-2">Analyzing Contribution History...</div>
                <p className="text-slate-500">
                  {user ? `Refreshing... Found ${progress} new edits.` : `Retrieved ${progress} contributions so far...`}
                </p>
              </div>
            )}

            {/* Error State */}
            {error && (
              <div className="bg-rose-900/20 border border-rose-500/40 text-rose-200 p-4 rounded-xl flex items-center gap-3 backdrop-blur-sm">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <p>{error}</p>
              </div>
            )}


            {/* Dashboard Content */}
            {!loading && stats && performanceMetrics && (
              <div className="space-y-6 animate-fade-in pt-4">

                <ErrorBoundary>
                  {/* ROW 1: User Profile, General Stats & Created Articles */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* User Profile Card */}
                    <div
                      className="backdrop-blur border p-6 rounded-2xl relative overflow-hidden group"
                      style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}
                    >
                      <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-2xl -translate-y-10 translate-x-10 group-hover:bg-indigo-500/10 transition-all duration-500"></div>

                      <div className="flex items-center gap-4 mb-4 relative z-10">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center text-white shadow-lg">
                          <User className="w-6 h-6" />
                        </div>
                        <div>
                          <h3 className="text-xl font-bold text-white leading-tight">{stats.user.name}</h3>
                          <div className="flex items-center gap-1.5 text-slate-500 text-xs mt-0.5">
                            <CalendarDays className="w-3 h-3" />
                            <span>Registered: {new Date(stats.user.registration).toLocaleDateString()}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 relative z-10">
                        {stats.user.groups && stats.user.groups.length > 0 ? (
                          stats.user.groups
                            .filter(g => !['*', 'user', 'autoconfirmed'].includes(g))
                            .map(g => <UserStatusBadge key={g} group={g} lang={lang} />)
                        ) : (
                          <span className="text-xs text-slate-500 italic">Standard User</span>
                        )}
                        {(stats.user.groups?.filter(g => !['*', 'user', 'autoconfirmed'].includes(g)).length === 0) && (
                          <span className="text-xs text-slate-600 italic">No special rights</span>
                        )}
                      </div>
                    </div>

                    {/* Total Edits Card */}
                    <div
                      className="backdrop-blur border p-6 rounded-2xl relative overflow-hidden group"
                      style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}
                    >
                      <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-2xl -translate-y-10 translate-x-10 group-hover:bg-blue-500/10 transition-all duration-500"></div>
                      <div className="flex items-center justify-between gap-3 mb-2 text-slate-400 text-sm font-medium relative z-10">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 bg-blue-500/10 rounded-lg"><FileText className="w-4 h-4 text-blue-400" /></div>
                          <span>Total Range Edits</span>
                        </div>
                      </div>
                      <div className="text-4xl font-bold text-white tracking-tight relative z-10">
                        {stats.totalFetched.toLocaleString()}
                      </div>
                      <div className="text-xs text-slate-500 mt-2 flex justify-between relative z-10">
                        <span>
                          {globalNamespaceFilter === 'all' ? 'In range' : `NS: ${getNamespaceLabel(parseInt(globalNamespaceFilter))}`}
                        </span>
                        {globalNamespaceFilter === 'all' && (
                          <span className="px-2 py-0.5 bg-slate-800/80 rounded-full text-slate-400">Lifetime: {stats.user.editcount.toLocaleString()}</span>
                        )}
                      </div>
                    </div>

                    {/* Pages Created Card */}
                    <div className="bg-slate-800/40 backdrop-blur border border-slate-700/50 p-6 rounded-2xl relative overflow-hidden group">
                      <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/5 rounded-full blur-2xl -translate-y-10 translate-x-10 group-hover:bg-orange-500/10 transition-all duration-500"></div>
                      <div className="flex items-center justify-between gap-3 mb-2 text-slate-400 text-sm font-medium relative z-10">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 bg-orange-500/10 rounded-lg"><Clock className="w-4 h-4 text-orange-400" /></div>
                          <span>Pages Created</span>
                        </div>
                      </div>
                      <div className="text-4xl font-bold text-white tracking-tight relative z-10">
                        {createdArticlesCount}
                      </div>
                      <div className="text-xs text-slate-500 mt-2 relative z-10">
                        {globalNamespaceFilter === 'all' ? 'In range contributions' : `In ${getNamespaceLabel(parseInt(globalNamespaceFilter))}`}
                      </div>
                    </div>
                  </div >

                  {/* All edits in recurring periods selected by the Reference Date */}
                  <div className="space-y-3">
                    <div>
                      <h2 className="text-lg font-semibold text-white">All Edits by Reference Period</h2>
                      <p className="text-xs text-slate-500">Totals across all years in the selected range, including page creations</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="bg-slate-800/40 backdrop-blur border border-slate-700/50 p-5 rounded-2xl relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-28 h-28 bg-sky-500/5 rounded-full blur-2xl -translate-y-8 translate-x-8 group-hover:bg-sky-500/10 transition-all duration-500"></div>
                        <div className="flex items-center justify-between gap-3 mb-3 text-slate-400 text-sm font-medium relative z-10">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="p-1.5 bg-sky-500/10 rounded-lg"><CalendarDays className="w-4 h-4 text-sky-400" /></div>
                            <span className="truncate">Edits on {performanceMetrics.currentDateName}</span>
                          </div>
                          <InfoTooltip text={`All edits made on ${performanceMetrics.currentDateName} in every year covered by the selected range, including edits that created new pages. Timestamps use your browser's local time.`} />
                        </div>
                        <div className="text-3xl font-bold text-white tracking-tight relative z-10">
                          {stats.editsOnReferenceDate.toLocaleString()}
                        </div>
                        <div className="text-xs text-slate-500 mt-2 relative z-10">
                          {globalNamespaceFilter === 'all' ? 'All namespaces' : getNamespaceLabel(parseInt(globalNamespaceFilter))}
                        </div>
                      </div>

                      <div className="bg-slate-800/40 backdrop-blur border border-slate-700/50 p-5 rounded-2xl relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-28 h-28 bg-indigo-500/5 rounded-full blur-2xl -translate-y-8 translate-x-8 group-hover:bg-indigo-500/10 transition-all duration-500"></div>
                        <div className="flex items-center justify-between gap-3 mb-3 text-slate-400 text-sm font-medium relative z-10">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="p-1.5 bg-indigo-500/10 rounded-lg"><Clock className="w-4 h-4 text-indigo-400" /></div>
                            <span className="truncate">Edits in ISO week {stats.referenceIsoWeek}</span>
                          </div>
                          <InfoTooltip text={`All edits made in ISO week ${stats.referenceIsoWeek} in every year covered by the selected range, including edits that created new pages. ISO weeks run Monday through Sunday and may cross calendar-year boundaries.`} />
                        </div>
                        <div className="text-3xl font-bold text-white tracking-tight relative z-10">
                          {stats.editsInReferenceWeek.toLocaleString()}
                        </div>
                        <div className="text-xs text-slate-500 mt-2 relative z-10">
                          {globalNamespaceFilter === 'all' ? 'All namespaces' : getNamespaceLabel(parseInt(globalNamespaceFilter))}
                        </div>
                      </div>

                      <div className="bg-slate-800/40 backdrop-blur border border-slate-700/50 p-5 rounded-2xl relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-28 h-28 bg-amber-500/5 rounded-full blur-2xl -translate-y-8 translate-x-8 group-hover:bg-amber-500/10 transition-all duration-500"></div>
                        <div className="flex items-center justify-between gap-3 mb-3 text-slate-400 text-sm font-medium relative z-10">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="p-1.5 bg-amber-500/10 rounded-lg"><BarChart2 className="w-4 h-4 text-amber-400" /></div>
                            <span className="truncate">Edits in {stats.currentMonthName}</span>
                          </div>
                          <InfoTooltip text={`All edits made in ${stats.currentMonthName} in every year covered by the selected range, including edits that created new pages. Timestamps use your browser's local time.`} />
                        </div>
                        <div className="text-3xl font-bold text-white tracking-tight relative z-10">
                          {stats.editsInReferenceMonth.toLocaleString()}
                        </div>
                        <div className="text-xs text-slate-500 mt-2 relative z-10">
                          {globalNamespaceFilter === 'all' ? 'All namespaces' : getNamespaceLabel(parseInt(globalNamespaceFilter))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Pages created in recurring periods selected by the Reference Date */}
                  <div className="space-y-3">
                    <div>
                      <h2 className="text-lg font-semibold text-white">Pages Created by Reference Period</h2>
                      <p className="text-xs text-slate-500">Totals across all years in the selected range</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="bg-slate-800/40 backdrop-blur border border-slate-700/50 p-5 rounded-2xl relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-28 h-28 bg-cyan-500/5 rounded-full blur-2xl -translate-y-8 translate-x-8 group-hover:bg-cyan-500/10 transition-all duration-500"></div>
                        <div className="flex items-center justify-between gap-3 mb-3 text-slate-400 text-sm font-medium relative z-10">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="p-1.5 bg-cyan-500/10 rounded-lg"><CalendarDays className="w-4 h-4 text-cyan-400" /></div>
                            <span className="truncate">Created on {performanceMetrics.currentDateName}</span>
                          </div>
                          <InfoTooltip text={`Pages created on ${performanceMetrics.currentDateName} in every year covered by the selected range. Creation timestamps use your browser's local time.`} />
                        </div>
                        <div className="text-3xl font-bold text-white tracking-tight relative z-10">
                          {stats.createdOnReferenceDate.toLocaleString()}
                        </div>
                        <div className="text-xs text-slate-500 mt-2 relative z-10">
                          {globalNamespaceFilter === 'all' ? 'All namespaces' : getNamespaceLabel(parseInt(globalNamespaceFilter))}
                        </div>
                      </div>

                      <div className="bg-slate-800/40 backdrop-blur border border-slate-700/50 p-5 rounded-2xl relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-28 h-28 bg-violet-500/5 rounded-full blur-2xl -translate-y-8 translate-x-8 group-hover:bg-violet-500/10 transition-all duration-500"></div>
                        <div className="flex items-center justify-between gap-3 mb-3 text-slate-400 text-sm font-medium relative z-10">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="p-1.5 bg-violet-500/10 rounded-lg"><Clock className="w-4 h-4 text-violet-400" /></div>
                            <span className="truncate">Created in ISO week {stats.referenceIsoWeek}</span>
                          </div>
                          <InfoTooltip text={`Pages created in ISO week ${stats.referenceIsoWeek} in every year covered by the selected range. ISO weeks run Monday through Sunday and may cross calendar-year boundaries.`} />
                        </div>
                        <div className="text-3xl font-bold text-white tracking-tight relative z-10">
                          {stats.createdInReferenceWeek.toLocaleString()}
                        </div>
                        <div className="text-xs text-slate-500 mt-2 relative z-10">
                          {globalNamespaceFilter === 'all' ? 'All namespaces' : getNamespaceLabel(parseInt(globalNamespaceFilter))}
                        </div>
                      </div>

                      <div className="bg-slate-800/40 backdrop-blur border border-slate-700/50 p-5 rounded-2xl relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-28 h-28 bg-emerald-500/5 rounded-full blur-2xl -translate-y-8 translate-x-8 group-hover:bg-emerald-500/10 transition-all duration-500"></div>
                        <div className="flex items-center justify-between gap-3 mb-3 text-slate-400 text-sm font-medium relative z-10">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="p-1.5 bg-emerald-500/10 rounded-lg"><BarChart2 className="w-4 h-4 text-emerald-400" /></div>
                            <span className="truncate">Created in {stats.currentMonthName}</span>
                          </div>
                          <InfoTooltip text={`Pages created in ${stats.currentMonthName} in every year covered by the selected range. Creation timestamps use your browser's local time.`} />
                        </div>
                        <div className="text-3xl font-bold text-white tracking-tight relative z-10">
                          {stats.createdInReferenceMonth.toLocaleString()}
                        </div>
                        <div className="text-xs text-slate-500 mt-2 relative z-10">
                          {globalNamespaceFilter === 'all' ? 'All namespaces' : getNamespaceLabel(parseInt(globalNamespaceFilter))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Performance Comparisons */}
                  < div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4" >

                    {/* 1. Yearly Performance */}
                    < div
                      onClick={() => handleCardClick('year')}
                      className={`p-5 rounded-2xl border backdrop-blur-sm relative transition-all duration-300 hover:shadow-lg cursor-pointer hover:scale-[1.02] active:scale-[0.98] group/card ${getCardStyle(performanceMetrics.isYearlyPositive, performanceMetrics.isYearlyProjectedUnder)}`
                      }>
                      <div className="flex items-center gap-2 mb-3 text-slate-400 text-sm font-medium">
                        <TrendingUp className={`w-4 h-4 ${getIconColor(performanceMetrics.isYearlyPositive, performanceMetrics.isYearlyProjectedUnder, 'text-purple-400')}`} />
                        <span className={getTextColor(performanceMetrics.isYearlyPositive, performanceMetrics.isYearlyProjectedUnder)}>Yearly</span>
                        <div className="absolute top-4 right-4">
                          <InfoTooltip text={`Comparison: Selected year edits vs. average of previous years.\n\nProjected: Estimated total by Dec 31st based on daily pace up to Reference Date.`} />
                        </div>
                      </div>
                      <div className="text-2xl font-bold text-white flex items-baseline gap-2">
                        <span>{stats.thisYearEdits.toLocaleString()}</span>
                        <span className="text-sm text-slate-500 font-normal">/ {Math.round(stats.averagePreviousYearsEdits).toLocaleString()}</span>
                      </div>
                      <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-700/30">
                        <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Projected</span>
                        <span className={`text-xs font-mono ${performanceMetrics.isYearlyProjectedUnder ? 'text-rose-300' : 'text-slate-300'}`}>
                          {performanceMetrics.projectedYearly.toLocaleString()}
                        </span>
                      </div>
                    </div >

                    {/* 2. Monthly Performance */}
                    < div
                      onClick={() => handleCardClick('month')}
                      className={`p-5 rounded-2xl border backdrop-blur-sm relative transition-all duration-300 hover:shadow-lg cursor-pointer hover:scale-[1.02] active:scale-[0.98] group/card ${getCardStyle(performanceMetrics.isMonthlyPositive, performanceMetrics.isMonthlyProjectedUnder)}`}>
                      <div className="flex items-center gap-2 mb-3 text-slate-400 text-sm font-medium">
                        <BarChart2 className={`w-4 h-4 ${getIconColor(performanceMetrics.isMonthlyPositive, performanceMetrics.isMonthlyProjectedUnder, 'text-emerald-400')}`} />
                        <span className={getTextColor(performanceMetrics.isMonthlyPositive, performanceMetrics.isMonthlyProjectedUnder)}>Monthly</span>
                        <div className="absolute top-4 right-4">
                          <InfoTooltip text={`Comparison: Selected month edits vs. historical monthly average.`} />
                        </div>
                      </div>
                      <div className="text-2xl font-bold text-white flex items-baseline gap-2">
                        <span>{stats.thisMonthEdits.toLocaleString()}</span>
                        <span className="text-sm text-slate-500 font-normal">/ {Math.round(stats.avgMonthlyEdits).toLocaleString()}</span>
                      </div>
                      <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-700/30">
                        <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Projected</span>
                        <span className={`text-xs font-mono ${performanceMetrics.isMonthlyProjectedUnder ? 'text-rose-300' : 'text-slate-300'}`}>
                          {performanceMetrics.projectedMonthly.toLocaleString()}
                        </span>
                      </div>
                    </div >

                    {/* 3. Weekday Performance */}
                    < div
                      onClick={() => handleCardClick('day')}
                      className={`p-5 rounded-2xl border backdrop-blur-sm relative transition-all duration-300 hover:shadow-lg cursor-pointer hover:scale-[1.02] active:scale-[0.98] group/card ${getCardStyle(performanceMetrics.isWeekdayPositive, performanceMetrics.isWeekdayProjectedUnder)}`}>
                      <div className="flex items-center gap-2 mb-3 text-slate-400 text-sm font-medium pr-6">
                        <Calendar className={`w-4 h-4 ${getIconColor(performanceMetrics.isWeekdayPositive, performanceMetrics.isWeekdayProjectedUnder, 'text-pink-400')}`} />
                        <span className={`${getTextColor(performanceMetrics.isWeekdayPositive, performanceMetrics.isWeekdayProjectedUnder)} truncate`}>
                          {performanceMetrics.currentDayName}s
                        </span>
                        <div className="absolute top-4 right-4">
                          <InfoTooltip text={`Comparison: Your activity today vs your average for ${performanceMetrics.currentDayName}s.`} />
                        </div>
                      </div>
                      <div className="text-2xl font-bold text-white flex items-baseline gap-2">
                        <span>{stats.thisDayEdits.toLocaleString()}</span>
                        <span className="text-sm text-slate-500 font-normal">/ {Math.round(stats.avgEditsOnCurrentWeekday).toLocaleString()}</span>
                      </div>
                      <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-700/30">
                        <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Projected</span>
                        <span className={`text-xs font-mono ${performanceMetrics.isWeekdayProjectedUnder ? 'text-rose-300' : 'text-slate-300'}`}>
                          {performanceMetrics.projectedDaily.toLocaleString()}
                        </span>
                      </div>
                    </div >

                    {/* 4. Calendar Date Performance */}
                    < div
                      onClick={() => handleCardClick('day')}
                      className={`p-5 rounded-2xl border backdrop-blur-sm relative transition-all duration-300 hover:shadow-lg cursor-pointer hover:scale-[1.02] active:scale-[0.98] group/card ${getCardStyle(performanceMetrics.isDatePositive, performanceMetrics.isDateProjectedUnder)}`}>
                      <div className="flex items-center gap-2 mb-3 text-slate-400 text-sm font-medium pr-6">
                        <CalendarDays className={`w-4 h-4 ${getIconColor(performanceMetrics.isDatePositive, performanceMetrics.isDateProjectedUnder, 'text-yellow-400')}`} />
                        <span className={`${getTextColor(performanceMetrics.isDatePositive, performanceMetrics.isDateProjectedUnder)} truncate`}>
                          On {performanceMetrics.currentDateName}
                        </span>
                        <div className="absolute top-4 right-4">
                          <InfoTooltip text={`Comparison: Your activity today vs your average for this specific date (${performanceMetrics.currentDateName}) historically.`} />
                        </div>
                      </div>
                      <div className="text-2xl font-bold text-white flex items-baseline gap-2">
                        <span>{stats.thisDayEdits.toLocaleString()}</span>
                        <span className="text-sm text-slate-500 font-normal">/ {Math.round(stats.avgEditsOnCurrentDate).toLocaleString()}</span>
                      </div>
                      <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-700/30">
                        <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Projected</span>
                        <span className={`text-xs font-mono ${performanceMetrics.isDateProjectedUnder ? 'text-rose-300' : 'text-slate-300'}`}>
                          {performanceMetrics.projectedDaily.toLocaleString()}
                        </span>
                      </div>
                    </div >
                  </div >

                  {/* Charts Grid */}
                  < div className="grid grid-cols-1 lg:grid-cols-2 gap-6" >

                    {/* Hourly Activity by Weekday */}
                    <div className="bg-slate-800/40 backdrop-blur border border-slate-700/50 p-6 rounded-2xl lg:col-span-2">
                      <div className="flex items-center justify-between gap-2 mb-6">
                        <div className="flex items-center gap-2">
                          <BarChart2 className="w-5 h-5 text-blue-400" />
                          <h3 className="text-lg font-semibold text-white">Daily Activity Rhythm (Hour by Weekday)</h3>
                        </div>
                        <InfoTooltip text={`Hour-by-hour edits on a single weekday: the one the Reference Date falls on.\n\nEvery occurrence of that weekday in the range is pooled together. Move the Reference Date to inspect a different weekday.\n\nOrange = hour of the Reference Date. Local time.`} />
                      </div>
                      <WeekdayHourlyActivityChart stats={stats} referenceDate={performanceMetrics.refDate} />
                    </div>

                    {/* Hourly Pace on the Reference Weekday */}
                    <div className="bg-slate-800/40 backdrop-blur border border-slate-700/50 p-6 rounded-2xl lg:col-span-2">
                      <div className="flex items-center justify-between gap-2 mb-6">
                        <div className="flex items-center gap-2">
                          <BarChart2 className="w-5 h-5 text-emerald-400" />
                          <h3 className="text-lg font-semibold text-white">Hourly Pace on {performanceMetrics.currentDayName}s (vs. Average)</h3>
                        </div>
                        <div className="flex items-center flex-shrink-0 gap-2">
                          <span className="text-[10px] px-2 py-1 bg-amber-500/10 text-amber-400 rounded-full border border-amber-500/20 whitespace-nowrap">
                            {stats.currentWeekdayAverageDays > 0
                              ? `From ${stats.currentWeekdayAverageDays} earlier ${performanceMetrics.currentDayName}s`
                              : `No earlier ${performanceMetrics.currentDayName} to compare`}
                          </span>
                          <InfoTooltip text={`Edits hour by hour on the Reference Date. Bars are that day itself; the dashed line is the average for that hour across earlier ${performanceMetrics.currentDayName}s.\n\nEach hour is divided only by the ${performanceMetrics.currentDayName}s actually worked in that same hour, so ${performanceMetrics.currentDayName}s spent editing at other times do not drag it down. Hover a bar for that hour's sample count.\n\nAn hour needs ${MIN_HOUR_SAMPLES} such days before a figure is reported; below that the line stays at zero rather than presenting a one-off session as typical. The Reference Date is never part of its own baseline.\n\nEach dot on the line shows how many days stand behind it, by size and colour together: a large green dot for ${MIN_HOUR_SAMPLES} or more, then yellow for two, amber for one, down to a small red dot for none. Size repeats the scale so it still reads without relying on colour, and the current hour's dot is ringed.`} />
                        </div>
                      </div>
                      <HourlyPaceChart data={stats.currentWeekdayHourlyStats} sampleSize={stats.currentWeekdayAverageDays} referenceDate={performanceMetrics.refDate} />
                    </div>

                    {/* Hourly Pace on the Reference Date */}
                    <div className="bg-slate-800/40 backdrop-blur border border-slate-700/50 p-6 rounded-2xl lg:col-span-2">
                      <div className="flex items-center justify-between gap-2 mb-6">
                        <div className="flex items-center gap-2">
                          <BarChart2 className="w-5 h-5 text-purple-400" />
                          <h3 className="text-lg font-semibold text-white">Hourly Pace on {performanceMetrics.currentDateName} (vs. Average)</h3>
                        </div>
                        <div className="flex items-center flex-shrink-0 gap-2">
                          <span className="text-[10px] px-2 py-1 bg-amber-500/10 text-amber-400 rounded-full border border-amber-500/20 whitespace-nowrap">
                            {stats.currentDateAverageYears > 0
                              ? `From ${stats.currentDateAverageYears} earlier year${stats.currentDateAverageYears > 1 ? 's' : ''}`
                              : 'No earlier year to compare'}
                          </span>
                          <InfoTooltip text={`Edits hour by hour on ${performanceMetrics.currentDateName}. Bars are the Reference Date itself; the dashed line is the average for that hour on the same calendar date in earlier years.\n\nEach hour is divided only by the years actually worked in that same hour. Because this date comes round once a year, most hours will fall short of the ${MIN_HOUR_SAMPLES} samples needed to report a figure and will sit at zero — the weekday chart above is the denser view.\n\nEach dot on the line shows how many years stand behind it, by size and colour together: a large green dot for ${MIN_HOUR_SAMPLES} or more, then yellow for two, amber for one, down to a small red dot for none. Size repeats the scale so it still reads without relying on colour, and the current hour's dot is ringed.\n\nThe Reference Date's own year is never part of its baseline.`} />
                        </div>
                      </div>
                      <HourlyPaceChart data={stats.currentDateHourlyStats} sampleSize={stats.currentDateAverageYears} referenceDate={performanceMetrics.refDate} />
                    </div>

                    {/* Namespace Breakdown */}
                    < div className="bg-slate-800/40 backdrop-blur border border-slate-700/50 p-6 rounded-2xl" >
                      <div className="flex items-center justify-between mb-6">
                        <h3 className="text-lg font-semibold text-white">Namespace Distribution</h3>
                        <InfoTooltip text={`Share of edits per namespace over the selected date range.\n\nThe six largest namespaces get their own slice; everything else is pooled into "Others".\n\nWith a namespace filter active only that one namespace is counted, leaving a single slice.`} />
                      </div>
                      <NamespaceChart stats={stats} />
                      <div className="mt-6 grid grid-cols-2 gap-3 text-sm text-slate-400">
                        {stats.namespaceStats.slice(0, 4).map(ns => (
                          <div key={ns.id} className="flex justify-between items-center bg-slate-800/50 rounded-lg px-3 py-2 border border-slate-700/30">
                            <span className="truncate mr-2">{ns.name}</span>
                            <span className="text-slate-200 font-mono font-medium">{ns.percentage.toFixed(1)}%</span>
                          </div>
                        ))}
                      </div>
                    </div >

                    {/* Time Analysis Container */}
                    < div className="space-y-6" >
                      <div className="bg-slate-800/40 backdrop-blur border border-slate-700/50 p-6 rounded-2xl">
                        <div className="flex justify-between items-start mb-4">
                          <h3 className="text-lg font-semibold text-white">Activity by Hour (Local)</h3>
                          <div className="flex items-center flex-shrink-0">
                            <span className="text-[10px] px-2 py-1 bg-orange-500/10 text-orange-400 rounded-full border border-orange-500/20">Orange = Ref Time</span>
                            <InfoTooltip text={`Total edits by hour of day (0-23), pooled over the whole selected range.\n\nHours are read in your browser's local time, not UTC, so the shape of this chart shifts if you open the report in another time zone.\n\nOrange = hour of the Reference Date.`} />
                          </div>
                        </div>
                        <HourlyActivityChart stats={stats} referenceDate={performanceMetrics.refDate} />
                      </div>

                      <div className="bg-slate-800/40 backdrop-blur border border-slate-700/50 p-6 rounded-2xl">
                        <div className="flex justify-between items-start mb-4">
                          <h3 className="text-lg font-semibold text-white">Activity by Day of Week</h3>
                          <div className="flex items-center flex-shrink-0">
                            <span className="text-[10px] px-2 py-1 bg-orange-500/10 text-orange-400 rounded-full border border-orange-500/20">Orange = Ref Day</span>
                            <InfoTooltip text={`Total edits per weekday over the whole selected range.\n\nThese are raw totals, not averages: a weekday that simply occurs more often inside the range gets a taller bar.\n\nOrange = weekday of the Reference Date. Local time.`} />
                          </div>
                        </div>
                        <WeeklyActivityChart stats={stats} referenceDate={performanceMetrics.refDate} />
                      </div>
                    </div >

                    {/* Day of Month Charts Container */}
                    < div className="lg:col-span-2 grid grid-cols-1 lg:grid-cols-2 gap-6" >
                      {/* Current Month Chart */}
                      < div className="bg-slate-800/40 backdrop-blur border border-slate-700/50 p-6 rounded-2xl" >
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-lg font-semibold text-white">Activity in {stats.currentMonthName} (Daily)</h3>
                          <InfoTooltip text={`Edits on each day of ${stats.currentMonthName}, added up across every year in the range.\n\nOnly this one month is counted. The month follows the Reference Date, so move that date to look at another month.\n\nOrange = day of the Reference Date.`} />
                        </div>
                        <p className="text-xs text-slate-400 mb-2">Aggregated across all selected years</p>
                        <CurrentMonthDailyChart stats={stats} referenceDate={performanceMetrics.refDate} />
                      </div >

                      {/* All Months Chart */}
                      < div className="bg-slate-800/40 backdrop-blur border border-slate-700/50 p-6 rounded-2xl" >
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-lg font-semibold text-white">Activity by Day of Month (Overall)</h3>
                          <InfoTooltip text={`Total edits per day number (1-31) across all months in the range.\n\nCaution: the tail is low by construction. Day 31 occurs in only 7 months of the year and day 30 in 11, so short bars there reflect the calendar rather than a drop in activity.\n\nOrange = day of the Reference Date.`} />
                        </div>
                        <DayOfMonthChart stats={stats} referenceDate={performanceMetrics.refDate} />
                      </div >
                    </div >

                    {/* Heatmap */}
                    < div className="bg-slate-800/40 backdrop-blur border border-slate-700/50 p-6 rounded-2xl lg:col-span-2" >
                      <div className="flex items-center justify-between gap-2 mb-6">
                        <div className="flex items-center gap-2">
                          <Grid className="w-5 h-5 text-blue-400" />
                          <h3 className="text-lg font-semibold text-white">Weekly Editing Rhythm (Heatmap - Local Time)</h3>
                        </div>
                        <InfoTooltip text={`Every edit in the range mapped onto a weekday x hour grid, showing the shape of a typical week.\n\nColour intensity is relative to the single busiest cell, so it says nothing about absolute volume. Hover a cell for its exact count.\n\nOrange outline = weekday and hour of the Reference Date. Local time.`} />
                      </div>
                      <ActivityHeatmap stats={stats} referenceDate={performanceMetrics.refDate} />
                    </div >
                  </div >

                  {/* Recent Top Articles */}
                  < div className="w-full bg-slate-800/40 backdrop-blur border border-slate-700/50 p-6 rounded-2xl" >
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-2">
                      <h3 className="text-lg font-semibold text-white">Most Edited Pages</h3>

                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500 font-medium uppercase tracking-wide">Showing</span>
                        <div className="relative">
                          <select
                            value={topPagesLimit}
                            onChange={(e) => setTopPagesLimit(parseInt(e.target.value))}
                            className="pl-3 pr-8 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none appearance-none cursor-pointer"
                          >
                            <option value="10">Top 10</option>
                            <option value="20">Top 20</option>
                            <option value="50">Top 50</option>
                            <option value="100">Top 100</option>
                            <option value="500">Top 500</option>
                          </select>
                          <List className="absolute right-2 top-2 w-3 h-3 text-slate-500 pointer-events-none" />
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                      {filteredPages.map((page, idx) => (
                        <div key={idx} className="flex flex-col p-3 bg-slate-900/40 border border-slate-800/60 rounded-xl hover:border-slate-700 transition-colors group">
                          <div className="flex items-center justify-between mb-2">
                            <span className="px-1.5 py-0.5 bg-slate-800 text-[10px] rounded text-slate-400 border border-slate-700/50">
                              {getNamespaceLabel(page.ns)}
                            </span>
                            <span className="text-xs font-mono text-blue-300 bg-blue-900/20 px-1.5 py-0.5 rounded">
                              {page.count}
                            </span>
                          </div>
                          <a
                            href={`https://${lang}.wikipedia.org/wiki/${encodeURIComponent(page.title)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-slate-300 font-medium hover:text-blue-400 line-clamp-2 leading-relaxed"
                            title={page.title}
                          >
                            {page.title}
                          </a>
                        </div>
                      ))}
                      {filteredPages.length === 0 && (
                        <div className="col-span-full text-center text-slate-500 py-8 text-sm">
                          No edits found in this namespace for the selected period.
                        </div>
                      )}
                    </div>
                  </div >

                  {/* Top Periods Section */}
                  {stats && (
                    <div
                      className="backdrop-blur-md border rounded-2xl p-6 shadow-xl mb-6"
                      style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}
                    >
                      <TopPeriodsPanel
                        stats={stats}
                        username={username}
                        lang={lang}
                        namespaceFilter={globalNamespaceFilter}
                      />
                    </div>
                  )}

                  {/* AI Analysis Section */}
                  < AnalysisSection stats={stats} lang={lang} startDate={startDate} endDate={endDate} />

                </ErrorBoundary>
              </div >
            )}
          </>
        )}
      </div >
    </div >
  );
}
