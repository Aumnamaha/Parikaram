// TypeScript interfaces matching src-tauri/src/ai.rs structs.

export interface AiProviderInfo {
  id: string;
  name: string;
  base_url: string;
  kind: "openai" | "anthropic";
  requires_key: boolean;
  has_key: boolean;
  default_model: string;
}

export interface ChatMessage {
  role: string;
  content: string;
}

export interface ChatStreamRequest {
  request_id: string;
  provider_id: string;
  model: string;
  base_url_override?: string | null;
  messages: ChatMessage[];
  page_context?: string | null;
  temperature: number;
}

export interface AiStreamChunkEvent {
  request_id: string;
  delta: string;
}

export interface AiStreamDoneEvent {
  request_id: string;
  full_text: string;
  provider_id: string;
  model: string;
}

export interface AiStreamErrorEvent {
  request_id: string;
  error: string;
}

// UI-facing chat message for the sidebar transcript.
export interface UiChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
  error?: string;
  providerName?: string;
  model?: string;
}

// Quick action chips for the composer.
export interface QuickAction {
  label: string;
  prompt: string;
}
