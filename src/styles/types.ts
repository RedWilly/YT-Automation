import {
  DEFAULT_CAPTION_STYLE as CONFIG_CAPTION_STYLE,
  DEFAULT_HIGHLIGHT_STYLE as CONFIG_HIGHLIGHT_STYLE,
} from "../config/defaults.ts";

export type SegmentationType = "sentence" | "wordCount";

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
 * Caption style configuration
 * ASS format uses BGR color order: &HAABBGGRR
 */
export interface CaptionStyleConfig {
  fontName: string;
  fontSize: number;
  primaryColor: string;
  outlineColor: string;
  backgroundColor: string;
  outlineWidth: number;
  shadowDepth: number;
  useBox: boolean;
  alignment: CaptionAlignment;
  marginV: number;
  marginVVertical: number;
  marginL: number;
  marginR: number;
  scaleX: number;
  scaleY: number;
  letterSpacing: number;
  bold: boolean;
  italic: boolean;
  uppercase: boolean;
}

export interface HighlightStyleConfig {
  enabled: boolean;
  color: string;
  useBox: boolean;
  outlineWidth: number;
}

export interface VideoStyle {
  id: string;
  name: string;
  description: string;
  imageStyle: string;
  negativePrompt: string;
  segmentationType: SegmentationType;
  wordsPerSegment: number;
  captionsEnabled: boolean;
  minWordsPerCaption: number;
  maxWordsPerCaption: number;
  captionStyle: CaptionStyleConfig;
  highlightStyle: HighlightStyleConfig;
  panEffect: boolean;
}

export interface StyleOptions {
  panEffect?: boolean;
  karaokeEnabled?: boolean;
  highlightColor?: string;
  highlightBox?: boolean;
  orientation?: VideoOrientation;
}

export interface ResolvedStyle extends VideoStyle {
  appliedOptions: StyleOptions;
  orientation: VideoOrientation;
}

// Predefined highlight colors in ASS BGR format (&HAABBGGRR)
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

export const DEFAULT_HIGHLIGHT_STYLE: HighlightStyleConfig = {
  enabled: CONFIG_HIGHLIGHT_STYLE.enabled,
  color: CONFIG_HIGHLIGHT_STYLE.color,
  useBox: CONFIG_HIGHLIGHT_STYLE.useBox,
  outlineWidth: CONFIG_HIGHLIGHT_STYLE.outlineWidth,
};


