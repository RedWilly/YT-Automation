/**
 * Custom error types for image generation providers
 * These are universal errors that any provider can throw
 */

/**
 * Error thrown when an image prompt is rejected as unsafe
 * Any image provider can throw this error when content is flagged
 */
export class UnsafePromptError extends Error {
    /** The original prompt that was rejected */
    public readonly originalPrompt: string;

    /** Optional reason from the provider */
    public readonly reason?: string;

    /** Provider that rejected the prompt */
    public readonly provider?: string;

    constructor(originalPrompt: string, reason?: string, provider?: string) {
        super(`Prompt rejected as unsafe: ${reason ?? "content policy violation"}`);
        this.name = "UnsafePromptError";
        this.originalPrompt = originalPrompt;
        this.reason = reason;
        this.provider = provider;
    }
}

/**
 * Check if an error is an unsafe prompt error
 * @param error - Error to check
 * @returns True if the error is an UnsafePromptError
 */
export function isUnsafePromptError(error: unknown): error is UnsafePromptError {
    return error instanceof UnsafePromptError;
}

/**
 * Error thrown when the provider is experiencing high traffic (429/quota exhausted)
 * Should trigger a retry after waiting
 */
export class HighTrafficError extends Error {
    /** Provider that returned the error */
    public readonly provider: string;

    /** Recommended wait time in milliseconds before retry */
    public readonly retryAfterMs: number;

    constructor(provider: string, retryAfterMs: number = 10000) {
        super(`High traffic detected on ${provider}. Retry after ${retryAfterMs / 1000}s.`);
        this.name = "HighTrafficError";
        this.provider = provider;
        this.retryAfterMs = retryAfterMs;
    }
}

/**
 * Check if an error is a high traffic error
 * @param error - Error to check
 * @returns True if the error is a HighTrafficError
 */
export function isHighTrafficError(error: unknown): error is HighTrafficError {
    return error instanceof HighTrafficError;
}
