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

    describe('productive period rankings', () => {
        const atLocalDate = (year: number, month: number, day: number) =>
            createContrib(new Date(year, month - 1, day, 12, 0, 0).toISOString());

        const contribs = [
            ...Array.from({ length: 2 }, () => atLocalDate(2022, 1, 1)),
            atLocalDate(2023, 1, 1),
            ...Array.from({ length: 4 }, () => atLocalDate(2023, 9, 20)),
            atLocalDate(2023, 12, 10),
        ];
        const stats = processStatistics(mockUser, contribs, new Date(2024, 0, 1, 12));

        it('ranks only active periods from least to most active', () => {
            expect(stats.leastDays[0].count).toBe(1);
            expect(stats.leastWeeks[0].count).toBeGreaterThan(0);
            expect(stats.leastMonths[0].count).toBeGreaterThan(0);
            expect(stats.leastYears[0].count).toBeGreaterThan(0);
            expect(stats.leastDays.every(period => period.count > 0)).toBe(true);
        });

        it('totals each calendar date across all selected years', () => {
            expect(stats.topDaysOfYear.map(({ label, count }) => ({ label, count }))).toEqual([
                { label: 'Sep 20', count: 4 },
                { label: 'Jan 01', count: 3 },
                { label: 'Dec 10', count: 1 },
            ]);
            expect(stats.leastDaysOfYear[0]).toMatchObject({ label: 'Dec 10', count: 1 });
        });

        it('fills zero-edit periods across an explicit selected range', () => {
            const rangeStats = processStatistics(
                mockUser,
                [atLocalDate(2022, 12, 31), atLocalDate(2024, 1, 2)],
                new Date(2024, 0, 2, 12),
                { startDate: '2022-12-31', endDate: '2024-01-02' }
            );

            expect(rangeStats.leastDays.every(period => period.count > 0)).toBe(true);
            expect(rangeStats.leastDaysIncludingZero).toContainEqual(expect.objectContaining({ date: '2023-01-01', count: 0 }));
            expect(rangeStats.leastWeeksIncludingZero.some(period => period.count === 0)).toBe(true);
            expect(rangeStats.leastMonthsIncludingZero).toContainEqual(expect.objectContaining({ date: '2023-01-01', count: 0 }));
            expect(rangeStats.leastYearsIncludingZero).toContainEqual(expect.objectContaining({ label: '2023', count: 0 }));
            expect(rangeStats.leastDaysOfYearIncludingZero).toContainEqual(expect.objectContaining({ label: 'Jan 01', count: 0 }));
        });

        it('retains up to 500 ranked periods for the larger display limits', () => {
            const start = new Date(2020, 0, 1, 12);
            const longHistory = Array.from({ length: 600 }, (_, offset) => {
                const date = new Date(start);
                date.setDate(date.getDate() + offset);
                return createContrib(date.toISOString());
            });

            const rangeStats = processStatistics(mockUser, longHistory, new Date(2021, 7, 22, 12));

            expect(rangeStats.topDays).toHaveLength(500);
            expect(rangeStats.leastDays).toHaveLength(500);
        });
    });

    describe('page creations for recurring reference periods', () => {
        const createdAt = (year: number, month: number, day: number) => ({
            ...createContrib(new Date(year, month - 1, day, 12, 0, 0).toISOString()),
            new: '',
        });

        it('totals creations for the reference calendar date, ISO week, and month across years', () => {
            const stats = processStatistics(mockUser, [
                createdAt(2022, 9, 21),
                createdAt(2023, 9, 21),
                createdAt(2024, 9, 16),
                createdAt(2024, 9, 30),
                createdAt(2024, 10, 1),
                createContrib(new Date(2021, 8, 21, 12).toISOString()), // An edit, not a creation
            ], new Date(2024, 8, 21, 12));

            expect(stats.referenceIsoWeek).toBe(38);
            expect(stats.editsOnReferenceDate).toBe(3);
            expect(stats.editsInReferenceWeek).toBe(4);
            expect(stats.editsInReferenceMonth).toBe(5);
            expect(stats.createdOnReferenceDate).toBe(2);
            expect(stats.createdInReferenceWeek).toBe(3);
            expect(stats.createdInReferenceMonth).toBe(4);
        });

        it('handles ISO week 53 across calendar-year boundaries', () => {
            const stats = processStatistics(mockUser, [
                createdAt(2015, 12, 31),
                createdAt(2020, 12, 28),
                createdAt(2021, 1, 3),
                createdAt(2021, 1, 4), // ISO week 1, so it must not count
            ], new Date(2021, 0, 1, 12));

            expect(stats.referenceIsoWeek).toBe(53);
            expect(stats.editsInReferenceWeek).toBe(3);
            expect(stats.createdInReferenceWeek).toBe(3);
        });
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
