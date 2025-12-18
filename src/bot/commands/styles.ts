/**
 * /styles command handler
 */

import type { Context } from "../../utils/telegram.ts";
import { getDefaultStyle, getStyleIds, getStyle } from "../../styles/index.ts";
import { escapeMarkdownV2 } from "../utils.ts";
import * as logger from "../../utils/logger.ts";

/**
 * Build style description from actual style properties
 * @param styleId - Style ID to describe
 * @returns Formatted description for MarkdownV2
 */
function buildStyleDescription(styleId: string): string {
    const style = getStyle(styleId);
    if (!style) return "";

    const lines: string[] = [];

    // Style header
    lines.push(`*\\#${style.id}*`);
    lines.push(escapeMarkdownV2(style.description));

    // Segmentation type
    if (style.segmentationType === "sentence") {
        lines.push("• Sentence\\-based segmentation");
    } else {
        lines.push(`• Word\\-count segmentation \\(${style.wordsPerSegment} words\\)`);
    }

    // Pan effect
    lines.push(`• Pan effect ${style.panEffect ? "enabled" : "disabled"}`);

    // Captions
    if (style.captionsEnabled) {
        if (style.highlightStyle.enabled) {
            lines.push("• Karaoke captions with highlight");
        } else {
            lines.push("• Captions enabled \\(no karaoke\\)");
        }
    } else {
        lines.push("• Captions disabled");
    }

    return lines.join("\n");
}

/**
 * Handle /styles command
 * Shows available video styles with descriptions
 */
export async function handleStylesCommand(ctx: Context): Promise<void> {
    logger.log("Bot", "Received /styles command");

    const defaultStyle = getDefaultStyle();
    const styleIds = getStyleIds();

    // Build dynamic style descriptions
    const styleDescriptions = styleIds
        .map(id => buildStyleDescription(id))
        .join("\n\n");

    await ctx.reply(
        "🎨 *Available Video Styles*\n\n" +
        styleDescriptions + "\n\n" +
        `📌 Default style: *${escapeMarkdownV2(defaultStyle.name)}*`,
        { parse_mode: "MarkdownV2" }
    );
}
