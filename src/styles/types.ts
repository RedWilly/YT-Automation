/**
 * Type definitions for the video style system
 */

/**
 * Segmentation type - how to split transcript into segments
 */
export type SegmentationType = "sentence" | "wordCount";

/**
 * Caption style configuration - colors, fonts, and visual settings
 * ASS format uses BGR color order: &HAABBGGRR
 */
export interface CaptionStyleConfig {
  /** Font name */
  fontName: string;
  /** Font size in pixels */
  fontSize: number;
  /** Primary text color in ASS BGR format (e.g., "&H00FFFFFF" for white) */
  primaryColor: string;
  /** Outline color in ASS BGR format */
  outlineColor: string;
  /** Background/box color in ASS BGR format */
  backgroundColor: string;
  /** Outline thickness in pixels */
  outlineWidth: number;
  /** Shadow depth in pixels (0 = no shadow) */
  shadowDepth: number;
  /** Whether to use a background box (BorderStyle=3) or outline (BorderStyle=1) */
  useBox: boolean;
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
  /** Optional: Scale image to fill 1920x1080 (crop edges). Only used when panEffect is false. */
  zoomToFit?: boolean;

  // === LLM Context ===
  /** Additional context for LLM prompts (style-specific guidance) */
  llmContext: string;
}

/**
 * Runtime options that can override style defaults
 * These are parsed from Telegram commands (e.g., --pan, --karaoke)
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
}

/**
 * Resolved style configuration (style + runtime overrides)
 */
export interface ResolvedStyle extends VideoStyle {
  /** Runtime options that were applied */
  appliedOptions: StyleOptions;
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
 * Default caption style (white text with black outline)
 */
export const DEFAULT_CAPTION_STYLE: CaptionStyleConfig = {
  fontName: "Resolve-Bold",
  fontSize: 72,
  primaryColor: "&H00FFFFFF",  // White
  outlineColor: "&H00000000",  // Black
  backgroundColor: "&H80000000",  // Semi-transparent black
  outlineWidth: 1,
  shadowDepth: 2,
  useBox: false,
};

/**
 * Default highlight style (purple box)
 */
export const DEFAULT_HIGHLIGHT_STYLE: HighlightStyleConfig = {
  enabled: true,
  color: "&H00FF008B",  // Purple
  useBox: true,
};

