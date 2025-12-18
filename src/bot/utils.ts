/**
 * Bot utility functions
 * Shared utilities for command and message handlers
 */

import { parseStyleFromMessage, getStyle, getDefaultStyle, resolveStyle } from "../styles/index.ts";
import type { ResolvedStyle } from "../styles/types.ts";
import type { Context } from "../utils/telegram.ts";

/**
 * State management for tracking users waiting to provide URLs
 * Stores chatId -> { style?: ResolvedStyle } for pending URL inputs
 */
export const waitingForUrl = new Map<number, { style?: ResolvedStyle }>();

/**
 * Escape special characters for Telegram MarkdownV2
 * @param text - Text to escape
 * @returns Escaped text safe for MarkdownV2
 */
export function escapeMarkdownV2(text: string): string {
    return text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, "\\$&");
}

/**
 * Parse style from message caption
 * @param ctx - Telegram context
 * @returns Resolved style or undefined
 */
export function parseStyleFromCaption(ctx: Context): ResolvedStyle | undefined {
    if (!ctx.message) return undefined;

    // Get caption from message (voice, audio, document all can have captions)
    const caption = "caption" in ctx.message ? ctx.message.caption : undefined;
    if (!caption) return undefined;

    const { styleId, options } = parseStyleFromMessage(caption);
    const baseStyle = getStyle(styleId) ?? getDefaultStyle();
    return resolveStyle(baseStyle, options);
}
