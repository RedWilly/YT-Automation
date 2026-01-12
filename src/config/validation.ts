/**
 * Environment validation
 * Validates required configuration at startup
 */

import * as logger from "../utils/logger.ts";
import { PROVIDER_CONFIGS, type AIProvider, type ProviderConfig } from './providers.ts';
import { AI_TEXT, TELEGRAM, TRANSCRIPTION } from './services.ts';

// =============================================================
// VALIDATION
// =============================================================

/**
 * Validate required environment configuration
 * Called at startup to ensure critical values are set
 */
export function validateEnvironment(): void {
    // Validate AI provider
    const provider = AI_TEXT.provider;
    if (!provider || !PROVIDER_CONFIGS[provider]) {
        logger.error("Config", "❌ Invalid or missing AI_PROVIDER in .env file.");
        logger.error("Config", `Supported providers: ${Object.keys(PROVIDER_CONFIGS).join(", ")}`);
        process.exit(1);
    }

    // Validate API key for selected provider
    const config = PROVIDER_CONFIGS[provider];
    if (!config.apiKey) {
        logger.error("Config", `❌ Missing API key for provider: ${provider}`);
        process.exit(1);
    }

    // Validate Telegram token
    if (!TELEGRAM.botToken) {
        logger.error("Config", "❌ Missing TELEGRAM_BOT_TOKEN in .env file.");
        process.exit(1);
    }

    // Validate AssemblyAI key
    if (!TRANSCRIPTION.assemblyAiKey) {
        logger.error("Config", "❌ Missing ASSEMBLYAI_API_KEY in .env file.");
        process.exit(1);
    }
}

/**
 * Get the active AI provider configuration
 */
export function getAIConfig(): ProviderConfig {
    return PROVIDER_CONFIGS[AI_TEXT.provider];
}
