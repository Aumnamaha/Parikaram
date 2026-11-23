import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { BrowserSnapshot } from "../types/browser";
import type { UiCanvasNode, UiCanvasEdge } from "../types/canvas";
import { AI_AGENT_PROMPTS, CANVAS_DEFAULTS } from "../types/canvas";
import { Plus, Copy, Zap, Minus, Maximize2, Link2, Trash2, Bot, Globe, Table as TableIcon, Code, Sparkles } from "lucide-react";

interface WorkCanvasProps {
  snap: BrowserSnapshot | null;
  activeSpaceId?: string;
}

const DEFAULTS = CANVAS_DEFAULTS;

/* ── Node Card Components ─────────────────────────────────────── */

function WebCardNode({ node, onEdit }: { node: UiCanvasNode; onEdit?: (updates: Partial<UiCanvasNode>) => void }) {
  const [urlInput, setUrlInput] = useState(node.url || "");
  return (
    <div className="p-3 space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium text-[var(--text-primary)] truncate">{node.title}</div>
      <div className="flex items-center gap-1">
        <Globe size={14} className="text-[var(--accent)]" />
        <input type="text" value={urlInput || ""} onChange={(e) => { setUrlInput(e.target.value); onEdit?.({ url: e.target.value }); }} placeholder="https://..." className="flex-1 bg-transparent text-xs border-b border-[var(--border-subtle)] focus:border-[var(--accent)] outline-none truncate" />
      </div>
      <button onClick={() => { if (node.url) window.open(node.url, "_blank"); }} disabled={!node.url} className="w-full py-1.5 text-xs bg-[var(--accent)]/20 hover:bg-[var(--accent)]/30 rounded text-[var(--accent)] transition-colors disabled:opacity-40">
        Open in Browser Tab →
      </button>
    </div>
  );
}

