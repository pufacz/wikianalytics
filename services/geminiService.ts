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

const initGemini = () => {
  // Assuming process.env.API_KEY is available in the environment
  const apiKey = process.env.API_KEY || '';
  if (!apiKey) {
    console.warn("API Key not found in environment variables.");
    return null;
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
  if (!ai) return "AI Analysis unavailable: Missing API Key.";

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

  try {
    const response = await ai.models.generateContent({
      model: resolveModel(process.env.GEMINI_MODEL),
      contents: prompt,
    });
    
    return response.text || "No analysis could be generated.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "Failed to generate AI analysis at this time.";
  }
};