import { describe, it, expect } from 'vitest';
import { resolveModel, DEFAULT_GEMINI_MODEL, describeGeminiError } from './geminiService';

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

describe('describeGeminiError', () => {
    it('digs the sentence out of the API JSON the SDK reports as a message', () => {
        // What an invalid key actually looks like coming back from the SDK.
        const err = new Error('got status: 400 Bad Request. {"error":{"code":400,"message":"API key not valid. Please pass a valid API key.","status":"INVALID_ARGUMENT"}}');
        expect(describeGeminiError(err)).toBe(
            'API key not valid. Please pass a valid API key. (400 INVALID_ARGUMENT)'
        );
    });

    it('reports a wrong model name in terms the reader can act on', () => {
        const err = new Error('{"error":{"code":404,"message":"models/gemini-9.9-ultra is not found for API version v1beta","status":"NOT_FOUND"}}');
        expect(describeGeminiError(err)).toContain('gemini-9.9-ultra is not found');
        expect(describeGeminiError(err)).toContain('404 NOT_FOUND');
    });

    it('reports a quota failure rather than a generic one', () => {
        const err = new Error('{"error":{"code":429,"message":"Resource has been exhausted (e.g. check quota).","status":"RESOURCE_EXHAUSTED"}}');
        expect(describeGeminiError(err)).toBe(
            'Resource has been exhausted (e.g. check quota). (429 RESOURCE_EXHAUSTED)'
        );
    });

    it('keeps plain messages as they are', () => {
        // A network failure never carries a JSON body.
        expect(describeGeminiError(new TypeError('Failed to fetch'))).toBe('Failed to fetch');
    });

    it('falls back to the raw text when the braces are not JSON', () => {
        const err = new Error('something broke {not json at all');
        expect(describeGeminiError(err)).toBe('something broke {not json at all');
    });

    it('survives a JSON body with no error field', () => {
        expect(describeGeminiError(new Error('{"unexpected":true}'))).toBe('{"unexpected":true}');
    });

    it('handles a thrown string and a thrown object', () => {
        expect(describeGeminiError('plain string failure')).toBe('plain string failure');
        expect(describeGeminiError({ weird: true })).toBe('Unknown error');
    });

    it('never returns an empty string for the UI to render as blank', () => {
        expect(describeGeminiError(new Error(''))).toBe('Unknown error');
        expect(describeGeminiError(new Error('   '))).toBe('Unknown error');
        expect(describeGeminiError(undefined)).toBe('Unknown error');
    });
});
