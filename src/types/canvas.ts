export interface CanvasNodeRecord {
  id: string;
  profile_id: string;
  space_id: string;
  kind: CanvasNodeKind;
  title: string;
  content: string;
  url?: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  updated_at: number;
}

export interface CanvasEdgeRecord {
  id: string;
  profile_id: string;
  space_id: string;
  source_id: string;
  target_id: string;
  label?: string | null;
}

export type CanvasNodeKind = "web" | "ai-card" | "table" | "code";

// UI-facing node with computed properties for the canvas renderer
export interface UiCanvasNode extends Omit<CanvasNodeRecord, "kind"> {
  kind: CanvasNodeKind;
  is_selected?: boolean;
  is_linked?: boolean;
}

export interface UiCanvasEdge extends CanvasEdgeRecord {}

// Parallel AI research prompt payload
export interface ParallelResearchRequest {
  goal: string;
  providerId: string;
  model: string;
  baseUrlOverride?: string | null;
  apiKey?: string | null;
  pageContext?: string | null;
}

export const CANVAS_NODE_KINDS: { kind: CanvasNodeKind; label: string; icon: string }[] = [
  { kind: "web", label: "Web Card", icon: "🌐" },
  { kind: "ai-card", label: "AI Card", icon: "🤖" },
  { kind: "table", label: "Comparison Table", icon: "📊" },
  { kind: "code", label: "Code Block", icon: "💻" },
];

export const AI_AGENT_PROMPTS = [
  { role: "Overview & Architecture", prompt: "Provide a comprehensive overview and architecture analysis." },
  { role: "Trade-offs & Benchmarks", prompt: "Analyze the trade-offs, performance benchmarks, and tradeoffs." },
  { role: "Actionable Synthesis", prompt: "Create an actionable synthesis with recommendations and next steps." },
];

export const CANVAS_DEFAULTS = {
  nodeWidth: 320,
  nodeHeight: 240,
  minZoom: 0.25,
  maxZoom: 2.0,
  defaultX: 100,
  defaultY: 100,
  gridSize: 20,
};

export interface CanvasToolbarState {
  zoom: number;
  panX: number;
  panY: number;
}
