/**
 * Image search and download service using DuckDuckGo or AI generation
 */

import { duckDuckGoImageSearch } from "../utils/dim.ts";
import {
  TMP_IMAGES_DIR,
  POLL_INTERVAL_MS,
  MAX_POLL_ATTEMPTS,
  USE_AI_IMAGE,
  WORKER_API_URL,
  WORKER_API_KEY,
  AI_IMAGE_MODEL,
  TOGETHER_API_KEY,
  TOGETHER_API_URL,
  TOGETHER_MODEL,
  TOGETHER_MIN_DELAY_MS,
} from "../constants.ts";
import type { ImageSearchQuery, DownloadedImage } from "../types.ts";
import type { ResolvedStyle } from "../styles/types.ts";
import { join, extname } from "node:path";
import * as logger from "../logger.ts";

// Track the last Together AI request time for rate limiting
let lastTogetherRequestTime = 0;

/**
 * Domains that typically serve watermarked stock photos
 */
const WATERMARKED_DOMAINS = [
  "dreamstime.com",
  "alamy.com",
  "freepik.com",
  "gettyimages.com",
  "vectorstock.com",
  "vecteezy.com"
];

/**
 * Search and download images for all queries (uses AI or web search based on USE_AI_IMAGE flag)
 * Both AI generation and web search follow the same patterns:
 * - POLL_INTERVAL_MS delays between each image
 * - Retry logic with MAX_POLL_ATTEMPTS for failed images
 * - Same error handling and logging approach
 * - Track progress the same way (current/total)
 * - Continue processing even if individual images fail
 *
 * @param queries - Array of image search queries with timestamps
 * @param style - Resolved style configuration for AI image generation
 * @returns Array of downloaded/generated image information
 */
export async function downloadImagesForQueries(
  queries: ImageSearchQuery[],
  style: ResolvedStyle
): Promise<DownloadedImage[]> {
  // Log which mode we're using
  if (USE_AI_IMAGE) {
    const providerName = AI_IMAGE_MODEL === "togetherai" ? "Together AI (FLUX.1-schnell)" : "Cloudflare Worker";
    logger.step("Images", `🎨 AI Image Generation Mode: Using ${providerName} to generate ${queries.length} images`);
    logger.debug("Images", `Image style: "${style.imageStyle.substring(0, 60)}..."`);
  } else {
    logger.step("Images", `🔍 Web Search Mode: Downloading images from DuckDuckGo for ${queries.length} queries`);
  }

  const processedImages: DownloadedImage[] = [];
  const queriesLength = queries.length;

  // Process each query with the same logic for both AI and web search
  for (let i = 0; i < queriesLength; i++) {
    const queryData = queries[i];
    if (!queryData) continue;

    try {
      // Use AI generation or web search based on USE_AI_IMAGE flag
      const processedImage = USE_AI_IMAGE
        ? await generateAIImageForQuery(queryData, style)
        : await downloadImageForQuery(queryData);

      processedImages.push(processedImage);
      logger.debug(
        "Images",
        `Progress: ${i + 1}/${queriesLength} - ${USE_AI_IMAGE ? "Generated" : "Downloaded"}: ${processedImage.filePath}`
      );

      // Add delay between queries to avoid rate limiting (except for last query)
      // Note: Together AI has its own rate limiting logic, so we skip delay for it
      const skipDelay = USE_AI_IMAGE && AI_IMAGE_MODEL === "togetherai";
      if (i < queriesLength - 1 && !skipDelay) {
        logger.debug("Images", `Waiting ${POLL_INTERVAL_MS}ms before next query to avoid rate limiting`);
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      }
    } catch (error) {
      logger.error(
        "Images",
        `Failed to ${USE_AI_IMAGE ? "generate AI image" : "download image"} for query "${queryData.query}"`,
        error
      );
      // Continue with next query even if one fails
    }
  }

  logger.success(
    "Images",
    `Successfully ${USE_AI_IMAGE ? "generated" : "downloaded"} ${processedImages.length}/${queriesLength} images`
  );

  return processedImages;
}

