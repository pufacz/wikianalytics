import { WikiContrib, PageCategories, CategoryStat, CategoryAnalysis } from '../types';

// Categories that sit on articles without saying anything about their subject:
// year-of-birth indexes, maintenance backlogs, project bookkeeping. They are
// not flagged hidden on plwiki, so the API happily returns them and they would
// otherwise dominate the ranking of anyone who writes biographies.
export const DEFAULT_CATEGORY_NOISE_PATTERNS: RegExp[] = [
  // Polish Wikipedia
  /^Urodzeni w \d/,
  /^Zmarli w \d/,
  /^Nieznana data /,
  /^Artykuły /,
  /^Strony /,
  /^Hasła /,
  /wymagając/i,
  // English Wikipedia
  /^\d+s? births$/,
  /^\d+s? deaths$/,
  /^Living people$/,
  /^All /,
  /^Articles /,
  /^Wikipedia /,
  /^CS1 /,
  /^Pages /,
  /^Short description/,
  /^Use [\w-]+ (dates|English)/,
  /^Webarchive /,
  /^Commons category/,
];

export const isNoiseCategory = (
  name: string,
  patterns: RegExp[] = DEFAULT_CATEGORY_NOISE_PATTERNS
): boolean => patterns.some(pattern => pattern.test(name));

export interface PageEditCount {
  pageid: number;
  title: string;
  count: number;
}

// Distinct main-namespace pages the editor touched, busiest first.
//
// Grouping is by page id, not title, so a page that was moved mid-history
// stays one page. Contributions arrive newest-first, so the first title seen
// for an id is its most recent one.
export const selectArticlePages = (contribs: WikiContrib[]): PageEditCount[] => {
  const pages = new Map<number, PageEditCount>();

  contribs.forEach(contrib => {
    // A page id of 0 means the revision no longer has a live page behind it.
    if (contrib.ns !== 0 || !contrib.pageid) return;

    const existing = pages.get(contrib.pageid);
    if (existing) {
      existing.count++;
    } else {
      pages.set(contrib.pageid, { pageid: contrib.pageid, title: contrib.title, count: 1 });
    }
  });

  return [...pages.values()].sort(
    (a, b) => b.count - a.count || a.title.localeCompare(b.title)
  );
};

export interface CategoryAnalysisOptions {
  includeNoise?: boolean;
  patterns?: RegExp[];
}

// Turns contributions plus a page -> categories map into the ranked view.
// Pure: every drill-down the UI offers is a read of what this returns, so
// exploring the result never touches the Wikipedia API again.
export const computeCategoryAnalysis = (
  contribs: WikiContrib[],
  categories: Map<number, PageCategories>,
  options: CategoryAnalysisOptions = {}
): CategoryAnalysis => {
  const { includeNoise = false, patterns = DEFAULT_CATEGORY_NOISE_PATTERNS } = options;

  const pages = selectArticlePages(contribs);
  const editsTotal = pages.reduce((sum, page) => sum + page.count, 0);

  const byName = new Map<string, CategoryStat>();
  let pagesResolved = 0;
  let editsCovered = 0;

  pages.forEach(page => {
    const info = categories.get(page.pageid);
    if (!info) return; // Never looked up, or the page is gone

    pagesResolved++;
    editsCovered += page.count;

    // A page listing the same category twice must not count twice.
    new Set(info.categories).forEach(name => {
      let stat = byName.get(name);
      if (!stat) {
        stat = { name, editCount: 0, pageCount: 0, pages: [] };
        byName.set(name, stat);
      }
      stat.editCount += page.count;
      stat.pageCount++;
      stat.pages.push({ pageid: page.pageid, title: page.title, count: page.count });
    });
  });

  const all = [...byName.values()];
  const kept = includeNoise ? all : all.filter(stat => !isNoiseCategory(stat.name, patterns));

  kept.forEach(stat => {
    stat.pages.sort((a, b) => b.count - a.count || a.title.localeCompare(b.title));
  });
  kept.sort(
    (a, b) => b.editCount - a.editCount || b.pageCount - a.pageCount || a.name.localeCompare(b.name)
  );

  return {
    categories: kept,
    // Coverage describes the lookup, not the filter, so it stays the same
    // whether or not noise categories are on screen.
    coverage: {
      pagesResolved,
      pagesTotal: pages.length,
      editsCovered,
      editsTotal,
    },
    filteredOut: all.length - kept.length,
  };
};
