# WikiAnalytics - Project Context (GEMINI.md)

## Project Overview
**WikiAnalytics** is a React-based web application designed to provide deep insights into Wikipedia editor habits. It fetches user contribution data from Wikipedia's public API, calculates detailed statistics (yearly/monthly performance, heatmap, activity rhythm), and uses **Google Gemini AI** to generate a qualitative profile of the editor.

## Tech Stack
-   **Framework**: [React](https://react.dev/) (v19) with [Vite](https://vitejs.dev/)
-   **Language**: [TypeScript](https://www.typescriptlang.org/)
-   **Styling**: [Tailwind CSS](https://tailwindcss.com/) (using utility classes)
-   **Icons**: [Lucide React](https://lucide.dev/)
-   **Charts**: [Recharts](https://recharts.org/)
-   **AI**: [Google GenAI SDK](https://www.npmjs.com/package/@google/genai)
-   **Deployment**: Can be deployed as a static site.

## Architecture

### Directory Structure
```
/
├── App.tsx                 # Main Application Component (State, Routing, Layout)
├── components/             # UI Components
│   ├── DashboardCharts.tsx # Individual Recharts components
│   ├── AnalysisSection.tsx # AI Analysis UI & Trigger
│   └── ComparisonView.tsx  # comparison logic (separate tab)
├── services/               # core logic
│   ├── wikipedia.ts        # Wikipedia API fetching & Statistics calculation
│   └── geminiService.ts    # Google Gemini AI integration
└── types.ts                # TypeScript interfaces (WikiUser, WikiContrib, UserStatistics)
```

### Key Components

#### `App.tsx`
The central controller. It handles:
-   **State Management**: `user`, `rawContribs`, `stats` (derived via `useMemo`).
-   **Routing**: Simple tab switching between `dashboard` (Live Analysis) and `compare` (Report Comparison).
-   **Data Flow**: Fetches data -> Updates state -> `processStatistics` computes metrics -> Passes to charts.
-   **Persistence**: Currently client-side only.

#### `services/wikipedia.ts`
The "brain" of the data processing.
-   `fetchWikiUser()`: Gets basic account meta (reg date, edit count).
-   `fetchUserContributions()`: Iteratively fetches edits (up to 2000 safety limit per batch).
-   `processStatistics()`: A massive function that aggregates thousands of edits into:
    -   `namespaceStats`: Distribution by namespace.
    -   `hourlyStats` / `dayOfWeekStats`: Activity rhythm (Local Time).
    -   `heatmap`: Weekday x Hour matrix.
    -   `averages`: Calculates historical averages to power the "Projected" metrics.

#### `services/geminiService.ts`
The AI Layer.
-   **Model**: Uses `gemini-2.5-flash` for speed and efficiency.
-   **Input**: Receives the computed `UserStatistics` object.
-   **Prompt Engineering**: Constructs a structured prompt summarizing the user's "Activity Metrics" (Top namespaces, busiest hour, etc.) and asks for a 2-paragraph professional profile categorization (e.g., "Gnome", "Content Creator").

## AI Integration Details
The app allows users to generate an AI-powered analysis of the stats.
-   **Trigger**: User clicks "Analyze with Gemini" in `AnalysisSection`.
-   **Context**: The prompt identifies the language (e.g., `pl`, `en`) and forces the output language to match the target Wikipedia language.

## Setup & Development

### Prerequisites
-   Node.js
-   Google Gemini API Key

### Installation
1.  Clone repo.
2.  `npm install`
3.  Create `.env.local` and add:
    ```
    GEMINI_API_KEY=your_key_here
    ```
4.  `npm run dev`

### Building
`npm run build`
