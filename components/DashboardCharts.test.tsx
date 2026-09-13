import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { sampleColor, sampleRadius, SampleDot } from './DashboardCharts';
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

describe('SampleDot', () => {
    const draw = (props: Record<string, unknown>) =>
        render(<svg><SampleDot cx={10} cy={20} payload={{ key: 9, samples: 5 }} {...props} /></svg>);

    it('rings the hour the analysis is anchored to', () => {
        const { queryByTestId } = draw({ currentHour: 9 });
        expect(queryByTestId('current-hour-ring')).not.toBeNull();
    });

    it('leaves every other hour unringed', () => {
        const { queryByTestId } = draw({ currentHour: 14 });
        expect(queryByTestId('current-hour-ring')).toBeNull();
    });

    it('draws no ring when there is no current hour to mark', () => {
        const { queryByTestId } = draw({});
        expect(queryByTestId('current-hour-ring')).toBeNull();
    });

    it('marks the hour by outline, never by repainting the sample colour', () => {
        // The fill still has to report the sample count: the ring is a second
        // channel, not a replacement for the scale.
        const { container } = draw({ currentHour: 9 });
        const fill = container.querySelectorAll('circle')[1];
        expect(fill.getAttribute('fill')).toBe(sampleColor(5));
    });

    it('grows the ring with the dot it surrounds', () => {
        const plain = draw({ currentHour: 9 }).container.querySelector('[data-testid="current-hour-ring"]');
        const hovered = draw({ currentHour: 9, boost: 2 }).container.querySelector('[data-testid="current-hour-ring"]');

        expect(Number(hovered!.getAttribute('r'))).toBeGreaterThan(Number(plain!.getAttribute('r')));
    });

    it('renders nothing positioned off the plot', () => {
        const { container } = draw({ cx: undefined, cy: undefined, currentHour: 9 });
        expect(container.querySelectorAll('circle')).toHaveLength(0);
    });
});
