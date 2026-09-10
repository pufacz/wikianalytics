import { describe, it, expect } from 'vitest';
import { WikiContrib, PageCategories } from '../types';
import {
  selectArticlePages,
  computeCategoryAnalysis,
  isNoiseCategory,
} from './categoryStats';

const createContrib = (
  pageid: number,
  title: string,
  ns = 0,
  timestamp = '2023-01-01T10:00:00Z'
): WikiContrib => ({
  userid: 1,
  user: 'TestUser',
  pageid,
  revid: Math.random(),
  parentid: 0,
  ns,
  title,
  timestamp,
  comment: 'test',
  size: 100,
});

const categoryMap = (entries: [number, string, string[]][]): Map<number, PageCategories> =>
  new Map(entries.map(([pageid, title, categories]) => [pageid, { pageid, title, categories }]));

describe('selectArticlePages', () => {
  it('groups edits by page id and reports each page\'s newest edit', () => {
    const pages = selectArticlePages([
      createContrib(1, 'Kraków', 0, '2023-03-01T10:00:00Z'),
      createContrib(2, 'Gdańsk', 0, '2023-02-01T10:00:00Z'),
      createContrib(1, 'Kraków', 0, '2023-01-05T10:00:00Z'),
      createContrib(1, 'Kraków', 0, '2023-01-01T10:00:00Z'),
    ]);

    expect(pages).toEqual([
      { pageid: 1, title: 'Kraków', count: 3, lastEdited: '2023-03-01T10:00:00Z' },
      { pageid: 2, title: 'Gdańsk', count: 1, lastEdited: '2023-02-01T10:00:00Z' },
    ]);
  });

  it('orders by most recent edit, not by how many edits a page got', () => {
    const pages = selectArticlePages([
      createContrib(1, 'Stary faworyt', 0, '2019-01-01T10:00:00Z'),
      createContrib(1, 'Stary faworyt', 0, '2019-01-02T10:00:00Z'),
      createContrib(1, 'Stary faworyt', 0, '2019-01-03T10:00:00Z'),
      createContrib(2, 'Świeży artykuł', 0, '2024-05-01T10:00:00Z'),
    ]);

    // The page edited once last year comes first; three old edits do not
    // outrank one recent one.
    expect(pages.map(p => p.title)).toEqual(['Świeży artykuł', 'Stary faworyt']);
  });

  it('orders by timestamp even when contributions arrive out of order', () => {
    const pages = selectArticlePages([
      createContrib(1, 'Najstarszy', 0, '2020-01-01T10:00:00Z'),
      createContrib(2, 'Najnowszy', 0, '2024-01-01T10:00:00Z'),
      createContrib(3, 'Pośredni', 0, '2022-01-01T10:00:00Z'),
    ]);

    expect(pages.map(p => p.title)).toEqual(['Najnowszy', 'Pośredni', 'Najstarszy']);
  });

  it('ignores everything outside the article namespace', () => {
    const pages = selectArticlePages([
      createContrib(1, 'Kraków', 0),
      createContrib(2, 'Dyskusja:Kraków', 1),
      createContrib(3, 'Wikipedysta:X', 2),
    ]);

    expect(pages.map(p => p.pageid)).toEqual([1]);
  });

  it('skips revisions with no live page behind them', () => {
    const pages = selectArticlePages([createContrib(0, 'Deleted article')]);
    expect(pages).toEqual([]);
  });

  it('keeps a moved page as one page, under the title of its newest edit', () => {
    const pages = selectArticlePages([
      createContrib(1, 'Stara nazwa', 0, '2023-01-01T10:00:00Z'),
      createContrib(1, 'Nowa nazwa', 0, '2023-06-01T10:00:00Z'),
    ]);

    expect(pages).toEqual([
      { pageid: 1, title: 'Nowa nazwa', count: 2, lastEdited: '2023-06-01T10:00:00Z' },
    ]);
  });
});

