import { envBool } from "./env.ts";

const DEBUG = envBool("DEBUG");

export function log(service: string, message: string): void {
  console.log(`[${service}] ${message}`);
}

export function debug(service: string, message: string): void {
  if (DEBUG) {
    console.log(`[${service}] ${message}`);
  }
}

export function warn(service: string, message: string): void {
  console.warn(`[${service}] ⚠️ ${message}`);
}

export function error(service: string, message: string, err?: unknown): void {
  console.error(`[${service}] ❌ ${message}`);
  if (err && DEBUG) {
    console.error(err);
  }
}

export function success(service: string, message: string): void {
  console.log(`[${service}] ✓ ${message}`);
}

export function step(service: string, stepName: string, details?: string): void {
  console.log(`[${service}] ${stepName}`);
  if (details && DEBUG) {
    console.log(`[${service}]   → ${details}`);
  }
}

export function raw(service: string, label: string, data: unknown): void {
  if (DEBUG) {
    console.log(`[${service}] ${label}:`);
    console.log(data);
  }
}
