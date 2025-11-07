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
const SYSTEM_PROMPT = `You are an expert content analyst and visual scene identifier.

Your task:
1. Analyze the transcript provided with timestamps.
2. For EACH segment in the transcript, generate EXACTLY ONE image search query (under 10 words).
3. The number of queries in your response MUST EXACTLY MATCH the number of segments in the transcript.
4. Use the EXACT start and end timestamps from each segment - do not modify them.
5. Return a valid JSON array where each item has exactly these keys:
   - "start": segment start in milliseconds (copy exactly from transcript)
   - "end": segment end in milliseconds (copy exactly from transcript)
   - "query": the visual search query for this segment

CRITICAL RULES:
- ✅ Generate EXACTLY ONE query per segment (no more, no less)
- ✅ Copy the exact start/end timestamps from the transcript
- ✅ Use concrete, visual nouns (e.g., "ancient temple ruins", "ocean waves crashing")
- ✅ Reflect the mood or action of the segment
- ✅ Keep queries under 10 words
- ❌ Do NOT generate multiple queries for the same segment
- ❌ Do NOT modify the timestamps
- ❌ Do NOT include abstract concepts ("freedom", "innovation")
- ❌ Do NOT include camera terms or formatting instructions
- ❌ Do NOT include explanations or extra text
- ❌ Do NOT include any extra fields beyond "start", "end", and "query"

Example Input:
[0–8640ms]: The waves crash upon the shore with a gentle rhythm.
[8640–15340ms]: As the tide retreats, it leaves behind shells and seaweed.

Example Output (2 segments = 2 queries):
[
  {
    "start": 0,
    "end": 8640,
    "query": "waves crashing on sandy shore"
  },
  {
    "start": 8640,
    "end": 15340,
    "query": "tide retreating at sunset"
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

