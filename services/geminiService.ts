import { GoogleGenAI } from "@google/genai";
import { UserStatistics, Namespace } from "../types";

// Overridable with GEMINI_MODEL in .env.local. Like the API key, this is
// substituted at build time, so changing it means restarting the dev server.
export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';

// An unset variable arrives as undefined, but a blank or whitespace-only entry
// in .env.local arrives as a string — which would otherwise be sent to the API
// as a model name and fail there rather than here.
export const resolveModel = (configured?: string): string =>
  configured?.trim() || DEFAULT_GEMINI_MODEL;

// The model actually in use, for labelling the generated output.
export const activeModel = (): string => resolveModel(process.env.GEMINI_MODEL);

// Pulls the readable part out of whatever the SDK threw. A failed call usually
// arrives with the API's JSON body as the message text, so the useful sentence
// is buried in a blob the reader should never have to see.
export const describeGeminiError = (error: unknown): string => {
  const raw = error instanceof Error ? error.message
    : typeof error === 'string' ? error
    : '';
  if (!raw.trim()) return 'Unknown error';

  const jsonStart = raw.indexOf('{');
  if (jsonStart !== -1) {
    try {
      const api = JSON.parse(raw.slice(jsonStart))?.error;
      if (api?.message) {
        const code = [api.code, api.status].filter(Boolean).join(' ');
        return code ? `${api.message} (${code})` : api.message;
      }
    } catch {
      // Not JSON after all — the raw text is the best we have.
    }
  }
  return raw;
};

const initGemini = () => {
  // Substituted at build time by vite.config, so a key added to .env.local
  // after the bundle was built does not apply until it is rebuilt.
  const apiKey = process.env.API_KEY || '';
  if (!apiKey) {
    throw new Error(
      'No Gemini API key configured. Set GEMINI_API_KEY in .env.local and restart the dev server — the key is built into the bundle, not read at runtime.'
    );
  }
  return new GoogleGenAI({ apiKey });
};

export const generateUserAnalysis = async (
  stats: UserStatistics, 
  lang: string, 
  startDate: string, 
  endDate: string, 
  customFocus?: string
): Promise<string> => {
  const ai = initGemini();

  // Construct a prompt based on the stats
  const topNs = stats.namespaceStats.slice(0, 3).map(n => `${n.name} (${n.percentage.toFixed(1)}%)`).join(', ');
  const busiestDay = stats.dayOfWeekStats.reduce((a, b) => a.count > b.count ? a : b).label;
  const busiestHour = stats.hourlyStats.reduce((a, b) => a.count > b.count ? a : b).label;
  const topPage = stats.editedPages.length > 0 ? stats.editedPages[0].title : 'N/A';
  // Default to Main (0) creations for analysis summary
  const mainCreations = stats.createdArticlesByNs[Namespace.MAIN] || 0;
  
  let prompt = `
    Analyze the activity of a Wikipedia user named "${stats.user.name}" on the "${lang}" Wikipedia.
    
    Context:
    - Analysis Period: From ${startDate} to ${endDate}
    - Edits in this sample: ${stats.totalFetched}
    - Total Edits (Lifetime): ${stats.user.editcount}
    - Account Registered: ${stats.user.registration}
    
    Activity Metrics (Sample):
    - New Articles Created (Main Namespace): ${mainCreations}
    - Top Namespaces: ${topNs}
    - Most Active Day: ${busiestDay}
    - Most Active Hour: ${busiestHour} Local Time
    - Top Edited Page: ${topPage}
    
    Please provide a professional, insightful 2-paragraph profile of this Wikipedian. 
    
    IMPORTANT: Provide the response strictly in the language of the Wikipedia being analyzed (Language Code: "${lang}"). For example, if the code is "pl", write in Polish; if "de", write in German.
  `;

  if (customFocus && customFocus.trim()) {
      prompt += `
      
      SPECIFIC USER QUESTION/FOCUS:
      The user has asked to specifically focus on the following regarding this editor: "${customFocus}".
      Ensure your analysis directly addresses this specific question or focus area while maintaining the profile format.
      `;
  } else {
      prompt += `
      
      1. First paragraph: Categorize their editing behavior (e.g., content creator, gnome, vandal fighter, talk page debater) based on namespace usage and patterns during this period.
      2. Second paragraph: Comment on their activity rhythm (consistency, time of day) and impact.
      `;
  }
    
  prompt += `\nKeep the tone objective and analytical.`;

  let response;
  try {
    response = await ai.models.generateContent({
      model: activeModel(),
      contents: prompt,
    });
  } catch (error) {
    console.error("Gemini API Error:", error);
    // Rethrown rather than returned as text: the caller has no way to tell an
    // error sentence from an analysis, and used to render one as the other.
    throw new Error(describeGeminiError(error), { cause: error });
  }

  const text = response.text?.trim();
  if (!text) {
    throw new Error(`The model (${activeModel()}) returned an empty response.`);
  }
  return text;
};