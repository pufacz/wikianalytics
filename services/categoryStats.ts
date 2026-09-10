import { WikiContrib, PageCategories, CategoryStat, CategoryAnalysis, CategoryMetric } from '../types';

// Categories that sit on articles without saying anything about their subject:
// year-of-birth indexes, maintenance backlogs, project bookkeeping. They are
// not flagged hidden on plwiki, so the API happily returns them and they would
// otherwise dominate the ranking of anyone who writes biographies.
export const DEFAULT_CATEGORY_NOISE_PATTERNS: RegExp[] = [
  // Polish Wikipedia. Birth and death categories are indexed by year OR by
  // Roman-numeral century ("Urodzeni w XI wieku"), so neither form may require
  // a digit. Place of birth is a separate tree ("Ludzie urodzeni w Warszawie")
  // and stays: it says something about the subject.
  /^Urodzeni w /,
  /^Zmarli w /,
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
  lastEdited: string; // Timestamp of the newest edit to this page in the sample
}

// Distinct main-namespace pages the editor touched, most recently edited
// first. The category lookup walks this list from the top, so it always
// describes what the editor has been working on lately rather than what they
// happened to hammer on years ago.
//
// Grouping is by page id, not title, so a page moved mid-history stays one
// page, and the title kept is the one carried by its newest edit. Ordering is
// derived from the timestamps rather than from the order contributions
// arrived in, so it holds even if a caller reshuffles the array.
export const selectArticlePages = (contribs: WikiContrib[]): PageEditCount[] => {
  const pages = new Map<number, PageEditCount>();

  contribs.forEach(contrib => {
    // A page id of 0 means the revision no longer has a live page behind it.
    if (contrib.ns !== 0 || !contrib.pageid) return;

    const existing = pages.get(contrib.pageid);
    if (!existing) {
      pages.set(contrib.pageid, {
        pageid: contrib.pageid,
        title: contrib.title,
        count: 1,
        lastEdited: contrib.timestamp,
      });
      return;
    }

    existing.count++;
    if (contrib.timestamp > existing.lastEdited) {
      existing.lastEdited = contrib.timestamp;
      existing.title = contrib.title;
    }
  });

  // ISO 8601 UTC timestamps sort lexicographically the same way they sort
  // chronologically, so a string compare is enough.
  return [...pages.values()].sort(
    (a, b) =>
      b.lastEdited.localeCompare(a.lastEdited) ||
      b.count - a.count ||
      a.title.localeCompare(b.title)
  );
};

// Orders a ranking by the chosen measure. The other measure breaks ties, so
// two categories on equal footing still come out in a stable, sensible order.
export const rankCategories = (
  categories: CategoryStat[],
  metric: CategoryMetric
): CategoryStat[] =>
  [...categories].sort((a, b) =>
    metric === 'pages'
      ? b.pageCount - a.pageCount || b.editCount - a.editCount || a.name.localeCompare(b.name)
      : b.editCount - a.editCount || b.pageCount - a.pageCount || a.name.localeCompare(b.name)
  );

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

  return {
    categories: rankCategories(kept, 'edits'),
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
