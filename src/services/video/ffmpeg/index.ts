/**
 * FFmpeg utilities for video processing
 * 
 * Modular structure:
 * - dimensions.ts: Video size constants
 * - effects/: Individual effect modules (pan, zoom, static)
 * - filters.ts: Filter complex builder
 */

// Main exports
export { createFilterComplex, determineEffectType } from "./filters.ts";
export { getVideoDimensions } from "./dimensions.ts";

// Effect exports
export { createPanFilter, calculatePanParams } from "./effects/pan.ts";
export { createZoomFilter, calculateZoomParams } from "./effects/zoom.ts";
export { createStaticFilter } from "./effects/static.ts";
export type { EffectType } from "./effects/index.ts";
export type { ZoomParams } from "./effects/zoom.ts";
