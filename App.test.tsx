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

beforeEach(() => {
    vi.mocked(fetchFirstEditDate).mockReset();
    vi.mocked(fetchWikiUser).mockReset();
    vi.mocked(fetchUserContributions).mockReset();
    vi.stubGlobal('confirm', vi.fn(() => true));
});

describe('App: "From" date follows the selected editor', () => {
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

    it('overwrites a previously entered date when the editor changes', async () => {
        vi.mocked(fetchFirstEditDate).mockResolvedValue('2003-09-11');
        await renderApp();

        typeUsername('Gdarin');
        fireEvent.change(fromInput(), { target: { value: '2015-06-01' } });

        await waitFor(() => expect(fromInput().value).toBe('2003-09-11'), { timeout: 3000 });

        expect(fetchFirstEditDate).toHaveBeenCalledWith('Gdarin', 'pl');
    });
});

describe('App: approving a new editor load', () => {
    it('shows the lifetime edit count and keeps the existing dashboard when declined', async () => {
        const firstUser = {
            userid: 1, name: 'FirstEditor', editcount: 1_234, registration: '2020-01-01T00:00:00Z', groups: [],
        };
        const secondUser = {
            userid: 2, name: 'SecondEditor', editcount: 98_765, registration: '2021-01-01T00:00:00Z', groups: [],
        };
        const firstContrib: WikiContrib = {
            userid: 1, user: 'FirstEditor', pageid: 1, revid: 1, parentid: 0, ns: 0,
            title: 'Article', timestamp: '2024-01-02T12:00:00Z', comment: '', size: 100,
        };

        vi.mocked(fetchFirstEditDate).mockImplementation(async (name) =>
            name === 'FirstEditor' ? '2020-01-02' : '2021-02-03'
        );
        vi.mocked(fetchWikiUser)
            .mockResolvedValueOnce(firstUser)
            .mockResolvedValueOnce(secondUser);
        vi.mocked(fetchUserContributions).mockResolvedValue([firstContrib]);
        vi.mocked(window.confirm)
            .mockReturnValueOnce(true)
            .mockReturnValueOnce(false);

        render(<App />);
        await act(async () => { await Promise.resolve(); });

        const usernameInput = screen.getByPlaceholderText('Enter Username...');
        fireEvent.change(usernameInput, { target: { value: 'FirstEditor' } });
        await waitFor(() => expect(screen.getByLabelText('From')).toHaveValue('2020-01-02'), { timeout: 3000 });
        fireEvent.click(screen.getByRole('button', { name: 'Analyze' }));

        await screen.findByText('Namespace Distribution', {}, { timeout: 3000 });
        expect(window.confirm).toHaveBeenNthCalledWith(1, expect.stringContaining(firstUser.editcount.toLocaleString()));
        expect(fetchUserContributions).toHaveBeenCalledTimes(1);

        fireEvent.change(usernameInput, { target: { value: 'SecondEditor' } });
        await waitFor(() => expect(screen.getByLabelText('From')).toHaveValue('2021-02-03'), { timeout: 3000 });
        fireEvent.click(screen.getByRole('button', { name: 'Analyze' }));

        await waitFor(() => expect(window.confirm).toHaveBeenCalledTimes(2));
        expect(window.confirm).toHaveBeenNthCalledWith(2, expect.stringContaining(secondUser.editcount.toLocaleString()));
        expect(fetchUserContributions).toHaveBeenCalledTimes(1);
        expect(screen.getByRole('banner')).toHaveTextContent('FirstEditor');
        expect(screen.getByText('Namespace Distribution')).toBeInTheDocument();
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
        await waitFor(() => expect(screen.getByLabelText('From')).toHaveValue('2024-01-10'), { timeout: 3000 });
        const analyzeButton = screen.getByRole('button', { name: /analyze/i });
        await waitFor(() => expect(analyzeButton).toBeEnabled(), { timeout: 3000 });
        fireEvent.click(analyzeButton);

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

    it('renders both sets of recurring-period cards', async () => {
        await renderDashboard();

        expect(screen.getByText('All Edits by Reference Period')).toBeInTheDocument();
        expect(screen.getByText(/^Edits on [A-Z][a-z]{2} \d{1,2}$/)).toBeInTheDocument();
        expect(screen.getByText(/^Edits in ISO week \d+$/)).toBeInTheDocument();
        expect(screen.getByText(/^Edits in [A-Za-z]+$/)).toBeInTheDocument();
        expect(screen.getByText('Pages Created by Reference Period')).toBeInTheDocument();
        expect(screen.getByText(/^Created on /)).toBeInTheDocument();
        expect(screen.getByText(/^Created in ISO week \d+$/)).toBeInTheDocument();
        expect(screen.getByText(/^Created in [A-Za-z]+$/)).toBeInTheDocument();
    });

    it('refreshes the loaded Wikipedia data with Ctrl+R', async () => {
        await renderDashboard();
        const fetchContributions = vi.mocked(fetchUserContributions);
        fetchContributions.mockClear();

        const browserDefaultAllowed = fireEvent.keyDown(window, { key: 'r', ctrlKey: true });

        expect(browserDefaultAllowed).toBe(false);
        await waitFor(() => expect(fetchContributions).toHaveBeenCalledTimes(1));
    });
});

describe('App: browsing the reference date with keyboard shortcuts', () => {
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

    it('returns to the local current date when Home is pressed', async () => {
        await renderApp();
        fireEvent.change(refDateInput(), { target: { value: '2020-01-15' } });

        fireEvent.keyDown(window, { key: 'Home' });

        const now = new Date();
        const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        await waitFor(() => expect(refDateInput().value).toBe(today));
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

describe('App: the sticky header shows the day under analysis', () => {
    const contribs: WikiContrib[] = [
        // Three edits on the reference day, one the day before.
        { userid: 1, user: 'Gdarin', pageid: 1, revid: 1, parentid: 0, ns: 0, title: 'A', timestamp: '2024-03-14T09:00:00Z', comment: 'e', size: 10 },
        { userid: 1, user: 'Gdarin', pageid: 2, revid: 2, parentid: 0, ns: 0, title: 'B', timestamp: '2024-03-14T10:00:00Z', comment: 'e', size: 10 },
        { userid: 1, user: 'Gdarin', pageid: 3, revid: 3, parentid: 0, ns: 0, title: 'C', timestamp: '2024-03-14T11:00:00Z', comment: 'e', size: 10 },
        { userid: 1, user: 'Gdarin', pageid: 4, revid: 4, parentid: 0, ns: 0, title: 'D', timestamp: '2024-03-13T11:00:00Z', comment: 'e', size: 10 },
    ];

    const renderDashboard = async () => {
        vi.mocked(fetchFirstEditDate).mockResolvedValue('2024-03-01');
        vi.mocked(fetchWikiUser).mockResolvedValue({
            userid: 1, name: 'Gdarin', editcount: 4, registration: '2003-09-11T00:00:00Z', groups: [],
        });
        vi.mocked(fetchUserContributions).mockResolvedValue(contribs);

        render(<App />);
        await act(async () => { await Promise.resolve(); });

        fireEvent.change(screen.getByPlaceholderText('Enter Username...'), { target: { value: 'Gdarin' } });
        fireEvent.change(screen.getByLabelText('Analysis Ref Date'), { target: { value: '2024-03-14' } });
        await waitFor(() => expect(screen.getByLabelText('From')).toHaveValue('2024-03-01'), { timeout: 3000 });
        const analyzeButton = screen.getByRole('button', { name: /analyze/i });
        await waitFor(() => expect(analyzeButton).toBeEnabled(), { timeout: 3000 });
        fireEvent.click(analyzeButton);

        await screen.findByText('Namespace Distribution', {}, { timeout: 3000 });
    };

    const header = () => screen.getByRole('banner');

    it('names the editor, the date and that day\'s edit count', async () => {
        await renderDashboard();

        expect(header()).toHaveTextContent('Gdarin');
        expect(header()).toHaveTextContent('Thu, Mar 14, 2024');
        expect(header()).toHaveTextContent(/3\s*edits/);
    });

    it('follows the reference date as it is stepped', async () => {
        await renderDashboard();

        fireEvent.click(screen.getByLabelText('Previous day'));

        await waitFor(() => expect(header()).toHaveTextContent('Wed, Mar 13, 2024'));
        expect(header()).toHaveTextContent(/1\s*edits/);
    });

    it('stays put while the page scrolls', async () => {
        await renderDashboard();
        expect(header().className).toMatch(/\bsticky\b/);
        expect(header().className).toMatch(/\btop-0\b/);
    });

    it('hides the date once another tab is active', async () => {
        await renderDashboard();
        expect(header()).toHaveTextContent('Thu, Mar 14, 2024');

        fireEvent.click(screen.getByText('Subject Areas'));

        expect(header()).not.toHaveTextContent('Thu, Mar 14, 2024');
        // The tab switcher itself stays in the bar.
        expect(header()).toHaveTextContent('Live Analysis');
    });
});
