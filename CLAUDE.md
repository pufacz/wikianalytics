# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

WikiAnalytics is a React 19 + TypeScript application that analyzes Wikipedia editor habits. It fetches contribution data from Wikipedia's public API, computes detailed statistics, and uses Google Gemini AI to generate qualitative editor profiles.

## Development Commands

```bash
# Install dependencies
npm install

# Run development server (http://localhost:3000)
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Run tests (use --run for single execution)
npm test -- --run
```

## Architecture & Code Organization

### Data Flow Architecture

The application follows a unidirectional data flow:

1. **App.tsx** - Central controller that manages application state (`user`, `rawContribs`, `stats`)
2. **services/wikipedia.ts** - Fetches Wikipedia API data and computes statistics via `processStatistics()`
3. **services/geminiService.ts** - Sends computed stats to Gemini AI for qualitative analysis
4. **services/storage.ts** - Handles IndexedDB persistence for user reports
5. **components/** - Presentation components receive data as props

### Critical Files

- **[App.tsx](App.tsx)**: State management, URL routing, tab switching between dashboard and comparison views
- **[services/wikipedia.ts](services/wikipedia.ts)**: Wikipedia API boundary and statistics engine. `processStatistics()` is the core function that transforms raw contributions into metrics
- **[types.ts](types.ts)**: All TypeScript interfaces including `WikiUser`, `WikiContrib`, `UserStatistics`
- **[services/geminiService.ts](services/geminiService.ts)**: AI integration using `gemini-2.5-flash` model

### Key Architectural Decisions

**Time Zones**: Statistics are grouped using browser local time, while Wikipedia API date parameters use UTC. The difference matters for date-based aggregations (daily stats, heatmaps).

**Contribution Ordering**: Wikipedia API returns contributions newest-first. This ordering is preserved throughout the app and must be maintained when modifying fetch/refresh logic to ensure proper deduplication.

**Statistics Computation**: `processStatistics()` in [services/wikipedia.ts](services/wikipedia.ts) is a pure function that computes all metrics from raw contributions. Changes to metric behavior should be made here, not in components.

**Service Boundaries**: Keep Wikipedia API calls, IndexedDB access, and Gemini requests behind their respective service modules. Components should not directly call external APIs.

## Environment Configuration

Create `.env.local` in the root directory:

```
GEMINI_API_KEY=your_api_key_here
GEMINI_MODEL=gemini-2.5-flash   # optional; this is the default
```

Both are substituted at build time, so restart the dev server after changing
them. `GEMINI_MODEL` falls back to `DEFAULT_GEMINI_MODEL` in
[services/geminiService.ts](services/geminiService.ts) when unset or blank.

The Gemini API key is exposed to the browser via Vite's `define` configuration ([vite.config.ts:14](vite.config.ts#L14)). This is client-side configuration, not a server secret.

## Testing

Tests use Vitest with jsdom environment. Setup is in [setupTests.ts](setupTests.ts). When adding features:
- Add focused tests for service logic, especially in `processStatistics()`
- Test date/time edge cases explicitly given timezone handling
- Run `npm test -- --run` and `npm run build` before finishing changes
