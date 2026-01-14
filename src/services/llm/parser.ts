/**
 * LLM Response Parser
 * Handles parsing, JSON extraction, and validation of LLM responses
 */

import type { ImageSearchQuery } from "../../types/index.ts";
import { BEAT_TYPES, COMPOSITIONS, SHOT_TYPES, type StructuredShot } from "./types.ts";
import * as logger from "../../utils/logger.ts";

/**
 * Parse and validate image queries from LLM response
 * @param content - Raw LLM response content
 * @returns Parsed array of image search queries
 */
export function parseImageQueries(content: string): ImageSearchQuery[] {
    const jsonString = extractJsonSnippet(content);
    let parsed: unknown[] = [];

    try {
        parsed = JSON.parse(jsonString);
    } catch {
        try {
            logger.warn("LLM", "Standard parse failed, attempting JSON repair...");
            parsed = JSON.parse(repairJson(jsonString));
        } catch (repairError) {
            // Attempt 3: Brute Force Regex (The "Nuclear Option")
            logger.warn("LLM", "JSON repair failed, attempting brute force regex extraction...");
            parsed = fallbackExtraction(content);

            if (parsed.length === 0) {
                // Only throw if even brute force failed
                logger.error("LLM", "JSON extraction failed", { content: content.substring(0, 200) });
                throw new Error(`Failed to parse JSON: ${repairError instanceof Error ? repairError.message : String(repairError)}`);
            }
        }
    }

    if (!isValidQueryArray(parsed)) {
        throw new Error("Response parsed successfully but does not match ImageSearchQuery[] schema");
    }

    return parsed;
}

/**
 * Parse structured shots from LLM response
 * @param content - Raw LLM response content
 * @returns Parsed array of structured shots
 */
export function parseStructuredShots(content: string): StructuredShot[] {
    const jsonString = extractJsonSnippet(content);
    let parsed: unknown[] = [];

    try {
        parsed = JSON.parse(jsonString);
    } catch {
        try {
            logger.warn("LLM", "Standard parse failed, attempting JSON repair...");
            parsed = JSON.parse(repairJson(jsonString));
        } catch (repairError) {
            logger.error("LLM", "JSON extraction failed for structured shots", { content: content.substring(0, 200) });
            throw new Error(`Failed to parse structured shots JSON: ${repairError instanceof Error ? repairError.message : String(repairError)}`);
        }
    }

    if (!isValidStructuredShotArray(parsed)) {
        throw new Error("Response parsed successfully but does not match StructuredShot[] schema");
    }

    return parsed;
}

/**
 * Extract JSON array from LLM response content
 * Handles various formats like markdown code blocks, raw JSON, etc.
 */
