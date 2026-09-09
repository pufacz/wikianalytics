# WikiAnalytics Agent Guide

## Project shape

- This is a TypeScript React 19 app built and served with Vite.
- [App.tsx](App.tsx) owns the main dashboard state, URL parameters, loading flow, persistence, and tab-level composition.
- Keep reusable presentation in [components/](components/) and shared domain types in [types.ts](types.ts).
- Treat [services/wikipedia.ts](services/wikipedia.ts) as the Wikipedia API boundary and statistics engine. Keep `processStatistics` pure when changing metric behavior.
- [services/storage.ts](services/storage.ts) owns IndexedDB persistence; [services/geminiService.ts](services/geminiService.ts) owns Gemini requests and prompt construction.
- Read [README.md](README.md) and [GEMINI.md](GEMINI.md) for the broader architecture and setup context.

## Development commands

```bash
npm install
npm run dev
npm run build
npm test -- --run
npm run preview
```

The Vite development server uses port `3000`. The test environment is `jsdom` and loads [setupTests.ts](setupTests.ts).

## Working conventions

- Use the existing React, TypeScript, Lucide, Recharts, and utility-class patterns. Preserve the current dark dashboard visual language unless the task explicitly changes it.
- Prefer small, typed changes at the owning boundary. Add or update focused tests beside service logic, especially for `processStatistics` and date/time edge cases.
- Statistics group contribution timestamps using the browser's local time, while Wikipedia API date parameters are UTC. Make timezone assumptions explicit in tests.
- Contribution results are expected newest-first in incremental-update paths. Preserve ordering and deduplicate carefully when changing fetch or refresh behavior.
- Keep Wikipedia fetching, IndexedDB access, and Gemini calls behind their existing service modules rather than embedding them in presentation components.
- Use `@/` only where it matches existing imports; otherwise preserve the nearby import style.

## Environment and safety

- Local Gemini configuration uses `GEMINI_API_KEY` in `.env.local`; do not commit `.env*` files or print key values.
- Vite currently exposes that key to the browser as `process.env.API_KEY`. Treat it as public client configuration; do not describe it as a server-side secret or expand its exposure without an explicit architecture change.
- Wikipedia calls are browser-side and use public API CORS. Avoid adding credentials to Wikipedia requests.
- Before finishing a change, run `npm test -- --run` and `npm run build` when the environment permits. For UI changes, also exercise the affected flow through `npm run dev`.