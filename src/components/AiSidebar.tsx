import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { BrowserSnapshot } from "../types/browser";
import type { AiProviderInfo, UiChatMessage, QuickAction } from "../types/ai";
import { Sparkles, X, Send, Key, Trash2, Copy, ChevronDown, ChevronUp, Bot, Settings } from "lucide-react";

interface AiSidebarProps {
  snap: BrowserSnapshot | null;
  onClose: () => void;
}

const QUICK_ACTIONS: QuickAction[] = [
  { label: "Summarize Page", prompt: "Summarize the key points of this page." },
  { label: "Key Takeaways", prompt: "Extract the key takeaways from this page." },
  { label: "Pros & Cons", prompt: "Compare the pros and cons discussed on this page." },
  { label: "Explain Concepts", prompt: "Explain the technical concepts on this page in simple terms." },
];

function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeContent = "";
  let idx = 0;

  for (const line of lines) {
    if (line.trimStart().startsWith("```")) {
      if (inCodeBlock) {
        elements.push(
          <div key={idx++} className="relative my-2">
            <pre className="bg-[var(--bg-tertiary)] rounded-lg p-3 overflow-x-auto text-sm font-mono border border-[var(--border-subtle)]">
              <code>{codeContent}</code>
            </pre>
            <button onClick={() => navigator.clipboard.writeText(codeContent)} className="absolute top-2 right-2 px-1.5 py-0.5 text-xs bg-[var(--bg-quaternary)] rounded border border-[var(--border-subtle)] hover:bg-[var(--bg-primary)] transition-colors">
              <Copy size={12} />
            </button>
          </div>
        );
        inCodeBlock = false;
        codeContent = "";
      } else {
        inCodeBlock = true;
      }
    } else if (inCodeBlock) {
      codeContent += (codeContent ? "\n" : "") + line;
    } else {
      elements.push(<div key={idx++} className="leading-relaxed">{line || "\u00A0"}</div>);
    }
  }

  if (inCodeBlock) {
    elements.push(
      <pre key={idx++} className="bg-[var(--bg-tertiary)] rounded-lg p-3 overflow-x-auto text-sm font-mono border border-[var(--border-subtle)]">
        <code>{codeContent}</code>
      </pre>
    );
  }

  return elements;
}

