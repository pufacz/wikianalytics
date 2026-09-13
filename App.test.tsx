import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { App } from './App';
import { fetchFirstEditDate, fetchWikiUser, fetchUserContributions } from './services/wikipedia';
import { WikiContrib } from './types';

// The charts themselves are recharts internals that cannot lay out in jsdom, and the
// tooltips under test live in App.tsx headers, not inside the charts.
vi.mock('./components/DashboardCharts', () => Object.fromEntries(
    ['NamespaceChart', 'HourlyActivityChart', 'WeeklyActivityChart', 'DayOfMonthChart',
     'ActivityHeatmap', 'CurrentMonthDailyChart', 'WeekdayHourlyActivityChart',
     'HourlyPaceChart'].map(name => [name, () => <div data-testid={name} />])
));

vi.mock('./services/storage', () => ({
    storage: {
        listUsers: vi.fn().mockResolvedValue([]),
        load: vi.fn().mockResolvedValue(null),
        save: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined),
    }
}));

vi.mock('./services/wikipedia', async (importOriginal) => ({
    ...(await importOriginal<typeof import('./services/wikipedia')>()),
    fetchFirstEditDate: vi.fn(),
    fetchWikiUser: vi.fn(),
    fetchUserContributions: vi.fn(),
}));

describe('App: "From" date follows the selected editor', () => {
    beforeEach(() => {
        vi.mocked(fetchFirstEditDate).mockReset();
    });

    // Lets the mount effect that loads saved profiles settle inside act().
    const renderApp = async () => {
        render(<App />);
        await act(async () => { await Promise.resolve(); });
    };

    const typeUsername = (name: string) => {
        fireEvent.change(screen.getByPlaceholderText('Enter Username...'), { target: { value: name } });
    };

    const fromInput = () => screen.getByLabelText('From') as HTMLInputElement;

    it('replaces the default date with the editor first edit', async () => {
        vi.mocked(fetchFirstEditDate).mockResolvedValue('2003-09-11');
        await renderApp();

        expect(fromInput().value).toBe('2001-01-01');

        typeUsername('Gdarin');

        await waitFor(() => expect(fromInput().value).toBe('2003-09-11'), { timeout: 3000 });
        expect(fetchFirstEditDate).toHaveBeenCalledWith('Gdarin', 'pl');
    });

    it('keeps the current date when the editor has no contributions', async () => {
        vi.mocked(fetchFirstEditDate).mockResolvedValue(null);
        await renderApp();

        typeUsername('NoSuchUser');

        await waitFor(() => expect(fetchFirstEditDate).toHaveBeenCalled(), { timeout: 3000 });
        expect(fromInput().value).toBe('2001-01-01');
    });

    it('debounces typing into a single lookup for the final name', async () => {
        vi.mocked(fetchFirstEditDate).mockResolvedValue('2006-11-04');
        await renderApp();

        typeUsername('Mas');
        typeUsername('Mast');
        typeUsername('Masti');

        await waitFor(() => expect(fromInput().value).toBe('2006-11-04'), { timeout: 3000 });
        expect(fetchFirstEditDate).toHaveBeenCalledTimes(1);
        expect(fetchFirstEditDate).toHaveBeenCalledWith('Masti', 'pl');
    });

    it('does not overwrite a date the user set by hand', async () => {
        vi.mocked(fetchFirstEditDate).mockResolvedValue('2003-09-11');
        await renderApp();

        typeUsername('Gdarin');
        fireEvent.change(fromInput(), { target: { value: '2015-06-01' } });

        await act(async () => { await new Promise(resolve => setTimeout(resolve, 1200)); });

        expect(fromInput().value).toBe('2015-06-01');
        expect(fetchFirstEditDate).not.toHaveBeenCalled();
    });
});

