import { PageCategories } from '../types';
import { storage, CachedPageCategories } from './storage';

// Anonymous clients may name at most 50 pages in one multi-page query.
export const CATEGORY_BATCH_SIZE = 50;

// A batch of 50 pages returns up to 500 categories per response, so a second
// pass is occasionally needed. The ceiling only guards against a runaway loop.
const MAX_CONTINUATIONS = 20;

const BATCH_DELAY_MS = 100;
const MAX_RETRIES = 3;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// "Kategoria:Polscy politycy" -> "Polscy politycy". The namespace prefix is
// language-specific noise; the category name is what carries meaning.
export const stripNamespacePrefix = (title: string): string => {
  const colon = title.indexOf(':');
  return colon === -1 ? title : title.slice(colon + 1);
};

export const chunk = <T,>(items: T[], size: number): T[][] => {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
};

// The floor on how many requests a lookup costs: one per batch of pages. The
// real figure can be several times higher, because a response carries at most
// 500 categories in total and a single biography can list ninety of them.
export const estimateRequests = (pageCount: number): number =>
  Math.ceil(pageCount / CATEGORY_BATCH_SIZE);

interface CategoryQueryPage {
  pageid?: number;
  title?: string;
  missing?: boolean;
  categories?: { title: string }[];
}

// One API call, retried on rate limiting and replication lag. Deliberately no
// cache-buster: category lists change rarely, so letting the CDN and the
// browser answer a repeat query is exactly what we want.
const requestBatch = async (endpoint: string, params: Record<string, string>): Promise<any> => {
  let retries = 0;

  while (true) {
    const backoff = Math.pow(2, retries) * 1000;
    try {
      const response = await fetch(`${endpoint}?${new URLSearchParams(params).toString()}`);

      // 503 also covers the server refusing us while replication lag is high.
      if (response.status === 429 || response.status === 503) {
        if (retries >= MAX_RETRIES - 1) throw new Error(`Wikipedia is throttling requests (HTTP ${response.status})`);
        await sleep(backoff);
        retries++;
        continue;
      }
      if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);

      const data = await response.json();

      if (data.error?.code === 'maxlag') {
        if (retries >= MAX_RETRIES - 1) throw new Error('Wikipedia replication lag is too high, try again later');
        await sleep(backoff);
        retries++;
        continue;
      }
      if (data.error) throw new Error(data.error.info || data.error.code);

      return data;
    } catch (err) {
      // Network failures get the same treatment; a thrown API error does not.
      if (err instanceof TypeError && retries < MAX_RETRIES - 1) {
        await sleep(backoff);
        retries++;
        continue;
      }
      throw err;
    }
  }
};

// Categories for up to CATEGORY_BATCH_SIZE pages, following clcontinue until
// every page's list is complete.
const fetchBatch = async (pageids: number[], lang: string): Promise<CachedPageCategories[]> => {
  const endpoint = `https://${lang}.wikipedia.org/w/api.php`;
  const collected = new Map<number, CachedPageCategories>();
  const fetchedAt = Date.now();
  let clcontinue: string | null = null;
  let passes = 0;

  do {
    const params: Record<string, string> = {
      action: 'query',
      prop: 'categories',
      pageids: pageids.join('|'),
      clshow: '!hidden',
      cllimit: 'max',
      format: 'json',
      formatversion: '2',
      maxlag: '5',
      origin: '*',
    };
    if (clcontinue) params.clcontinue = clcontinue;

    const data = await requestBatch(endpoint, params);
    const pages: CategoryQueryPage[] = data.query?.pages ?? [];

    pages.forEach(page => {
      if (page.pageid === undefined) return;

      const existing = collected.get(page.pageid);
      const names = (page.categories ?? []).map(c => stripNamespacePrefix(c.title));

      if (existing) {
        existing.categories.push(...names);
        return;
      }

      collected.set(page.pageid, {
        id: `${lang}:${page.pageid}`,
        lang,
        pageid: page.pageid,
        title: page.title ?? '',
        categories: names,
        missing: page.missing === true,
        fetchedAt,
      });
    });

    clcontinue = data.continue?.clcontinue ?? null;
    passes++;
  } while (clcontinue && passes < MAX_CONTINUATIONS);

  // Page ids the API never mentioned are gone; cache that so they are not
  // requested again on the next run.
  pageids.forEach(pageid => {
    if (!collected.has(pageid)) {
      collected.set(pageid, {
        id: `${lang}:${pageid}`,
        lang,
        pageid,
        title: '',
        categories: [],
        missing: true,
        fetchedAt,
      });
    }
  });

  return [...collected.values()];
};

export interface CategoryFetchProgress {
  resolved: number; // Pages settled so far, cache hits included
  total: number;    // Distinct pages asked about
  fromCache: number;
}

// Categories for the given pages, cache first. Only pages the cache has never
// seen reach the network, so widening a lookup costs only the new pages and
// re-running an analysis costs nothing at all.
export const fetchCategoriesForPages = async (
  pageids: number[],
  lang: string,
  onProgress?: (progress: CategoryFetchProgress) => void
): Promise<Map<number, PageCategories>> => {
  const unique = [...new Set(pageids)];
  const result = new Map<number, PageCategories>();
  if (unique.length === 0) return result;

  const cached = await storage.getCachedCategories(lang, unique);

  const absorb = (entry: CachedPageCategories) => {
    if (entry.missing) return; // Deleted page: known, but nothing to attribute
    result.set(entry.pageid, {
      pageid: entry.pageid,
      title: entry.title,
      categories: entry.categories,
    });
  };

  cached.forEach(absorb);

  const misses = unique.filter(pageid => !cached.has(pageid));
  let settled = cached.size;
  onProgress?.({ resolved: settled, total: unique.length, fromCache: cached.size });

  const batches = chunk(misses, CATEGORY_BATCH_SIZE);

  for (let i = 0; i < batches.length; i++) {
    const entries = await fetchBatch(batches[i], lang);
    await storage.putCachedCategories(entries);
    entries.forEach(absorb);

    settled += batches[i].length;
    onProgress?.({ resolved: settled, total: unique.length, fromCache: cached.size });

    if (i < batches.length - 1) await sleep(BATCH_DELAY_MS);
  }

  return result;
};