describe('computeCategoryAnalysis', () => {
  const contribs = [
    createContrib(1, 'Kraków'),
    createContrib(1, 'Kraków'),
    createContrib(1, 'Kraków'),
    createContrib(2, 'Gdańsk'),
    createContrib(2, 'Gdańsk'),
    createContrib(3, 'Jan Kowalski'),
  ];

  const categories = categoryMap([
    [1, 'Kraków', ['Miasta w Polsce', 'Kraków']],
    [2, 'Gdańsk', ['Miasta w Polsce']],
    [3, 'Jan Kowalski', ['Polscy politycy', 'Urodzeni w 1950']],
  ]);

  it('weights a category by edits and by distinct pages', () => {
    const { categories: ranked } = computeCategoryAnalysis(contribs, categories);

    const cities = ranked.find(c => c.name === 'Miasta w Polsce');
    expect(cities).toMatchObject({ editCount: 5, pageCount: 2 });

    const krakow = ranked.find(c => c.name === 'Kraków');
    expect(krakow).toMatchObject({ editCount: 3, pageCount: 1 });
  });

  it('ranks by edit count, busiest first', () => {
    const { categories: ranked } = computeCategoryAnalysis(contribs, categories);
    expect(ranked.map(c => c.name)).toEqual(['Miasta w Polsce', 'Kraków', 'Polscy politycy']);
  });

  it('lists the pages behind a category, busiest first', () => {
    const { categories: ranked } = computeCategoryAnalysis(contribs, categories);
    const cities = ranked.find(c => c.name === 'Miasta w Polsce');

    expect(cities?.pages).toEqual([
      { pageid: 1, title: 'Kraków', count: 3 },
      { pageid: 2, title: 'Gdańsk', count: 2 },
    ]);
  });

  it('filters non-topical categories by default and reports how many', () => {
    const filtered = computeCategoryAnalysis(contribs, categories);
    expect(filtered.categories.map(c => c.name)).not.toContain('Urodzeni w 1950');
    expect(filtered.filteredOut).toBe(1);

    const unfiltered = computeCategoryAnalysis(contribs, categories, { includeNoise: true });
    expect(unfiltered.categories.map(c => c.name)).toContain('Urodzeni w 1950');
    expect(unfiltered.filteredOut).toBe(0);
  });

  it('counts a category once even if a page lists it twice', () => {
    const duplicated = categoryMap([[1, 'Kraków', ['Miasta w Polsce', 'Miasta w Polsce']]]);
    const { categories: ranked } = computeCategoryAnalysis(contribs, duplicated);

    expect(ranked.find(c => c.name === 'Miasta w Polsce')).toMatchObject({
      editCount: 3,
      pageCount: 1,
    });
  });

  it('reports coverage against the whole sample, not just looked-up pages', () => {
    // Only Kraków was looked up; Gdańsk and Jan Kowalski were not.
    const partial = categoryMap([[1, 'Kraków', ['Miasta w Polsce']]]);
    const { coverage } = computeCategoryAnalysis(contribs, partial);

    expect(coverage).toEqual({
      pagesResolved: 1,
      pagesTotal: 3,
      editsCovered: 3,
      editsTotal: 6,
    });
  });

  it('reports coverage unaffected by the noise filter', () => {
    const withFilter = computeCategoryAnalysis(contribs, categories);
    const withoutFilter = computeCategoryAnalysis(contribs, categories, { includeNoise: true });

    expect(withFilter.coverage).toEqual(withoutFilter.coverage);
  });

  it('handles an empty category map', () => {
    const { categories: ranked, coverage } = computeCategoryAnalysis(contribs, new Map());

    expect(ranked).toEqual([]);
    expect(coverage.pagesResolved).toBe(0);
    expect(coverage.editsCovered).toBe(0);
    expect(coverage.editsTotal).toBe(6);
  });
});

describe('isNoiseCategory', () => {
  it('matches year-indexed and maintenance categories', () => {
    expect(isNoiseCategory('Urodzeni w 1950')).toBe(true);
    expect(isNoiseCategory('Zmarli w 2003')).toBe(true);
    expect(isNoiseCategory('Artykuły wymagające uzupełnienia źródeł')).toBe(true);
    expect(isNoiseCategory('1950 births')).toBe(true);
    expect(isNoiseCategory('Living people')).toBe(true);
  });

  it('leaves topical categories alone', () => {
    expect(isNoiseCategory('Miasta w Polsce')).toBe(false);
    expect(isNoiseCategory('Polscy politycy')).toBe(false);
    expect(isNoiseCategory('Historia Krakowa')).toBe(false);
  });

  it('accepts a caller-supplied pattern list', () => {
    expect(isNoiseCategory('Miasta w Polsce', [/^Miasta/])).toBe(true);
    expect(isNoiseCategory('Urodzeni w 1950', [/^Miasta/])).toBe(false);
  });
});
