import { AI_TEXT, getAIConfig } from '../../config/index.ts';
import type {
    LLMRequest,
    LLMResponse,
    ImageSearchQuery,
} from "../../types/index.ts";
import type { ResolvedStyle } from "../../styles/types.ts";
import * as logger from "../../utils/logger.ts";
import { parseImageQueries } from "./parser.ts";

// Get AI configuration
const aiConfig = getAIConfig();
const AI_API_KEY = aiConfig.apiKey;
const AI_BASE_URL = aiConfig.baseUrl;
const AI_MODEL = aiConfig.model;
const AI_PROVIDER = AI_TEXT.provider;

/** Call LLM chat API with retry logic */
export async function callLLMWithRetry(
    systemPrompt: string,
    userPrompt: string,
    label: string,
    maxRetries: number,
    returnRaw: true
): Promise<string>;
export async function callLLMWithRetry(
    systemPrompt: string,
    userPrompt: string,
    label: string,
    maxRetries: number,
    returnRaw?: false
): Promise<ImageSearchQuery[]>;
export async function callLLMWithRetry(
    systemPrompt: string,
    userPrompt: string,
    label: string,
    maxRetries: number,
    returnRaw?: boolean
): Promise<ImageSearchQuery[] | string> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const response = await callLLM(systemPrompt, userPrompt);
            const content = response.choices[0]?.message?.content;

            if (!content) {
                throw new Error("Empty response from LLM");
            }

            if (returnRaw) {
                if (attempt > 0) {
                    logger.success("LLM", `Successfully received response on attempt ${attempt + 1}${label}`);
                }
                return content;
            }

            const queries = parseImageQueries(content);

            if (attempt > 0) {
                logger.success("LLM", `Successfully parsed response on attempt ${attempt + 1}${label}`);
            }

            return queries;
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));

            if (attempt < maxRetries) {
                const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
                logger.warn(
                    "LLM",
                    `LLM call${label} failed (attempt ${attempt + 1}/${maxRetries + 1}): ${lastError.message}. Retrying in ${delay}ms...`
                );
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    throw lastError ?? new Error("Unknown LLM error");
}

async function callLLM(
    systemPrompt: string,
    userPrompt: string
): Promise<LLMResponse> {
    const request: LLMRequest = {
        model: AI_MODEL,
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
        ],
        temperature: aiConfig.temperature,
        max_tokens: aiConfig.maxTokens,
    };

    logger.log("LLM", `Calling ${AI_PROVIDER}: ${AI_MODEL}`);

    const response = await fetch(`${AI_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${AI_API_KEY}`,
        },
        body: JSON.stringify(request),
    });

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`LLM API error: ${response.status} - ${errorBody}`);
    }

    return await response.json() as LLMResponse;
}


export async function rewriteUnsafePrompt(
    currentPrompt: string,
    style: ResolvedStyle,
    originalPrompt?: string,
    rewriteCount: number = 1,
    maxRewrites: number = 25
): Promise<string> {
    const retriesLeft = maxRewrites - rewriteCount;
    const urgencyPercent = Math.round((rewriteCount / maxRewrites) * 100);

    logger.log("LLM", `Rewriting unsafe prompt (${rewriteCount}/${maxRewrites}, ${retriesLeft} left)...`);

    // After 20% of attempts, try anonymizing names
    const shouldAnonymize = rewriteCount >= Math.ceil(maxRewrites * 0.2);
    const anonymizeInstruction = shouldAnonymize
        ? `
6. REPLACE any real person names with generic terms:
   - Real names → "a person", "a soldier", "a woman", "a man"
   - Famous figures → describe by role, not name`
        : '';

    // Build urgency message based on retries left
    let urgencyMessage = '';
    if (urgencyPercent >= 80) {
        urgencyMessage = `⚠️ CRITICAL: Only ${retriesLeft} attempts left! Be VERY aggressive in removing trigger words.`;
    } else if (urgencyPercent >= 50) {
        urgencyMessage = `⚠️ WARNING: ${retriesLeft} attempts left. Try harder to find and remove trigger words.`;
    }

    const systemPrompt = `You are a prompt optimization assistant. The image generation request was declined and needs refinement for compatibility with standard AI image generation parameters.

TASK: Make MINIMAL changes to the prompt to help it pass content filters while preserving ALL scene context, characters, era, and setting details.

${urgencyMessage}

CRITICAL RULES:
1. MINIMAL CHANGE PRINCIPLE - Change as LITTLE as possible:
   - Only modify specific words/phrases that trigger filters
   - NEVER remove characters, settings, or era details
   - NEVER simplify or abstract the scene

2. PRESERVE EVERYTHING EXCEPT TRIGGER WORDS:
   - KEEP all character descriptions (names, roles, appearance)
   - KEEP the historical era/period (ancient, medieval, modern, etc.)
   - KEEP cultural/ethnic identifiers (Chinese, Roman, Viking, etc.)
   - KEEP time period markers (1940s, Renaissance, Bronze Age, etc.)
   - KEEP clothing/armor/equipment specific to the era
   - KEEP architectural styles, settings, and materials
   - KEEP scene composition, lighting, and atmosphere
   - KEEP camera angles and shot scales

3. REWORDING PRINCIPLES (apply creatively based on context):
   - Replace direct action verbs with descriptive states that imply the same meaning
   - Use physical positioning and body language to convey intent
   - Use environmental cues to suggest outcomes (smoke, dust, shadows)
   - Describe visible results rather than the action itself
   - Focus on the moment before or after the peak action
   - The goal is SAME VISUAL RESULT, different wording

4. PRESERVE BRACKET NOTATION:
   - Keep all [entity_id] references exactly as they appear
   - Keep all [cameraAngle: X] and [shotScale: Y] notations
   - Do not remove or alter bracketed references

5. RETURN only the refined prompt, no explanations${anonymizeInstruction}

Goal: Same scene, same characters, same era/setting - change ONLY specific trigger words, keep everything else identical.`;

    // Include original prompt context if this isn't the first refinement
    const contextSection = originalPrompt && currentPrompt !== originalPrompt
        ? `ORIGINAL PROMPT (for context):
"${originalPrompt}"

PREVIOUS ATTEMPT (was declined):
"${currentPrompt}"`
        : `PROMPT TO REFINE:
"${currentPrompt}"`;

    const userPrompt = `${contextSection}

Make MINIMAL changes - only replace specific trigger words. Keep ALL characters, era, setting, and scene details EXACTLY as they are.
Return ONLY the refined prompt, preserving all bracket notation like [entity_id], [cameraAngle: X], [shotScale: Y]:`;

    // Log what we're asking the LLM to do for debugging
    logger.log("LLM", `Minimal refinement request: changing only trigger words, preserving all context (attempt ${rewriteCount}/${maxRewrites})`);

    try {
        const response = await callLLM(systemPrompt, userPrompt);
        const content = response.choices[0]?.message?.content;

        if (!content) {
            throw new Error("Empty response from LLM");
        }

        const rewritten = content.trim().replace(/^["']|["']$/g, "");

        logger.success("LLM", `Rewritten prompt: "${rewritten.substring(0, 50)}..."`);

        return rewritten;
    } catch (error) {
        logger.warn("LLM", `Failed to rewrite prompt: ${error instanceof Error ? error.message : String(error)}`);
        return `Abstract ${style.imageStyle} artwork with ambient mood`;
    }
}
