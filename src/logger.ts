/**
 * Logger utility for debug and lite logging
 */

import { DEBUG } from "./constants.ts";

/**
 * Log levels
 */
export enum LogLevel {
  INFO = "INFO",
  DEBUG = "DEBUG",
  WARN = "WARN",
  ERROR = "ERROR",
}

/**
 * Log a message (always shown)
 */
export function log(service: string, message: string): void {
  console.log(`[${service}] ${message}`);
}

/**
 * Log a debug message (only shown when DEBUG=true)
 */
export function debug(service: string, message: string): void {
  if (DEBUG) {
    console.log(`[${service}] ${message}`);
  }
}

/**
 * Log a warning (always shown)
 */
export function warn(service: string, message: string): void {
  console.warn(`[${service}] ⚠️ ${message}`);
}

/**
 * Log an error (always shown)
 */
export function error(service: string, message: string, err?: unknown): void {
  console.error(`[${service}] ❌ ${message}`);
  if (err && DEBUG) {
    console.error(err);
  }
}

/**
 * Log success (always shown)
 */
export function success(service: string, message: string): void {
  console.log(`[${service}] ✓ ${message}`);
}

/**
 * Log a step (always shown, but details only in debug mode)
 */
export function step(service: string, stepName: string, details?: string): void {
  console.log(`[${service}] ${stepName}`);
  if (details && DEBUG) {
    console.log(`[${service}]   → ${details}`);
  }
}

/**
 * Log raw data (only in debug mode)
 */
export function raw(service: string, label: string, data: unknown): void {
  if (DEBUG) {
    console.log(`[${service}] ${label}:`);
    console.log(data);
  }
}

