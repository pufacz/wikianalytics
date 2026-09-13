import { describe, it, expect } from 'vitest';
import { sampleColor } from './DashboardCharts';
import { MIN_HOUR_SAMPLES } from '../types';

describe('sampleColor', () => {
    const RED = '#ef4444';
    const ORANGE = '#f97316';
    const YELLOW = '#eab308';
    const GREEN = '#10b981';

    it('warns in red when nothing stands behind the average', () => {
        expect(sampleColor(0)).toBe(RED);
    });

    it('steps orange then yellow as samples accumulate', () => {
        expect(sampleColor(1)).toBe(ORANGE);
        expect(sampleColor(2)).toBe(YELLOW);
    });

    it('turns green once the average is actually reported', () => {
        expect(sampleColor(MIN_HOUR_SAMPLES)).toBe(GREEN);
        expect(sampleColor(MIN_HOUR_SAMPLES + 10)).toBe(GREEN);
    });

    it('draws the green boundary at the same threshold the average uses', () => {
        // The colour must never promise a figure the chart is suppressing.
        expect(sampleColor(MIN_HOUR_SAMPLES - 1)).not.toBe(GREEN);
    });

    it('keeps a sane colour for counts that cannot occur', () => {
        expect(sampleColor(-1)).toBe(RED);
    });
});
