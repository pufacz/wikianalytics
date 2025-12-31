
import { describe, it, expect } from 'vitest';
import { processStatistics } from './wikipedia';
import { WikiUser, WikiContrib } from '../types';

describe('processStatistics bug reproduction', () => {
    const mockUser: WikiUser = {
        userid: 123,
        name: 'TestUser',
        editcount: 1000,
        registration: '2020-01-01T00:00:00Z',
        groups: [],
        gender: 'unknown'
    };

    const createContrib = (timestamp: string): WikiContrib => ({
        userid: 123,
        user: 'TestUser',
        pageid: 1,
        revid: Math.random(),
        parentid: 0,
        ns: 0,
        title: 'Test',
        timestamp,
        comment: 'test',
        size: 100
    });

    it('identifies today edits correctly', () => {
        // Use a fixed reference date: Oct 29, 2025
        const refDate = new Date('2025-10-29T12:00:00'); // Local time Oct 29

        // Create a contribution on the SAME day
        const contribs = [
            createContrib('2025-10-29T10:00:00Z')
        ];

        const stats = processStatistics(mockUser, contribs, refDate);

        // Expected dayKey in loop: "2025-10-29"
        // Actual currentDayKey in code: "2025-9-29" (because 10-1 = 9 and no padding)

        console.log('thisDayEdits:', stats.thisDayEdits);
        expect(stats.thisDayEdits).toBe(1);
    });

    it('identifies month edits correctly for averages', () => {
        const refDate = new Date('2025-10-29T12:00:00');
        const contribs = [
            createContrib('2025-10-29T10:00:00Z')
        ];

        const stats = processStatistics(mockUser, contribs, refDate);

        // avgMonthlyEdits should NOT include this month if it's "historic" average
        // But if currentMonthKey is wrong, it might include it or fail to filter it.
        // Actually the code does:
        // const otherMonths = Object.keys(monthlyEditsMap).filter(k => k !== currentMonthKey);
        // if currentMonthKey is "2025-9" and map has "2025-10", then otherMonths will have "2025-10".

        // If we only have edits in the current month, avgMonthlyEdits (historic) should be 0.
        expect(stats.avgMonthlyEdits).toBe(0);
    });
});
