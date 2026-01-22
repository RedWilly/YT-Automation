/**
 * Retry Utilities for Image Providers
 * Provides exponential backoff and retry mechanisms
 * Includes unified safety retry wrapper for all providers
 */

import type { ImageProvider, ImageGenerationOptions, ImageGenerationResult } from "./types.ts";
import type { ResolvedStyle } from "../../../styles/types.ts";
import { isUnsafePromptError, isHighTrafficError } from "./errors.ts";
import { rewriteUnsafePrompt } from "../../llm/client.ts";
import * as logger from "../../../utils/logger.ts";

/**
 * Configuration for retry with exponential backoff
 */
export interface RetryConfig {
    /** Maximum number of retry attempts (default: 3) */
    maxAttempts?: number;
    /** Base delay in milliseconds (default: 1000) */
    baseDelayMs?: number;
    /** Maximum delay cap in milliseconds (default: 600000 = 10 min) */
    maxDelayMs?: number;
    /** Multiplier for exponential growth (default: 2) */
    multiplier?: number;
    /** Add random jitter to prevent thundering herd (default: true) */
    jitter?: boolean;
    /** Log tag for debug messages */
    logTag?: string;
}

/**
 * Default retry configuration
 */
const DEFAULT_CONFIG: Required<RetryConfig> = {
    maxAttempts: 3,
    baseDelayMs: 1000,
    maxDelayMs: 600000,
    multiplier: 2,
    jitter: true,
    logTag: "Retry",
};

/**
 * Calculate delay for a specific attempt using exponential backoff
 * @param attempt - Current attempt number (1-indexed)
 * @param config - Retry configuration
 * @returns Delay in milliseconds
 */
export function calculateBackoffDelay(attempt: number, config: Partial<RetryConfig> = {}): number {
    const { baseDelayMs, maxDelayMs, multiplier, jitter } = { ...DEFAULT_CONFIG, ...config };

    // Exponential: baseDelay * multiplier^(attempt-1)
    // Example with defaults: 1s, 2s, 4s, 8s, 16s...
    const exponentialDelay = baseDelayMs * Math.pow(multiplier, attempt - 1);

    // Cap at maximum delay
    let delay = Math.min(exponentialDelay, maxDelayMs);

    // Add jitter (±25%) to prevent thundering herd
    if (jitter) {
        const jitterAmount = delay * 0.25;
        delay = delay - jitterAmount + Math.random() * jitterAmount * 2;
    }

    return Math.round(delay);
}

/**
 * Sleep for a specified duration
 * @param ms - Duration in milliseconds
 */
export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute a function with exponential backoff retry
 * @param fn - Async function to execute
 * @param config - Retry configuration
 * @returns Result of the function
 * @throws Last error if all attempts fail
 */
export async function withRetry<T>(
    fn: () => Promise<T>,
    config: Partial<RetryConfig> = {}
): Promise<T> {
    const { maxAttempts, logTag } = { ...DEFAULT_CONFIG, ...config };
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));

            if (attempt < maxAttempts) {
                const delay = calculateBackoffDelay(attempt, config);
                logger.warn(logTag, `Attempt ${attempt}/${maxAttempts} failed, retrying in ${Math.round(delay / 1000)}s...`);
                await sleep(delay);
            }
        }
    }

    throw lastError ?? new Error("All retry attempts failed");
}

/**
 * Check if an error is retryable (network, rate limit, server errors)
 * @param error - Error to check
 * @returns True if error is likely transient and worth retrying
 */
export function isRetryableError(error: unknown): boolean {
    if (!(error instanceof Error)) return true;

    const message = error.message.toLowerCase();

    const retryablePatterns = [
        "timeout",
        "econnreset",
        "econnrefused",
        "socket hang up",
        "network",
        "rate limit",
        "429",
        "500",
        "502",
        "503",
        "504",
    ];

    return retryablePatterns.some(pattern => message.includes(pattern));
}

/**
 * Options for generateWithSafetyRetry
 */
