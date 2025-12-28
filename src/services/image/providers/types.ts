/**
 * Common types and interfaces for AI image providers
 * All providers must implement the ImageProvider interface
 */

import type { ResolvedStyle } from "../../../styles/types.ts";

/**
 * Result from an image generation request
 */
export interface ImageGenerationResult {
    /** Raw image data */
    data: ArrayBuffer;
    /** Image format */
    format: "jpg" | "png" | "webp";
}

/**
 * Supported aspect ratios for image generation
 * - "16:9": Native horizontal video resolution
 * - "9:16": Native vertical/shorts resolution
 */
export type ImageAspectRatio = '16:9' | '9:16';

/**
 * Options for image generation
 */
export interface ImageGenerationOptions {
    /** The prompt describing the image to generate */
    prompt: string;
    /** Negative prompt (things to avoid) */
    negativePrompt: string;
    /** Optional width (provider may ignore if unsupported) */
    width?: number;
    /** Optional height (provider may ignore if unsupported) */
    height?: number;
    /** Aspect ratio hint for providers that support it */
    aspectRatio?: ImageAspectRatio;
}

/**
 * Common interface for all AI image providers
 * Implement this interface to add a new provider
 */
export interface ImageProvider {
    /** Provider display name (e.g., "Cloudflare Worker") */
    readonly name: string;

    /** Provider ID matching AI_IMAGE_MODEL value (e.g., "cloudflare") */
    readonly id: string;

    /**
     * Check if the provider is configured with required API keys
     * @returns True if provider can be used
     */
    isConfigured(): boolean;

    /**
     * Generate a single image
     * @param options - Generation options including prompt
     * @returns Generated image data
     * @throws Error if generation fails
     */
    generate(options: ImageGenerationOptions): Promise<ImageGenerationResult>;
}

/**
 * Provider configuration for registration
 */
export interface ProviderConfig {
    /** Provider ID (matches AI_IMAGE_MODEL values) */
    id: string;
    /** Provider instance */
    provider: ImageProvider;
    /** Priority for fallback order (lower = higher priority) */
    priority: number;
}
