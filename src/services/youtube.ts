/**
 * YouTube upload service using Google APIs
 * Handles video upload to YouTube with OAuth2 authentication
 */

import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import * as logger from "../logger.ts";
import type { YouTubeUploadOptions, YouTubeUploadResult, YouTubeChannel } from "../types.ts";
import {
  YOUTUBE_CLIENT_ID,
  YOUTUBE_CLIENT_SECRET,
  YOUTUBE_DEFAULT_CHANNEL,
  YOUTUBE_MOSSAD_ACCESS_TOKEN,
  YOUTUBE_MOSSAD_REFRESH_TOKEN,
  YOUTUBE_MOSSAD_CHANNEL_ID,
  YOUTUBE_BLINDSPOT_ACCESS_TOKEN,
  YOUTUBE_BLINDSPOT_REFRESH_TOKEN,
  YOUTUBE_BLINDSPOT_CHANNEL_ID,
} from "../constants.ts";

/**
 * Channel credentials storage
 */
const channelCredentials: Record<YouTubeChannel, {
  accessToken: string;
  refreshToken: string;
  channelId: string;
}> = {
  mossad: {
    accessToken: YOUTUBE_MOSSAD_ACCESS_TOKEN,
    refreshToken: YOUTUBE_MOSSAD_REFRESH_TOKEN,
    channelId: YOUTUBE_MOSSAD_CHANNEL_ID,
  },
  blindspot: {
    accessToken: YOUTUBE_BLINDSPOT_ACCESS_TOKEN,
    refreshToken: YOUTUBE_BLINDSPOT_REFRESH_TOKEN,
    channelId: YOUTUBE_BLINDSPOT_CHANNEL_ID,
  },
};

/**
 * Upload video to YouTube using the YouTube Data API v3
 * @param videoPath - Path to the video file to upload
 * @param options - Upload options (title, description, tags, channel, etc.)
 * @returns Upload result with video ID and URL
 */
export async function uploadToYouTube(
  videoPath: string,
  options: YouTubeUploadOptions
): Promise<YouTubeUploadResult> {
  // Determine which channel to use (default: mossad)
  const channel: YouTubeChannel = options.channel || (YOUTUBE_DEFAULT_CHANNEL as YouTubeChannel);

  logger.step("YouTube", `Uploading video to YouTube (${channel} channel)...`);
  logger.debug("YouTube", `Video path: ${videoPath}`);
  logger.debug("YouTube", `Title: ${options.title}`);
  logger.debug("YouTube", `Channel: ${channel}`);

  try {
    // Read video file
    const videoBuffer = await readFile(videoPath);
    const fileSize = videoBuffer.length;
    const filename = basename(videoPath);

    logger.debug("YouTube", `File size: ${(fileSize / 1024 / 1024).toFixed(2)} MB`);

    // Prepare metadata
    const metadata = {
      snippet: {
        title: options.title,
        description: options.description || "",
        tags: options.tags || [],
        categoryId: options.categoryId || "22", // Default: People & Blogs
      },
      status: {
        privacyStatus: "private", // Always private as per requirements
        selfDeclaredMadeForKids: false,
      },
    };

    logger.debug("YouTube", `Metadata: ${JSON.stringify(metadata, null, 2)}`);

    // Upload video using resumable upload
    const uploadResult = await uploadVideoResumable(
      videoBuffer,
      metadata,
      filename,
      channel
    );

    logger.success("YouTube", `Video uploaded successfully to ${channel} channel!`);
    logger.debug("YouTube", `Video ID: ${uploadResult.videoId}`);
    logger.debug("YouTube", `Video URL: ${uploadResult.videoUrl}`);

    return uploadResult;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error("YouTube", `Upload failed: ${errorMsg}`);
    throw new Error(`YouTube upload failed: ${errorMsg}`);
  }
}

/**
 * Upload video using resumable upload protocol
 * @param videoBuffer - Video file buffer
 * @param metadata - Video metadata
 * @param filename - Original filename
 * @param channel - YouTube channel to upload to
 * @returns Upload result
 */
