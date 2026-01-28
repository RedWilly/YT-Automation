/**
 * v2v - Main Entry Point
 */

import { startBot } from "./src/bot/index.ts";
import * as logger from "./src/utils/logger.ts";

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
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // Handle Telegram connection errors gracefully
    if (errorMessage.includes("ECONNRESET") || 
        errorMessage.includes("ConnectionRefused") ||
        errorMessage.includes("socket") ||
        errorMessage.includes("getUpdates")) {
      
      logger.warn("Main", "Telegram connection error occurred");
      logger.log("Main", "This may happen during network issues but doesn't affect active work");
      
      // Import jobQueue here to check for active work
      const { jobQueue } = await import("./src/core/queue/index.ts");
      
      if (jobQueue.hasActiveJob()) {
        logger.log("Main", "Active work detected - keeping process alive");
        
        // Keep the process alive by setting up a periodic check
        const checkInterval = setInterval(async () => {
          if (!jobQueue.hasActiveJob()) {
            logger.success("Main", "All work completed, exiting gracefully");
            clearInterval(checkInterval);
            process.exit(0);
          }
        }, 5000); // Check every 5 seconds
        
        // Prevent the process from exiting
        return;
      } else {
        logger.log("Main", "No active work, exiting due to connection error");
        process.exit(0);
      }
    }
    
    // For other errors, log and exit
    logger.error("Main", "Fatal error", error);
    process.exit(1);
  }
}

// Run the application
main();