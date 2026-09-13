import { describe, it, expect } from 'vitest';
import { sampleColor, sampleRadius } from './DashboardCharts';
import { MIN_HOUR_SAMPLES } from '../types';

describe('sampleColor', () => {
    const RED = '#e11d48';
    const ORANGE = '#f59e0b';
    const YELLOW = '#fde047';
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

describe('sampleRadius', () => {
    it('grows with the sample count, so size repeats what colour says', () => {
        const steps = [0, 1, 2, MIN_HOUR_SAMPLES].map(sampleRadius);
        const ascending = [...steps].sort((a, b) => a - b);
        expect(steps).toEqual(ascending);
        expect(new Set(steps).size).toBe(steps.length);
    });

    it('tops out at the same threshold the colour does', () => {
        expect(sampleRadius(MIN_HOUR_SAMPLES)).toBe(sampleRadius(MIN_HOUR_SAMPLES + 99));
        expect(sampleRadius(MIN_HOUR_SAMPLES - 1)).toBeLessThan(sampleRadius(MIN_HOUR_SAMPLES));
    });

    it('stays positive for counts that cannot occur', () => {
        expect(sampleRadius(-1)).toBeGreaterThan(0);
    });
});