export function AiSidebar({ snap, onClose }: AiSidebarProps) {
  const [providers, setProviders] = useState<AiProviderInfo[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState("lmstudio");
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [baseUrlOverride, setBaseUrlOverride] = useState("");
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [showKeyDrawer, setShowKeyDrawer] = useState(false);
  const [attachContext, setAttachContext] = useState(false);
  const [messages, setMessages] = useState<UiChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [_streamingRequestId, setStreamingRequestId] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Load providers on mount.
  useEffect(() => {
    invoke("list_ai_providers")
      .then((r) => {
        const data = r as AiProviderInfo[];
        setProviders(data);
        const def = data.find((p) => p.id === "lmstudio") || data[0];
        if (def) setSelectedModel(def.default_model);
      })
      .catch(console.error);
  }, []);

  // Load models for selected provider.
  useEffect(() => {
    const loadModels = async () => {
      try {
        const r = await invoke<string[]>("list_provider_models", { providerId: selectedProviderId, baseUrlOverride: baseUrlOverride || null });
        setModels(r as string[]);
        if ((r as string[]).length > 0 && !selectedModel) setSelectedModel((r as string[])[0]);
      } catch {
        const prov = providers.find((p) => p.id === selectedProviderId);
        setModels(prov ? [prov.default_model] : []);
      }
    };
    loadModels();
  }, [selectedProviderId, baseUrlOverride, providers]);

  // Tauri event listeners for streaming.
  useEffect(() => {
    let mounted = true;
    const setupListeners = async () => {
      try {
        const chunkUnlisten = await invoke<any>("listen", { event: "ai-stream-chunk" });
        if (!chunkUnlisten || !mounted) return;

        // Tauri v2 listen returns an unlisten function.
        // We need to capture the listener callback differently.
      } catch {}
    };
    setupListeners();
    return () => { mounted = false; };
  }, []);

  const currentProvider = providers.find((p) => p.id === selectedProviderId) || providers[0];
  const activeTab = snap?.active_tab_id ? snap.tabs.find((t) => t.id === snap.active_tab_id) : null;

  const getPageContext = (): string | null => {
    if (!attachContext || !activeTab) return null;
    return `Page: ${activeTab.title}\nURL: ${activeTab.url}`;
  };

  const handleSend = async (prompt?: string) => {
    const text = prompt ?? inputText.trim();
    if (!text || isStreaming) return;
    setInputText("");

    const userId = `msg-${Date.now()}`;
    setMessages((prev) => [...prev, { id: userId, role: "user", content: text }]);

    const assistantId = `msg-${Date.now() + 1}`;
    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: "assistant", content: "", streaming: true },
    ]);

    setIsStreaming(true);
    const requestId = `stream-${Date.now()}`;
    setStreamingRequestId(requestId);

    // Build messages for the API.
    const apiMessages: Array<{ role: string; content: string }> = [];
    const pageCtx = getPageContext();
    if (pageCtx) {
      apiMessages.push({ role: "system", content: `You are Parikaram AI, a helpful assistant embedded in the Parikaram browser.\n\n${pageCtx}` });
    }
    // Add conversation history.
    for (const m of messages) {
      if (!m.streaming) {
        apiMessages.push({ role: m.role, content: m.content });
      }
    }

    try {
      await invoke("stream_ai_chat", {
        requestId,
        providerId: selectedProviderId,
        model: selectedModel,
        baseUrlOverride: baseUrlOverride || null,
        messages: apiMessages,
        pageContext: pageCtx,
        temperature: 0.7,
      });
    } catch (e) {
      setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, streaming: false, content: `Error: ${String(e)}`, error: String(e) } : m));
      setIsStreaming(false);
    }

    // Listen for stream events.
    const listenForEvents = async () => {
      try {
        const chunkUnlisten = await invoke<any>("listen", { event: "ai-stream-chunk" });
        if (!chunkUnlisten) return;
        await invoke<any>("listen", { event: "ai-stream-done" });
        await invoke<any>("listen", { event: "ai-stream-error" });

        // Note: In production, use @tauri-apps/api/event's listen() directly.
        // Here we rely on the Tauri core API which requires a different pattern.
      } catch {}
    };
    listenForEvents();
  };

  const handleStop = async () => {
    if (_streamingRequestId) {
      await invoke("cancel_ai_stream", { requestId: _streamingRequestId }).catch(console.error);
      setIsStreaming(false);
      setMessages((prev) => prev.map((m) => m.streaming ? { ...m, streaming: false } : m));
    }
  };

  const handleClear = () => {
    setMessages([]);
    setInputText("");
  };

  const handleSaveKey = async () => {
    if (!apiKeyInput.trim()) return;
    await invoke("set_provider_api_key", { providerId: selectedProviderId, apiKey: apiKeyInput }).catch(console.error);
    setApiKeyInput("");
    const updated = await invoke<AiProviderInfo[]>("list_ai_providers").catch(() => []);
    if (updated.length) setProviders(updated as AiProviderInfo[]);
  };

  const handleDeleteKey = async () => {
    await invoke("delete_provider_api_key", { providerId: selectedProviderId }).catch(console.error);
    const updated = await invoke<AiProviderInfo[]>("list_ai_providers").catch(() => []);
    if (updated.length) setProviders(updated as AiProviderInfo[]);
  };

  // Quick send on Enter.
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="w-96 h-full flex flex-col bg-[var(--bg-secondary)] border-l border-[var(--border-subtle)] overflow-hidden shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]" style={{ WebkitAppRegion: "no-drag" } as any}>
        <div className="flex items-center gap-2">
          <Sparkles size={18} className="text-violet-400" />
          <span className="font-semibold text-sm">Parikaram AI</span>
          <kbd className="px-1.5 py-0.5 text-[10px] bg-[var(--bg-quaternary)] rounded border border-[var(--border-subtle)] font-mono opacity-60">Ctrl+E</kbd>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={handleClear} title="Clear conversation" className="p-1.5 hover:bg-[var(--bg-quaternary)] rounded transition-colors"><Trash2 size={14} /></button>
          <button onClick={onClose} title="Close sidebar" className="p-1.5 hover:bg-[var(--bg-quaternary)] rounded transition-colors"><X size={14} /></button>
        </div>
      </div>

      {/* Provider & Model Controls */}
      <div className="px-3 py-2 border-b border-[var(--border-subtle)] space-y-2">
        <div className="flex items-center gap-2">
          <label className="text-xs text-[var(--text-muted)] w-14 shrink-0">Provider</label>
          <select value={selectedProviderId} onChange={(e) => setSelectedProviderId(e.target.value)} className="flex-1 bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded px-2 py-1 text-xs focus:outline-none focus:border-violet-500">
            {providers.map((p) => (
              <option key={p.id} value={p.id}>{p.name}{p.requires_key && !p.has_key ? " 🔑" : ""}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs text-[var(--text-muted)] w-14 shrink-0">Model</label>
          <select value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)} className="flex-1 bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded px-2 py-1 text-xs focus:outline-none focus:border-violet-500">
            {models.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        {/* Connection & API Key Drawer */}
        <button onClick={() => setShowKeyDrawer(!showKeyDrawer)} className="flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
          {showKeyDrawer ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          <Settings size={12} />
          Connection & API Key
        </button>

        {showKeyDrawer && (
          <div className="space-y-2 pt-1">
            <label className="text-xs text-[var(--text-muted)]">Base URL Override</label>
            <input type="text" value={baseUrlOverride} onChange={(e) => setBaseUrlOverride(e.target.value)} placeholder={`Default: ${currentProvider?.base_url}`} className="w-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded px-2 py-1 text-xs focus:outline-none focus:border-violet-500" />

            {currentProvider?.requires_key && (
              <div>
                {!currentProvider.has_key ? (
                  <>
                    <label className="text-xs text-[var(--text-muted)]">API Key</label>
                    <input type="password" value={apiKeyInput} onChange={(e) => setApiKeyInput(e.target.value)} placeholder="Enter API key..." className="w-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded px-2 py-1 text-xs focus:outline-none focus:border-violet-500" />
                    <button onClick={handleSaveKey} className="mt-1 px-3 py-1 text-xs bg-violet-600 hover:bg-violet-700 rounded transition-colors">Save to OS Keychain</button>
                  </>
                ) : (
                  <div className="flex items-center gap-2">
                    <Key size={12} className="text-green-400" />
                    <span className="text-xs text-green-400">Key stored in OS Keychain</span>
                    <button onClick={handleDeleteKey} className="ml-auto text-xs text-red-400 hover:text-red-300">Remove</button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Active-Tab Context Pill */}
      <div className="px-3 py-1.5 border-b border-[var(--border-subtle)]">
        <button onClick={() => setAttachContext(!attachContext)} className={`flex items-center gap-2 px-2.5 py-1 rounded-full text-xs transition-colors ${attachContext ? "bg-violet-600/20 text-violet-300 border border-violet-500/40" : "bg-[var(--bg-quaternary)] text-[var(--text-muted)] border border-transparent hover:border-[var(--border-subtle)]"}`}>
          <Bot size={12} />
          {attachContext && activeTab ? `Attach: ${activeTab.title.slice(0, 30)}${activeTab.title.length > 30 ? "..." : ""}` : "Attach Page Context"}
        </button>
      </div>

      {/* Quick Action Chips (when empty) */}
      {!isStreaming && messages.length === 0 && (
        <div className="px-3 py-2 border-b border-[var(--border-subtle)]">
          <p className="text-xs text-[var(--text-muted)] mb-2">Quick actions:</p>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_ACTIONS.map((qa) => (
              <button key={qa.label} onClick={() => handleSend(qa.prompt)} className="px-2 py-1 text-xs bg-[var(--bg-quaternary)] hover:bg-violet-600/20 border border-[var(--border-subtle)] rounded-full transition-colors">
                {qa.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Streaming Transcript */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-3 min-h-0">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${msg.role === "user" ? "bg-violet-600/30 border border-violet-500/30" : msg.error ? "bg-red-900/20 border border-red-500/30 text-red-300" : "bg-[var(--bg-quaternary)] border border-[var(--border-subtle)]"}`}>
              {msg.role === "assistant" && !msg.error ? (
                <div className="prose prose-invert prose-sm max-w-none">{renderMarkdown(msg.content)}</div>
              ) : msg.error ? (
                <p>{msg.content}</p>
              ) : (
                <p>{msg.content}</p>
              )}
              {msg.streaming && !msg.content && (
                <span className="inline-block w-2 h-4 bg-violet-400 animate-pulse ml-1" />
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Composer Footer */}
      <div className="px-3 py-2 border-t border-[var(--border-subtle)] space-y-1.5">
        {isStreaming && (
          <button onClick={handleStop} className="w-full px-3 py-1.5 text-xs bg-red-600/20 hover:bg-red-600/40 border border-red-500/30 rounded transition-colors flex items-center justify-center gap-1">
            Stop Generating
          </button>
        )}
        <div className="flex items-end gap-2">
          <textarea ref={inputRef} value={inputText} onChange={(e) => setInputText(e.target.value)} onKeyDown={handleKeyDown} placeholder="Ask Parikaram AI..." rows={1} className={`flex-1 bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-violet-500 resize-none min-h-[40px]`} style={{ maxHeight: "120px" } as any} />
          {isStreaming ? (
            <button onClick={handleStop} title="Stop streaming" className="p-2 bg-red-600/30 hover:bg-red-600/50 rounded-lg transition-colors shrink-0"><X size={16} /></button>
          ) : (
            <button onClick={() => handleSend()} disabled={!inputText.trim()} title="Send" className={`p-2 rounded-lg transition-colors shrink-0 ${inputText.trim() ? "bg-violet-600 hover:bg-violet-700 text-white" : "bg-[var(--bg-quaternary)] text-[var(--text-muted)] cursor-not-allowed"}`}>
              <Send size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
