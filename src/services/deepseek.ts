/**
 * DeepSeek LLM service for generating image search queries
 */

import {
  DEEPSEEK_API_KEY,
  DEEPSEEK_BASE_URL,
  DEEPSEEK_MODEL,
} from "../constants.ts";
import type {
  DeepSeekRequest,
  DeepSeekResponse,
  ImageSearchQuery,
} from "../types.ts";
import * as logger from "../logger.ts";

/**
 * System prompt for the LLM
 */
const SYSTEM_PROMPT = `You are an expert content analyst and visual scene identifier specialized in Cold War, espionage, and intelligence operations.

Your task:
1. Analyze the FULL transcript (including timestamps) to understand the narrative tone, historical context, and setting.
2. For EACH transcript segment, generate EXACTLY ONE image search query (under 10 words).
3. The number of queries in your response MUST EXACTLY MATCH the number of transcript segments.
4. Use the EXACT start and end timestamps from each segment — do not alter them.
5. Return a valid JSON array where each object has exactly these keys:
   - "start": segment start in milliseconds (copy exactly)
   - "end": segment end in milliseconds (copy exactly)
   - "query": the image search query for that segment

DOMAIN CONTEXT:
This content focuses on Cold War espionage, covert missions, secret agencies (Mossad, CIA, KGB, MI6), betrayals, double agents, assassinations, and intelligence warfare. 
Scenes often involve surveillance, code exchanges, safehouses, political leaders, operations, and tense diplomacy.

ERA AND AESTHETIC ANALYSIS:
Before generating queries, infer the overall *time period* and *visual tone* of the transcript:
- 1940s–1970s → emphasize *Cold War*, *vintage*, *black and white*, *archival photo* feel.
- 1980s–1990s → use *grainy film*, *gritty urban*, *Soviet collapse*, *early tech surveillance* cues.
- 2000s–present → emphasize *modern intelligence*, *cyber warfare*, *digital espionage*.
Apply this mood consistently unless the transcript explicitly shifts time or tone.

TONE AND COLOR GUIDANCE:
Adapt descriptions subtly to match the story’s mood:
- Historical or documentary → use “black and white”, “archival photo”, “vintage scene”
- Covert or tense → use “dimly lit”, “shadowy room”, “foggy city alley”
- Action or pursuit → use “night street chase”, “agents in motion”, “helicopter surveillance”
- Political or diplomatic → use “conference table”, “embassy hallway”, “press briefing room”
- If no strong mood is implied → default to Cold War realism

CRITICAL RULES:
- ✅ Generate EXACTLY ONE query per segment (no more, no less)
- ✅ Copy timestamps exactly as given
- ✅ Use vivid, concrete scene nouns and environments
- ✅ Reflect the correct period, agency, or location if mentioned
- ✅ Keep each query under 10 words
- ❌ Do NOT use abstract ideas (“betrayal”, “loyalty”, “truth”)
- ❌ Do NOT use film or camera terms (“cinematic”, “close-up”, “B-roll”)
- ❌ Do NOT include any explanation, narration, or commentary
- ❌ Output ONLY a JSON array with "start", "end", "query" fields

STYLE EXAMPLES:
If transcript mentions:
- “Yom Kippur War” → “Israeli soldiers in Sinai desert 1973”
- “Soviet double agent” → “KGB officer in dim Moscow office 1980s”
- “Mossad operation in Paris” → “Mossad agents outside Paris café 1970s”
- “Cold War tension” → “black and white photo of Berlin Wall 1960s”
- “Modern surveillance” → “intelligence analysts watching monitors in dark room”

Example Input:
[0–5400ms]: In 1973, Mossad agents planned a covert rescue in Damascus.
[5400–10800ms]: Hidden cameras captured military trucks moving under the night sky.

Example Output:
[
  {
    "start": 0,
    "end": 5400,
    "query": "Mossad agents in Damascus 1970s black and white"
  },
  {
    "start": 5400,
    "end": 10800,
    "query": "military trucks moving at night 1970s Syria"
  }
]`;


