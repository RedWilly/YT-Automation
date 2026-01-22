import { duckDuckGoImageSearch } from "../../utils/dim.ts";
import { DEFAULT_PATHS, DEFAULT_IMAGE_SETTINGS } from "../../config/defaults.ts";
import { AI_TEXT, AI_IMAGE } from "../../config/index.ts";
import type { ImageSearchQuery, DownloadedImage, StructuredShot } from "../../types/index.ts";
import type { ResolvedStyle } from "../../styles/types.ts";
import { generateConsistentSeed } from "../llm/index.ts";
import { getProvider } from "./providers/index.ts";
import { calculateBackoffDelay, sleep } from "./providers/retry.ts";
import { isUnsafePromptError, isHighTrafficError } from "./providers/errors.ts";
import { rewriteUnsafePrompt } from "../llm/index.ts";
import { join, extname } from "node:path";
import * as logger from "../../utils/logger.ts";

const TMP_IMAGES_DIR = DEFAULT_PATHS.images;
const WEB_SEARCH_DELAY_MS = AI_IMAGE.searchDelayMs;
const IMAGE_RETRY_ATTEMPTS = AI_IMAGE.retryAttempts;
const USE_AI_IMAGE = AI_TEXT.useAiImage;

const WATERMARKED_DOMAINS = DEFAULT_IMAGE_SETTINGS.watermarkedDomains;

function assignSeeds(queries: ImageSearchQuery[], shots?: StructuredShot[]): Map<number, number> {
  const seedMap = new Map<number, number>();

  for (let i = 0; i < queries.length; i++) {
    const shot = shots?.[i];
    if (shot) {
      // Use deterministic entity-based seed
      const seed = generateConsistentSeed(shot, i);
      seedMap.set(i, seed);
      logger.debug('Seeds', `Segment ${i}: seed ${seed} (based on ${shot.sceneId}, emphasis: ${shot.focus.emphasis.join(',')})`);
    } else {
      // Fallback to random seed if no structured shot
      const seed = Math.floor(Math.random() * 2147483646) + 1;
      seedMap.set(i, seed);
      logger.debug('Seeds', `Segment ${i}: random seed ${seed} (no structured shot)`);
    }
  }

  return seedMap;
}

/**
 * Callbacks for per-segment cache updates during image generation
 * Enables incremental caching and safety rewrite persistence
 */
export interface SegmentCacheCallbacks {
  onImageApproved?: (segmentIndex: number, imagePath: string, seed?: number) => void;
  onPromptRewritten?: (segmentIndex: number, newPrompt: string, rewriteCount: number) => void;
}

/**
 * Search and download images for all queries. Supports:
 * - Resumption from partial cache (skips already-downloaded images)
 * - Incremental saving via callback to persist progress
 * - Per-segment caching for safety rewrite persistence
 * - Retry logic with exponential backoff
 */
