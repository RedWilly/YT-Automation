import { parseStyleFromMessage, getStyle, getDefaultStyle, resolveStyle } from "../styles/index.ts";
import type { ResolvedStyle } from "../styles/types.ts";
import type { Context } from "../utils/telegram/index.ts";

export const waitingForUrl = new Map<number, { style?: ResolvedStyle }>();

export function escapeMarkdownV2(text: string): string {
    return text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, "\\$&");
}

export function parseStyleFromCaption(ctx: Context): ResolvedStyle | undefined {
    if (!ctx.message) return undefined;

    // Get caption from message (voice, audio, document all can have captions)
    const caption = "caption" in ctx.message ? ctx.message.caption : undefined;
    if (!caption) return undefined;

    const { styleId, options } = parseStyleFromMessage(caption);
    const baseStyle = getStyle(styleId) ?? getDefaultStyle();
    return resolveStyle(baseStyle, options);
}