/**
 * Generate a single AI image for a query using the configured provider with retry logic
 * Routes to Cloudflare Worker or Together AI based on AI_IMAGE_MODEL setting
 * Includes fallback logic: if primary provider fails after all retries, try the other provider
 * @param queryData - Image search query with timestamps
 * @param style - Resolved style configuration for prompts
 * @returns Generated image information
 */
async function generateAIImageForQuery(
  queryData: ImageSearchQuery,
  style: ResolvedStyle
): Promise<DownloadedImage> {
  const primaryProvider = AI_IMAGE_MODEL === "togetherai" ? "togetherai" : "cloudflare";
  const fallbackProvider = primaryProvider === "togetherai" ? "cloudflare" : "togetherai";

  // Check if fallback provider is configured
  const canFallbackToTogether = TOGETHER_API_KEY.length > 0;
  const canFallbackToCloudflare = WORKER_API_URL.length > 0 && WORKER_API_KEY.length > 0;
  const canUseFallback = fallbackProvider === "togetherai" ? canFallbackToTogether : canFallbackToCloudflare;

  try {
    // Try primary provider first
    if (primaryProvider === "togetherai") {
      return await generateTogetherAIImage(queryData, style);
    }
    return await generateCloudflareImage(queryData, style);
  } catch (primaryError) {
    // Primary provider failed after all retries
    const primaryErrorMsg = primaryError instanceof Error ? primaryError.message : String(primaryError);
    logger.warn("AI-Images", `Primary provider (${primaryProvider}) failed: ${primaryErrorMsg}`);

    // Try fallback provider if configured
    if (canUseFallback) {
      logger.step("AI-Images", `Switching to fallback provider: ${fallbackProvider}`);

      try {
        if (fallbackProvider === "togetherai") {
          return await generateTogetherAIImage(queryData, style);
        }
        return await generateCloudflareImage(queryData, style);
      } catch (fallbackError) {
        const fallbackErrorMsg = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
        logger.error("AI-Images", `Fallback provider (${fallbackProvider}) also failed: ${fallbackErrorMsg}`);
        throw new Error(`Both providers failed. Primary (${primaryProvider}): ${primaryErrorMsg}. Fallback (${fallbackProvider}): ${fallbackErrorMsg}`);
      }
    }

    // No fallback available
    throw primaryError;
  }
}

/**
 * Generate a single AI image using Cloudflare Worker with retry logic
 * @param queryData - Image search query with timestamps
 * @param style - Resolved style configuration for prompts
 * @returns Generated image information
 */
async function generateCloudflareImage(
  queryData: ImageSearchQuery,
  style: ResolvedStyle
): Promise<DownloadedImage> {
  const { query, start, end } = queryData;

  let lastError: Error | null = null;

  // Retry up to MAX_POLL_ATTEMPTS times (same as web search)
  for (let attempt = 1; attempt <= MAX_POLL_ATTEMPTS; attempt++) {
    try {
      logger.debug("AI-Images", `[Cloudflare] Generating image for: "${query}" (attempt ${attempt}/${MAX_POLL_ATTEMPTS})`);

      // Use query directly - LLM now includes style keywords in the query
      logger.debug("AI-Images", `Prompt: "${query}"`);

      // Make request to Cloudflare Worker with negative prompt
      const response = await fetch(WORKER_API_URL, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${WORKER_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: query,
          negative_prompt: style.negativePrompt,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error("AI-Images", `API request failed: ${response.status} ${response.statusText}`);
        logger.debug("AI-Images", `Response body: ${errorText}`);
        throw new Error(`Cloudflare Worker API request failed: ${response.status} ${response.statusText}`);
      }

      // Get image data
      const imageData = await response.arrayBuffer();

      // Sanitize query for filename
      const sanitizedQuery = sanitizeFilename(query);
      const filename = `ai_${sanitizedQuery}.jpg`;
      const filePath = join(TMP_IMAGES_DIR, filename);

      // Save the image
      await Bun.write(filePath, imageData);

      logger.debug("AI-Images", `Saved AI image to: ${filePath}`);

      // If this succeeded after retries, log success
      if (attempt > 1) {
        logger.success("AI-Images", `Successfully generated after ${attempt} attempts`);
      }

      return {
        query,
        start,
        end,
        filePath,
      };

    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < MAX_POLL_ATTEMPTS) {
        logger.warn("AI-Images", `Attempt ${attempt} failed, retrying in ${POLL_INTERVAL_MS}ms...`);
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      }
    }
  }

  // All attempts failed
  throw new Error(
    `Failed to generate AI image for query "${query}" after ${MAX_POLL_ATTEMPTS} attempts. Last error: ${lastError?.message}`
  );
}

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
 * Generate a single AI image using Together AI (FLUX.1-schnell) with rate limiting
 * Handles the 6 img/min rate limit by tracking request timing
 * @param queryData - Image search query with timestamps
 * @param style - Resolved style configuration for prompts
 * @returns Generated image information
 */
