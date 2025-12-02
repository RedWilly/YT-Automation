/**
 * LLM service for generating image search queries
 * Supports multiple providers (DeepSeek, Kimi, etc.) via configuration
 * Uses style-specific prompts and context
 */

import {
  AI_API_KEY,
  AI_BASE_URL,
  AI_MODEL,
  AI_PROVIDER,
  LLM_SEGMENTS_PER_BATCH,
  USE_AI_IMAGE,
} from "../constants.ts";
import type {
  LLMRequest,
  LLMResponse,
  ImageSearchQuery,
} from "../types.ts";
import type { ResolvedStyle } from "../styles/types.ts";
import * as logger from "../logger.ts";

import { buildSystemPrompt, buildUserPrompt } from "../prompts.ts";

// Maximum number of retry attempts for LLM requests per batch
const LLM_MAX_RETRIES = 2;

/**
 * Generate image search queries from formatted transcript
 * @param formattedTranscript - Formatted transcript with timestamps
 * @param style - Resolved style configuration for style-specific prompts
 * @returns Array of image search queries with timestamps
 */
export async function generateImageQueries(
  formattedTranscript: string,
  style: ResolvedStyle
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
    `${segmentCount} segments, style: ${style.name}`
  );

  // Build system prompt with style-specific context
  const systemPrompt = buildSystemPrompt(USE_AI_IMAGE, style);

  // Log whether AI style is being used
  if (USE_AI_IMAGE) {
    logger.log(
      "LLM",
      `🎨 AI image generation enabled - style: "${style.imageStyle.substring(
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
        1 // Reduced retry limit for batch retries to keep budget predictable
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
 * Parse and validate image queries from LLM response
 */
export function parseImageQueries(content: string): ImageSearchQuery[] {
  const jsonString = extractJsonSnippet(content);
  let parsed: any[] = [];

  // let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch (e) {
    try {
      logger.warn("LLM", "Standard parse failed, attempting JSON repair...");
      parsed = JSON.parse(repairJson(jsonString));
    } catch (repairError) {
      // Attempt 3: Brute Force Regex (The "Nuclear Option")
      logger.warn("LLM", "JSON repair failed, attempting brute force regex extraction...");
      parsed = fallbackExtraction(content);

      if (parsed.length === 0) {
        // Only throw if even brute force failed
        logger.error("LLM", "JSON extraction failed", { content: content.substring(0, 200) });
        throw new Error(`Failed to parse JSON: ${repairError instanceof Error ? repairError.message : String(repairError)}`);
      }
    }
  }

  if (!isValidQueryArray(parsed)) {
    throw new Error("Response parsed successfully but does not match ImageSearchQuery[] schema");
  }

  return parsed;
}

function extractJsonSnippet(content: string): string {
  const clean = content.replace(/```(?:json)?|```/g, "").trim();

  const firstOpen = clean.indexOf("[");

  if (firstOpen !== -1) {
    let depth = 0;
    let firstClose = -1;

    for (let i = firstOpen; i < clean.length; i++) {
      if (clean[i] === "[") depth++;
      if (clean[i] === "]") {
        depth--;
        if (depth === 0) {
          firstClose = i;
          break;
        }
      }
    }

    if (firstClose !== -1) {
      const extracted = clean.substring(firstOpen, firstClose + 1);

      const objectMatches = extracted.match(/\{[^}]+\}/g);
      if (objectMatches?.length) {
        const hasValidObjects = objectMatches.some(obj =>
          /["']?start["']?\s*:/i.test(obj)
        );

        if (hasValidObjects) {
          const validObjects = objectMatches.filter(obj =>
            /["']?start["']?\s*:/i.test(obj) &&
            /["']?end["']?\s*:/i.test(obj) &&
            /["']?query["']?\s*:/i.test(obj)
          );

          if (validObjects.length > 0) {
            return `[${validObjects.join(",")}]`;
          }
        }
      }

      return extracted;
    }
  }

  const objectPattern = /\{\s*["']?start["']?\s*:\s*\d+/;
  if (objectPattern.test(clean)) {
    const objectMatches = clean.match(/\{[^}]+\}/g);
    if (objectMatches?.length) {
      return `[${objectMatches.join(",")}]`;
    }
  }

  return clean;
}

export function repairJson(json: string): string {
  return json
    // FIX 1: Aggressively clean up keys with spaces inside quotes
    // Handles: " "start": 0, "end ": 500, " query ": ...
    .replace(/"\s*([a-zA-Z0-9_]+)\s*"\s*:/g, '"$1":')

    // FIX 2: Wrap unquoted 'query' values in quotes
    // Handles: query: Mysterious figure walks...
    // logic: Find 'query:', ensure next char isn't a quote/bracket, capture text until comma/brace
    .replace(/(["']?query["']?\s*:\s*)(?!["{\[])(.*?[^,}\]\s])(?=\s*[,}\]])/gi, '$1"$2"')

    // --- Original Standard Repairs ---
    .replace(/"\s+"(\w+)":/g, '"$1":')
    .replace(/"\s+(\w+)":/g, '"$1":')
    .replace(/,(\s*})/g, '$1')
    .replace(/,(\s*])/g, '$1')
    // Handles unquoted keys (start: 0 -> "start": 0)
    .replace(/(\{|,)\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":')
    .replace(/'([^']*)'(?=\s*[,}\]])/g, '"$1"')
    .replace(/^\[([#@!$%^&*]+)/, '[')
    .replace(/([#@!$%^&*]+)\]$/, ']')
    .replace(/\\([^"\\\/bfnrtu])/g, '$1')
    .replace(/\s*:\s*/g, ':')
    .replace(/\s*,\s*/g, ',');
}

export function fallbackExtraction(content: string): ImageSearchQuery[] {
  const results: ImageSearchQuery[] = [];

  // This regex matches an object-like pattern containing start, end, and query.
  const regex = /start["']?\s*:\s*(\d+)[\s\S]*?end["']?\s*:\s*(\d+)[\s\S]*?query["']?\s*:\s*(["'])([\s\S]*?)\3/gi;

  // FIX 1: Explicitly type the variable as RegExpExecArray or null
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    // Ensure required capture groups are present; skip malformed matches defensively.
    if (!match[1] || !match[2] || !match[4]) {
      continue;
    }
    const startVal = parseInt(match[1], 10);
    const endVal = parseInt(match[2], 10);
    const queryVal = match[4].trim();
    if (!isNaN(startVal) && !isNaN(endVal) && queryVal.length > 0) {
      results.push({
        start: startVal,
        end: endVal,
        query: queryVal
      });
    }
  }

  return results;
}

function isValidQueryArray(data: unknown): data is ImageSearchQuery[] {
  return Array.isArray(data) && data.every(item =>
    item &&
    typeof item === "object" &&
    typeof item.start === "number" &&
    typeof item.end === "number" &&
    typeof item.query === "string"
  );
}

export function validateImageQueries(queries: ImageSearchQuery[]): boolean {
  if (!Array.isArray(queries)) {
    throw new Error("Queries must be an array");
  }

  if (queries.length === 0) {
    throw new Error("Queries array is empty");
  }

  for (let i = 0; i < queries.length; i++) {
    const query = queries[i];

    if (!query ||
      typeof query.start !== "number" ||
      typeof query.end !== "number" ||
      typeof query.query !== "string") {
      throw new Error(`Invalid query structure at index ${i}`);
    }

    if (query.query.trim().length === 0) {
      throw new Error(`Empty query string at index ${i}`);
    }

    const wordCount = query.query.split(/\s+/).length;
    const maxWords = USE_AI_IMAGE ? 40 : 10;

    if (wordCount > maxWords) {
      logger.warn(
        "LLM",
        `Query at index ${i} exceeds ${maxWords} words (${wordCount}): "${query.query}"`
      );
    }
  }

  return true;
}