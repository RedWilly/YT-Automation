/**
 * Retry Utilities for Image Providers
 * Provides exponential backoff and retry mechanisms
 */

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
    maxDelayMs: 600000, // 10 minutes max delay
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
    if (!(error instanceof Error)) return true; // Unknown errors, try again

    const message = error.message.toLowerCase();

    // Definitely retry these
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