async function generateTogetherAIImage(
  queryData: ImageSearchQuery,
  style: ResolvedStyle
): Promise<DownloadedImage> {
  const { query, start, end } = queryData;

  let lastError: Error | null = null;

  // Retry up to MAX_POLL_ATTEMPTS times
  for (let attempt = 1; attempt <= MAX_POLL_ATTEMPTS; attempt++) {
    try {
      logger.debug("AI-Images", `[Together AI] Generating image for: "${query}" (attempt ${attempt}/${MAX_POLL_ATTEMPTS})`);

      // Handle rate limiting - ensure minimum delay between requests
      const now = Date.now();
      const timeSinceLastRequest = now - lastTogetherRequestTime;
      if (lastTogetherRequestTime > 0 && timeSinceLastRequest < TOGETHER_MIN_DELAY_MS) {
        const waitTime = TOGETHER_MIN_DELAY_MS - timeSinceLastRequest;
        logger.debug("AI-Images", `Rate limiting: waiting ${Math.ceil(waitTime / 1000)}s before next request`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }

      // Use query directly - LLM now includes style keywords in the query
      logger.debug("AI-Images", `Prompt: "${query}"`);

      // Note: FLUX.1-schnell doesn't support negative prompts, but we pass it anyway
      // for consistency and in case the model changes
      // Record request time before making the call
      const requestStartTime = Date.now();

      // Make request to Together AI
      const response = await fetch(TOGETHER_API_URL, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${TOGETHER_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: TOGETHER_MODEL,
          prompt: query,
          n: 1,
          width: 1440,
          height: 1104,
          steps: 4,
          negative_prompt: style.negativePrompt,
          guidance_scale: 20,
          disable_safety_checker: false,
        }),
      });

      // Update last request time after response received
      lastTogetherRequestTime = Date.now();
      const requestDuration = lastTogetherRequestTime - requestStartTime;
      logger.debug("AI-Images", `Request took ${Math.ceil(requestDuration / 1000)}s`);

      if (!response.ok) {
        const errorText = await response.text();
        logger.error("AI-Images", `Together AI request failed: ${response.status} ${response.statusText}`);
        logger.debug("AI-Images", `Response body: ${errorText}`);
        throw new Error(`Together AI request failed: ${response.status} ${response.statusText}`);
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
        logger.debug("AI-Images", `Together AI inference time: ${inferenceTime.toFixed(2)}s`);
      }

      // Download the image from the URL
      logger.debug("AI-Images", `Downloading image from Together AI URL...`);
      const imageResponse = await fetch(imageUrl);
      if (!imageResponse.ok) {
        throw new Error(`Failed to download image from Together AI: ${imageResponse.status}`);
      }
      const binaryData = await imageResponse.arrayBuffer();

      // Sanitize query for filename
      const sanitizedQuery = sanitizeFilename(query);
      const filename = `ai_${sanitizedQuery}.jpg`;
      const filePath = join(TMP_IMAGES_DIR, filename);

      // Save the image
      await Bun.write(filePath, binaryData);

      logger.debug("AI-Images", `Saved Together AI image to: ${filePath}`);

      // If this succeeded after retries, log success
      if (attempt > 1) {
        logger.success("AI-Images", `Successfully generated after ${attempt} attempts`);
      }

      return {
        query,
        start,
        end,
        filePath,
      };

    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < MAX_POLL_ATTEMPTS) {
        logger.warn("AI-Images", `Attempt ${attempt} failed, retrying in ${POLL_INTERVAL_MS}ms...`);
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      }
    }
  }

  // All attempts failed
  throw new Error(
    `Failed to generate Together AI image for query "${query}" after ${MAX_POLL_ATTEMPTS} attempts. Last error: ${lastError?.message}`
  );
}

