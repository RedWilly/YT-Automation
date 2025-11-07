/**
 * YouTube Automation Workflow - Main Entry Point
 */

import { startBot } from "./src/bot.ts";

// Load environment variables
import { config } from "dotenv";
config();

/**
 * Main function to start the application
 */
async function main(): Promise<void> {
  try {
    console.log("=".repeat(50));
    console.log("YouTube Automation Workflow");
    console.log("=".repeat(50));
    console.log("");

    // Start the Telegram bot
    await startBot();
  } catch (error) {
    console.error("Fatal error:", error);
    process.exit(1);
  }
}

// Run the application
main();