/**
 * Generate image search queries from formatted transcript
 * @param formattedTranscript - Formatted transcript with timestamps
 * @returns Array of image search queries with timestamps
 */
export async function generateImageQueries(
  formattedTranscript: string
): Promise<ImageSearchQuery[]> {
  // Count segments in the formatted transcript
  const segmentCount = (formattedTranscript.match(/\[/g) || []).length;
  logger.step("DeepSeek", `Generating image search queries`, `${segmentCount} segments`);
  logger.debug("DeepSeek", `Formatted transcript:\n${formattedTranscript}`);

  const userPrompt = `Here is the Transcript with timestamps (each segment is [start–end ms]: text):

${formattedTranscript}

Generate EXACTLY ${segmentCount} image search queries (one per segment).`;

  const requestBody: DeepSeekRequest = {
    model: DEEPSEEK_MODEL,
    messages: [
      {
        role: "system",
        content: SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: userPrompt,
      },
    ],
    temperature: 0.7,
    max_tokens: 4000,
  };

  const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to generate image queries: ${response.status} - ${errorText}`
    );
  }

  const data = (await response.json()) as DeepSeekResponse;

  // Extract the content from the response
  const content = data.choices[0]?.message?.content;
  if (!content) {
    throw new Error("No content in DeepSeek response");
  }

  logger.raw("DeepSeek", "Raw response content", content);

  // Parse the JSON response
  const queries = parseImageQueries(content);

  logger.success("DeepSeek", `Generated ${queries.length} image search queries`);

  return queries;
}

/**
 * Parse image queries from LLM response
 * @param content - Raw content from LLM response
 * @returns Array of parsed image search queries
 */
function parseImageQueries(content: string): ImageSearchQuery[] {
  // Try to extract JSON from the content
  // Sometimes LLMs wrap JSON in markdown code blocks
  let jsonContent = content.trim();

  // Remove markdown code blocks if present
  if (jsonContent.startsWith("```json")) {
    jsonContent = jsonContent.replace(/^```json\s*/, "").replace(/\s*```$/, "");
  } else if (jsonContent.startsWith("```")) {
    jsonContent = jsonContent.replace(/^```\s*/, "").replace(/\s*```$/, "");
  }

  try {
    const parsed = JSON.parse(jsonContent) as ImageSearchQuery[];

    // Validate the structure
    if (!Array.isArray(parsed)) {
      throw new Error("Response is not an array");
    }

    // Validate each query
    for (const query of parsed) {
      if (
        typeof query.start !== "number" ||
        typeof query.end !== "number" ||
        typeof query.query !== "string"
      ) {
        throw new Error("Invalid query structure");
      }
    }

    return parsed;
  } catch (error) {
    logger.error("DeepSeek", "Failed to parse JSON response", error);
    logger.debug("DeepSeek", `Content was: ${jsonContent}`);
    throw new Error(
      `Failed to parse image queries from LLM response: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Validate image queries
 * @param queries - Array of image search queries to validate
 * @returns True if valid, throws error otherwise
 */
export function validateImageQueries(queries: ImageSearchQuery[]): boolean {
  if (!Array.isArray(queries)) {
    throw new Error("Queries must be an array");
  }

  if (queries.length === 0) {
    throw new Error("Queries array is empty");
  }

  const queriesLength = queries.length;
  for (let i = 0; i < queriesLength; i++) {
    const query = queries[i];
    if (!query) continue;

    if (
      typeof query.start !== "number" ||
      typeof query.end !== "number" ||
      typeof query.query !== "string"
    ) {
      throw new Error(`Invalid query at index ${i}`);
    }

    if (query.query.length === 0) {
      throw new Error(`Empty query string at index ${i}`);
    }
  }

  logger.success("DeepSeek", `Validation passed for ${queries.length} queries`);
  return true;
}

