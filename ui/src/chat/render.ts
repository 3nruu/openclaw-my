import type { AppState, ChatMessage, ContentBlock, ToolLogEntry } from "./app.ts";
import {
  sendMessage,
  abortChat,
  resetChat,
  setMode,
  toggleLogPanel,
  setSearchQuery,
} from "./app.ts";

// ── Escape HTML ────────────────────────────────────────────────────────────

function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Icons (inline SVG) ─────────────────────────────────────────────────────

const ICONS = {
  chat: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
  settings: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
  logs: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`,
  send: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`,
  stop: `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>`,
  reset: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v6h6"/><path d="M3 13a9 9 0 1 0 3-7.7L3 8"/></svg>`,
  close: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  tool: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`,
  search: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
  brain: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z"/></svg>`,
  bolt: `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
};

// ── Build initial HTML structure ───────────────────────────────────────────

export function buildAppShell(root: HTMLElement) {
  root.innerHTML = `
    <div class="app" id="app-root">
      <aside class="sidebar">
        <div class="sidebar-logo">
          <div class="logo-icon">C</div>
        </div>
        <nav class="sidebar-nav">
          <button class="nav-btn active" data-tab="chat" title="Чат">${ICONS.chat}</button>
          <button class="nav-btn" data-tab="logs" title="Логи">${ICONS.logs}</button>
        </nav>
        <div class="sidebar-footer">
          <button class="nav-btn" data-tab="settings" title="Настройки">${ICONS.settings}</button>
        </div>
      </aside>

      <main class="chat-area" id="chat-area">
        <header class="chat-header">
          <div class="header-search">
            <span class="search-icon">${ICONS.search}</span>
            <input
              type="text"
              id="search-input"
              class="search-input"
              placeholder="Поиск по чату…"
              autocomplete="off"
            />
          </div>
          <div class="header-center">
            <div class="session-badge" id="session-badge">agent:main:main</div>
          </div>
          <div class="header-right">
            <div class="mode-toggle" id="mode-toggle">
              <button class="mode-btn active" data-mode="thinking" title="Режим размышлений">
                ${ICONS.brain} <span>Thinking</span>
              </button>
              <button class="mode-btn" data-mode="instant" title="Быстрый режим">
                ${ICONS.bolt} <span>Instant</span>
              </button>
            </div>
            <button class="icon-btn log-toggle-btn" id="log-toggle-btn" title="Открыть логи">
              ${ICONS.logs}
              <span class="log-badge hidden" id="log-badge">0</span>
            </button>
          </div>
        </header>

        <div class="messages-wrapper">
          <div class="messages" id="messages"></div>
          <div class="stream-indicator hidden" id="stream-indicator">
            <div class="stream-dots">
              <span></span><span></span><span></span>
            </div>
          </div>
        </div>

        <div class="input-area">
          <div class="input-wrapper">
            <textarea
              id="chat-input"
              class="chat-input"
              placeholder="Напишите сообщение… (Enter для отправки, Shift+Enter — новая строка)"
              rows="1"
              autocomplete="off"
              spellcheck="true"
            ></textarea>
            <div class="input-actions">
              <button class="icon-btn reset-btn" id="reset-btn" title="Сбросить чат">${ICONS.reset}</button>
              <button class="send-btn" id="send-btn" title="Отправить (Enter)">
                <span id="send-icon">${ICONS.send}</span>
              </button>
            </div>
          </div>
          <div class="input-footer">
            <span class="status-dot" id="status-dot"></span>
            <span class="status-text" id="status-text">Подключение…</span>
          </div>
        </div>
      </main>

      <aside class="log-panel hidden" id="log-panel">
        <div class="log-panel-header">
          <span class="log-panel-title">${ICONS.logs} Логирование</span>
          <button class="icon-btn close-log-btn" id="close-log-btn">${ICONS.close}</button>
        </div>
        <div class="log-entries" id="log-entries"></div>
      </aside>
    </div>
  `;

  attachEventListeners();
}

// ── Event listeners ────────────────────────────────────────────────────────

function attachEventListeners() {
  const input = document.getElementById("chat-input") as HTMLTextAreaElement | null;
  const sendBtn = document.getElementById("send-btn");
  const resetBtn = document.getElementById("reset-btn");
  const logToggleBtn = document.getElementById("log-toggle-btn");
  const closeLogBtn = document.getElementById("close-log-btn");
  const searchInput = document.getElementById("search-input") as HTMLInputElement | null;
  const modeToggle = document.getElementById("mode-toggle");

  input?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void triggerSend();
    }
  });

  input?.addEventListener("input", () => {
    if (!input) return;
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 200) + "px";
  });

  sendBtn?.addEventListener("click", () => {
    const { state } = getAppState();
    if (state.isSending || state.streamRunId) {
      void abortChat();
    } else {
      void triggerSend();
    }
  });

  resetBtn?.addEventListener("click", () => void resetChat());
  logToggleBtn?.addEventListener("click", toggleLogPanel);
  closeLogBtn?.addEventListener("click", toggleLogPanel);

  searchInput?.addEventListener("input", () => {
    setSearchQuery(searchInput.value);
  });

  modeToggle?.addEventListener("click", (e) => {
    const btn = (e.target as Element).closest<HTMLElement>("[data-mode]");
    if (!btn) return;
    const mode = btn.dataset.mode as "thinking" | "instant";
    setMode(mode);
  });
}

let _appState: { state: AppState } | null = null;

function getAppState(): { state: AppState } {
  if (!_appState) throw new Error("app state not set");
  return _appState;
}

export function setAppStateRef(ref: { state: AppState }) {
  _appState = ref;
}

async function triggerSend() {
  const input = document.getElementById("chat-input") as HTMLTextAreaElement | null;
  if (!input) return;
  const text = input.value;
  input.value = "";
  input.style.height = "auto";
  await sendMessage(text);
}

// ── Main render function ───────────────────────────────────────────────────

let renderScheduled = false;

export function render(state: AppState) {
  if (renderScheduled) return;
  renderScheduled = true;
  requestAnimationFrame(() => {
    renderScheduled = false;
    doRender(state);
  });
}

function doRender(state: AppState) {
  updateStatus(state);
  updateMessages(state);
  updateLogPanel(state);
  updateModeToggle(state);
  updateSendButton(state);
  updateLogBadge(state);
}

// ── Status bar ─────────────────────────────────────────────────────────────

function updateStatus(state: AppState) {
  const dot = document.getElementById("status-dot");
  const text = document.getElementById("status-text");
  if (!dot || !text) return;

  if (state.connecting) {
    dot.className = "status-dot connecting";
    text.textContent = "Подключение…";
  } else if (state.connected) {
    if (state.isSending || state.streamRunId) {
      dot.className = "status-dot active";
      text.textContent = "Генерация…";
    } else {
      dot.className = "status-dot connected";
      text.textContent = state.serverVersion ? `Подключено · ${state.serverVersion}` : "Подключено";
    }
  } else {
    dot.className = "status-dot error";
    text.textContent = state.error ? `Ошибка: ${state.error.slice(0, 60)}` : "Отключено";
  }
}

// ── Messages ───────────────────────────────────────────────────────────────

function updateMessages(state: AppState) {
  const container = document.getElementById("messages");
  const streamIndicator = document.getElementById("stream-indicator");
  if (!container) return;

  const query = state.searchQuery.toLowerCase().trim();
  const filtered = query
    ? state.messages.filter((m) => extractMessageText(m).toLowerCase().includes(query))
    : state.messages;

  container.innerHTML = filtered.map((msg) => renderMessage(msg)).join("");

  if (state.streamText !== null) {
    const streamMsg: ChatMessage = {
      role: "assistant",
      content: [{ type: "text", text: state.streamText }],
    };
    container.insertAdjacentHTML("beforeend", renderMessage(streamMsg, true));
    streamIndicator?.classList.add("hidden");
  } else if (state.isSending) {
    streamIndicator?.classList.remove("hidden");
  } else {
    streamIndicator?.classList.add("hidden");
  }

  if (!query) {
    container.scrollTop = container.scrollHeight;
  }
}

function renderMessage(msg: ChatMessage, isStreaming = false): string {
  const role = msg.role;
  const isUser = role === "user";
  const text = extractMessageText(msg);

  if (!text && !isStreaming) return "";

  const cls = `message ${isUser ? "message--user" : "message--assistant"} ${isStreaming ? "message--streaming" : ""}`;
  const avatar = isUser
    ? `<div class="avatar avatar--user">Вы</div>`
    : `<div class="avatar avatar--ai">AI</div>`;

  const timeStr = msg.timestamp
    ? new Date(msg.timestamp).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })
    : "";

  return `
    <div class="${cls}">
      ${avatar}
      <div class="message-body">
        <div class="message-content">${renderText(text)}</div>
        ${timeStr ? `<div class="message-time">${esc(timeStr)}</div>` : ""}
      </div>
    </div>
  `;
}

function renderText(text: string): string {
  // Basic markdown-like rendering: code blocks, inline code, bold, italic
  const escaped = esc(text);
  return escaped
    .replace(/```([^`]*?)```/gs, (_, code) => `<pre class="code-block"><code>${code}</code></pre>`)
    .replace(/`([^`]+)`/g, (_, code) => `<code class="inline-code">${code}</code>`)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/\n/g, "<br>");
}

function extractMessageText(msg: ChatMessage): string {
  const parts: string[] = [];
  for (const block of msg.content) {
    if (block.type === "text") parts.push(block.text);
  }
  return parts.join("\n");
}

// ── Log panel ─────────────────────────────────────────────────────────────

function updateLogPanel(state: AppState) {
  const panel = document.getElementById("log-panel");
  const entries = document.getElementById("log-entries");
  if (!panel || !entries) return;

  if (state.logPanelOpen) {
    panel.classList.remove("hidden");
  } else {
    panel.classList.add("hidden");
  }

  if (state.toolLogs.length === 0) {
    entries.innerHTML = `<div class="log-empty">Инструменты не вызывались в этой сессии</div>`;
    return;
  }

  entries.innerHTML = state.toolLogs.map((log) => renderLogEntry(log)).join("");
}

function renderLogEntry(log: ToolLogEntry): string {
  const phaseClass = log.phase === "done" ? "log-entry--done" : log.phase === "error" ? "log-entry--error" : "log-entry--running";
  const phaseLabel = log.phase === "done" ? "✓" : log.phase === "error" ? "✕" : "⟳";
  const duration = log.phase !== "running" ? `${((log.updatedAt - log.startedAt) / 1000).toFixed(2)}s` : "…";

  const argsStr = log.args ? JSON.stringify(log.args, null, 2).slice(0, 500) : "";
  const outputStr = log.output ? log.output.slice(0, 1000) : "";

  return `
    <div class="log-entry ${phaseClass}">
      <div class="log-entry-header">
        <span class="log-phase">${phaseLabel}</span>
        <span class="log-name">${ICONS.tool} ${esc(log.name)}</span>
        <span class="log-duration">${duration}</span>
      </div>
      ${argsStr ? `<div class="log-section"><div class="log-label">Аргументы</div><pre class="log-code">${esc(argsStr)}</pre></div>` : ""}
      ${outputStr ? `<div class="log-section"><div class="log-label">Результат</div><pre class="log-code">${esc(outputStr)}</pre></div>` : ""}
    </div>
  `;
}

// ── Mode toggle ────────────────────────────────────────────────────────────

function updateModeToggle(state: AppState) {
  const toggle = document.getElementById("mode-toggle");
  if (!toggle) return;
  toggle.querySelectorAll<HTMLElement>("[data-mode]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.mode === state.mode);
  });
}

// ── Send button ────────────────────────────────────────────────────────────

function updateSendButton(state: AppState) {
  const btn = document.getElementById("send-btn");
  const icon = document.getElementById("send-icon");
  if (!btn || !icon) return;

  const isBusy = state.isSending || Boolean(state.streamRunId);
  btn.classList.toggle("send-btn--stop", isBusy);
  icon.innerHTML = isBusy ? ICONS.stop : ICONS.send;
  btn.title = isBusy ? "Остановить генерацию" : "Отправить (Enter)";
}

// ── Log badge ──────────────────────────────────────────────────────────────

function updateLogBadge(state: AppState) {
  const badge = document.getElementById("log-badge");
  if (!badge) return;
  const running = state.toolLogs.filter((l) => l.phase === "running").length;
  if (running > 0) {
    badge.textContent = String(running);
    badge.classList.remove("hidden");
  } else {
    badge.classList.add("hidden");
  }
}

// ── Unused type reference (keeps ContentBlock import alive) ─────────────────
void (null as unknown as ContentBlock);
