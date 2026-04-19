import {
  GatewayBrowserClient,
  GatewayRequestError,
  type GatewayEventFrame,
  type GatewayHelloOk,
} from "./gateway.ts";
import { render } from "./render.ts";

// ── Types ─────────────────────────────────────────────────────────────────

export type ChatRole = "user" | "assistant" | "tooluse" | "toolresult" | "system";

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: unknown };

export type ChatMessage = {
  role: ChatRole;
  content: ContentBlock[];
  timestamp?: number;
};

export type ToolLogEntry = {
  id: string;
  runId: string;
  name: string;
  phase: "running" | "done" | "error";
  args?: unknown;
  output?: string;
  startedAt: number;
  updatedAt: number;
};

export type AppState = {
  connected: boolean;
  connecting: boolean;
  error: string | null;
  sessionKey: string;
  messages: ChatMessage[];
  streamText: string | null;
  streamRunId: string | null;
  isSending: boolean;
  mode: "thinking" | "instant";
  logPanelOpen: boolean;
  searchQuery: string;
  toolLogs: ToolLogEntry[];
  gatewayUrl: string;
  serverVersion: string | null;
};

// ── State ─────────────────────────────────────────────────────────────────

let client: GatewayBrowserClient | null = null;

export const state: AppState = {
  connected: false,
  connecting: true,
  error: null,
  sessionKey: "agent:main:main",
  messages: [],
  streamText: null,
  streamRunId: null,
  isSending: false,
  mode: "thinking",
  logPanelOpen: false,
  searchQuery: "",
  toolLogs: [],
  gatewayUrl: deriveGatewayUrl(),
  serverVersion: null,
};

function deriveGatewayUrl(): string {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const isViteDev = location.port === "5174";
  if (isViteDev) {
    return `${proto}://${location.hostname}:18789`;
  }
  return `${proto}://${location.host}`;
}

// ── Rendering ─────────────────────────────────────────────────────────────

function scheduleRender() {
  render(state);
}

// ── Gateway connection ─────────────────────────────────────────────────────

export function connect() {
  client?.stop();

  state.connecting = true;
  state.connected = false;
  state.error = null;
  scheduleRender();

  client = new GatewayBrowserClient({
    url: state.gatewayUrl,
    onHello: (hello: GatewayHelloOk) => {
      state.connected = true;
      state.connecting = false;
      state.error = null;
      state.serverVersion = hello.server?.version ?? null;
      scheduleRender();
      void loadHistory();
    },
    onEvent: (evt: GatewayEventFrame) => handleEvent(evt),
    onClose: (info) => {
      state.connected = false;
      if (info.error?.code && !state.connected) {
        state.error = info.error.message ?? "Connection closed";
      }
      scheduleRender();
    },
  });

  client.start();
}

// ── Chat history ───────────────────────────────────────────────────────────

async function loadHistory() {
  if (!client) return;
  try {
    const result = await client.request<{ messages: ChatMessage[] }>("chat.history", {
      sessionKey: state.sessionKey,
      limit: 200,
    });
    state.messages = (result.messages ?? []).filter((m) => m.role !== "system");
    scheduleRender();
  } catch (err) {
    if (err instanceof GatewayRequestError && err.retryable) {
      setTimeout(() => void loadHistory(), 1500);
    }
  }
}

// ── Send message ──────────────────────────────────────────────────────────

export async function sendMessage(text: string) {
  if (!client || !state.connected || state.isSending) return;
  const trimmed = text.trim();
  if (!trimmed) return;

  state.isSending = true;
  state.streamText = null;
  state.streamRunId = null;
  state.toolLogs = [];
  scheduleRender();

  const userMsg: ChatMessage = {
    role: "user",
    content: [{ type: "text", text: trimmed }],
    timestamp: Date.now(),
  };
  state.messages = [...state.messages, userMsg];
  scheduleRender();

  try {
    const result = await client.request<{ runId: string }>("chat.send", {
      sessionKey: state.sessionKey,
      message: trimmed,
      deliver: false,
      idempotencyKey: crypto.randomUUID(),
    });
    state.streamRunId = result.runId;
  } catch (err) {
    state.isSending = false;
    state.error = err instanceof Error ? err.message : "Send failed";
    scheduleRender();
  }
}

// ── Abort ─────────────────────────────────────────────────────────────────

export async function abortChat() {
  if (!client || !state.connected) return;
  try {
    await client.request("chat.abort", {
      sessionKey: state.sessionKey,
      runId: state.streamRunId ?? undefined,
    });
  } catch { /* ignore */ }
}

// ── Reset chat ────────────────────────────────────────────────────────────

