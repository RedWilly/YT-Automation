/**
 * Type definitions for the video style system
 */

import {
  DEFAULT_CAPTION_STYLE as CONFIG_CAPTION_STYLE,
  DEFAULT_HIGHLIGHT_STYLE as CONFIG_HIGHLIGHT_STYLE,
} from "../config/defaults.ts";

/**
 * Segmentation type - how to split transcript into segments
 */
export type SegmentationType = "sentence" | "wordCount";

/**
 * Video orientation - horizontal (16:9) or vertical (9:16 shorts)
 */
export type VideoOrientation = "horizontal" | "vertical";

/**
 * ASS Subtitle Alignment Values
 * 
 * Position grid:
 *   7 8 9   ← Top
 *   4 5 6   ← Middle
 *   1 2 3   ← Bottom
 */
export type CaptionAlignment = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

/**
 * Caption style configuration - colors, fonts, position, and visual settings
 * ASS format uses BGR color order: &HAABBGGRR
 */
export interface CaptionStyleConfig {
  // === Font Settings ===
  /** Font name */
  fontName: string;
  /** Font size in pixels */
  fontSize: number;

  // === Color Settings (ASS BGR format) ===
  /** Primary text color (e.g., "&H00FFFFFF" for white) */
  primaryColor: string;
  /** Outline color */
  outlineColor: string;
  /** Background/box color */
  backgroundColor: string;

  // === Border Settings ===
  /** Outline thickness in pixels */
  outlineWidth: number;
  /** Shadow depth in pixels (0 = no shadow) */
  shadowDepth: number;
  /** Whether to use a background box (BorderStyle=3) or outline (BorderStyle=1) */
  useBox: boolean;

  // === Position & Layout ===
  /** Caption alignment (1-9, see grid in CaptionAlignment type) */
  alignment: CaptionAlignment;
  /** Vertical margin from edge (pixels) - for horizontal videos */
  marginV: number;
  /** Vertical margin for vertical videos (pixels) */
  marginVVertical: number;
  /** Left margin (pixels) */
  marginL: number;
  /** Right margin (pixels) */
  marginR: number;

  // === Text Transform ===
  /** Horizontal scale (100 = normal) */
  scaleX: number;
  /** Vertical scale (100 = normal) */
  scaleY: number;
  /** Letter spacing (0 = normal) */
  letterSpacing: number;
  /** Bold text */
  bold: boolean;
  /** Italic text */
  italic: boolean;
  /** Force uppercase text */
  uppercase: boolean;
}

/**
 * Highlight style configuration for karaoke effect
 */
export interface HighlightStyleConfig {
  /** Whether karaoke highlighting is enabled */
  enabled: boolean;
  /** Highlight color in ASS BGR format */
  color: string;
  /** Whether to use a box for highlight (BorderStyle=3) */
  useBox: boolean;
  /** Outline width when using box highlight */
  outlineWidth: number;
}

/**
 * Complete video style configuration
 */
export interface VideoStyle {
  /** Unique style identifier (e.g., "history", "ww2") */
  id: string;
  /** Human-readable style name */
  name: string;
  /** Description for help text */
  description: string;

  // === Image Generation ===
  /** AI image generation style prompt */
  imageStyle: string;
  /** Negative prompt for AI image generation */
  negativePrompt: string;

  // === Segmentation ===
  /** How to segment the transcript */
  segmentationType: SegmentationType;
  /** Words per segment (only used when segmentationType is "wordCount") */
  wordsPerSegment: number;

  // === Captions ===
  /** Whether captions are enabled by default */
  captionsEnabled: boolean;
  /** Minimum words per caption group */
  minWordsPerCaption: number;
  /** Maximum words per caption group */
  maxWordsPerCaption: number;
  /** Caption text style configuration */
  captionStyle: CaptionStyleConfig;
  /** Highlight style for karaoke effect */
  highlightStyle: HighlightStyleConfig;