export function extractJsonSnippet(content: string): string {
    const clean = content.replace(/```(?:json)?|```/g, "").trim();

    const firstOpen = clean.indexOf("[");

    if (firstOpen !== -1) {
        let depth = 0;
        let firstClose = -1;

        for (let i = firstOpen; i < clean.length; i++) {
            if (clean[i] === "[") depth++;
            if (clean[i] === "]") {
                depth--;
                if (depth === 0) {
                    firstClose = i;
                    break;
                }
            }
        }

        if (firstClose !== -1) {
            const extracted = clean.substring(firstOpen, firstClose + 1);

            const objectMatches = extracted.match(/\{[^}]+\}/g);
            if (objectMatches?.length) {
                const hasValidObjects = objectMatches.some(obj =>
                    /["']?start["']?\s*:/i.test(obj)
                );

                if (hasValidObjects) {
                    const validObjects = objectMatches.filter(obj =>
                        /["']?start["']?\s*:/i.test(obj) &&
                        /["']?end["']?\s*:/i.test(obj) &&
                        /["']?query["']?\s*:/i.test(obj)
                    );

                    if (validObjects.length > 0) {
                        return `[${validObjects.join(",")}]`;
                    }
                }
            }

            return extracted;
        }
    }

    const objectPattern = /\{\s*["']?start["']?\s*:\s*\d+/;
    if (objectPattern.test(clean)) {
        const objectMatches = clean.match(/\{[^}]+\}/g);
        if (objectMatches?.length) {
            return `[${objectMatches.join(",")}]`;
        }
    }

    return clean;
}

/**
 * Repair malformed JSON from LLM responses
 * Handles common issues like unquoted keys, trailing commas, etc.
 */
export function repairJson(json: string): string {
    return json
        // FIX 1: Aggressively clean up keys with spaces inside quotes
        .replace(/"\s*([a-zA-Z0-9_]+)\s*"\s*:/g, '"$1":')

        // FIX 2: Wrap unquoted 'query' values in quotes
        .replace(/(["']?query["']?\s*:\s*)(?!["{[\]])(.*?[^,}\]\s])(?=\s*[,}\]])/gi, '$1"$2"')

        // Standard Repairs
        .replace(/"\s+"\s*(\w+)":/g, '"$1":')
        .replace(/"\s+(\w+)":/g, '"$1":')
        .replace(/,(\s*})/g, '$1')
        .replace(/,(\s*])/g, '$1')
        // Handles unquoted keys
        .replace(/(\{|,)\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":')
        .replace(/'([^']*)'\s*(?=[,}\]])/g, '"$1"')
        .replace(/^\[([#@!$%^&*]+)/, '[')
        .replace(/([#@!$%^&*]+)\]$/, ']')
        .replace(/\\([^"\\/bfnrtu])/g, '$1')
        .replace(/\s*:\s*/g, ':')
        .replace(/\s*,\s*/g, ',');
}

/**
 * Brute force extraction when all else fails
 * Uses regex to find query objects directly
 */
export function fallbackExtraction(content: string): ImageSearchQuery[] {
    const results: ImageSearchQuery[] = [];

    // Match object-like pattern containing start, end, query, optionally type
    const regex = /start["']?\s*:\s*(\d+)[\s\S]*?end["']?\s*:\s*(\d+)[\s\S]*?query["']?\s*:\s*(["'])([\s\S]*?)\3(?:[\s\S]*?type["']?\s*:\s*(["'])(pan|zoom|static)\5)?/gi;

    let match: RegExpExecArray | null;

    while ((match = regex.exec(content)) !== null) {
        if (!match[1] || !match[2] || !match[4]) {
            continue;
        }
        const startVal = parseInt(match[1], 10);
        const endVal = parseInt(match[2], 10);
        const queryVal = match[4].trim();
        const typeVal = match[6] as "pan" | "zoom" | "static" | undefined;

        if (!isNaN(startVal) && !isNaN(endVal) && queryVal.length > 0) {
            results.push({
                start: startVal,
                end: endVal,
                query: queryVal,
                type: typeVal,
            });
        }
    }

    return results;
}

/**
 * Type guard to validate parsed data is an ImageSearchQuery array
 */
export function isValidQueryArray(data: unknown): data is ImageSearchQuery[] {
    return Array.isArray(data) && data.every(item => {
        if (!item || typeof item !== "object") return false;
        const obj = item as Record<string, unknown>;

        // Required fields
        if (typeof obj.start !== "number") return false;
        if (typeof obj.end !== "number") return false;
        if (typeof obj.query !== "string") return false;

        return true;
    });
}

/**
 * Type guard to validate parsed data is a StructuredShot array
 */
export function isValidStructuredShotArray(data: unknown): data is StructuredShot[] {
    return Array.isArray(data) && data.every(item => {
        if (!item || typeof item !== "object") return false;
        const obj = item as Record<string, unknown>;

        // Required fields
        if (typeof obj.start !== "number") return false;
        if (typeof obj.end !== "number") return false;
        if (typeof obj.sceneId !== "string") return false;
        if (typeof obj.action !== "string") return false;
        if (!SHOT_TYPES.includes(obj.type as typeof SHOT_TYPES[number])) return false;

        // beatType validation using centralized constants
        if (!BEAT_TYPES.includes(obj.beatType as typeof BEAT_TYPES[number])) return false;

        // focus object validation
        if (!obj.focus || typeof obj.focus !== 'object') return false;
        const focus = obj.focus as Record<string, unknown>;
        if (!Array.isArray(focus.primary)) return false;
        if (!Array.isArray(focus.secondary)) return false;
        if (!Array.isArray(focus.exclude)) return false;

        // composition validation (can be null)
        if (obj.composition !== null && obj.composition !== undefined) {
            if (!COMPOSITIONS.includes(obj.composition as typeof COMPOSITIONS[number])) return false;
        }

        // Optional framingNote
        if (obj.framingNote !== undefined && obj.framingNote !== null && typeof obj.framingNote !== "string") {
            return false;
        }

        return true;
    });
}

/**
 * Validate image queries have required fields and valid data
 * @param queries - Array of image queries to validate
 * @returns True if valid, throws error otherwise
 */
export function validateImageQueries(queries: ImageSearchQuery[]): boolean {
    if (!Array.isArray(queries) || queries.length === 0) {
        throw new Error("No image queries generated by LLM");
    }

    for (let i = 0; i < queries.length; i++) {
        const query = queries[i];
        if (!query) {
            throw new Error(`Invalid query at index ${i}: query is undefined`);
        }
        if (typeof query.start !== "number" || typeof query.end !== "number") {
            throw new Error(`Invalid query at index ${i}: start/end must be numbers`);
        }
        if (typeof query.query !== "string" || query.query.trim().length === 0) {
            throw new Error(`Invalid query at index ${i}: query string is empty or invalid`);
        }
        if (query.start < 0 || query.end < 0) {
            throw new Error(`Invalid query at index ${i}: timestamps must be non-negative`);
        }
        if (query.start > query.end) {
            throw new Error(`Invalid query at index ${i}: start (${query.start}) > end (${query.end})`);
        }
    }

    return true;
}

/**
 * Validate structured shots have required fields and valid data
 */
export function validateStructuredShots(shots: StructuredShot[]): boolean {
    if (!Array.isArray(shots) || shots.length === 0) {
        throw new Error("No structured shots generated by LLM");
    }

    for (let i = 0; i < shots.length; i++) {
        const shot = shots[i];
        if (!shot) {
            throw new Error(`Invalid shot at index ${i}: shot is undefined`);
        }
        if (typeof shot.start !== "number" || typeof shot.end !== "number") {
            throw new Error(`Invalid shot at index ${i}: start/end must be numbers`);
        }
        if (typeof shot.sceneId !== "string" || shot.sceneId.trim().length === 0) {
            throw new Error(`Invalid shot at index ${i}: sceneId is required`);
        }
        if (typeof shot.action !== "string" || shot.action.trim().length === 0) {
            throw new Error(`Invalid shot at index ${i}: action is required`);
        }
        if (shot.start < 0 || shot.end < 0) {
            throw new Error(`Invalid shot at index ${i}: timestamps must be non-negative`);
        }
        if (shot.start > shot.end) {
            throw new Error(`Invalid shot at index ${i}: start (${shot.start}) > end (${shot.end})`);
        }

        // Validate focus has at least primary
        if (!shot.focus || !Array.isArray(shot.focus.primary)) {
            throw new Error(`Invalid shot at index ${i}: focus.primary is required`);
        }

        // Validate beatType
        if (!shot.beatType) {
            throw new Error(`Invalid shot at index ${i}: beatType is required`);
        }
    }

    return true;
}
