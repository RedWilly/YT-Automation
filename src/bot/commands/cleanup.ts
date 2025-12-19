/**
 * /cleanup command handler
 */

import type { Context } from "../../utils/telegram/index.ts";
import { cleanupTempFiles } from "../../services/storage/cleanup.ts";
import { PATHS } from "../../config/index.ts";
import * as logger from "../../utils/logger.ts";

/**
 * Handle /cleanup command
 * Removes all temporary files from tmp/audio/, tmp/images/, and tmp/video/ directories
 */
export async function handleCleanupCommand(ctx: Context): Promise<void> {
    logger.log("Bot", "Received /cleanup command");

    try {
        await ctx.reply("🧹 Starting cleanup of temporary files...");

        // Call the cleanup service
        const result = await cleanupTempFiles(false); // Don't keep final video

        // Calculate statistics
        const totalSizeMB = (result.totalSize / 1024 / 1024).toFixed(2);
        const audioFiles = result.deletedFiles.filter((f) => f.includes(PATHS.audio)).length;
        const imageFiles = result.deletedFiles.filter((f) => f.includes(PATHS.images)).length;
        const videoFiles = result.deletedFiles.filter((f) => f.includes(PATHS.video)).length;

        // Build success message
        let message = `✅ Cleanup completed successfully!\n\n`;
        message += `📊 Summary:\n`;
        message += `   • Audio files deleted: ${audioFiles}\n`;
        message += `   • Image files deleted: ${imageFiles}\n`;
        message += `   • Video files deleted: ${videoFiles}\n`;
        message += `   • Total files deleted: ${result.deletedFiles.length}\n`;
        message += `   • Space freed: ${totalSizeMB} MB\n`;

        if (result.failedFiles.length > 0) {
            message += `\n⚠️ Failed to delete ${result.failedFiles.length} files`;
        }

        await ctx.reply(message);
        logger.success("Bot", `Cleanup completed: ${result.deletedFiles.length} files deleted (${totalSizeMB} MB)`);
    } catch (error) {
        logger.error("Bot", "Error in handleCleanupCommand", error);
        await ctx.reply(`❌ Cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
    }
}