  // === Video Effects ===
  /** Whether pan effect is enabled by default */
  panEffect: boolean;
}

/**
 * Runtime options that can override style defaults
 * These are parsed from Telegram commands (e.g., --pan, --karaoke, --short)
 */
export interface StyleOptions {
  /** Override pan effect setting */
  panEffect?: boolean;
  /** Override karaoke highlighting */
  karaokeEnabled?: boolean;
  /** Override highlight color (e.g., "yellow", "red", "purple") */
  highlightColor?: string;
  /** Override highlight box setting */
  highlightBox?: boolean;
  /** Override video orientation (--short sets this to "vertical") */
  orientation?: VideoOrientation;
}

/**
 * Resolved style configuration (style + runtime overrides)
 */
export interface ResolvedStyle extends VideoStyle {
  /** Runtime options that were applied */
  appliedOptions: StyleOptions;
  /** Video orientation (horizontal or vertical/shorts) */
  orientation: VideoOrientation;
}

/**
 * Predefined highlight colors in ASS BGR format
 * Format: &HAABBGGRR (Alpha, Blue, Green, Red)
 */
export const HIGHLIGHT_COLORS: Record<string, string> = {
  purple: "&H00FF008B",    // #8B00FF (violet/purple)
  yellow: "&H0000FFFF",    // #FFFF00 (yellow)
  red: "&H000000FF",       // #FF0000 (red)
  green: "&H0000FF00",     // #00FF00 (green)
  blue: "&H00FF0000",      // #0000FF (blue)
  orange: "&H0000A5FF",    // #FFA500 (orange)
  pink: "&H00B469FF",      // #FF69B4 (hot pink)
  cyan: "&H00FFFF00",      // #00FFFF (cyan)
  white: "&H00FFFFFF",     // #FFFFFF (white)
};

/**
 * Default caption style (uses config/defaults.ts values)
 */
export const DEFAULT_CAPTION_STYLE: CaptionStyleConfig = {
  fontName: CONFIG_CAPTION_STYLE.fontName,
  fontSize: CONFIG_CAPTION_STYLE.fontSize,
  primaryColor: CONFIG_CAPTION_STYLE.primaryColor,
  outlineColor: CONFIG_CAPTION_STYLE.outlineColor,
  backgroundColor: CONFIG_CAPTION_STYLE.backgroundColor,
  outlineWidth: CONFIG_CAPTION_STYLE.outlineWidth,
  shadowDepth: CONFIG_CAPTION_STYLE.shadowDepth,
  useBox: CONFIG_CAPTION_STYLE.useBox,
  alignment: CONFIG_CAPTION_STYLE.alignment,
  marginV: CONFIG_CAPTION_STYLE.marginV,
  marginVVertical: CONFIG_CAPTION_STYLE.marginVVertical,
  marginL: CONFIG_CAPTION_STYLE.marginL,
  marginR: CONFIG_CAPTION_STYLE.marginR,
  scaleX: CONFIG_CAPTION_STYLE.scaleX,
  scaleY: CONFIG_CAPTION_STYLE.scaleY,
  letterSpacing: CONFIG_CAPTION_STYLE.letterSpacing,
  bold: CONFIG_CAPTION_STYLE.bold,
  italic: CONFIG_CAPTION_STYLE.italic,
  uppercase: CONFIG_CAPTION_STYLE.uppercase,
};

/**
 * Default highlight style (uses config/defaults.ts values)
 */
export const DEFAULT_HIGHLIGHT_STYLE: HighlightStyleConfig = {
  enabled: CONFIG_HIGHLIGHT_STYLE.enabled,
  color: CONFIG_HIGHLIGHT_STYLE.color,
  useBox: CONFIG_HIGHLIGHT_STYLE.useBox,
  outlineWidth: CONFIG_HIGHLIGHT_STYLE.outlineWidth,
};