export interface SafetyRetryOptions {
    /** Maximum number of retry attempts (default: 3) */
    maxAttempts?: number;
    /** Maximum number of prompt rewrites for safety errors (default: 25) */
    maxRewrites?: number;
    /** Style for prompt rewriting context */
    style: ResolvedStyle;
    /** Style prefix to prepend to prompt when generating (applied at generation time, not during rewrite) */
    stylePrefix?: string;
    /** Callback when prompt is rewritten (for caching) - receives the raw scene prompt without style */
    onPromptRewritten?: (newPrompt: string, rewriteCount: number) => void;
}

/**
 * Extended result that includes the final prompt used (may differ from input if rewritten)
 */
export interface SafetyRetryResult extends ImageGenerationResult {
    /** The final prompt that succeeded (may be rewritten) */
    finalPrompt: string;
    /** Number of times the prompt was rewritten */
    rewriteCount: number;
}

/**
 * Generate an image with unified retry logic for all error types:
 * - UnsafePromptError: Rewrites prompt via LLM and retries
 * - HighTrafficError: Waits and retries the same attempt
 * - Other errors: Exponential backoff retry
 * 
 * This is the single source of truth for image generation retry logic.
 * All callers (downloader, server, CLI, etc.) should use this instead of provider.generate() directly.
 * 
 * @param provider - The image provider to use
 * @param options - Generation options (prompt, aspectRatio, etc.)
 * @param retryOptions - Retry and safety options
 * @returns Generated image with metadata about rewrites
 */
export async function generateWithSafetyRetry(
    provider: ImageProvider,
    options: ImageGenerationOptions,
    retryOptions: SafetyRetryOptions
): Promise<SafetyRetryResult> {
    const {
        maxAttempts = 3,
        maxRewrites = 25,
        style,
        stylePrefix,
        onPromptRewritten,
    } = retryOptions;

    // currentPrompt is the raw scene description (no style)
    let currentPrompt = options.prompt;
    const originalPrompt = options.prompt;
    let rewriteCount = 0;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            // Apply style prefix only at generation time
            const fullPrompt = stylePrefix ? `${stylePrefix}. ${currentPrompt}` : currentPrompt;
            
            logger.debug("SafetyRetry", `[${provider.name}] Generating image (attempt ${attempt}/${maxAttempts})`);

            const result = await provider.generate({
                ...options,
                prompt: fullPrompt,
            });

            if (attempt > 1 || rewriteCount > 0) {
                logger.success("SafetyRetry", `Successfully generated after ${attempt} attempts, ${rewriteCount} rewrites`);
            }

            return {
                ...result,
                finalPrompt: currentPrompt,
                rewriteCount,
            };

        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));

            // Handle unsafe prompt - rewrite and retry (resets attempt counter)
            if (isUnsafePromptError(error) && rewriteCount < maxRewrites) {
                rewriteCount++;
                logger.warn("SafetyRetry", `Prompt flagged as unsafe (rewrite ${rewriteCount}/${maxRewrites}), requesting LLM rewrite...`);

                const rewrittenPrompt = await rewriteUnsafePrompt(
                    currentPrompt,
                    style,
                    originalPrompt,
                    rewriteCount,
                    maxRewrites
                );

                currentPrompt = rewrittenPrompt;

                // Notify caller for caching
                if (onPromptRewritten) {
                    onPromptRewritten(rewrittenPrompt, rewriteCount);
                }

                logger.log("SafetyRetry", `Retrying with rewritten prompt: ${rewrittenPrompt.substring(0, 60)}...`);

                // Reset attempt counter - rewrite is a "fresh start"
                attempt = 0;
                continue;
            }

            // Handle high traffic - wait and retry same attempt
            if (isHighTrafficError(error)) {
                const waitTime = error.retryAfterMs;
                logger.warn("SafetyRetry", `High traffic on ${error.provider}, waiting ${waitTime / 1000}s before retry...`);
                await sleep(waitTime);
                attempt--; // Retry the same attempt
                continue;
            }

            // Handle other errors with exponential backoff
            if (attempt < maxAttempts) {
                const delay = calculateBackoffDelay(attempt, { logTag: "SafetyRetry" });
                logger.warn("SafetyRetry", `Attempt ${attempt} failed, retrying in ${Math.round(delay / 1000)}s...`);
                await sleep(delay);
            }
        }
    }

    throw new Error(
        `Failed to generate image after ${maxAttempts} attempts and ${rewriteCount} rewrites. Error: ${lastError?.message}`
    );
}
