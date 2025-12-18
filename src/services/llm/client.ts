/**
 * LLM Client
 * Handles API communication with LLM providers (DeepSeek, Kimi, etc.)
 */

import { AI_TEXT, getAIConfig } from "../../config/environment.ts";
import { DEFAULT_LLM_SETTINGS } from "../../config/defaults.ts";
import type {
    LLMRequest,
    LLMResponse,
    ImageSearchQuery,
} from "../../types/index.ts";
import type { ResolvedStyle } from "../../styles/types.ts";
import * as logger from "../../utils/logger.ts";
import { parseImageQueries } from "./parser.ts";

// Get AI configuration
const aiConfig = getAIConfig();
const AI_API_KEY = aiConfig.apiKey;
const AI_BASE_URL = aiConfig.baseUrl;
const AI_MODEL = aiConfig.model;
const AI_PROVIDER = AI_TEXT.provider;

/**
 * Call LLM chat API with retry logic and parse the image queries.
 * Retries are useful when the model returns malformed or noisy JSON.
 * 
 * @param systemPrompt - System-level prompt for LLM
 * @param userPrompt - User-level prompt with transcript
 * @param label - Label for logging (e.g., batch number)
 * @param maxRetries - Maximum number of additional retry attempts
 * @returns Parsed image search queries from LLM
 */
export async function callLLMWithRetry(
    systemPrompt: string,
    userPrompt: string,
    label: string,
    maxRetries: number
): Promise<ImageSearchQuery[]> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const response = await callLLM(systemPrompt, userPrompt);
            const content = response.choices[0]?.message?.content;

            if (!content) {
                throw new Error("Empty response from LLM");
            }

            const queries = parseImageQueries(content);

            if (attempt > 0) {
                logger.success("LLM", `Successfully parsed response on attempt ${attempt + 1}${label}`);
            }

            return queries;
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));

            if (attempt < maxRetries) {
                logger.warn(
                    "LLM",
                    `LLM call${label} failed (attempt ${attempt + 1}/${maxRetries + 1}): ${lastError.message}. Retrying...`
                );
            }
        }
    }

    throw lastError ?? new Error("Unknown LLM error");
}

/**
 * Call the LLM API
 * @param systemPrompt - System prompt
 * @param userPrompt - User prompt
 * @returns LLM response
 */
async function callLLM(
    systemPrompt: string,
    userPrompt: string
): Promise<LLMResponse> {
    const request: LLMRequest = {
        model: AI_MODEL,
        messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
        ],
        temperature: 0.4,
        max_tokens: 8000,
    };

    logger.log("LLM", `Calling ${AI_PROVIDER}: ${AI_MODEL}`);

    const response = await fetch(`${AI_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${AI_API_KEY}`,
        },
        body: JSON.stringify(request),
    });

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`LLM API error: ${response.status} - ${errorBody}`);
    }

    return await response.json() as LLMResponse;
}

/**
 * Rewrite an unsafe image prompt to make it safe for AI image generation
 * Called when an image provider rejects a prompt due to safety filters
 * 
 * @param originalPrompt - The prompt that was rejected
 * @param style - Resolved style configuration for context
 * @returns Rewritten safe prompt
 */
export async function rewriteUnsafePrompt(
    originalPrompt: string,
    style: ResolvedStyle
): Promise<string> {
    logger.log("LLM", "Rewriting unsafe prompt using LLM...");

    const systemPrompt = `You are a prompt rewriting assistant. Your job is to rewrite image generation prompts that were rejected by safety filters.

RULES:
1. Keep the same general visual concept and scene
2. Remove any potentially sensitive content (violence, gore, weapons, nudity, etc.)
3. Make the scene more abstract or symbolic if needed
4. Maintain the art style: "${style.imageStyle}"
5. Return ONLY the rewritten prompt, no explanations

The rewritten prompt should be safe for AI image generation while still conveying the original visual concept.`;

    const userPrompt = `Rewrite this rejected prompt to be safe for AI image generation:

"${originalPrompt}"

Return ONLY the rewritten prompt:`;

    try {
        const response = await callLLM(systemPrompt, userPrompt);
        const content = response.choices[0]?.message?.content;

        if (!content) {
            throw new Error("Empty response from LLM");
        }

        // Clean up the response - remove quotes if present
        const rewritten = content.trim().replace(/^["']|["']$/g, "");

        logger.success("LLM", `Rewritten prompt: "${rewritten.substring(0, 50)}..."`);

        return rewritten;
    } catch (error) {
        logger.warn("LLM", `Failed to rewrite prompt: ${error instanceof Error ? error.message : String(error)}`);
        // Return a generic safe fallback
        return `Abstract ${style.imageStyle} artwork with ambient mood`;
    }
}
