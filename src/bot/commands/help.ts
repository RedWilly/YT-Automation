import type { Context } from "../../utils/telegram/index.ts";
import * as logger from "../../utils/logger.ts";

export async function handleHelpCommand(ctx: Context): Promise<void> {
    logger.log("Bot", "Received /help command");

    await ctx.reply(
        "📖 *Detailed Help*\n\n" +
        "*Style Selection:*\n" +
        "Add a hashtag to your message caption to select a style:\n" +
        "• `#history` \\- Classical oil painting style \\(default\\)\n" +
        "• `#ww2` \\- Black\\-and\\-white archival photography\n\n" +
        "*Options \\(override style defaults\\):*\n" +
        "• `--pan` / `--no-pan` \\- Enable/disable pan effect\n" +
        "• `--karaoke` / `--no-karaoke` \\- Enable/disable word highlighting\n" +
        "• `--highlight=COLOR` \\- Set highlight color \\(purple, yellow, cyan, green, red, white\\)\n\n" +
        "*Examples:*\n" +
        "• Send audio with caption: `#ww2`\n" +
        "• Send audio with caption: `#history --no-pan`\n" +
        "• Send audio with caption: `#ww2 --karaoke --highlight=yellow`\n\n" +
        "*Commands:*\n" +
        "• /start \\- Welcome message\n" +
        "• /upload \\- Upload audio file\n" +
        "• /url \\- Process audio from URL\n" +
        "• /queue \\- View job queue\n" +
        "• /styles \\- View available styles\n" +
        "• /cleanup \\- Remove temp files",
        { parse_mode: "MarkdownV2" }
    );
}
