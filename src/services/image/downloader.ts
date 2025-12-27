/**
 * Image search and download service using DuckDuckGo or AI generation
 * Uses modular provider system for AI image generation
 */

import { duckDuckGoImageSearch } from "../../utils/dim.ts";
import { DEFAULT_PATHS, DEFAULT_IMAGE_SETTINGS } from "../../config/defaults.ts";
import { AI_TEXT, AI_IMAGE } from "../../config/environment.ts";
import type { ImageSearchQuery, DownloadedImage } from "../../types/index.ts";
import type { ResolvedStyle } from "../../styles/types.ts";
import { getProvider, getFallbackProvider } from "./providers/index.ts";
import { calculateBackoffDelay, sleep } from "./providers/retry.ts";
import { isUnsafePromptError } from "./providers/errors.ts";
import { rewriteUnsafePrompt } from "../llm/index.ts";
import { join, extname } from "node:path";
import * as logger from "../../utils/logger.ts";

const TMP_IMAGES_DIR = DEFAULT_PATHS.images;
const WEB_SEARCH_DELAY_MS = AI_IMAGE.searchDelayMs;
const IMAGE_RETRY_ATTEMPTS = AI_IMAGE.retryAttempts;
const USE_AI_IMAGE = AI_TEXT.useAiImage;

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
 * - WEB_SEARCH_DELAY_MS delays between each image
 * - Retry logic with IMAGE_RETRY_ATTEMPTS for failed images
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
    const provider = getProvider();
    logger.step("Images", `🎨 AI Image Generation Mode: Using ${provider.name} to generate ${queries.length} images`);
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

      // Add delay between web search queries to avoid rate limiting (except for last query)
      // Note: AI providers manage their own rate limiting internally
      if (i < queriesLength - 1 && !USE_AI_IMAGE) {
        logger.debug("Images", `Waiting ${WEB_SEARCH_DELAY_MS}ms before next query`);
        await new Promise((resolve) => setTimeout(resolve, WEB_SEARCH_DELAY_MS));
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
 * Uses modular provider system with automatic fallback and exponential backoff
 * Determines aspect ratio based on scene duration and orientation:
 * - Scenes ≥3s (with pan effect): 4:3 for pan headroom
 * - Scenes <3s (static): Native resolution (16:9 or 9:16 based on orientation)
 * @param queryData - Image search query with timestamps
 * @param style - Resolved style configuration for prompts
 * @returns Generated image information
 */
async function generateAIImageForQuery(
  queryData: ImageSearchQuery,
  style: ResolvedStyle
): Promise<DownloadedImage> {
  const { start, end } = queryData;
  const provider = getProvider();

  // Calculate scene duration
  const durationSeconds = (end - start) / 1000;
  const MIN_PAN_DURATION = 3; // Same as in ffmpeg.ts

  // Determine aspect ratio based on shot type (natural splitting always enabled)
  let aspectRatio: "4:3" | "16:9" | "9:16";

  if (queryData.type) {
    // Shot type determines aspect ratio:
    // - pan: 4:3 for vertical pan headroom
    // - zoom/static: native resolution (no extra headroom needed)
    if (queryData.type === "pan") {
      aspectRatio = "4:3";
    } else {
      aspectRatio = style.orientation === "vertical" ? "9:16" : "16:9";
    }
    logger.debug("AI-Images", `Scene ${durationSeconds.toFixed(1)}s → ${queryData.type} → ${aspectRatio}`);
  } else {
    // Fallback: use panEffect + duration logic (original behavior)
    const isPanning = style.panEffect && durationSeconds >= MIN_PAN_DURATION;
    if (isPanning) {
      aspectRatio = "4:3";
    } else {
      aspectRatio = style.orientation === "vertical" ? "9:16" : "16:9";
    }
    logger.debug("AI-Images", `Scene ${durationSeconds.toFixed(1)}s → ${isPanning ? "panning" : "static"} → ${aspectRatio}`);
  }

  let lastError: Error | null = null;
  let rewriteCount = 0;
  const MAX_REWRITES = 25;
  const originalQuery = queryData.query;  // Store original for context

  // Retry with primary provider using exponential backoff
  for (let attempt = 1; attempt <= IMAGE_RETRY_ATTEMPTS; attempt++) {
    try {
      logger.debug("AI-Images", `[${provider.name}] Generating image (attempt ${attempt}/${IMAGE_RETRY_ATTEMPTS})`);

      const result = await provider.generate({
        prompt: queryData.query,
        negativePrompt: style.negativePrompt,
        aspectRatio,
      });

      // Save the image
      const sanitizedQuery = sanitizeFilename(queryData.query);
      const filename = `ai_${sanitizedQuery}.${result.format}`;
      const filePath = join(TMP_IMAGES_DIR, filename);

      await Bun.write(filePath, result.data);
      logger.debug("AI-Images", `Saved image to: ${filePath}`);

      if (attempt > 1) {
        logger.success("AI-Images", `Successfully generated after ${attempt} attempts`);
      }

      return { query: queryData.query, start, end, filePath, type: queryData.type };

    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // If prompt was flagged as unsafe, rewrite it and retry (max rewrites)
      if (isUnsafePromptError(error) && rewriteCount < MAX_REWRITES) {
        rewriteCount++;
        logger.warn("AI-Images", `Prompt flagged as unsafe (rewrite ${rewriteCount}/${MAX_REWRITES}), requesting LLM rewrite...`);

        // Pass original prompt, current prompt, and retry info
        const rewrittenQuery = await rewriteUnsafePrompt(
          queryData.query,
          style,
          originalQuery,
          rewriteCount,
          MAX_REWRITES
        );

        // Update query for next attempt
        queryData.query = rewrittenQuery;
        logger.log("AI-Images", `Retrying with rewritten prompt: ${rewrittenQuery.substring(0, 60)}...`);

        // Don't count this as a failed attempt - reset and try with new prompt
        attempt = 0;
        continue;
      }

      if (attempt < IMAGE_RETRY_ATTEMPTS) {
        // Exponential backoff: 1s, 2s, 4s, 8s... capped at 10min
        const delay = calculateBackoffDelay(attempt, { logTag: "AI-Images" });
        logger.warn("AI-Images", `Attempt ${attempt} failed, retrying in ${Math.round(delay / 1000)}s...`);
        await sleep(delay);
      }
    }
  }

  // Primary provider failed - try fallback with exponential backoff
  const fallback = getFallbackProvider(provider.id);
  if (fallback) {
    logger.step("AI-Images", `Switching to fallback provider: ${fallback.name}`);

    for (let attempt = 1; attempt <= IMAGE_RETRY_ATTEMPTS; attempt++) {
      try {
        logger.debug("AI-Images", `[${fallback.name}] Fallback attempt ${attempt}/${IMAGE_RETRY_ATTEMPTS}`);

        const result = await fallback.generate({
          prompt: queryData.query,
          negativePrompt: style.negativePrompt,
          aspectRatio,
        });

        const sanitizedQuery = sanitizeFilename(queryData.query);
        const filename = `ai_${sanitizedQuery}.${result.format}`;
        const filePath = join(TMP_IMAGES_DIR, filename);

        await Bun.write(filePath, result.data);
        logger.success("AI-Images", `Fallback succeeded: ${filePath}`);

        return { query: queryData.query, start, end, filePath, type: queryData.type };

      } catch (fallbackError) {
        lastError = fallbackError instanceof Error ? fallbackError : new Error(String(fallbackError));

        if (attempt < IMAGE_RETRY_ATTEMPTS) {
          const delay = calculateBackoffDelay(attempt, { logTag: "AI-Images" });
          logger.warn("AI-Images", `Fallback attempt ${attempt} failed, retrying in ${Math.round(delay / 1000)}s...`);
          await sleep(delay);
        }
      }
    }

    logger.error("AI-Images", `Fallback provider also failed after ${IMAGE_RETRY_ATTEMPTS} attempts`);
    throw new Error(`Both providers failed after retries. Last error: ${lastError?.message}`);
  }

  // No fallback available
  throw new Error(
    `Failed to generate AI image for "${queryData.query}" after ${IMAGE_RETRY_ATTEMPTS} attempts. Error: ${lastError?.message}`
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

  // Retry up to IMAGE_RETRY_ATTEMPTS times
  for (let attempt = 1; attempt <= IMAGE_RETRY_ATTEMPTS; attempt++) {
    try {
      logger.debug("Images", `Searching for: "${query}" (attempt ${attempt}/${IMAGE_RETRY_ATTEMPTS})`);

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
          type: queryData.type,
        };
      }

      // This should never happen, but just in case
      throw new Error(`Failed to download any image for query: "${query}"`);

    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < IMAGE_RETRY_ATTEMPTS) {
        const delay = calculateBackoffDelay(attempt, { logTag: "Images" });
        logger.warn("Images", `Attempt ${attempt} failed, retrying in ${Math.round(delay / 1000)}s...`);
        await sleep(delay);
      }
    }
  }

  // All attempts failed
  throw new Error(
    `Failed to download image for query "${query}" after ${IMAGE_RETRY_ATTEMPTS} attempts. Last error: ${lastError?.message}`
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

