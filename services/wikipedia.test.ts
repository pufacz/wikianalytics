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
