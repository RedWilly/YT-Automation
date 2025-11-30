/**
 * Style system - Central registry for video generation styles
 */

import type { VideoStyle, StyleOptions, ResolvedStyle } from "./types.ts";
import { HIGHLIGHT_COLORS } from "./types.ts";
import { historyStyle } from "./history.ts";
import { ww2Style } from "./ww2.ts";

// Re-export types
export * from "./types.ts";

/**
 * Registry of all available styles
 */
export const STYLES: Record<string, VideoStyle> = {
  history: historyStyle,
  ww2: ww2Style,
};

/**
 * Default style ID when no style is specified
 */
export const DEFAULT_STYLE_ID = "history";

/**
 * Get a style by ID
 * @param styleId - Style identifier (e.g., "history", "ww2")
 * @returns VideoStyle or undefined if not found
 */
export function getStyle(styleId: string): VideoStyle | undefined {
  return STYLES[styleId.toLowerCase()];
}

/**
 * Get the default style
 * @returns Default VideoStyle
 */
export function getDefaultStyle(): VideoStyle {
  return STYLES[DEFAULT_STYLE_ID]!;
}

/**
 * Get all available style IDs
 * @returns Array of style IDs
 */
export function getStyleIds(): string[] {
  return Object.keys(STYLES);
}

/**
 * Check if a style exists
 * @param styleId - Style identifier to check
 * @returns True if style exists
 */
export function styleExists(styleId: string): boolean {
  return styleId.toLowerCase() in STYLES;
}

/**
 * Resolve a style with runtime options applied
 * Creates a new object with options merged into the style defaults
 * 
 * @param style - Base video style
 * @param options - Runtime options to apply
 * @returns ResolvedStyle with options applied
 */
export function resolveStyle(style: VideoStyle, options: StyleOptions = {}): ResolvedStyle {
  // Create a deep copy of the style to avoid mutation
  const resolved: ResolvedStyle = {
    ...style,
    captionStyle: { ...style.captionStyle },
    highlightStyle: { ...style.highlightStyle },
    appliedOptions: options,
  };

  // Apply pan effect override
  if (options.panEffect !== undefined) {
    resolved.panEffect = options.panEffect;
  }

  // Apply karaoke highlight override
  if (options.karaokeEnabled !== undefined) {
    resolved.highlightStyle.enabled = options.karaokeEnabled;
  }

  // Apply highlight color override
  if (options.highlightColor !== undefined) {
    const colorKey = options.highlightColor.toLowerCase();
    if (colorKey in HIGHLIGHT_COLORS) {
      resolved.highlightStyle.color = HIGHLIGHT_COLORS[colorKey]!;
    }
  }

  // Apply highlight box override
  if (options.highlightBox !== undefined) {
    resolved.highlightStyle.useBox = options.highlightBox;
  }

  return resolved;
}

/**
 * Parse style ID and options from a message text
 * Looks for #hashtags for style and --flags for options
 * 
 * Format examples:
 *   "#ww2 --pan --karaoke"
 *   "#history --highlight=yellow"
 *   "#ww2 --pan --highlight=red --box"
 * 
 * @param text - Message text to parse
 * @returns Object with styleId and options
 */
export function parseStyleFromMessage(text: string): { styleId: string; options: StyleOptions } {
  const options: StyleOptions = {};
  let styleId = DEFAULT_STYLE_ID;

  // Parse hashtag for style
  const hashtagMatch = text.match(/#(\w+)/);
  if (hashtagMatch && hashtagMatch[1]) {
    const potentialStyle = hashtagMatch[1].toLowerCase();
    if (styleExists(potentialStyle)) {
      styleId = potentialStyle;
    }
  }

  // Parse --pan flag
  if (/--pan\b/i.test(text)) {
    options.panEffect = true;
  }

  // Parse --nopan flag
  if (/--nopan\b/i.test(text)) {
    options.panEffect = false;
  }

  // Parse --karaoke flag
  if (/--karaoke\b/i.test(text)) {
    options.karaokeEnabled = true;
  }

  // Parse --nokaraoke flag
  if (/--nokaraoke\b/i.test(text)) {
    options.karaokeEnabled = false;
  }

  // Parse --highlight=color flag
  const highlightMatch = text.match(/--highlight=(\w+)/i);
  if (highlightMatch && highlightMatch[1]) {
    options.highlightColor = highlightMatch[1].toLowerCase();
  }

  // Parse --box flag
  if (/--box\b/i.test(text)) {
    options.highlightBox = true;
  }

  // Parse --nobox flag
  if (/--nobox\b/i.test(text)) {
    options.highlightBox = false;
  }

  return { styleId, options };
}

