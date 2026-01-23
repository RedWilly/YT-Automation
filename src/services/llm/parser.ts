/** Handles parsing, JSON extraction, and validation of LLM responses */

import type { ImageSearchQuery } from "../../types/index.ts";
import { SHOT_TYPES, type StructuredShot } from "../../types/llm.ts";
import * as logger from "../../utils/logger.ts";

/** Parse and validate image queries from LLM response */
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
            logger.warn("LLM", "JSON repair failed, attempting brute force regex extraction...");
            parsed = fallbackExtraction(content);

            if (parsed.length === 0) {
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

/** Parse structured shots from LLM response */
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

    // Enforce shot type distribution: static should be ~10% max
    // return enforceShootTypeDistribution(parsed);
    return parsed;
}

/**
 * Enforce shot type distribution: static should be ~25% max
 * If too many static shots, convert excess to pan/zoom based on context
 */
function enforceShootTypeDistribution(shots: StructuredShot[]): StructuredShot[] {
    const total = shots.length;
    const maxStatic = Math.max(1, Math.ceil(total * 0.25)); // At least 1, max 25%

    const staticShots = shots.filter(s => s.type === 'static');
    const staticCount = staticShots.length;

    if (staticCount <= maxStatic) {
        return shots; // Already within limit
    }

    logger.debug("LLM", `Enforcing shot type distribution: ${staticCount} static shots exceeds ${maxStatic} max, converting ${staticCount - maxStatic} to pan/zoom`);

    // Convert excess static shots to pan/zoom
    let converted = 0;
    const excess = staticCount - maxStatic;

    return shots.map((shot, index) => {
        if (shot.type !== 'static' || converted >= excess) {
            return shot;
        }

        converted++;

        // Check if action mentions close-up to determine conversion type
        const isCloseUp = /\[shotScale:\s*(Close-Up|Extreme Close-Up)\]/i.test(shot.action);

        // Zoom for close-ups, pan for everything else
        const newType = isCloseUp ? 'zoom' : 'pan';

        logger.debug("LLM", `Shot ${index + 1}: static → ${newType}`);

        return { ...shot, type: newType };
    });
}

/**
 * Extract JSON array from LLM response content
 * Handles markdown code blocks, raw JSON, etc.
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
 * Handles unquoted keys, trailing commas, etc.
 */
export function repairJson(json: string): string {
    return json
        .replace(/"\s*([a-zA-Z0-9_]+)\s*"\s*:/g, '"$1":')
        .replace(/(["']?query["']?\s*:\s*)(?!["{[\]])(.*?[^,}\]\s])(?=\s*[,}\]])/gi, '$1"$2"')
        .replace(/"\s+"\s*(\w+)":/g, '"$1":')
        .replace(/"\s+(\w+)":/g, '"$1":')
        .replace(/,(\s*})/g, '$1')
        .replace(/,(\s*])/g, '$1')
        .replace(/(\{|,)\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":')
        .replace(/'([^']*)'\s*(?=[,}\]])/g, '"$1"')
        .replace(/^\[([#@!$%^&*]+)/, '[')
        .replace(/([#@!$%^&*]+)\]$/, ']')
        .replace(/\\([^"\\/bfnrtu])/g, '$1')
        .replace(/\s*:\s*/g, ':')
        .replace(/\s*,\s*/g, ',');
}

/** Brute force extraction when JSON parsing fails */
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

/** Type guard for ImageSearchQuery[] */
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

/** Type guard for StructuredShot[] with diagnostic logging */
export function isValidStructuredShotArray(data: unknown): data is StructuredShot[] {
    if (!Array.isArray(data)) {
        logger.debug("LLM", "Validation failed: data is not an array");
        return false;
    }

    for (let i = 0; i < data.length; i++) {
        const item = data[i];
        if (!item || typeof item !== "object") {
            logger.debug("LLM", `Shot ${i}: not an object`);
            return false;
        }
        const obj = item as Record<string, unknown>;

        // Required fields
        if (typeof obj.start !== "number") {
            logger.debug("LLM", `Shot ${i}: start is not a number (got ${typeof obj.start})`);
            return false;
        }
        if (typeof obj.end !== "number") {
            logger.debug("LLM", `Shot ${i}: end is not a number (got ${typeof obj.end})`);
            return false;
        }
        if (typeof obj.action !== "string") {
            logger.debug("LLM", `Shot ${i}: action is not a string (got ${typeof obj.action})`);
            return false;
        }
        if (!SHOT_TYPES.includes(obj.type as typeof SHOT_TYPES[number])) {
            logger.debug("LLM", `Shot ${i}: invalid type "${obj.type}" (valid: ${SHOT_TYPES.join(', ')})`);
            return false;
        }

        // Optional framingNote
        if (obj.framingNote !== undefined && obj.framingNote !== null && typeof obj.framingNote !== "string") {
            logger.debug("LLM", `Shot ${i}: framingNote is not a string (got ${typeof obj.framingNote})`);
            return false;
        }

        // Warn if OLD format fields are present (for migration debugging)
        if ('sceneId' in obj || 'focus' in obj || 'cameraAngle' in obj || 'shotScale' in obj || 'exclude' in obj) {
            logger.debug("LLM", `Shot ${i}: OLD FORMAT fields detected - these are ignored in new format`);
        }
    }

    return true;
}

/** Validate image queries have required fields and valid data */
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

/** Validate structured shots have required fields and valid data */
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
        if (typeof shot.action !== "string" || shot.action.trim().length === 0) {
            throw new Error(`Invalid shot at index ${i}: action is required`);
        }
        if (shot.start < 0 || shot.end < 0) {
            throw new Error(`Invalid shot at index ${i}: timestamps must be non-negative`);
        }
        if (shot.start > shot.end) {
            throw new Error(`Invalid shot at index ${i}: start (${shot.start}) > end (${shot.end})`);
        }

        // Check for entity references in action (should have at least one [something])
        const hasEntityRef = /\[[^\]]+\]/.test(shot.action);
        if (!hasEntityRef) {
            logger.warn("LLM", `Shot ${i} has no bracket references in action - may lack entity/camera info`);
        }
    }

    return true;
}
