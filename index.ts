/**
 * v2v - Main Entry Point
 */

import { startBot } from "./src/bot.ts";
import * as logger from "./src/logger.ts";

// Load environment variables
import { config } from "dotenv";
config();

/**
 * Main function to start the application
 */
async function main(): Promise<void> {
  try {
    logger.log("Main", "=".repeat(50));
    logger.log("Main", "v2v - Audio to Video Bot");
    logger.log("Main", "=".repeat(50));

    // Start the Telegram bot
    await startBot();
  } catch (error) {
    logger.error("Main", "Fatal error", error);
    process.exit(1);
  }
}

// Run the application
main();