/**
 * FFmpeg effects index
 * Re-exports all effect modules for easy imports
 */

export { createStaticFilter } from "./static.ts";
export type { StaticParams } from "./static.ts";

export { createPanFilter, calculatePanParams } from "./pan.ts";

export { createZoomFilter, calculateZoomParams } from "./zoom.ts";
export type { ZoomParams } from "./zoom.ts";

/**
 * Effect type for shot-based effects
 */
export type EffectType = "pan" | "zoom" | "static";
