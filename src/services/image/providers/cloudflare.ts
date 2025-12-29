/**
 * Cloudflare Worker AI Image Provider
 * Uses Cloudflare Workers AI (Stable Diffusion XL) for image generation
 */

import type { ImageProvider, ImageGenerationOptions, ImageGenerationResult } from "./types.ts";
import { AI_IMAGE } from "../../../config/environment.ts";
import * as logger from "../../../utils/logger.ts";

const WORKER_API_KEY = AI_IMAGE.workerApiKey;

/**
 * Set your Cloudflare Worker URL via WORKER_API_URL environment variable
 * if you do not have a worker you can deploy one- jut copy and paste the cloudflare.js code 
 * you can ref the setup.md there is a video to help you set it up
 */
const WORKER_API_URL = process.env.WORKER_API_URL || "";

/**
 * Cloudflare Worker-based image provider
 * Implements the ImageProvider interface for Cloudflare Workers AI with rate limiting
 */
class CloudflareProvider implements ImageProvider {
    readonly name = "Cloudflare Worker";
    readonly id = "cloudflare";

    /** Track last request end time for rate limiting */
    private lastRequestEndTime = 0;

    /** Minimum delay between requests in milliseconds (3 seconds) */
    private readonly MIN_DELAY_MS = 3000;

    /**
     * Check if Cloudflare Worker is configured
     */
    isConfigured(): boolean {
        return WORKER_API_URL.length > 0 && WORKER_API_KEY.length > 0;
    }

    /**
     * Wait for rate limit if needed
     * If the last request took less than MIN_DELAY_MS, wait for the remaining time
     */
    private async waitForRateLimit(): Promise<void> {
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestEndTime;

        if (this.lastRequestEndTime > 0 && timeSinceLastRequest < this.MIN_DELAY_MS) {
            const waitTime = this.MIN_DELAY_MS - timeSinceLastRequest;
            logger.debug("Cloudflare", `Rate limiting: waiting ${Math.ceil(waitTime / 1000)}s before next request`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
    }

    /**
     * Generate an image using Cloudflare Worker
     * @param options - Generation options
     * @returns Generated image data
     */
    async generate(options: ImageGenerationOptions): Promise<ImageGenerationResult> {
        const { prompt, negativePrompt, aspectRatio = '16:9' } = options;

        const dimensionsMap: Record<string, { width: number; height: number }> = {
            '16:9': { width: 1920, height: 1080 },
            '9:16': { width: 1080, height: 1920 },
        };
        const { width, height } = dimensionsMap[aspectRatio] ?? { width: 1920, height: 1080 };

        await this.waitForRateLimit();

        logger.debug('Cloudflare', `Generating image for: "${prompt.substring(0, 60)}..." (${aspectRatio}: ${width}x${height})`);

        const requestStartTime = Date.now();

        const response = await fetch(WORKER_API_URL, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${WORKER_API_KEY}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                prompt,
                negative_prompt: negativePrompt,
                width,
                height,
            }),
        });

        this.lastRequestEndTime = Date.now();
        const requestDuration = this.lastRequestEndTime - requestStartTime;
        logger.debug("Cloudflare", `Request took ${Math.ceil(requestDuration / 1000)}s`);

        if (!response.ok) {
            const errorText = await response.text();
            logger.error("Cloudflare", `API request failed: ${response.status} ${response.statusText}`);
            logger.debug("Cloudflare", `Response body: ${errorText}`);
            throw new Error(`Cloudflare Worker API failed: ${response.status} ${response.statusText}`);
        }

        const data = await response.arrayBuffer();

        logger.debug("Cloudflare", `Successfully generated image (${Math.round(data.byteLength / 1024)}KB)`);

        return {
            data,
            format: "jpg",
        };
    }
}

// Export singleton instance
export const cloudflareProvider = new CloudflareProvider();
