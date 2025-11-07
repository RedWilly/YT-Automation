/**
 * Image search and download service using DuckDuckGo
 */

import { duckDuckGoImageSearch } from "../../dim.ts";
import { TMP_IMAGES_DIR } from "../constants.ts";
import type { ImageSearchQuery, DownloadedImage } from "../types.ts";
import { join, extname } from "node:path";
import * as logger from "../logger.ts";

/**
 * Search and download images for all queries
 * @param queries - Array of image search queries with timestamps
 * @returns Array of downloaded image information
 */
export async function downloadImagesForQueries(
  queries: ImageSearchQuery[]
): Promise<DownloadedImage[]> {
  logger.step("Images", `Downloading images for ${queries.length} queries`);

  const downloadedImages: DownloadedImage[] = [];
  const queriesLength = queries.length;

  for (let i = 0; i < queriesLength; i++) {
    const queryData = queries[i];
    if (!queryData) continue;

    try {
      const downloadedImage = await downloadImageForQuery(queryData);
      downloadedImages.push(downloadedImage);
      logger.debug(
        "Images",
        `Progress: ${i + 1}/${queriesLength} - Downloaded: ${downloadedImage.filePath}`
      );
    } catch (error) {
      logger.error(
        "Images",
        `Failed to download image for query "${queryData.query}"`,
        error
      );
      // Continue with next query even if one fails
    }
  }

  logger.success(
    "Images",
    `Successfully downloaded ${downloadedImages.length}/${queriesLength} images`
  );

  return downloadedImages;
}

/**
 * Search and download a single image for a query
 * @param queryData - Image search query with timestamps
 * @returns Downloaded image information
 */
async function downloadImageForQuery(
  queryData: ImageSearchQuery
): Promise<DownloadedImage> {
  const { query, start, end } = queryData;

  logger.debug("Images", `Searching for: "${query}"`);

  // Search for images using DuckDuckGo
  const searchResults = await duckDuckGoImageSearch(query, 1);

  if (searchResults.length === 0 || !searchResults[0]) {
    throw new Error(`No images found for query: "${query}"`);
  }

  const imageUrl = searchResults[0].image;
  logger.debug("Images", `Found image URL: ${imageUrl}`);

  // Download the image
  const filePath = await downloadImage(imageUrl, query);

  return {
    query,
    start,
    end,
    filePath,
  };
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

  console.log(`[Images] Saved image to: ${filePath}`);

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
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, 200); // Limit length to avoid filesystem issues
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

