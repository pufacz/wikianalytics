import { describe, it, expect, vi, afterEach } from 'vitest';
import { processStatistics, fetchFirstEditDate } from './wikipedia';
import { WikiUser, WikiContrib, Namespace } from '../types';

describe('processStatistics', () => {
    const mockUser: WikiUser = {
        userid: 123,
        name: 'TestUser',
        editcount: 1000,
        registration: '2020-01-01T00:00:00Z',
        groups: [],
        gender: 'unknown'
    };

    const createContrib = (timestamp: string, ns = 0, title = 'Test Page'): WikiContrib => ({
        userid: 123,
        user: 'TestUser',
        pageid: 1,
        revid: Math.random(),
        parentid: 0,
        ns,
        title,
        timestamp,
        comment: 'test',
        size: 100
    });

    it('correctly calculates basic edit counts', () => {
        const contribs = [
            createContrib('2023-01-01T10:00:00Z'),
            createContrib('2023-01-02T10:00:00Z'),
            createContrib('2023-01-02T11:00:00Z')
        ];

        // Reference date: 2023-01-05
        const refDate = new Date('2023-01-05T12:00:00Z');
        const stats = processStatistics(mockUser, contribs, refDate);

        expect(stats.totalFetched).toBe(3);
        expect(stats.thisYearEdits).toBe(3); // All in 2023
        expect(stats.namespaceStats[0].count).toBe(3);
    });

    it('correctly groups by namespace', () => {
        const contribs = [
            createContrib('2023-01-01T10:00:00Z', 0, 'Article'),
            createContrib('2023-01-01T11:00:00Z', 1, 'Talk:Article'),
            createContrib('2023-01-01T12:00:00Z', 2, 'User:Me')
        ];

        const stats = processStatistics(mockUser, contribs, new Date());

        const ns0 = stats.namespaceStats.find(n => n.id === 0);
        const ns1 = stats.namespaceStats.find(n => n.id === 1);
        const ns2 = stats.namespaceStats.find(n => n.id === 2);

        expect(ns0?.count).toBe(1);
        expect(ns1?.count).toBe(1);
        expect(ns2?.count).toBe(1);
    });

    it('calculates hourly activity correctly (Local Time simulation)', () => {
        // Note: The function uses local time of the machine running tests.
        // To make this deterministic, we'd usually mock the timezone or inspect the date object directly.
        // For now, we just check that the total matches.

        const contribs = [
            createContrib('2023-01-01T10:00:00Z'), // 10:00 UTC
            createContrib('2023-01-01T10:30:00Z')  // 10:30 UTC
        ];

        const stats = processStatistics(mockUser, contribs, new Date());
        const totalHours = stats.hourlyStats.reduce((acc, curr) => acc + curr.count, 0);
        expect(totalHours).toBe(2);
    });

    describe('currentDateHourlyStats (hourly pace vs. same date in earlier years)', () => {
        // Built from local-time parts so the expectations hold in any timezone:
        // processStatistics reads timestamps with getHours()/getDate().
        const at = (y: number, m: number, d: number, h: number) =>
            createContrib(new Date(y, m - 1, d, h, 0, 0).toISOString());

        const refDate = new Date(2024, 9, 25, 15, 0, 0); // Oct 25 2024, 15:00 local

        const contribs = [
            at(2024, 10, 25, 14), at(2024, 10, 25, 14), // reference date itself
            at(2024, 10, 25, 15),
            at(2023, 10, 25, 14), at(2023, 10, 25, 14),
            at(2023, 10, 25, 14), at(2023, 10, 25, 14), // 4 edits at 14:00
            at(2022, 10, 25, 14), at(2022, 10, 25, 14), // 2 edits at 14:00
            at(2021, 10, 20, 14), at(2021, 10, 20, 14), // different date, must not count
        ];

        const stats = processStatistics(mockUser, contribs, refDate);
        const hour = (h: number) => stats.currentDateHourlyStats.find(s => s.key === h)!;

        it('covers all 24 hours', () => {
            expect(stats.currentDateHourlyStats).toHaveLength(24);
        });

        it('reports the reference date own edits as "today"', () => {
            expect(hour(14).today).toBe(2);
            expect(hour(15).today).toBe(1);
            expect(hour(9).today).toBe(0);
        });

        it('averages earlier years over only the years that edited that date', () => {
            // 2023 (4 edits) + 2022 (2 edits) at 14:00, over 2 contributing years.
            // 2021 edited Oct 20, not Oct 25, so it neither adds edits nor dilutes the mean.
            expect(stats.currentDateAverageYears).toBe(2);
            expect(hour(14).average).toBe(3);
        });

        it('keeps the reference year out of its own baseline', () => {
            // 15:00 has an edit today but none in earlier years.
            expect(hour(15).today).toBe(1);
            expect(hour(15).average).toBe(0);
        });

        it('reports a zero baseline when no earlier year edited that date', () => {
            const onlyToday = processStatistics(mockUser, [at(2024, 10, 25, 14)], refDate);
            expect(onlyToday.currentDateAverageYears).toBe(0);
            expect(onlyToday.currentDateHourlyStats.every(s => s.average === 0)).toBe(true);
        });
    });
});

describe('fetchFirstEditDate', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    const stubFetch = (payload: unknown) => {
        const fetchMock = vi.fn().mockResolvedValue({ json: async () => payload });
        vi.stubGlobal('fetch', fetchMock);
        return fetchMock;
    };

    it('asks for the oldest edit and returns its date', async () => {
        const fetchMock = stubFetch({
            query: { usercontribs: [{ timestamp: '2003-09-11T13:04:12Z' }] }
        });

        const result = await fetchFirstEditDate('Gdarin', 'pl');

        expect(result).toBe('2003-09-11');

        // Direction matters: without ucdir=newer the API returns the NEWEST edit.
        const url = new URL(fetchMock.mock.calls[0][0]);
        expect(url.origin).toBe('https://pl.wikipedia.org');
        expect(url.searchParams.get('ucdir')).toBe('newer');
        expect(url.searchParams.get('uclimit')).toBe('1');
        expect(url.searchParams.get('ucuser')).toBe('Gdarin');
    });

    it('returns null for a user with no contributions', async () => {
        stubFetch({ query: { usercontribs: [] } });

        expect(await fetchFirstEditDate('NoSuchUser', 'pl')).toBeNull();
    });
});
