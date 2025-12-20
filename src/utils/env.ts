/**
 * Environment parsing utilities
 * Separated to avoid circular dependencies with logger
 */

/**
 * Get boolean from environment variable
 * @param key - Environment variable name
 * @param defaultValue - Default value if not set
 * @returns Parsed boolean value
 */
export function envBool(key: string, defaultValue = false): boolean {
    const value = process.env[key];
    if (value === undefined) return defaultValue;
    return value.toLowerCase() === "true";
}

/**
 * Get number from environment variable
 * @param key - Environment variable name
 * @param defaultValue - Default value if not set
 * @returns Parsed number value
 */
export function envNumber(key: string, defaultValue: number): number {
    const value = process.env[key];
    if (value === undefined) return defaultValue;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : defaultValue;
}

/**
 * Get string from environment variable
 * @param key - Environment variable name
 * @param defaultValue - Default value if not set
 * @returns String value
 */
export function envString(key: string, defaultValue = ""): string {
    return process.env[key] ?? defaultValue;
}
