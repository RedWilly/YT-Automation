import { envString } from "../utils/env.ts";

// =============================================================
// TYPE DEFINITIONS
// =============================================================

export type AIProvider = 'kimi' | 'deepseek' | 'gemini' | 'Qwen';

export type AIImageProvider = "cloudflare" | "togetherai" | "imagefx";

export interface ProviderConfig {
    model: string;
    baseUrl: string;
    apiKey: string;
    /** Segments per batch - 0 means entire transcript at once */
    segmentsPerBatch: number;
    maxTokens?: number;
    temperature: number;
    maxRetries: number;
}

// =============================================================
// AI PROVIDER CONFIGURATIONS
// =============================================================

export const PROVIDER_CONFIGS: Record<AIProvider, ProviderConfig> = {
    Qwen: {
        model: 'Qwen/Qwen3-VL-32B-Instruct',
        baseUrl: 'https://api.together.xyz/v1',
        apiKey: envString('TOGETHER_API_KEY'),
        segmentsPerBatch: 60,
        maxTokens: 200000, //190K
        temperature: 0.2,
        maxRetries: 15,
    },
    deepseek: {
        model: 'deepseek-chat',
        baseUrl: 'https://api.deepseek.com/v1',
        apiKey: envString('DEEPSEEK_API_KEY'),
        segmentsPerBatch: 30,
        maxTokens: 8192,      
        temperature: 0.2,
        maxRetries: 15,
    },
    kimi: {
        model: 'kimi-k2-turbo-preview',
        baseUrl: 'https://api.moonshot.ai/v1',
        apiKey: envString('KIMI_API_KEY'),
        segmentsPerBatch: 60,
        maxTokens: 256000,
        temperature: 0.2,
        maxRetries: 6,
    },
    gemini: {
        model: 'gemini-2.5-flash',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
        apiKey: envString('GEMINI_API_KEY'),
        segmentsPerBatch: 60, // Batch for reliable output on long transcripts
        maxTokens: 64000,
        temperature: 0.2,
        maxRetries: 6,
    },
};
