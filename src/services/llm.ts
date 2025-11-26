/**
 * LLM service for generating image search queries
 * Supports multiple providers (DeepSeek, Kimi, etc.) via configuration
 */

import {
  AI_API_KEY,
  AI_BASE_URL,
  AI_MODEL,
  AI_PROVIDER,
  LLM_SEGMENTS_PER_BATCH,
  USE_AI_IMAGE,
  AI_IMAGE_STYLE,
} from "../constants.ts";
import type {
  LLMRequest,
  LLMResponse,
  ImageSearchQuery,
} from "../types.ts";
import * as logger from "../logger.ts";

import { buildSystemPrompt, buildUserPrompt } from "../prompts.ts";

// Maximum number of retry attempts for LLM requests per batch
const LLM_MAX_RETRIES = 2;

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
    "LLM",
    `Generating image search queries using ${AI_PROVIDER}`,
    `${segmentCount} segments`
  );

  // Build system prompt with conditional AI style integration
  const systemPrompt = buildSystemPrompt(USE_AI_IMAGE, AI_IMAGE_STYLE);

  // Log whether AI style is being used
  if (USE_AI_IMAGE) {
    logger.log(
      "LLM",
      `🎨 AI image generation enabled - including style in queries: "${AI_IMAGE_STYLE.substring(
        0,
        50
      )}..."`
    );
  } else {
    logger.log(
      "LLM",
      `🔍 Web image search enabled - optimizing queries for search results`
    );
  }

  // If small enough, single request
  const batchSize = LLM_SEGMENTS_PER_BATCH;
  if (segmentCount <= batchSize) {
    const userPrompt = buildUserPrompt(lines.join("\n"), segmentCount, USE_AI_IMAGE);
    const queries = await callLLMWithRetry(
      systemPrompt,
      userPrompt,
      "",
      LLM_MAX_RETRIES
    );
    logger.success(
      "LLM",
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
    const expectedCount = batchLines.length;

    logger.step(
      "LLM",
      `Processing batch ${batchIndex + 1}/${totalBatches}`,
      `Segments ${start + 1}-${end}`
    );

    const userPrompt = buildUserPrompt(batchFormatted, expectedCount, USE_AI_IMAGE);
    const label = ` (batch ${batchIndex + 1})`;

    // Retry logic for batches that don't return the expected number of queries
    let queries: ImageSearchQuery[] = [];
    let retryAttempt = 0;
    const maxBatchRetries = LLM_MAX_RETRIES;

    while (retryAttempt <= maxBatchRetries) {
      queries = await callLLMWithRetry(
        systemPrompt,
        userPrompt,
        label,
        LLM_MAX_RETRIES
      );

      // Check if we got the expected number of queries
      if (queries.length === expectedCount) {
        break; // Success! Exit retry loop
      }

      // If not the expected count and we have retries left
      if (retryAttempt < maxBatchRetries) {
        logger.warn(
          "LLM",
          `Expected ${expectedCount} queries in batch ${batchIndex + 1}, got ${queries.length}. Retrying batch (attempt ${retryAttempt + 2}/${maxBatchRetries + 1})...`
        );
        retryAttempt++;
      } else {
        // Final attempt failed, log warning and proceed
        logger.warn(
          "LLM",
          `Expected ${expectedCount} queries in batch ${batchIndex + 1}, got ${queries.length} after ${maxBatchRetries + 1} attempts. Proceeding with partial results.`
        );
        break;
      }
    }

    validateImageQueries(queries);
    batches.push(...queries);
  }

  logger.success(
    "LLM",
    `Generated ${batches.length} image search queries across ${totalBatches} batches`
  );

  return batches;
}

/**
 * Call LLM chat API with retry logic and parse the image queries.
 * Retries are useful when the model returns malformed or noisy JSON.
 *
 * @param systemPrompt - System-level prompt for LLM
 * @param userPrompt - User-level prompt containing the transcript batch
 * @param label - Label for logging context (e.g., "" or " (batch 2)")
 * @param maxRetries - Maximum number of additional retry attempts
 * @returns Parsed image search queries from LLM
 */
async function callLLMWithRetry(
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
      // Note: We reuse DeepSeekRequest type as the structure is standard OpenAI-compatible
      const requestBody: LLMRequest = {
        model: AI_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.4,
        max_tokens: 8000,
      };

      const response = await fetch(`${AI_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${AI_API_KEY}`,
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

      const data = (await response.json()) as LLMResponse;
      const content = data.choices[0]?.message?.content;
      if (!content) {
        throw new Error(`No content in LLM response${label}`);
      }

      logger.raw("LLM", `Raw response content${label}`, content);
      const queries = parseImageQueries(content);
      return queries;
    } catch (error) {
      lastError = error;

      if (attempt >= totalAttempts) {
        throw error instanceof Error ? error : new Error(String(error));
      }

      logger.warn(
        "LLM",
        `Retrying LLM request${label} (attempt ${attempt + 1
        }/${totalAttempts}) due to error: ${error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Unknown error in callLLMWithRetry");
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
      "LLM",
      "Failed to parse JSON response",
      lastError ?? error
    );
    logger.debug("LLM", `Content was: ${jsonContent}`);
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

    // Warn if query exceeds word count limits based on mode
    const wordCount = query.query.split(/\s+/).length;
    const maxWords = USE_AI_IMAGE ? 40 : 10;
    if (wordCount > maxWords) {
      logger.warn(
        "LLM",
        `Query at index ${i} exceeds ${maxWords} words (${wordCount} words): "${query.query}"`
      );
    }
  }

  logger.success("LLM", `Validation passed for ${queries.length} queries`);
  return true;
}