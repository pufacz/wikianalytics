import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { processStatistics } from '../services/wikipedia';
import { WikiContrib, WikiUser } from '../types';
import { TopPeriodsPanel } from './TopPeriodsPanel';

describe('TopPeriodsPanel', () => {
    it('keeps zero-edit periods hidden until the switch is enabled', () => {
        const user: WikiUser = {
            userid: 1,
            name: 'Editor',
            editcount: 1,
            registration: '2024-01-01T00:00:00Z',
        };
        const contribution: WikiContrib = {
            userid: 1,
            user: 'Editor',
            pageid: 1,
            revid: 1,
            parentid: 0,
            ns: 0,
            title: 'Article',
            timestamp: new Date(2024, 0, 2, 12).toISOString(),
            comment: '',
            size: 100,
        };
        const stats = processStatistics(
            user,
            [contribution],
            new Date(2024, 0, 3, 12),
            { startDate: '2024-01-01', endDate: '2024-01-03' }
        );

        render(
            <TopPeriodsPanel
                stats={stats}
                username="Editor"
                lang="en"
                namespaceFilter="all"
            />
        );

        const zeroSwitch = screen.getByRole('switch', { name: 'Include periods with zero edits' });
        expect(zeroSwitch).toHaveAttribute('aria-checked', 'false');
        expect(screen.queryAllByText('0')).toHaveLength(0);
        expect(screen.getByRole('button', { name: 'Show 100' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Show 500' })).toBeInTheDocument();
        expect(screen.getAllByRole('heading', { name: 'Days' })).toHaveLength(2);
        expect(screen.getAllByRole('heading', { name: 'Weeks' })).toHaveLength(2);
        expect(screen.getAllByRole('heading', { name: 'Months' })).toHaveLength(2);
        expect(screen.getAllByRole('heading', { name: 'Years' })).toHaveLength(2);
        expect(screen.getAllByRole('heading', { name: 'Days of Year' })).toHaveLength(2);

        fireEvent.click(zeroSwitch);

        expect(zeroSwitch).toHaveAttribute('aria-checked', 'true');
        expect(screen.getAllByText('0').length).toBeGreaterThan(0);
    });
});