function AiCardNode({ node }: { node: UiCanvasNode; snap?: BrowserSnapshot | null }) {
  const [messages, setMessages] = useState<{ role: string; content: string }[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [inputText, setInputText] = useState("");

  const sendToAI = useCallback(async () => {
    if (!inputText.trim() || isStreaming) return;
    const requestId = `canvas-ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setIsStreaming(true);
    setMessages(prev => [...prev, { role: "user", content: inputText }]);

    try {
      // In production use @tauri-apps/api/event listen() for streaming.
      // Here we invoke the Rust stream and rely on window event listeners
      // registered in AiSidebar to capture ai-stream-chunk/done/error events.
      const payload = JSON.parse(node.content || "{}");
      await invoke("stream_ai_chat", { req: { ...payload, request_id: requestId, messages: [...(payload.messages || []), { role: "user" as const, content: inputText }] } });
    } catch (e) {
      setMessages(prev => [...prev, { role: "system", content: `Error: ${String(e)}` }]);
      setIsStreaming(false);
    }
    setInputText("");
  }, [inputText, isStreaming, node.content]);

  return (
    <div className="p-3 space-y-2">
      <div className="flex items-center gap-1.5 text-sm font-medium text-violet-400"><Sparkles size={14} /> {node.title}</div>
      <div className="max-h-36 overflow-y-auto space-y-1.5 text-xs pr-1">
        {messages.map((m, i) => (
          <div key={i} className={`rounded p-2 ${m.role === "user" ? "bg-[var(--accent)]/10 text-[var(--text-primary)]" : m.role === "system" ? "bg-red-500/10 text-red-400" : "bg-white/5 text-[var(--text-muted)]"} ${m.content.includes("\n") ? "font-mono whitespace-pre-wrap" : ""}`}>
            {m.content}{isStreaming && m.role === "assistant" && i === messages.length - 1 && <span className="inline-block w-1.5 h-3 ml-0.5 bg-violet-400 animate-pulse align-middle" />}
          </div>
        ))}
      </div>
      {!isStreaming ? (
        <div className="flex gap-1">
          <input value={inputText} onChange={(e) => setInputText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) sendToAI(); }} placeholder="Ask AI..." className="flex-1 bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded px-2 py-1 text-xs focus:outline-none focus:border-violet-500" />
          <button onClick={sendToAI} disabled={!inputText.trim()} className="px-2 py-1 text-xs bg-violet-500/20 hover:bg-violet-500/30 rounded text-violet-400 transition-colors disabled:opacity-40">Send</button>
        </div>
      ) : (
        <div className="text-[10px] text-violet-400 animate-pulse">Streaming...</div>
      )}
    </div>
  );
}

function TableNode({ node, onEdit }: { node: UiCanvasNode; onEdit?: (updates: Partial<UiCanvasNode>) => void }) {
  const [content, setContent] = useState(node.content || "|| Header 1 || Header 2 ||\n| Cell A | Cell B |\n| Cell C | Cell D |");
  return (
    <div className="p-3 space-y-2">
      <div className="flex items-center gap-1.5 text-sm font-medium text-[var(--text-primary)]"><TableIcon size={14} /> {node.title}</div>
      <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={6} className="w-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded px-2 py-1.5 text-xs font-mono focus:outline-none focus:border-[var(--accent)] resize-none" placeholder="Markdown table..." />
      <button onClick={() => onEdit?.({ content })} className="w-full py-1.5 text-xs bg-white/5 hover:bg-white/10 rounded transition-colors">Save Table</button>
    </div>
  );
}

function CodeNode({ node, onEdit }: { node: UiCanvasNode; onEdit?: (updates: Partial<UiCanvasNode>) => void }) {
  const content = node.content || "// Write your code here";
  return (
    <div className="p-3 space-y-2">
      <div className="flex items-center justify-between text-sm font-medium text-[var(--text-primary)]">
        <span className="flex items-center gap-1.5"><Code size={14} /> {node.title}</span>
        <button onClick={() => navigator.clipboard.writeText(content)} className="p-1 rounded hover:bg-white/5 transition-colors" title="Copy code"><Copy size={12} /></button>
      </div>
      <pre className="bg-[var(--bg-tertiary)] rounded-lg p-3 overflow-x-auto text-xs font-mono border border-[var(--border-subtle)] max-h-40">
        <code>{content}</code>
      </pre>
      <button onClick={() => onEdit?.({ content })} className="w-full py-1.5 text-xs bg-white/5 hover:bg-white/10 rounded transition-colors">Save Code</button>
    </div>
  );
}

/* ── WorkCanvas Main Component ───────────────────────────────── */

export function WorkCanvas({ snap, activeSpaceId }: WorkCanvasProps) {
  const spaceId = activeSpaceId || "space-personal";
  const [nodes, setNodes] = useState<UiCanvasNode[]>([]);
  const [edges, setEdges] = useState<UiCanvasEdge[]>([]);
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);

  // Drag state
  const dragRef = useRef<{ type: "none" | "node" | "edge-connect" | "pan"; nodeId?: string; startX: number; startY: number; nodeStartX?: number; nodeStartY?: number }>({ type: "none", startX: 0, startY: 0 });
  const [draggingNode, setDraggingNode] = useState<string | null>(null);
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
  const mouseRef = useRef({ x: 0, y: 0 });

  // Load canvas data on mount / space change
  useEffect(() => {
    Promise.all([
      invoke("list_canvas_nodes", { spaceId }).then((r) => setNodes(r as UiCanvasNode[])).catch(console.error),
      invoke("list_canvas_edges", { spaceId }).then((r) => setEdges(r as UiCanvasEdge[])).catch(console.error),
    ]);
  }, [spaceId]);

  // Persist node on drag end
  const persistNode = useCallback(async (node: UiCanvasNode) => {
    try { await invoke("upsert_canvas_node", { node }); } catch {}
  }, []);

  const persistEdge = useCallback(async (edge: UiCanvasEdge) => {
    try { await invoke("upsert_canvas_edge", { edge }); } catch {}
  }, []);

  /* ── Mouse handlers for pan/zoom/drag/connect ─────────────── */

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = -e.deltaY * 0.001;
      setZoom(z => Math.max(DEFAULTS.minZoom, Math.min(DEFAULTS.maxZoom, z + delta)));
    } else {
      setPanX(p => p - e.deltaX);
      setPanY(p => p - e.deltaY);
    }
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 1 || (e.button === 0 && (e.target as HTMLElement).closest(".canvas-bg"))) {
      dragRef.current = { type: "pan", startX: e.clientX - panX, startY: e.clientY - panY };
      (e.currentTarget as HTMLElement).style.cursor = "grabbing";
    }
  }, [panX, panY]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    mouseRef.current = { x: e.clientX, y: e.clientY };
    if (dragRef.current.type === "pan") {
      setPanX(e.clientX - dragRef.current.startX);
      setPanY(e.clientY - dragRef.current.startY);
    } else if (draggingNode) {
      const dx = (e.clientX - dragRef.current.startX) / zoom;
      const dy = (e.clientY - dragRef.current.startY) / zoom;
      setNodes(prev => prev.map(n => n.id === draggingNode ? { ...n, x: (dragRef.current.nodeStartX || 0) + dx, y: (dragRef.current.nodeStartY || 0) + dy } : n));
    }
  }, [zoom, draggingNode]);

  const handleMouseUp = useCallback(() => {
    dragRef.current = { type: "none", startX: 0, startY: 0 };
    setDraggingNode(null);
    (document.activeElement as HTMLElement)?.blur();
  }, []);

  /* ── Node operations ──────────────────────────────────────── */

  const addNode = useCallback((kind: string) => {
    const id = `node-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const newNode: UiCanvasNode = {
      id, profile_id: "default", space_id: spaceId, kind: kind as any,
      title: `${kind === "web" ? "Web Card" : kind === "ai-card" ? "AI Research Card" : kind === "table" ? "Comparison Table" : "Code Block"} ${nodes.length + 1}`,
      content: kind === "code" ? "// Write your code here" : "",
      url: null, x: (-panX + window.innerWidth / 2 - DEFAULTS.nodeWidth / 2) / zoom + (Math.random() * 60 - 30), y: (-panY + window.innerHeight / 2 - DEFAULTS.nodeHeight / 2) / zoom + (Math.random() * 60 - 30),
      width: DEFAULTS.nodeWidth, height: kind === "code" ? 180 : DEFAULTS.nodeHeight, updated_at: Date.now(),
    };
    setNodes(prev => [...prev, newNode]);
    persistNode(newNode);
  }, [spaceId, nodes.length, panX, panY, zoom, persistNode]);

  const deleteNode = useCallback(async (id: string) => {
    try { await invoke("delete_canvas_node", { spaceId, id }); } catch {}
    setNodes(prev => prev.filter(n => n.id !== id));
    setEdges(prev => prev.filter(e => e.source_id !== id && e.target_id !== id));
  }, [spaceId]);

  const startConnect = useCallback((nodeId: string) => {
    if (connectingFrom === nodeId) { setConnectingFrom(null); return; }
    if (!connectingFrom) { setConnectingFrom(nodeId); return; }
    // Create edge from connectingFrom → nodeId
    const eid = `edge-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const newEdge: UiCanvasEdge = { id: eid, profile_id: "default", space_id: spaceId, source_id: connectingFrom, target_id: nodeId, label: null };
    setEdges(prev => [...prev, newEdge]);
    persistEdge(newEdge);
    setConnectingFrom(null);
  }, [connectingFrom, spaceId, persistEdge]);

  const updateNodeContent = useCallback((id: string, updates: Partial<UiCanvasNode>) => {
    setNodes(prev => prev.map(n => n.id === id ? { ...n, ...updates } : n));
  }, []);

  /* ── Parallel AI Research ─────────────────────────────────── */

  const runParallelResearch = useCallback(async (goal: string) => {
    if (!snap?.active_tab_id) return;
    // Spawn 3 AI cards with staggered positions
    const prompts = AI_AGENT_PROMPTS;
    const baseX = (-panX + window.innerWidth / 2 - DEFAULTS.nodeWidth * 1.5) / zoom;
    const baseY = (-panY + window.innerHeight / 2 - DEFAULTS.nodeHeight) / zoom;

    for (let i = 0; i < 3; i++) {
      setTimeout(async () => {
        const id = `node-ai-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}`;
        const newNode: UiCanvasNode = {
          id, profile_id: "default", space_id: spaceId, kind: "ai-card" as any,
          title: prompts[i].role,
          content: JSON.stringify({ provider_id: "lmstudio", model: "", base_url_override: null, messages: [], page_context: goal }),
          url: null, x: baseX + i * (DEFAULTS.nodeWidth + 20), y: baseY + Math.random() * 40,
          width: DEFAULTS.nodeWidth, height: 300, updated_at: Date.now(),
        };
        setNodes(prev => [...prev, newNode]);
        persistNode(newNode);

        // Start streaming concurrently for each card
        const requestId = `research-${id}-${Date.now()}`;
        try {
          await invoke("stream_ai_chat", { req: { ...JSON.parse(newNode.content), request_id: requestId, messages: [{ role: "user" as const, content: `${prompts[i].prompt}: ${goal}` }] } });
        } catch (e) { console.error(`AI stream failed for card ${i}:`, e); }
      }, i * 500); // Stagger by 500ms
    }
  }, [snap, spaceId, panX, panY, zoom, persistNode]);

  /* ── Zoom controls ────────────────────────────────────────── */

  const setViewZoom = (z: number) => setZoom(Math.max(DEFAULTS.minZoom, Math.min(DEFAULTS.maxZoom, z)));
  const resetView = () => { setZoom(1); setPanX(0); setPanY(0); };

  /* ── SVG edge path generator ──────────────────────────────── */

  function bezierPath(x1: number, y1: number, x2: number, y2: number): string {
    const dx = Math.abs(x2 - x1) * 0.5;
    return `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;
  }

  /* ── Render ───────────────────────────────────────────────── */

  const nodeMap: Record<string, React.ReactNode> = {};
  for (const n of nodes) {
    switch (n.kind) {
      case "web": nodeMap[n.id] = <WebCardNode key={n.id} node={n} onEdit={(u) => updateNodeContent(n.id, u)} />; break;
      case "ai-card": nodeMap[n.id] = <AiCardNode key={n.id} node={n} snap={snap} />; break;
      case "table": nodeMap[n.id] = <TableNode key={n.id} node={n} onEdit={(u) => updateNodeContent(n.id, u)} />; break;
      case "code": nodeMap[n.id] = <CodeNode key={n.id} node={n} onEdit={(u) => updateNodeContent(n.id, u)} />; break;
    }
  }

  return (
    <div className="h-full w-full relative overflow-hidden bg-[var(--bg-primary)]">
      {/* Canvas toolbar */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-3 py-2 rounded-xl border border-[var(--border-subtle)]" style={{ backgroundColor: "rgba(18, 18, 30, 0.95)" }}>
        <button onClick={() => addNode("web")} className="px-2.5 py-1 text-xs bg-white/5 hover:bg-white/10 rounded-lg transition-colors flex items-center gap-1" title="Web Card"><Globe size={14} /> Web</button>
        <button onClick={() => addNode("ai-card")} className="px-2.5 py-1 text-xs bg-violet-500/15 hover:bg-violet-500/25 rounded-lg transition-colors flex items-center gap-1 text-violet-400" title="AI Card"><Bot size={14} /> AI</button>
        <button onClick={() => addNode("table")} className="px-2.5 py-1 text-xs bg-white/5 hover:bg-white/10 rounded-lg transition-colors flex items-center gap-1" title="Table"><TableIcon size={14} /> Table</button>
        <button onClick={() => addNode("code")} className="px-2.5 py-1 text-xs bg-white/5 hover:bg-white/10 rounded-lg transition-colors flex items-center gap-1" title="Code Block"><Code size={14} /> Code</button>

        <div className="w-px h-6 bg-[var(--border-subtle)] mx-1" />

        {/* Parallel AI Research bar */}
        <ParallelResearchBar onRun={runParallelResearch} />

        <div className="w-px h-6 bg-[var(--border-subtle)] mx-1" />

        {/* Zoom controls */}
        <button onClick={() => setViewZoom(zoom - 0.1)} className="p-1 rounded hover:bg-white/5 transition-colors"><Minus size={14} /></button>
        <span className="text-[10px] text-[var(--text-secondary)] w-10 text-center">{Math.round(zoom * 100)}%</span>
        <button onClick={() => setViewZoom(zoom + 0.1)} className="p-1 rounded hover:bg-white/5 transition-colors"><Plus size={14} /></button>
        <button onClick={resetView} className="px-2 py-1 text-[10px] bg-white/5 hover:bg-white/10 rounded transition-colors flex items-center gap-1" title="Fit View"><Maximize2 size={12} /> Reset</button>

        <div className="w-px h-6 bg-[var(--border-subtle)] mx-1" />
        <span className="text-[10px] text-[var(--text-secondary)]">{nodes.length} nodes · {edges.length} links</span>
      </div>

      {/* Canvas surface */}
      <div className="w-full h-full canvas-bg" style={{ cursor: dragRef.current.type === "pan" ? "grabbing" : draggingNode ? "move" : connectingFrom ? "crosshair" : "default" }} onWheel={handleWheel} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}>
        <div style={{ transform: `translate(${panX}px, ${panY}px) scale(${zoom})`, transformOrigin: "0 0", width: "100%", height: "100%", position: "relative" }}>

          {/* Dot grid background */}
          <svg className="canvas-bg absolute inset-0 pointer-events-none" style={{ width: "5000px", height: "5000px", left: "-2500px", top: "-2500px" }} aria-hidden>
            <defs>
              <pattern id="dotGrid" x={panX % (DEFAULTS.gridSize * zoom)} y={panY % (DEFAULTS.gridSize * zoom)} width={DEFAULTS.gridSize} height={DEFAULTS.gridSize} patternUnits="userSpaceOnUse">
                <circle cx="0.5" cy="0.5" r="0.8" fill="rgba(255,255,255,0.1)" />
              </pattern>
            </defs>
            <rect x="-2500" y="-2500" width="5000" height="5000" fill="url(#dotGrid)" />
          </svg>

          {/* SVG edge layer */}
          <svg className="absolute inset-0 pointer-events-none" style={{ width: "100%", height: "100%" }}>
            {edges.map((edge) => {
              const src = nodes.find(n => n.id === edge.source_id);
              const tgt = nodes.find(n => n.id === edge.target_id);
              if (!src || !tgt) return null;
              const x1 = src.x + src.width / 2, y1 = src.y + src.height;
              const x2 = tgt.x + tgt.width / 2, y2 = tgt.y;
              return <path key={edge.id} d={bezierPath(x1, y1, x2, y2)} stroke="rgba(99,102,241,0.5)" strokeWidth="2" fill="none" className="pointer-events-auto cursor-pointer hover:stroke-violet-400 transition-colors" />;
            })}
          </svg>

          {/* Node cards */}
          {nodes.map((node) => (
            <div key={node.id} className={`absolute rounded-xl border shadow-lg overflow-hidden select-none group ${connectingFrom === node.id ? "ring-2 ring-[var(--accent)]" : ""}`} style={{ left: node.x, top: node.y, width: node.width, height: node.height, backgroundColor: "rgba(24, 24, 36, 0.97)", borderColor: connectingFrom === node.id ? "var(--accent)" : "var(--border-subtle)", zIndex: draggingNode === node.id ? 10 : 5 }}>
              {/* Header / drag handle */}
              <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border-subtle)] cursor-move bg-white/[0.02]" onMouseDown={(e) => { e.stopPropagation(); setDraggingNode(node.id); dragRef.current = { type: "node", startX: e.clientX, startY: e.clientY, nodeStartX: node.x, nodeStartY: node.y }; }} onDoubleClick={() => deleteNode(node.id)}>
                <div className="flex items-center gap-1.5 text-xs font-medium truncate flex-1 min-w-0">
                  {node.kind === "web" && <Globe size={12} className="text-[var(--accent)]" />}
                  {node.kind === "ai-card" && <Bot size={12} className="text-violet-400" />}
                  {node.kind === "table" && <TableIcon size={12} className="text-emerald-400" />}
                  {node.kind === "code" && <Code size={12} className="text-amber-400" />}
                  <span className="truncate">{node.title}</span>
                </div>
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={(e) => { e.stopPropagation(); startConnect(node.id); }} title={connectingFrom ? "Link here" : "Start connect"} className={`p-1 rounded hover:bg-white/10 transition-colors ${connectingFrom !== null ? "text-[var(--accent)]" : "text-[var(--text-secondary)]"}`}><Link2 size={12} /></button>
                  <button onClick={(e) => { e.stopPropagation(); deleteNode(node.id); }} className="p-1 rounded hover:bg-white/10 transition-colors text-red-400"><Trash2 size={12} /></button>
                </div>
              </div>

              {/* Content */}
              <div className="h-[calc(100%-36px)] overflow-auto">{nodeMap[node.id]}</div>

              {/* Resize handle */}
              <div className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize" onMouseDown={(e) => { e.stopPropagation(); }} />
            </div>
          ))}

          {/* Connection line preview */}
          {connectingFrom && (() => {
            const src = nodes.find(n => n.id === connectingFrom);
            if (!src) return null;
            const mx = (mouseRef.current.x - panX) / zoom;
            const my = (mouseRef.current.y - panY) / zoom;
            return <svg className="absolute inset-0 pointer-events-none" style={{ width: "100%", height: "100%" }}><path d={bezierPath(src.x + src.width / 2, src.y + src.height, mx, my)} stroke="rgba(99,102,241,0.7)" strokeWidth="2" fill="none" strokeDasharray="6 3" /></svg>;
          })()}

        </div>
      </div>
    </div>
  );
}

/* ── Parallel Research Bar ──────────────────────────────────── */

function ParallelResearchBar({ onRun }: { onRun: (goal: string) => void }) {
  const [text, setText] = useState("");
  return (
    <div className="flex items-center gap-1.5">
      <Zap size={14} className="text-amber-400 flex-shrink-0" />
      <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && text.trim()) { onRun(text.trim()); setText(""); } }} placeholder="Research goal..." className="w-36 bg-transparent text-xs outline-none placeholder:text-[var(--text-secondary)] border-b border-transparent focus:border-violet-500 transition-colors" />
      <button onClick={() => { if (text.trim()) { onRun(text.trim()); setText(""); } }} disabled={!text.trim()} className="px-2 py-1 text-[10px] bg-amber-500/15 hover:bg-amber-500/25 rounded transition-colors text-amber-400 disabled:opacity-40 font-medium">Run 3 Agents</button>
    </div>
  );
}

export default WorkCanvas;
