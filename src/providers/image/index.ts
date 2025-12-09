/**
 * AI Image Provider Registry and Selection
 * Central module for managing image generation providers
 * 
 * To add a new provider:
 * 1. Create src/providers/image/newprovider.ts implementing ImageProvider
 * 2. Import and register it in PROVIDERS below
 * 3. Add the ID to AI_IMAGE_MODEL options in constants.ts
 */

import type { ImageProvider } from "./types.ts";
import { cloudflareProvider } from "./cloudflare.ts";
import { togetherAIProvider } from "./togetherai.ts";
import { imageFXProvider } from "./imagefx.ts";
import { AI_IMAGE_MODEL } from "../../constants.ts";
import * as logger from "../../logger.ts";

// Re-export types for convenience
export * from "./types.ts";

/**
 * Registry of all available providers
 * Key = provider ID (matches AI_IMAGE_MODEL values)
 */
const PROVIDERS = new Map<string, ImageProvider>([
    ["cloudflare", cloudflareProvider],
    ["togetherai", togetherAIProvider],
    ["imagefx", imageFXProvider],
]);

/**
 * Fallback order for providers (used when primary fails)
 * Lower index = higher priority
 */
const FALLBACK_ORDER: string[] = ["imagefx", "togetherai", "cloudflare"];

/**
 * Get the currently configured primary provider
 * Based on AI_IMAGE_MODEL environment variable
 * @returns Primary ImageProvider
 * @throws Error if no provider is configured
 */
export function getProvider(): ImageProvider {
    const providerId = AI_IMAGE_MODEL || "cloudflare";
    const provider = PROVIDERS.get(providerId);

    if (!provider) {
        throw new Error(`Unknown image provider: ${providerId}. Available: ${getAvailableProviderIds().join(", ")}`);
    }

    if (!provider.isConfigured()) {
        throw new Error(`Provider "${provider.name}" is not configured. Check your API keys.`);
    }

    return provider;
}

/**
 * Get a fallback provider if the primary fails
 * Skips the primary provider and finds the next configured one
 * @param primaryId - ID of the primary provider that failed
 * @returns Fallback ImageProvider or null if none available
 */
export function getFallbackProvider(primaryId: string): ImageProvider | null {
    for (const providerId of FALLBACK_ORDER) {
        // Skip the primary provider
        if (providerId === primaryId) continue;

        const provider = PROVIDERS.get(providerId);
        if (provider && provider.isConfigured()) {
            logger.debug("Providers", `Fallback provider available: ${provider.name}`);
            return provider;
        }
    }

    logger.debug("Providers", "No fallback provider available");
    return null;
}

/**
 * Get provider by ID
 * @param id - Provider ID
 * @returns ImageProvider or undefined
 */
export function getProviderById(id: string): ImageProvider | undefined {
    return PROVIDERS.get(id);
}

/**
 * Get all available provider IDs
 * @returns Array of provider IDs
 */
export function getAvailableProviderIds(): string[] {
    return Array.from(PROVIDERS.keys());
}

/**
 * Get all configured providers (with valid API keys)
 * @returns Array of configured ImageProviders
 */
export function getConfiguredProviders(): ImageProvider[] {
    const configured: ImageProvider[] = [];
    for (const provider of PROVIDERS.values()) {
        if (provider.isConfigured()) {
            configured.push(provider);
        }
    }
    return configured;
}

/**
 * Check if any AI image provider is configured
 * @returns True if at least one provider is configured
 */
export function hasConfiguredProvider(): boolean {
    return getConfiguredProviders().length > 0;
}

/**
 * Get provider info for logging/debugging
 * @returns Object with provider status info
 */
export function getProviderInfo(): {
    primary: { id: string; name: string; configured: boolean } | null;
    fallback: { id: string; name: string; configured: boolean } | null;
    available: string[];
} {
    const primaryId = AI_IMAGE_MODEL || "cloudflare";
    const primary = PROVIDERS.get(primaryId);
    const fallback = getFallbackProvider(primaryId);

    return {
        primary: primary ? {
            id: primary.id,
            name: primary.name,
            configured: primary.isConfigured(),
        } : null,
        fallback: fallback ? {
            id: fallback.id,
            name: fallback.name,
            configured: fallback.isConfigured(),
        } : null,
        available: getAvailableProviderIds(),
    };
}
