import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { App } from './App';
import { fetchFirstEditDate } from './services/wikipedia';

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