describe('App: every chart carries a description tooltip', () => {
    const contribs: WikiContrib[] = Array.from({ length: 40 }, (_, i) => ({
        userid: 1,
        user: 'Gdarin',
        pageid: i,
        revid: i,
        parentid: 0,
        ns: i % 3 === 0 ? 0 : 4,
        title: `Page ${i % 7}`,
        timestamp: `2024-0${(i % 9) + 1}-1${i % 10}T0${i % 10}:15:00Z`,
        comment: 'edit',
        size: 100,
    }));

    const renderDashboard = async () => {
        vi.mocked(fetchFirstEditDate).mockResolvedValue('2024-01-10');
        vi.mocked(fetchWikiUser).mockResolvedValue({
            userid: 1, name: 'Gdarin', editcount: 40, registration: '2003-09-11T00:00:00Z', groups: [],
        });
        vi.mocked(fetchUserContributions).mockResolvedValue(contribs);

        render(<App />);
        await act(async () => { await Promise.resolve(); });

        fireEvent.change(screen.getByPlaceholderText('Enter Username...'), { target: { value: 'Gdarin' } });
        fireEvent.click(screen.getByRole('button', { name: /analyze/i }));

        await screen.findByText('Namespace Distribution', {}, { timeout: 3000 });
    };

    // One distinctive phrase per chart, so a dropped or mis-wired tooltip fails loudly.
    const expectedTooltips: [string, RegExp][] = [
        ['Hour by Weekday', /Hour-by-hour edits on a single weekday/],
        ['Hourly Pace vs Average', /comes round once a year/],
        ['Hourly Pace vs Weekday', /spent editing at other times do not drag it down/],
        ['Namespace Distribution', /six largest namespaces/],
        ['Activity by Hour', /browser's local time, not UTC/],
        ['Activity by Day of Week', /raw totals, not averages/],
        ['Activity in <month>', /added up across every year in the range/],
        ['Day of Month (Overall)', /Day 31 occurs in only 7 months/],
        ['Heatmap', /relative to the single busiest cell/],
    ];

    it.each(expectedTooltips)('describes the %s chart', async (_name, phrase) => {
        await renderDashboard();
        expect(screen.getByText(phrase)).toBeInTheDocument();
    });

    it('renders the month chart description with the actual month name', async () => {
        await renderDashboard();
        const heading = screen.getByText(/^Activity in .+ \(Daily\)$/);
        const month = heading.textContent!.replace('Activity in ', '').replace(' (Daily)', '');
        expect(screen.getByText(new RegExp(`Edits on each day of ${month},`))).toBeInTheDocument();
    });
});

describe('App: browsing the reference date with arrow keys', () => {
    const renderApp = async () => {
        render(<App />);
        await act(async () => { await Promise.resolve(); });
    };

    const refDateInput = () => screen.getByLabelText('Analysis Ref Date') as HTMLInputElement;

    it('steps the reference date back and forward on the dashboard tab', async () => {
        await renderApp();
        const before = refDateInput().value;

        fireEvent.keyDown(window, { key: 'ArrowLeft' });
        await waitFor(() => {
            const d = new Date(before);
            d.setDate(d.getDate() - 1);
            expect(refDateInput().value).toBe(d.toISOString().split('T')[0]);
        });

        fireEvent.keyDown(window, { key: 'ArrowRight' });
        await waitFor(() => expect(refDateInput().value).toBe(before));
    });

    it('does not steal arrow keys while typing in another field', async () => {
        await renderApp();
        const before = refDateInput().value;
        const usernameInput = screen.getByPlaceholderText('Enter Username...');

        usernameInput.focus();
        fireEvent.keyDown(usernameInput, { key: 'ArrowLeft' });

        expect(refDateInput().value).toBe(before);
    });

    it('ignores the shortcut while an Alt/Ctrl/Meta modifier is held', async () => {
        await renderApp();
        const before = refDateInput().value;

        fireEvent.keyDown(window, { key: 'ArrowLeft', altKey: true });
        expect(refDateInput().value).toBe(before);
    });

    it('is inert once the comparison tab is active', async () => {
        await renderApp();
        fireEvent.click(screen.getByText('Compare Reports'));

        // The dashboard's reference date field is unmounted on this tab, so
        // there is nothing to assert other than the handler not throwing
        // once its own inputs are gone.
        expect(() => fireEvent.keyDown(window, { key: 'ArrowLeft' })).not.toThrow();
        expect(screen.queryByLabelText('Analysis Ref Date')).toBeNull();
    });
});
