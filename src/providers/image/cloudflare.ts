/**
 * Cloudflare Worker AI Image Provider
 * Uses Cloudflare Workers AI (Stable Diffusion XL) for image generation
 */

import type { ImageProvider, ImageGenerationOptions, ImageGenerationResult } from "./types.ts";
import { WORKER_API_KEY } from "../../constants.ts";
import * as logger from "../../logger.ts";

/**
 * Set your Cloudflare Worker URL via WORKER_API_URL environment variable
 * if you do not have a worker you can deploy one- jut copy and paste the cloudflare.js code 
 * you can ref the setup.md there is a video to help you set it up
 */
const WORKER_API_URL = process.env.WORKER_API_URL || "";

/**
 * Cloudflare Worker-based image provider
 * Implements the ImageProvider interface for Cloudflare Workers AI
 */
class CloudflareProvider implements ImageProvider {
    readonly name = "Cloudflare Worker";
    readonly id = "cloudflare";

    /**
     * Check if Cloudflare Worker is configured
     */
    isConfigured(): boolean {
        return WORKER_API_URL.length > 0 && WORKER_API_KEY.length > 0;
    }

    /**
     * Generate an image using Cloudflare Worker
     * @param options - Generation options
     * @returns Generated image data
     */
    async generate(options: ImageGenerationOptions): Promise<ImageGenerationResult> {
        const { prompt, negativePrompt } = options;

        logger.debug("Cloudflare", `Generating image for: "${prompt.substring(0, 60)}..."`);

        const response = await fetch(WORKER_API_URL, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${WORKER_API_KEY}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                prompt,
                negative_prompt: negativePrompt,
            }),
        });

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