export async function downloadImagesForQueries(
  queries: ImageSearchQuery[],
  style: ResolvedStyle,
  existingImages?: DownloadedImage[],
  onImageDownloaded?: (images: DownloadedImage[]) => void,
  structuredShots?: StructuredShot[],
  segmentCallbacks?: SegmentCacheCallbacks
): Promise<DownloadedImage[]> {
  const queriesLength = queries.length;
  const startIndex = existingImages?.length ?? 0;
  const processedImages: DownloadedImage[] = existingImages ? [...existingImages] : [];

  // Check if resuming from partial cache
  if (startIndex > 0) {
    logger.log("Images", `📦 Resuming from cached images: ${startIndex}/${queriesLength} already downloaded`);
  }

  // If all images already exist, return immediately
  if (startIndex >= queriesLength) {
    logger.log("Images", `✓ All ${queriesLength} images already cached`);
    return processedImages;
  }

  // Log which mode we're using
  if (USE_AI_IMAGE) {
    const provider = getProvider();
    logger.step("Images", `🎨 AI Image Generation Mode: Using ${provider.name} to generate ${queriesLength - startIndex} images`);
    logger.debug("Images", `Image style: "${style.imageStyle.substring(0, 60)}..."`);
  } else {
    logger.step("Images", `🔍 Web Search Mode: Downloading images from DuckDuckGo for ${queriesLength - startIndex} queries`);
  }

  // Assign seeds based on entity composition (only for AI image generation)
  const seedMap = USE_AI_IMAGE ? assignSeeds(queries, structuredShots) : new Map<number, number>();

  if (USE_AI_IMAGE && seedMap.size > 0) {
    // Count unique seeds to show how many "scene groups" we have
    const uniqueSeeds = new Set(seedMap.values()).size;
    logger.log("Seeds", `Assigned ${uniqueSeeds} unique seeds across ${queriesLength} segments`);
  }

  // Process each query starting from where we left off
  for (let i = startIndex; i < queriesLength; i++) {
    const queryData = queries[i];
    if (!queryData) continue;

    const segmentIndex = i + 1;  // 1-based index for cache

    try {
      const seed = seedMap.get(i);

      // Use AI generation or web search based on USE_AI_IMAGE flag
      const processedImage = USE_AI_IMAGE
        ? await generateAIImageForQuery(queryData, style, i, seed, segmentCallbacks)
        : await downloadImageForQuery(queryData, style, i);

      processedImages.push(processedImage);
      logger.debug(
        "Images",
        `Progress: ${i + 1}/${queriesLength} - ${USE_AI_IMAGE ? "Generated" : "Downloaded"}: ${processedImage.filePath}`
      );

      // Mark segment as approved in cache (incremental)
      if (segmentCallbacks?.onImageApproved) {
        segmentCallbacks.onImageApproved(segmentIndex, processedImage.filePath, processedImage.seed);
      }

      // Incremental save: persist after each successful download
      if (onImageDownloaded) {
        onImageDownloaded(processedImages);
      }

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

async function generateAIImageForQuery(
  queryData: ImageSearchQuery,
  style: ResolvedStyle,
  index: number,
  seed?: number,
  segmentCallbacks?: SegmentCacheCallbacks
): Promise<DownloadedImage> {
  const { start, end } = queryData;
  const provider = getProvider();
  const segmentIndex = index + 1;  // 1-based for cache

  const aspectRatio: '16:9' | '9:16' = style.orientation === 'vertical' ? '9:16' : '16:9';

  logger.debug('AI-Images', `Scene → ${queryData.type ?? 'default'} → ${aspectRatio}`);

  let lastError: Error | null = null;
  let rewriteCount = 0;
  const MAX_REWRITES = 25;
  const originalQuery = queryData.query;

  for (let attempt = 1; attempt <= IMAGE_RETRY_ATTEMPTS; attempt++) {
    try {
      logger.debug("AI-Images", `[${provider.name}] Generating image (attempt ${attempt}/${IMAGE_RETRY_ATTEMPTS})`);

      // Combine style prefix with scene description
      const styledPrompt = `${style.imageStyle}. ${queryData.query}`;

      const result = await provider.generate({
        prompt: styledPrompt,
        negativePrompt: style.negativePrompt,
        aspectRatio,
        seed,
      });

      // Save the image with style-based naming: {styleId}_{orientation}_{index}.{format}
      const orientationSuffix = style.orientation === 'vertical' ? '_vertical' : '';
      const filename = `${style.id}${orientationSuffix}_${index}.${result.format}`;
      const filePath = join(TMP_IMAGES_DIR, filename);

      await Bun.write(filePath, result.data);
      logger.debug("AI-Images", `Saved image to: ${filePath}`);

      if (attempt > 1) {
        logger.success("AI-Images", `Successfully generated after ${attempt} attempts`);
      }

      return { query: queryData.query, start, end, filePath, type: queryData.type, seed };

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

        // Update query for next attempt and persist rewrite to cache
        queryData.query = rewrittenQuery;
        
        // Cache the rewritten prompt so we don't lose progress on restart
        if (segmentCallbacks?.onPromptRewritten) {
          segmentCallbacks.onPromptRewritten(segmentIndex, rewrittenQuery, rewriteCount);
        }
        
        logger.log("AI-Images", `Retrying with rewritten prompt: ${rewrittenQuery.substring(0, 60)}...`);

        attempt = 0;
        continue;
      }

      // If high traffic error, wait and retry the same attempt
      if (isHighTrafficError(error)) {
        const waitTime = error.retryAfterMs;
        logger.warn("AI-Images", `High traffic on ${error.provider}, waiting ${waitTime / 1000}s before retry...`);
        await sleep(waitTime);
        attempt--; // Retry the same attempt
        continue;
      }

      if (attempt < IMAGE_RETRY_ATTEMPTS) {
        const delay = calculateBackoffDelay(attempt, { logTag: "AI-Images" });
        logger.warn("AI-Images", `Attempt ${attempt} failed, retrying in ${Math.round(delay / 1000)}s...`);
        await sleep(delay);
      }
    }
  }

  throw new Error(
    `Failed to generate AI image for "${queryData.query}" after ${IMAGE_RETRY_ATTEMPTS} attempts. Error: ${lastError?.message}`
  );
}

function isWatermarkedImage(imageUrl: string): boolean {
  const lowerUrl = imageUrl.toLowerCase();
  return WATERMARKED_DOMAINS.some((domain) => lowerUrl.includes(domain));
}

function extractDomain(imageUrl: string): string {
  try {
    const url = new URL(imageUrl);
    return url.hostname;
  } catch {
    return "unknown";
  }
}

async function downloadImageForQuery(
  queryData: ImageSearchQuery,
  style: ResolvedStyle,
  index: number
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

      const nonWatermarkedUrls: string[] = [];
      const watermarkedUrls: string[] = [];

      for (const result of searchResults) {
        if (!result?.image) continue;

        const imageUrl = result.image;

        if (isWatermarkedImage(imageUrl)) {
          const domain = extractDomain(imageUrl);
          logger.debug("Images", `Skipped watermarked image from ${domain}`);
          watermarkedUrls.push(imageUrl);
        } else {
          nonWatermarkedUrls.push(imageUrl);
        }
      }

      logger.debug("Images", `Found ${nonWatermarkedUrls.length} non-watermarked and ${watermarkedUrls.length} watermarked images`);

      const imagesToTry = [...nonWatermarkedUrls, ...watermarkedUrls];

      if (imagesToTry.length === 0) {
        throw new Error(`No valid images found for query: "${query}"`);
      }

      let downloadSucceeded = false;
      let filePath: string | null = null;

      for (let i = 0; i < imagesToTry.length; i++) {
        const imageUrl = imagesToTry[i];
        if (!imageUrl) continue;

        const domain = extractDomain(imageUrl);
        const isWatermarked = i >= nonWatermarkedUrls.length;

        try {
          logger.debug("Images", `Trying to download image ${i + 1}/${imagesToTry.length} from ${domain}${isWatermarked ? " (watermarked)" : ""}`);

          filePath = await downloadImage(imageUrl, style, index);
          downloadSucceeded = true;

          if (isWatermarked) {
            logger.warn("Images", `All non-watermarked images failed, successfully downloaded watermarked image from ${domain}`);
          } else {
            logger.debug("Images", `Successfully downloaded non-watermarked image from ${domain}`);
          }

          break;
        } catch (downloadError) {
          const errorMsg = downloadError instanceof Error ? downloadError.message : String(downloadError);
          logger.debug("Images", `Failed to download from ${domain}: ${errorMsg}`);

          if (i === imagesToTry.length - 1) {
            throw new Error(`All ${imagesToTry.length} images failed to download. Last error: ${errorMsg}`);
          }
          continue;
        }
      }

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

  throw new Error(
    `Failed to download image for query "${query}" after ${IMAGE_RETRY_ATTEMPTS} attempts. Last error: ${lastError?.message}`
  );
}

async function downloadImage(imageUrl: string, style: ResolvedStyle, index: number): Promise<string> {
  logger.debug("Images", `Downloading image from: ${imageUrl}`);

  const response = await fetch(imageUrl);

  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.status}`);
  }

  const imageData = await response.arrayBuffer();

  // Determine file extension from URL or content type
  const extension = getImageExtension(imageUrl, response.headers.get("content-type"));

  // Generate filename with style-based naming: {styleId}_{orientation}_{index}.{ext}
  const orientationSuffix = style.orientation === 'vertical' ? '_vertical' : '';
  const filename = `${style.id}${orientationSuffix}_${index}${extension}`;
  const filePath = join(TMP_IMAGES_DIR, filename);

  // Save the image
  await Bun.write(filePath, imageData);

  logger.log("Images", `Saved image to: ${filePath}`);

  return filePath;
}

function getImageExtension(url: string, contentType: string | null): string {
  const urlExtension = extname(url).toLowerCase();
  if (urlExtension && [".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(urlExtension)) {
    return urlExtension;
  }

  if (contentType) {
    if (contentType.includes("jpeg")) return ".jpg";
    if (contentType.includes("png")) return ".png";
    if (contentType.includes("webp")) return ".webp";
    if (contentType.includes("gif")) return ".gif";
  }

  return ".jpg";
}

function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[<>:"/\\|?*]/g, "_")
    .replace(/\s+/g, "_")
    .trim()
    .substring(0, 200);
}

export function validateDownloadedImages(images: DownloadedImage[]): boolean {
  if (images.length === 0) {
    throw new Error("No images were downloaded");
  }
  logger.success("Images", `Validation passed for ${images.length} images`);
  return true;
}