async function uploadVideoResumable(
  videoBuffer: Buffer,
  metadata: any,
  filename: string,
  channel: YouTubeChannel
): Promise<YouTubeUploadResult> {
  const YOUTUBE_UPLOAD_URL = "https://www.googleapis.com/upload/youtube/v3/videos";
  let accessToken = await getAccessToken(channel);

  // Step 1: Initiate resumable upload session
  logger.debug("YouTube", "Initiating resumable upload session...");

  let initiateResponse = await fetch(
    `${YOUTUBE_UPLOAD_URL}?uploadType=resumable&part=snippet,status`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Upload-Content-Length": videoBuffer.length.toString(),
        "X-Upload-Content-Type": "video/*",
      },
      body: JSON.stringify(metadata),
    }
  );

  // If 401 Unauthorized, refresh token and retry
  if (initiateResponse.status === 401) {
    logger.warn("YouTube", "Access token expired, refreshing...");
    accessToken = await refreshAccessToken(channel);

    initiateResponse = await fetch(
      `${YOUTUBE_UPLOAD_URL}?uploadType=resumable&part=snippet,status`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "X-Upload-Content-Length": videoBuffer.length.toString(),
          "X-Upload-Content-Type": "video/*",
        },
        body: JSON.stringify(metadata),
      }
    );
  }

  if (!initiateResponse.ok) {
    const errorText = await initiateResponse.text();
    throw new Error(`Failed to initiate upload: ${initiateResponse.status} - ${errorText}`);
  }

  const uploadUrl = initiateResponse.headers.get("Location");
  if (!uploadUrl) {
    throw new Error("No upload URL returned from YouTube");
  }

  logger.debug("YouTube", `Upload session created: ${uploadUrl}`);

  // Step 2: Upload video content
  logger.step("YouTube", "Uploading video content...");

  const uploadResponse = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "video/*",
      "Content-Length": videoBuffer.length.toString(),
    },
    body: videoBuffer,
  });

  if (!uploadResponse.ok) {
    const errorText = await uploadResponse.text();
    throw new Error(`Failed to upload video: ${uploadResponse.status} - ${errorText}`);
  }

  const result = (await uploadResponse.json()) as { id: string };
  const videoId = result.id;
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

  return {
    videoId,
    videoUrl,
    title: metadata.snippet.title,
    privacyStatus: metadata.status.privacyStatus,
    channel,
  };
}

/**
 * Get OAuth2 access token for YouTube API
 * Automatically refreshes the token if needed
 * @param channel - YouTube channel to get token for
 * @returns Access token
 */
async function getAccessToken(channel: YouTubeChannel): Promise<string> {
  const credentials = channelCredentials[channel];

  if (!credentials.accessToken) {
    throw new Error(`Access token not found for ${channel} channel`);
  }

  // Try using the existing access token first
  // If it fails (401), we'll refresh it
  logger.debug("YouTube", `Using access token for ${channel} channel`);

  return credentials.accessToken;
}

/**
 * Refresh OAuth2 access token using refresh token
 * @param channel - YouTube channel to refresh token for
 * @returns New access token
 */
async function refreshAccessToken(channel: YouTubeChannel): Promise<string> {
  const credentials = channelCredentials[channel];

  if (!credentials.refreshToken) {
    throw new Error(`Refresh token not found for ${channel} channel`);
  }

  logger.debug("YouTube", `Refreshing access token for ${channel} channel...`);

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: YOUTUBE_CLIENT_ID,
      client_secret: YOUTUBE_CLIENT_SECRET,
      refresh_token: credentials.refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to refresh token: ${response.status} - ${errorText}`);
  }

  const data = (await response.json()) as { access_token: string };
  const newAccessToken = data.access_token;

  // Update the in-memory access token
  channelCredentials[channel].accessToken = newAccessToken;

  logger.success("YouTube", `Access token refreshed for ${channel} channel`);

  return newAccessToken;
}