/**
 * Check if an image URL is from a watermarked stock photo site
 * @param imageUrl - URL of the image to check
 * @returns true if the URL contains a watermarked domain
 */
function isWatermarkedImage(imageUrl: string): boolean {
  const lowerUrl = imageUrl.toLowerCase();
  return WATERMARKED_DOMAINS.some((domain) => lowerUrl.includes(domain));
}

/**
 * Extract domain from URL for logging purposes
 * @param imageUrl - URL to extract domain from
 * @returns Domain name or "unknown"
 */
function extractDomain(imageUrl: string): string {
  try {
    const url = new URL(imageUrl);
    return url.hostname;
  } catch {
    return "unknown";
  }
}

/**
 * Search and download a single image for a query with watermark filtering and retry logic
 * @param queryData - Image search query with timestamps
 * @returns Downloaded image information
 */
async function downloadImageForQuery(
  queryData: ImageSearchQuery
): Promise<DownloadedImage> {
  const { query, start, end } = queryData;

  let lastError: Error | null = null;

  // Retry up to MAX_POLL_ATTEMPTS times
  for (let attempt = 1; attempt <= MAX_POLL_ATTEMPTS; attempt++) {
    try {
      logger.debug("Images", `Searching for: "${query}" (attempt ${attempt}/${MAX_POLL_ATTEMPTS})`);

      // Fetch 10 results at once to find non-watermarked images
      const searchResults = await duckDuckGoImageSearch(query, 10);

      if (searchResults.length === 0) {
        throw new Error(`No images found for query: "${query}"`);
      }

      logger.debug("Images", `Fetched ${searchResults.length} results, filtering watermarked images...`);

      // Separate non-watermarked and watermarked images
      const nonWatermarkedUrls: string[] = [];
      const watermarkedUrls: string[] = [];

      for (const result of searchResults) {
        if (!result?.image) continue;

        const imageUrl = result.image;

        // Check if this image is watermarked
        if (isWatermarkedImage(imageUrl)) {
          const domain = extractDomain(imageUrl);
          logger.debug("Images", `Skipped watermarked image from ${domain}`);
          watermarkedUrls.push(imageUrl);
        } else {
          nonWatermarkedUrls.push(imageUrl);
        }
      }

      logger.debug("Images", `Found ${nonWatermarkedUrls.length} non-watermarked and ${watermarkedUrls.length} watermarked images`);

      // Try all non-watermarked images first, then watermarked as fallback
      const imagesToTry = [...nonWatermarkedUrls, ...watermarkedUrls];

      if (imagesToTry.length === 0) {
        throw new Error(`No valid images found for query: "${query}"`);
      }

      // Try downloading each image until one succeeds
      let downloadSucceeded = false;
      let filePath: string | null = null;

      for (let i = 0; i < imagesToTry.length; i++) {
        const imageUrl = imagesToTry[i];
        if (!imageUrl) continue;

        const domain = extractDomain(imageUrl);
        const isWatermarked = i >= nonWatermarkedUrls.length;

        try {
          logger.debug("Images", `Trying to download image ${i + 1}/${imagesToTry.length} from ${domain}${isWatermarked ? " (watermarked)" : ""}`);

          filePath = await downloadImage(imageUrl, query);
          downloadSucceeded = true;

          if (isWatermarked) {
            logger.warn("Images", `All non-watermarked images failed, successfully downloaded watermarked image from ${domain}`);
          } else {
            logger.debug("Images", `Successfully downloaded non-watermarked image from ${domain}`);
          }

          break; // Success! Exit the loop
        } catch (downloadError) {
          // Log the failure and try the next image
          const errorMsg = downloadError instanceof Error ? downloadError.message : String(downloadError);
          logger.debug("Images", `Failed to download from ${domain}: ${errorMsg}`);

          // If this is the last image, throw the error
          if (i === imagesToTry.length - 1) {
            throw new Error(`All ${imagesToTry.length} images failed to download. Last error: ${errorMsg}`);
          }

          // Otherwise, continue to the next image
          continue;
        }
      }

      // If download succeeded, return the result
      if (downloadSucceeded && filePath) {
        if (attempt > 1) {
          logger.success("Images", `Successfully downloaded after ${attempt} attempts`);
        }

        return {
          query,
          start,
          end,
          filePath,
        };
      }

      // This should never happen, but just in case
      throw new Error(`Failed to download any image for query: "${query}"`);

    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < MAX_POLL_ATTEMPTS) {
        logger.warn("Images", `Attempt ${attempt} failed, retrying in ${POLL_INTERVAL_MS}ms...`);
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      }
    }
  }

  // All attempts failed
  throw new Error(
    `Failed to download image for query "${query}" after ${MAX_POLL_ATTEMPTS} attempts. Last error: ${lastError?.message}`
  );
}

