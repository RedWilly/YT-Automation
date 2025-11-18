/**
 * DeepSeek LLM service for generating image search queries
 */

import {
  DEEPSEEK_API_KEY,
  DEEPSEEK_BASE_URL,
  DEEPSEEK_MODEL,
  DEEPSEEK_SEGMENTS_PER_BATCH,
  USE_AI_IMAGE,
  AI_IMAGE_STYLE,
} from "../constants.ts";
import type {
  DeepSeekRequest,
  DeepSeekResponse,
  ImageSearchQuery,
} from "../types.ts";
import * as logger from "../logger.ts";

import { buildSystemPrompt, buildUserPrompt } from "../prompts.ts";

// Maximum number of retry attempts for DeepSeek requests per batch
const DEEPSEEK_MAX_RETRIES = 2;

/**
 * Generate image search queries from formatted transcript
 * @param formattedTranscript - Formatted transcript with timestamps
 * @returns Array of image search queries with timestamps
 */
export async function generateImageQueries(
  formattedTranscript: string
): Promise<ImageSearchQuery[]> {
  // Split transcript into segment lines
  const lines = formattedTranscript
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const segmentCount = lines.length;
  logger.step(
    "DeepSeek",
    `Generating image search queries`,
    `${segmentCount} segments`
  );

  // Build system prompt with conditional AI style integration
  const systemPrompt = buildSystemPrompt(USE_AI_IMAGE, AI_IMAGE_STYLE);

  // Log whether AI style is being used
  if (USE_AI_IMAGE) {
    logger.log(
      "DeepSeek",
      `🎨 AI image generation enabled - including style in queries: "${AI_IMAGE_STYLE.substring(
        0,
        50
      )}..."`
    );
  } else {
    logger.log(
      "DeepSeek",
      `🔍 Web image search enabled - optimizing queries for search results`
    );
  }

  // If small enough, single request
  const batchSize = DEEPSEEK_SEGMENTS_PER_BATCH;
  if (segmentCount <= batchSize) {
    const userPrompt = buildUserPrompt(lines.join("\n"), segmentCount);
    const queries = await callDeepSeekWithRetry(
      systemPrompt,
      userPrompt,
      "",
      DEEPSEEK_MAX_RETRIES
    );
    logger.success(
      "DeepSeek",
      `Generated ${queries.length} image search queries`
    );
    return queries;
  }

  // Batching path
  const batches: ImageSearchQuery[] = [];
  const totalBatches = Math.ceil(segmentCount / batchSize);

  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
    const start = batchIndex * batchSize;
    const end = Math.min(start + batchSize, segmentCount);
    const batchLines = lines.slice(start, end);
    const batchFormatted = batchLines.join("\n");

    logger.step(
      "DeepSeek",
      `Processing batch ${batchIndex + 1}/${totalBatches}`,
      `Segments ${start + 1}-${end}`
    );

    const userPrompt = buildUserPrompt(batchFormatted, batchLines.length);
    const label = ` (batch ${batchIndex + 1})`;
    const queries = await callDeepSeekWithRetry(
      systemPrompt,
      userPrompt,
      label,
      DEEPSEEK_MAX_RETRIES
    );
    // Basic per-batch validation
    if (queries.length !== batchLines.length) {
      logger.warn(
        "DeepSeek",
        `Expected ${batchLines.length} queries in batch ${batchIndex + 1
        }, got ${queries.length}`
      );
    }
    validateImageQueries(queries);
    batches.push(...queries);
  }

  logger.success(
    "DeepSeek",
    `Generated ${batches.length} image search queries across ${totalBatches} batches`
  );

  return batches;
}

/**
 * Call DeepSeek chat API with retry logic and parse the image queries.
 * Retries are useful when the model returns malformed or noisy JSON.
 *
 * @param systemPrompt - System-level prompt for DeepSeek
 * @param userPrompt - User-level prompt containing the transcript batch
 * @param label - Label for logging context (e.g., "" or " (batch 2)")
 * @param maxRetries - Maximum number of additional retry attempts
 * @returns Parsed image search queries from DeepSeek
 */
async function callDeepSeekWithRetry(
  systemPrompt: string,
  userPrompt: string,
  label: string,
  maxRetries: number
): Promise<ImageSearchQuery[]> {
  const totalAttempts = maxRetries + 1;
  let attempt = 0;
  let lastError: unknown;

  while (attempt < totalAttempts) {
    attempt++;

    try {
      const requestBody: DeepSeekRequest = {
        model: DEEPSEEK_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.4,
        max_tokens: 8000,
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
          `Failed to generate image queries${label}: ${response.status} - ${errorText}`
        );
      }

      const data = (await response.json()) as DeepSeekResponse;
      const content = data.choices[0]?.message?.content;
      if (!content) {
        throw new Error(`No content in DeepSeek response${label}`);
      }

      logger.raw("DeepSeek", `Raw response content${label}`, content);
      const queries = parseImageQueries(content);
      return queries;
    } catch (error) {
      lastError = error;

      if (attempt >= totalAttempts) {
        throw error instanceof Error ? error : new Error(String(error));
      }

      logger.warn(
        "DeepSeek",
        `Retrying DeepSeek request${label} (attempt ${attempt + 1
        }/${totalAttempts}) due to error: ${error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Unknown error in callDeepSeekWithRetry");
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

  // First attempt: parse the whole content as JSON
  let parsedValue: unknown;
  let lastError: unknown;

  try {
    parsedValue = JSON.parse(jsonContent);
  } catch (error) {
    lastError = error;

    // Fallback: try to extract JSON arrays from noisy content and parse the first valid one
    const arrayMatches = jsonContent.match(/\[[\s\S]*?]/g);
    if (arrayMatches) {
      for (const candidate of arrayMatches) {
        const candidateText = candidate.trim();
        try {
          const candidateValue = JSON.parse(candidateText) as unknown;
          if (Array.isArray(candidateValue)) {
            parsedValue = candidateValue;
            jsonContent = candidateText; // For logging in case of later validation errors
            lastError = undefined;
            break;
          }
        } catch (innerError) {
          lastError = innerError;
        }
      }
    }
  }

  const parsed = parsedValue as ImageSearchQuery[];

  try {
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
    logger.error(
      "DeepSeek",
      "Failed to parse JSON response",
      lastError ?? error
    );
    logger.debug("DeepSeek", `Content was: ${jsonContent}`);
    throw new Error(
      `Failed to parse image queries from LLM response: ${error instanceof Error ? error.message : String(error)
      }`
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

    // Warn if query exceeds 17 words
    const wordCount = query.query.split(/\s+/).length;
    if (wordCount > 17) {
      logger.warn(
        "DeepSeek",
        `Query at index ${i} exceeds 17 words (${wordCount} words): "${query.query}"`
      );
    }
  }

  logger.success("DeepSeek", `Validation passed for ${queries.length} queries`);
  return true;
}