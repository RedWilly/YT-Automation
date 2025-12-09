/**
 * ImageFX Provider
 * Uses Google's ImageFX via @rohitaryal/imagefx-api library (IMAGEN 3.5)
 * Requires GOOGLE_COOKIE environment variable for authentication
 */

import { ImageFX, Prompt, AspectRatio as OriginalAspectRatio } from "@rohitaryal/imagefx-api";
import type { ImageProvider, ImageGenerationOptions, ImageGenerationResult } from "./types.ts";
import { UnsafePromptError } from "./errors.ts";
import { GOOGLE_COOKIE } from "../../constants.ts";
import * as logger from "../../logger.ts";
import { join } from "node:path";
import { readFile, rm } from "node:fs/promises";
import { TMP_IMAGES_DIR } from "../../constants.ts";

/**
 * Extended AspectRatio with additional options not yet in the library
 * TODO: Remove wrapper when library adds MOBILE_LANDSCAPE support
 */
export const AspectRatio = {
    ...OriginalAspectRatio,
    // Custom aspect ratio for 4:3 landscape (good for video thumbnails)
    MOBILE_LANDSCAPE: "IMAGE_ASPECT_RATIO_LANDSCAPE_FOUR_THREE",
} as const;

export type AspectRatioType = keyof typeof AspectRatio;

/**
 * ImageFX image provider using Google's IMAGEN 3.5 model
 * Implements the ImageProvider interface with rate limiting
 */
class ImageFXProvider implements ImageProvider {
    readonly name = "ImageFX (IMAGEN 3.5)";
    readonly id = "imagefx";

    /** ImageFX client instance */
    private client: ImageFX | null = null;

    /** Track last request end time for rate limiting */
    private lastRequestEndTime = 0;

    /** Minimum delay between requests in milliseconds */
    private readonly MIN_DELAY_MS = 2000;

    /**
     * Check if ImageFX is configured (has Google cookie)
     */
    isConfigured(): boolean {
        return GOOGLE_COOKIE.length > 0;
    }

    /**
     * Get or create the ImageFX client
     */
    private getClient(): ImageFX {
        if (!this.client) {
            if (!this.isConfigured()) {
                throw new Error("ImageFX requires GOOGLE_COOKIE to be set");
            }
            this.client = new ImageFX(GOOGLE_COOKIE);
        }
        return this.client;
    }

    /**
     * Wait for rate limit if needed
     * If the last request took less than 2 seconds, wait for the remaining time
     */
    private async waitForRateLimit(): Promise<void> {
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestEndTime;

        if (this.lastRequestEndTime > 0 && timeSinceLastRequest < this.MIN_DELAY_MS) {
            const waitTime = this.MIN_DELAY_MS - timeSinceLastRequest;
            logger.debug("ImageFX", `Rate limiting: waiting ${Math.ceil(waitTime / 1000)}s before next request`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
    }

    /**
     * Generate an image using ImageFX (IMAGEN 3.5)
     * @param options - Generation options
     * @returns Generated image data
     */
    async generate(options: ImageGenerationOptions): Promise<ImageGenerationResult> {
        const { prompt: promptText } = options;

        // Apply rate limiting before starting
        await this.waitForRateLimit();

        logger.debug("ImageFX", `Generating image for: "${promptText.substring(0, 60)}..."`);

        const client = this.getClient();
        const requestStartTime = Date.now();

        // Create prompt with optimal settings for video generation
        const prompt = new Prompt({
            seed: 0, // Random seed for variety
            numberOfImages: 1,
            prompt: promptText,
            // Use 4:3 landscape for video-friendly aspect ratio
            aspectRatio: AspectRatio.MOBILE_LANDSCAPE as unknown as OriginalAspectRatio,
            generationModel: "IMAGEN_3_5",
        });

        try {
            const generatedImages = await client.generateImage(prompt);

            // Update last request time after completion
            this.lastRequestEndTime = Date.now();
            const requestDuration = this.lastRequestEndTime - requestStartTime;
            logger.debug("ImageFX", `Request took ${Math.ceil(requestDuration / 1000)}s`);

            if (!generatedImages || generatedImages.length === 0) {
                throw new Error("No images returned from ImageFX");
            }

            // Save to temp directory and read the file
            const image = generatedImages[0];
            if (!image) {
                throw new Error("Generated image is undefined");
            }

            // Save image to temp dir
            const savedPath = image.save(TMP_IMAGES_DIR);
            logger.debug("ImageFX", `Temporarily saved to: ${savedPath}`);

            // Read the file into ArrayBuffer
            const fileData = await readFile(savedPath);
            const data = fileData.buffer.slice(
                fileData.byteOffset,
                fileData.byteOffset + fileData.byteLength
            ) as ArrayBuffer;

            // Clean up the temp file (we'll save with our own naming)
            await rm(savedPath, { force: true });

            logger.debug("ImageFX", `Successfully generated image (${Math.round(data.byteLength / 1024)}KB)`);

            return {
                data,
                format: "png", // ImageFX generates PNG
            };
        } catch (error) {
            // Update last request time even on failure
            this.lastRequestEndTime = Date.now();
            const errorMsg = error instanceof Error ? error.message : String(error);

            // Check for unsafe content error from ImageFX
            if (errorMsg.includes("PUBLIC_ERROR_UNSAFE_GENERATION") ||
                errorMsg.includes("PUBLIC_ERROR_PROMINENT_PEOPLE_FILTER_FAILED")) {
                logger.warn("ImageFX", `Prompt flagged as unsafe: ${promptText.substring(0, 50)}...`);
                throw new UnsafePromptError(promptText, "ImageFX safety filter", "imagefx");
            }

            logger.error("ImageFX", `Generation failed: ${errorMsg}`);
            throw new Error(`ImageFX generation failed: ${errorMsg}`);
        }
    }
}

// Export singleton instance
export const imageFXProvider = new ImageFXProvider();
