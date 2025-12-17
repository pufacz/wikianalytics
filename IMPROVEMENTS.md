# WikiAnalytics - Proposed Improvements (MoSCoW)

This document outlines potential improvements for the WikiAnalytics application, prioritized using the MoSCoW method (Must have, Should have, Could have, Won't have).

## Must Have (Critical for MVP/Stability)
These initiatives are critical for the reliability and core usability of the application.

*   **Unit Testing**: Implement `Vitest` unit tests for the complex `processStatistics` function in `services/wikipedia.ts`. The logic for heatmaps and averages is dense and prone to regression.
*   **URL State Synchronization**: Store the current search state (username, language, dates) in the URL query parameters. This allows users to bookmark or share direct links to specific analyses.
*   **Error Boundaries**: Add React Error Boundaries around the main dashboard components to prevent the entire app from crashing if one chart fails to render (e.g., due to malformed API data).
*   **API Rate Limiting Handling**: Improve robustness around the Wikipedia API calls. Implement exponential backoff if the API returns a 429 (Too Many Requests) or 503 error.

## Should Have (High Value)
Important features that provide significant value but are not strictly critical for the app to function.

*   **Local Persistence**: Use `localStorage` or `sessionStorage` to cache the fetched `rawContribs` for a session. Currently, refreshing the page loses all data, forcing a re-fetch.
*   **PDF Export**: Add a feature to export the dashboard (or the AI Analysis text) as a tailored PDF report, similar to the existing JSON export.
*   **Skeleton Loading States**: Replace the current simple loading text/spinner with UI skeleton loaders (for charts and cards) to improve perceived performance.
*   **Mobile Optimizations**: Fine-tune the charts for mobile screens (e.g., adjust aspect ratios or hide detailed axes on small viewports).

## Could Have (Nice to Have)
Desirable features that can be delayed or implemented as time permits.

*   **Dark/Light Mode Toggle**: Currently, the app is hardcoded to a dark aesthetic. Adding a light mode would improve accessibility for users who prefer high-contrast light themes.
*   **Gamification/Badges**: Visually display "Badges" based on stats (e.g., "Night Owl" for late-night editing, "Archivist" for high main-namespace edits).
*   **Internationalization (i18n)**: Translate the application UI (buttons, labels, tooltips) into other languages, matching the language of the Wikipedia being analyzed.
*   **Visual Diffing**: In the "Compare" tab, allow visualizing the actual text difference of detailed stats, not just side-by-side cards.

## Won't Have (Out of Scope)
Features that are agreed to be out of scope for the current architectural phase.

*   **Backend Database**: We will continue to operate as a client-side only (static) application. Storing user analysis history server-side introduces privacy and cost complexities that are unnecessary.
*   **User Accounts/Auth**: There is no need for users to "log in" to the tool itself; it should remain an open utility.
*   **Real-time WebSocket Updates**: Wikipedia edits happen frequently, but polling or sockets for "live" updates is overkill for this type of analytical tool.
