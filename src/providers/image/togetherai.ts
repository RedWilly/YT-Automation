/**
 * Together AI Image Provider
 * Uses Together AI API with FLUX models for image generation
 * Includes rate limiting for free tier (6 img/min)
 */

import type { ImageProvider, ImageGenerationOptions, ImageGenerationResult } from "./types.ts";
import {
    TOGETHER_API_KEY,
    TOGETHER_API_URL,
    TOGETHER_MODEL,
    TOGETHER_MIN_DELAY_MS,
} from "../../constants.ts";
import * as logger from "../../logger.ts";

/**
 * Together AI response type for image generation
 */
interface TogetherAIImageResponse {
    id: string;
    model: string;
    object: string;
    data: Array<{
        index: number;
        url: string;
        timings?: {
            inference: number;
        };
    }>;
}

/**
 * Together AI image provider with rate limiting
 * Implements the ImageProvider interface for Together AI (FLUX models)
 */
class TogetherAIProvider implements ImageProvider {
    readonly name = "Together AI (FLUX)";
    readonly id = "togetherai";

    /** Track the last request time for rate limiting */
    private lastRequestTime = 0;

    /**
     * Check if Together AI is configured
     */
    isConfigured(): boolean {
        return TOGETHER_API_KEY.length > 0;
    }

    /**
     * Generate an image using Together AI
     * Handles rate limiting automatically (6 img/min for free tier)
     * @param options - Generation options
     * @returns Generated image data
     */
    async generate(options: ImageGenerationOptions): Promise<ImageGenerationResult> {
        const { prompt, negativePrompt, width = 1440, height = 1104 } = options;

        // Handle rate limiting - ensure minimum delay between requests
        await this.waitForRateLimit();

        logger.debug("TogetherAI", `Generating image for: "${prompt.substring(0, 60)}..."`);

        const requestStartTime = Date.now();

        const response = await fetch(TOGETHER_API_URL, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${TOGETHER_API_KEY}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: TOGETHER_MODEL,
                prompt,
                n: 1,
                width,
                height,
                // might delete thiz ( depending of the model -e.g flux2dev)
                steps: 4,
                negative_prompt: negativePrompt,
                guidance_scale: 20,
                //
                disable_safety_checker: false,
            }),
        });

        // Update last request time after response received
        this.lastRequestTime = Date.now();
        const requestDuration = this.lastRequestTime - requestStartTime;
        logger.debug("TogetherAI", `Request took ${Math.ceil(requestDuration / 1000)}s`);

        if (!response.ok) {
            const errorText = await response.text();
            logger.error("TogetherAI", `API request failed: ${response.status} ${response.statusText}`);
            logger.debug("TogetherAI", `Response body: ${errorText}`);
            throw new Error(`Together AI API failed: ${response.status} ${response.statusText}`);
        }

        // Parse JSON response
        const result = await response.json() as TogetherAIImageResponse;

        // Extract image URL from response
        const imageUrl = result.data?.[0]?.url;
        if (!imageUrl) {
            throw new Error("No image URL in Together AI response");
        }

        // Log inference time if available
        const inferenceTime = result.data?.[0]?.timings?.inference;
        if (inferenceTime) {
            logger.debug("TogetherAI", `Inference time: ${inferenceTime.toFixed(2)}s`);
        }

        // Download the image from the URL
        logger.debug("TogetherAI", "Downloading generated image...");
        const imageResponse = await fetch(imageUrl);
        if (!imageResponse.ok) {
            throw new Error(`Failed to download image: ${imageResponse.status}`);
        }
        const data = await imageResponse.arrayBuffer();

        logger.debug("TogetherAI", `Successfully generated image (${Math.round(data.byteLength / 1024)}KB)`);

        return {
            data,
            format: "jpg",
        };
    }

    /**
     * Wait for rate limit if needed
     * Ensures minimum delay between requests (6 img/min = 10s between requests)
     */
    private async waitForRateLimit(): Promise<void> {
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;

        if (this.lastRequestTime > 0 && timeSinceLastRequest < TOGETHER_MIN_DELAY_MS) {
            const waitTime = TOGETHER_MIN_DELAY_MS - timeSinceLastRequest;
            logger.debug("TogetherAI", `Rate limiting: waiting ${Math.ceil(waitTime / 1000)}s`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
    }
}

// Export singleton instance
export const togetherAIProvider = new TogetherAIProvider();
