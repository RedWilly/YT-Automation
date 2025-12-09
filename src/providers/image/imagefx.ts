/**
 * ImageFX Provider
 * Uses Google's ImageFX via @rohitaryal/imagefx-api library (IMAGEN 3.5)
 * Requires GOOGLE_COOKIE environment variable for authentication
 */

import { ImageFX, Prompt, AspectRatio as OriginalAspectRatio } from "@rohitaryal/imagefx-api";
import type { ImageProvider, ImageGenerationOptions, ImageGenerationResult } from "./types.ts";
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
 * Implements the ImageProvider interface
 */
class ImageFXProvider implements ImageProvider {
    readonly name = "ImageFX (IMAGEN 3.5)";
    readonly id = "imagefx";

    /** ImageFX client instance */
    private client: ImageFX | null = null;

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
     * Generate an image using ImageFX (IMAGEN 3.5)
     * @param options - Generation options
     * @returns Generated image data
     */
    async generate(options: ImageGenerationOptions): Promise<ImageGenerationResult> {
        const { prompt: promptText } = options;

        logger.debug("ImageFX", `Generating image for: "${promptText.substring(0, 60)}..."`);

        const client = this.getClient();

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
            const errorMsg = error instanceof Error ? error.message : String(error);
            logger.error("ImageFX", `Generation failed: ${errorMsg}`);
            throw new Error(`ImageFX generation failed: ${errorMsg}`);
        }
    }
}

// Export singleton instance
export const imageFXProvider = new ImageFXProvider();
