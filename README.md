<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# WikiAnalytics

**WikiAnalytics** is a React-based web application designed to provide deep insights into Wikipedia editor habits. It fetches user contribution data from Wikipedia's public API, calculates detailed statistics (yearly/monthly performance, heatmap, activity rhythm), and uses **Google Gemini AI** to generate a qualitative profile of the editor.

## Features

-   **Deep Statistics**: Comprehensive analysis of user contributions, including yearly/monthly breakdowns and namespace distribution.
-   **Activity Heatmaps**: Visualizes editing habits with weekday x hour heatmaps.
-   **Rhythm Analysis**: Analyzes hourly and day-of-week activity patterns.
-   **AI-Powered Profiling**: Uses Google Gemini to analyze metrics and generate a qualitative "editor personality" profile.
-   **Comparison View**: Compare reports between different users.

## Tech Stack

-   **Framework**: [React](https://react.dev/) (v19) with [Vite](https://vitejs.dev/)
-   **Language**: [TypeScript](https://www.typescriptlang.org/)
-   **Styling**: [Tailwind CSS](https://tailwindcss.com/)
-   **Icons**: [Lucide React](https://lucide.dev/)
-   **Charts**: [Recharts](https://recharts.org/)
-   **AI**: [Google GenAI SDK](https://www.npmjs.com/package/@google/genai)

## Getting Started

### Prerequisites

-   Node.js (v18+ recommended)
-   Google Gemini API Key

### Installation

1.  **Clone the repository**
    ```bash
    git clone https://github.com/yourusername/wikianalytics.git
    cd wikianalytics
    ```

2.  **Install dependencies**
    ```bash
    npm install
    ```

3.  **Environment Setup**
    Create a `.env.local` file in the root directory and add your Gemini API key:
    ```env
    GEMINI_API_KEY=your_actual_api_key_here
    ```

4.  **Run the application**
    ```bash
    npm run dev
    ```
    The app should now be running at `http://localhost:5173`.

## Architecture

-   **`App.tsx`**: Main controller handling state, routing, and data flow.
-   **`services/wikipedia.ts`**: Core logic for fetching API data and calculating statistics.
-   **`services/geminiService.ts`**: Handles interaction with the Google Gemini API for profile generation.
-   **`components/`**: UI components including charts and analysis views.

## AI Integration

This project uses the **Google Gemini** model (specifically `gemini-2.5-flash`) to interpret statistical data. When a user clicks "Analyze", the app constructs a structured prompt based on computed metrics (e.g., top namespaces, busiest active hours) and requests a professional summary of the editor's habits.

<!-- Original AI Studio Link: https://ai.studio/apps/drive/1eI9TYVf1OtEuVTRqckPqZyfI_pQgZ_j9 -->
