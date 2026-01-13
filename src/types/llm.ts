/**
 * Shot type for natural editing - controls per-shot video effects
 * - pan: vertical pan up/down (random direction), uses 4:3 aspect ratio for headroom
 * - zoom: subtle zoom in/out (random direction), uses 16:9 aspect ratio
 * - static: no movement, uses 16:9 aspect ratio
 */
export type ShotType = "pan" | "zoom" | "static";

export interface ImageSearchQuery {
  start: number;
  end: number;
  query: string;
  /** Shot type for natural editing effects */
  type?: ShotType;
  /** Index of related previous segment for visual consistency (null = new scene) */
  linkedTo?: number | null;
}

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMRequest {
  model: string;
  messages: LLMMessage[];
  temperature?: number;
  max_tokens?: number;
}

export interface LLMResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}
