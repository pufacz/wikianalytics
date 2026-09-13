import { describe, it, expect } from 'vitest';
import { resolveModel, DEFAULT_GEMINI_MODEL } from './geminiService';

describe('resolveModel', () => {
    it('uses the configured model when one is set', () => {
        expect(resolveModel('gemini-2.5-pro')).toBe('gemini-2.5-pro');
    });

    it('falls back when GEMINI_MODEL is not set at all', () => {
        expect(resolveModel(undefined)).toBe(DEFAULT_GEMINI_MODEL);
    });

    it('falls back on a blank entry in .env.local', () => {
        // "GEMINI_MODEL=" arrives as an empty string, not undefined.
        expect(resolveModel('')).toBe(DEFAULT_GEMINI_MODEL);
    });

    it('falls back rather than sending whitespace as a model name', () => {
        expect(resolveModel('   ')).toBe(DEFAULT_GEMINI_MODEL);
    });

    it('trims a stray space around an otherwise valid name', () => {
        expect(resolveModel(' gemini-2.5-flash-lite ')).toBe('gemini-2.5-flash-lite');
    });

    it('keeps the default the app already shipped with', () => {
        expect(DEFAULT_GEMINI_MODEL).toBe('gemini-2.5-flash');
    });
});
