import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchCategoriesForPages, stripNamespacePrefix, chunk, estimateRequests } from './categories';
import { storage } from './storage';

// The cache is a thin IndexedDB wrapper; the behaviour under test is which
// pages reach the network, so it is stubbed out entirely.
vi.mock('./storage', () => ({
  storage: {
    getCachedCategories: vi.fn(),
    putCachedCategories: vi.fn(),
  },
}));

const getCached = vi.mocked(storage.getCachedCategories);
const putCached = vi.mocked(storage.putCachedCategories);

// A formatversion=2 response for the given pages.
const apiResponse = (pages: any[], cont?: string) =>
  Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({
      query: { pages },
      ...(cont ? { continue: { clcontinue: cont } } : {}),
    }),
  });

const page = (pageid: number, categories: string[]) => ({
  pageid,
  ns: 0,
  title: `Page ${pageid}`,
  categories: categories.map(name => ({ ns: 14, title: `Kategoria:${name}` })),
});

const requestedPageIds = (call: any[]): number[] => {
  const url = new URL(call[0] as string);
  return (url.searchParams.get('pageids') ?? '').split('|').map(Number);
};

describe('fetchCategoriesForPages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCached.mockResolvedValue(new Map());
    putCached.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('strips the namespace prefix from category titles', async () => {
    const fetchMock = vi.fn(() => apiResponse([page(1, ['Miasta w Polsce'])]));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchCategoriesForPages([1], 'pl');

    expect(result.get(1)?.categories).toEqual(['Miasta w Polsce']);
  });

  it('splits requests into batches of 50 pages', async () => {
    const ids = Array.from({ length: 120 }, (_, i) => i + 1);
    const fetchMock = vi.fn((url: string) =>
      apiResponse(requestedPageIds([url]).map(id => page(id, ['Kategoria testowa'])))
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchCategoriesForPages(ids, 'pl');

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(requestedPageIds(fetchMock.mock.calls[0]).length).toBe(50);
    expect(requestedPageIds(fetchMock.mock.calls[2]).length).toBe(20);
    expect(result.size).toBe(120);
  });

  it('asks about each page only once, however often it was edited', async () => {
    const fetchMock = vi.fn(() => apiResponse([page(1, ['A']), page(2, ['B'])]));
    vi.stubGlobal('fetch', fetchMock);

    await fetchCategoriesForPages([1, 2, 1, 2, 1], 'pl');

    expect(requestedPageIds(fetchMock.mock.calls[0])).toEqual([1, 2]);
  });

  it('never hits the network for pages the cache already holds', async () => {
    getCached.mockResolvedValue(new Map([
      [1, { id: 'pl:1', lang: 'pl', pageid: 1, title: 'Kraków', categories: ['Miasta w Polsce'], fetchedAt: 0 }],
    ]));
    const fetchMock = vi.fn(() => apiResponse([page(2, ['B'])]));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchCategoriesForPages([1, 2], 'pl');

    expect(requestedPageIds(fetchMock.mock.calls[0])).toEqual([2]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.get(1)?.categories).toEqual(['Miasta w Polsce']);
    expect(result.get(2)?.categories).toEqual(['B']);
  });

  it('makes no request at all when every page is cached', async () => {
    getCached.mockResolvedValue(new Map([
      [1, { id: 'pl:1', lang: 'pl', pageid: 1, title: 'Kraków', categories: ['Miasta w Polsce'], fetchedAt: 0 }],
    ]));
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchCategoriesForPages([1], 'pl');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.size).toBe(1);
  });

  it('follows clcontinue and merges the partial category lists', async () => {
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => apiResponse([page(1, ['A'])], 'token'))
      .mockImplementationOnce(() => apiResponse([page(1, ['B'])]));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchCategoriesForPages([1], 'pl');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(new URL(fetchMock.mock.calls[1][0]).searchParams.get('clcontinue')).toBe('token');
    expect(result.get(1)?.categories).toEqual(['A', 'B']);
  });

  it('caches deleted pages as missing and leaves them out of the result', async () => {
    const fetchMock = vi.fn(() => apiResponse([{ pageid: 9, missing: true }]));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchCategoriesForPages([9], 'pl');

    expect(result.has(9)).toBe(false);
    expect(putCached).toHaveBeenCalledWith([expect.objectContaining({ pageid: 9, missing: true })]);
  });

  it('caches page ids the API never mentions, so they are not asked about again', async () => {
    const fetchMock = vi.fn(() => apiResponse([]));
    vi.stubGlobal('fetch', fetchMock);

    await fetchCategoriesForPages([42], 'pl');

    expect(putCached).toHaveBeenCalledWith([expect.objectContaining({ pageid: 42, missing: true })]);
  });

  it('sends maxlag and asks only for visible categories', async () => {
    const fetchMock = vi.fn(() => apiResponse([page(1, ['A'])]));
    vi.stubGlobal('fetch', fetchMock);

    await fetchCategoriesForPages([1], 'pl');

    const params = new URL(fetchMock.mock.calls[0][0]).searchParams;
    expect(params.get('maxlag')).toBe('5');
    expect(params.get('clshow')).toBe('!hidden');
    expect(params.get('cllimit')).toBe('max');
    // No cache-buster: a repeat query should be answerable from the CDN.
    expect(params.get('_')).toBeNull();
  });

  it('reports progress including what came from the cache', async () => {
    getCached.mockResolvedValue(new Map([
      [1, { id: 'pl:1', lang: 'pl', pageid: 1, title: 'Kraków', categories: ['A'], fetchedAt: 0 }],
    ]));
    vi.stubGlobal('fetch', vi.fn(() => apiResponse([page(2, ['B'])])));

    const updates: any[] = [];
    await fetchCategoriesForPages([1, 2], 'pl', p => updates.push({ ...p }));

    expect(updates[0]).toEqual({ resolved: 1, total: 2, fromCache: 1 });
    expect(updates[updates.length - 1]).toEqual({ resolved: 2, total: 2, fromCache: 1 });
  });

  it('backs off and retries when Wikipedia throttles', async () => {
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve({}) }))
      .mockImplementationOnce(() => apiResponse([page(1, ['A'])]));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchCategoriesForPages([1], 'pl');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.get(1)?.categories).toEqual(['A']);
  });

  it('surfaces API errors instead of retrying them', async () => {
    const fetchMock = vi.fn(() => Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ error: { code: 'badvalue', info: 'Bad parameter' } }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchCategoriesForPages([1], 'pl')).rejects.toThrow('Bad parameter');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns immediately for an empty page list', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    expect((await fetchCategoriesForPages([], 'pl')).size).toBe(0);
    expect(getCached).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('helpers', () => {
  it('strips only the leading namespace prefix', () => {
    expect(stripNamespacePrefix('Kategoria:Polscy politycy')).toBe('Polscy politycy');
    expect(stripNamespacePrefix('Category:Cities: a list')).toBe('Cities: a list');
    expect(stripNamespacePrefix('No prefix')).toBe('No prefix');
  });

  it('chunks a list without dropping items', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 2)).toEqual([]);
  });

  it('estimates one request per batch of 50 pages', () => {
    expect(estimateRequests(0)).toBe(0);
    expect(estimateRequests(50)).toBe(1);
    expect(estimateRequests(200)).toBe(4);
    expect(estimateRequests(201)).toBe(5);
  });
});