/**
 * Download an image from URL and save it with query as filename
 * @param imageUrl - URL of the image to download
 * @param query - Search query to use as filename
 * @returns Path to the downloaded image file
 */
async function downloadImage(imageUrl: string, query: string): Promise<string> {
  logger.debug("Images", `Downloading image from: ${imageUrl}`);

  const response = await fetch(imageUrl);

  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.status}`);
  }

  const imageData = await response.arrayBuffer();

  // Determine file extension from URL or content type
  const extension = getImageExtension(imageUrl, response.headers.get("content-type"));

  // Sanitize query for filename
  const sanitizedQuery = sanitizeFilename(query);
  const filename = `${sanitizedQuery}${extension}`;
  const filePath = join(TMP_IMAGES_DIR, filename);

  // Save the image
  await Bun.write(filePath, imageData);

  logger.log("Images", `Saved image to: ${filePath}`);

  return filePath;
}

/**
 * Get image file extension from URL or content type
 * @param url - Image URL
 * @param contentType - Content-Type header value
 * @returns File extension with dot (e.g., ".jpg")
 */
function getImageExtension(url: string, contentType: string | null): string {
  // Try to get extension from URL
  const urlExtension = extname(url).toLowerCase();
  if (urlExtension && [".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(urlExtension)) {
    return urlExtension;
  }

  // Try to get extension from content type
  if (contentType) {
    if (contentType.includes("jpeg")) return ".jpg";
    if (contentType.includes("png")) return ".png";
    if (contentType.includes("webp")) return ".webp";
    if (contentType.includes("gif")) return ".gif";
  }

  // Default to .jpg
  return ".jpg";
}

/**
 * Sanitize filename by removing invalid characters
 * @param filename - Original filename
 * @returns Sanitized filename
 */
function sanitizeFilename(filename: string): string {
  // Replace invalid Windows filename characters with underscore
  return filename
    .replace(/[<>:"/\\|?*]/g, "_")
    .replace(/\s+/g, "_")
    .trim()
    .substring(0, 200);
}

/**
 * Validate downloaded images
 * @param images - Array of downloaded images to validate
 * @returns True if valid, throws error otherwise
 */
export function validateDownloadedImages(images: DownloadedImage[]): boolean {
  if (!Array.isArray(images)) {
    throw new Error("Images must be an array");
  }

  if (images.length === 0) {
    throw new Error("No images were downloaded");
  }

  const imagesLength = images.length;
  for (let i = 0; i < imagesLength; i++) {
    const image = images[i];
    if (!image) continue;

    if (
      typeof image.query !== "string" ||
      typeof image.start !== "number" ||
      typeof image.end !== "number" ||
      typeof image.filePath !== "string"
    ) {
      throw new Error(`Invalid image data at index ${i}`);
    }
  }

  logger.success("Images", `Validation passed for ${images.length} images`);
  return true;
}

