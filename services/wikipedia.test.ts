import { describe, it, expect, vi, afterEach } from 'vitest';
import { processStatistics, fetchFirstEditDate } from './wikipedia';
import { MIN_HOUR_SAMPLES } from '../types';
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

    describe('hourly pace baselines', () => {
        const at = (y: number, m: number, d: number, h: number) =>
            createContrib(new Date(y, m - 1, d, h, 0, 0).toISOString());
        const repeat = (n: number, y: number, m: number, d: number, h: number) =>
            Array.from({ length: n }, () => at(y, m, d, h));

        describe('vs. the same weekday', () => {
            // Oct 23 2024 is a Wednesday; Oct 16, Oct 9, Oct 2 and Sep 25 precede it.
            const refDate = new Date(2024, 9, 23, 15, 0, 0);

            const stats = processStatistics(mockUser, [
                ...repeat(2, 2024, 10, 23, 14), // the reference Wednesday itself
                ...repeat(4, 2024, 10, 16, 14),
                ...repeat(2, 2024, 10, 9, 14),
                ...repeat(3, 2024, 10, 2, 14),  // 14:00 worked on 3 earlier Wednesdays
                ...repeat(5, 2024, 10, 16, 10), // 10:00 worked on 1
                ...repeat(2, 2024, 10, 16, 11),
                ...repeat(4, 2024, 10, 9, 11),  // 11:00 worked on 2
                ...repeat(1, 2024, 9, 25, 20),  // keeps this Wednesday in the pool only
            ], refDate);
            const hour = (h: number) => stats.currentWeekdayHourlyStats.find(s => s.key === h)!;

            it('confirms the fixture really is a Wednesday', () => {
                expect(refDate.getDay()).toBe(3);
            });

            it('divides an hour by the days worked in that hour, not by every active day', () => {
                // 4 + 2 + 3 edits at 14:00 over the 3 Wednesdays that were worked then.
                // Dividing by all 4 active Wednesdays would understate this as 2.25.
                expect(hour(14).samples).toBe(3);
                expect(hour(14).average).toBe(3);
            });

            it('still reports the whole pool of earlier days for the header badge', () => {
                expect(stats.currentWeekdayAverageDays).toBe(4);
            });

            it('withholds an average below the sample threshold', () => {
                expect(MIN_HOUR_SAMPLES).toBe(3);
                expect(hour(11).samples).toBe(2); // 6 edits, but only 2 days
                expect(hour(11).average).toBe(0);
                expect(hour(10).samples).toBe(1); // a single 5-edit session
                expect(hour(10).average).toBe(0);
            });

            it('leaves hours that were never worked at zero', () => {
                expect(hour(4).samples).toBe(0);
                expect(hour(4).average).toBe(0);
            });

            it('keeps the reference day out of both the totals and the divisor', () => {
                expect(hour(14).today).toBe(2);
                // Reference day counted in would be 11 edits over 4 days = 2.75.
                expect(hour(14).average).toBe(3);
            });
        });

        describe('vs. the same calendar date', () => {
            const refDate = new Date(2024, 9, 25, 15, 0, 0);

            const stats = processStatistics(mockUser, [
                ...repeat(2, 2024, 10, 25, 14), // reference date itself
                ...repeat(4, 2023, 10, 25, 14),
                ...repeat(2, 2022, 10, 25, 14),
                ...repeat(3, 2021, 10, 25, 14), // 14:00 worked in 3 earlier years
                ...repeat(1, 2020, 10, 25, 9),  // keeps 2020 in the pool only
                ...repeat(9, 2019, 10, 20, 14), // different date, must not count
            ], refDate);
            const hour = (h: number) => stats.currentDateHourlyStats.find(s => s.key === h)!;

            it('divides an hour by the years worked in that hour', () => {
                expect(hour(14).samples).toBe(3);
                expect(hour(14).average).toBe(3);
            });

            it('still reports the whole pool of earlier years for the header badge', () => {
                expect(stats.currentDateAverageYears).toBe(4);
            });

            it('withholds an average below the sample threshold', () => {
                expect(hour(9).samples).toBe(1);
                expect(hour(9).average).toBe(0);
            });

            it('shares the "today" series with the weekday chart', () => {
                // Both describe the same day, so only their baselines may differ.
                expect(stats.currentDateHourlyStats.map(s => s.today))
                    .toEqual(stats.currentWeekdayHourlyStats.map(s => s.today));
            });
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