export async function resetChat() {
  if (!client || !state.connected) return;
  try {
    await client.request("sessions.reset", { sessionKey: state.sessionKey });
  } catch { /* try injecting /new command */ }
  state.messages = [];
  state.streamText = null;
  state.streamRunId = null;
  state.isSending = false;
  state.toolLogs = [];
  scheduleRender();
}

// ── Event handler ─────────────────────────────────────────────────────────

function handleEvent(evt: GatewayEventFrame) {
  if (evt.event === "chat.event") {
    handleChatEvent(evt.payload);
    return;
  }
  if (evt.event === "agent.event") {
    handleAgentEvent(evt.payload);
    return;
  }
}

type ChatEventPayload = {
  runId?: string;
  sessionKey?: string;
  state?: string;
  message?: ChatMessage;
  delta?: string;
  errorMessage?: string;
};

function handleChatEvent(payload: unknown) {
  const p = payload as ChatEventPayload;
  if (!p) return;

  if (p.sessionKey && p.sessionKey !== state.sessionKey) return;

  const evtState = p.state;

  if (evtState === "delta") {
    const delta = p.delta ?? extractText(p.message);
    if (delta) {
      state.streamText = (state.streamText ?? "") + delta;
      scheduleRender();
    }
    return;
  }

  if (evtState === "final") {
    if (p.message) {
      state.messages = [...state.messages, p.message];
    } else if (state.streamText) {
      state.messages = [
        ...state.messages,
        { role: "assistant", content: [{ type: "text", text: state.streamText }], timestamp: Date.now() },
      ];
    }
    state.streamText = null;
    state.streamRunId = null;
    state.isSending = false;
    scheduleRender();
    return;
  }

  if (evtState === "aborted" || evtState === "error") {
    if (evtState === "error") state.error = p.errorMessage ?? "Error during generation";
    state.streamText = null;
    state.streamRunId = null;
    state.isSending = false;
    scheduleRender();
    return;
  }
}

type AgentEventPayload = {
  runId?: string;
  seq?: number;
  stream?: string;
  ts?: number;
  sessionKey?: string;
  data?: Record<string, unknown>;
};

function handleAgentEvent(payload: unknown) {
  const p = payload as AgentEventPayload;
  if (!p || p.stream !== "tool") return;
  if (p.sessionKey && p.sessionKey !== state.sessionKey) return;

  const data = p.data ?? {};
  const toolCallId = typeof data.toolCallId === "string" ? data.toolCallId : "";
  if (!toolCallId) return;

  const name = typeof data.name === "string" ? data.name : "tool";
  const phase = typeof data.phase === "string" ? data.phase : "";
  const runId = p.runId ?? "";
  const now = Date.now();

  const existing = state.toolLogs.find((e) => e.id === toolCallId);

  if (!existing) {
    const entry: ToolLogEntry = {
      id: toolCallId,
      runId,
      name,
      phase: "running",
      args: phase === "start" ? data.args : undefined,
      startedAt: typeof p.ts === "number" ? p.ts : now,
      updatedAt: now,
    };
    state.toolLogs = [...state.toolLogs, entry];
  } else {
    const updated = { ...existing, updatedAt: now };
    if (phase === "result") {
      updated.phase = "done";
      updated.output = formatToolOutput(data.result);
    } else if (phase === "update") {
      updated.output = formatToolOutput(data.partialResult);
    }
    state.toolLogs = state.toolLogs.map((e) => (e.id === toolCallId ? updated : e));
  }

  scheduleRender();
}

// ── Helpers ───────────────────────────────────────────────────────────────

function extractText(message: unknown): string {
  if (!message || typeof message !== "object") return "";
  const msg = message as { content?: unknown };
  if (!Array.isArray(msg.content)) return "";
  const parts: string[] = [];
  for (const block of msg.content) {
    if (block && typeof block === "object" && (block as { type?: unknown }).type === "text") {
      const text = (block as { text?: unknown }).text;
      if (typeof text === "string") parts.push(text);
    }
  }
  return parts.join("");
}

function formatToolOutput(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.slice(0, 2000);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    const text = JSON.stringify(value, null, 2);
    return text.slice(0, 2000) + (text.length > 2000 ? "\n…" : "");
  } catch {
    return String(value);
  }
}

// ── UI actions ────────────────────────────────────────────────────────────

export function setMode(mode: "thinking" | "instant") {
  state.mode = mode;
  scheduleRender();
}

export function toggleLogPanel() {
  state.logPanelOpen = !state.logPanelOpen;
  scheduleRender();
}

export function setSearchQuery(q: string) {
  state.searchQuery = q;
  scheduleRender();
}

export function setGatewayUrl(url: string) {
  state.gatewayUrl = url;
  connect();
}
