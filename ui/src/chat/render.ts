import type { AppState, ChatMessage, ContentBlock, ToolLogEntry } from "./app.ts";
import {
  sendMessage,
  abortChat,
  resetChat,
  setMode,
  toggleLogPanel,
  setSearchQuery,
  setCredentials,
} from "./app.ts";
import { marked } from "marked";
import DOMPurify from "dompurify";

// ── Configure marked ───────────────────────────────────────────────────────

marked.use({ async: false, breaks: true, gfm: true });

// ── HTML escape ────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Icons ──────────────────────────────────────────────────────────────────

const ICONS = {
  chat: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
  logs: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`,
  settings: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
  send: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`,
  stop: `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="3"/></svg>`,
  reset: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v6h6"/><path d="M3 13a9 9 0 1 0 3-7.7L3 8"/></svg>`,
  close: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  search: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
  brain: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z"/></svg>`,
  bolt: `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
  tool: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`,
  copy: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
  check: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  arrowDown: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>`,
  chevronRight: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`,
};

// ── Toast ──────────────────────────────────────────────────────────────────

function showToast(message: string) {
  const container = document.getElementById("toast-container");
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  container.appendChild(toast);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => toast.classList.add("toast--visible"));
  });
  setTimeout(() => {
    toast.classList.remove("toast--visible");
    setTimeout(() => toast.remove(), 300);
  }, 2200);
}

// ── Build app shell ────────────────────────────────────────────────────────

export function buildAppShell(root: HTMLElement) {
  root.innerHTML = `
    <div class="app" id="app-root">

      <aside class="sidebar">
        <div class="sidebar-logo">
          <div class="logo-mark">C</div>
        </div>
        <nav class="sidebar-nav">
          <button class="nav-btn nav-btn--active" data-tab="chat" title="Чат">
            ${ICONS.chat}
          </button>
          <button class="nav-btn" data-tab="logs" title="Логи">
            ${ICONS.logs}
          </button>
        </nav>
        <div class="sidebar-footer">
          <button class="nav-btn" data-tab="settings" title="Настройки">
            ${ICONS.settings}
          </button>
        </div>
      </aside>

      <div class="chat-area">
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
            <span class="session-badge" id="session-badge">agent:main:main</span>
          </div>
          <div class="header-right">
            <div class="mode-toggle" id="mode-toggle">
              <button class="mode-btn mode-btn--active" data-mode="thinking">
                ${ICONS.brain}<span>Thinking</span>
              </button>
              <button class="mode-btn" data-mode="instant">
                ${ICONS.bolt}<span>Instant</span>
              </button>
            </div>
            <button class="icon-btn log-toggle-btn" id="log-toggle-btn" title="Открыть логирование">
              ${ICONS.logs}
              <span class="log-badge hidden" id="log-badge">0</span>
            </button>
          </div>
        </header>

        <div class="messages-area" id="messages-area">
          <div class="messages" id="messages"></div>
          <div class="reading-indicator hidden" id="reading-indicator">
            <div class="avatar avatar--ai">AI</div>
            <div class="reading-dots">
              <span></span><span></span><span></span>
            </div>
          </div>
        </div>

        <button class="scroll-btn hidden" id="scroll-btn" title="Вниз">
          ${ICONS.arrowDown}
        </button>

        <div class="input-area">
          <div class="input-box">
            <textarea
              id="chat-input"
              class="chat-input"
              placeholder="Напишите сообщение…"
              rows="1"
              autocomplete="off"
              spellcheck="true"
            ></textarea>
            <div class="input-actions">
              <button class="icon-btn reset-btn" id="reset-btn" title="Сбросить чат">
                ${ICONS.reset}
              </button>
              <button class="send-btn" id="send-btn" title="Отправить (Enter)">
                <span id="send-icon">${ICONS.send}</span>
              </button>
            </div>
          </div>
          <div class="input-footer">
            <span class="status-dot" id="status-dot"></span>
            <span class="status-text" id="status-text">Подключение…</span>
            <span class="input-hint">Shift+Enter — новая строка</span>
          </div>
        </div>
      </div>

      <aside class="log-panel hidden" id="log-panel">
        <div class="log-panel-header">
          <div class="log-panel-title">
            ${ICONS.logs}
            <span>Логирование</span>
          </div>
          <button class="icon-btn" id="close-log-btn" title="Закрыть">${ICONS.close}</button>
        </div>
        <div class="log-entries" id="log-entries"></div>
      </aside>

      <div class="toast-container" id="toast-container"></div>
    </div>

    <div class="login-gate hidden" id="login-gate">
      <div class="login-card">
        <div class="login-header">
          <div class="login-logo">C</div>
          <div class="login-title">OpenClaw</div>
          <div class="login-sub">Введите данные для подключения к Gateway</div>
        </div>
        <div class="login-form">
          <label class="login-field">
            <span>Gateway URL</span>
            <input id="login-url" type="text" placeholder="ws://127.0.0.1:18789" autocomplete="off" />
          </label>
          <label class="login-field">
            <span>OPENCLAW_GATEWAY_TOKEN</span>
            <input id="login-token" type="password" placeholder="Токен (если задан)" autocomplete="off" />
          </label>
          <label class="login-field">
            <span>Пароль</span>
            <input id="login-password" type="password" placeholder="Пароль (если задан)" autocomplete="off" />
          </label>
          <button class="login-btn" id="login-connect-btn">Подключиться</button>
        </div>
      </div>
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
  const messagesArea = document.getElementById("messages-area");
  const scrollBtn = document.getElementById("scroll-btn");

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
    setMode(btn.dataset.mode as "thinking" | "instant");
  });

  messagesArea?.addEventListener("scroll", () => {
    if (!messagesArea || !scrollBtn) return;
    const { scrollTop, scrollHeight, clientHeight } = messagesArea;
    scrollBtn.classList.toggle("hidden", scrollHeight - scrollTop - clientHeight < 80);
  });

  scrollBtn?.addEventListener("click", () => {
    messagesArea?.scrollTo({ top: messagesArea.scrollHeight, behavior: "smooth" });
  });

  function doConnect() {
    const url = (document.getElementById("login-url") as HTMLInputElement | null)?.value.trim() || "";
    const token = (document.getElementById("login-token") as HTMLInputElement | null)?.value.trim() || "";
    const password = (document.getElementById("login-password") as HTMLInputElement | null)?.value.trim() || "";
    setCredentials(url, token, password);
  }

  document.getElementById("login-connect-btn")?.addEventListener("click", doConnect);

  document.getElementById("login-password")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") doConnect();
  });
}

// ── App state ref ──────────────────────────────────────────────────────────

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

// ── Render loop ────────────────────────────────────────────────────────────

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
  updateLoginGate(state);
  updateStatus(state);
  updateMessages(state);
  updateLogPanel(state);
  updateModeToggle(state);
  updateSendButton(state);
  updateLogBadge(state);
}

function updateLoginGate(state: AppState) {
  const gate = document.getElementById("login-gate");
  if (!gate) return;
  if (state.authError) {
    gate.classList.remove("hidden");
    const urlEl = document.getElementById("login-url") as HTMLInputElement | null;
    if (urlEl && !urlEl.value) urlEl.value = state.gatewayUrl;
    const tokenEl = document.getElementById("login-token") as HTMLInputElement | null;
    if (tokenEl && !tokenEl.value) tokenEl.value = state.token;
  } else {
    gate.classList.add("hidden");
  }
}

// ── Status ─────────────────────────────────────────────────────────────────

function updateStatus(state: AppState) {
  const dot = document.getElementById("status-dot");
  const text = document.getElementById("status-text");
  if (!dot || !text) return;

  if (state.connecting) {
    dot.className = "status-dot status-dot--connecting";
    text.textContent = "Подключение…";
  } else if (state.connected) {
    if (state.isSending || state.streamRunId) {
      dot.className = "status-dot status-dot--active";
      text.textContent = "Генерация…";
    } else {
      dot.className = "status-dot status-dot--connected";
      text.textContent = state.serverVersion ? `Подключено · ${state.serverVersion}` : "Подключено";
    }
  } else {
    dot.className = "status-dot status-dot--error";
    text.textContent = state.error ? `Ошибка: ${state.error.slice(0, 60)}` : "Отключено";
  }
}

// ── Message grouping ───────────────────────────────────────────────────────

type MsgRole = "user" | "assistant" | "other";

type MessageGroup = {
  role: MsgRole;
  messages: ChatMessage[];
};

function groupMessages(messages: ChatMessage[]): MessageGroup[] {
  const groups: MessageGroup[] = [];
  for (const msg of messages) {
    const role: MsgRole =
      msg.role === "user" ? "user" : msg.role === "assistant" ? "assistant" : "other";
    const last = groups[groups.length - 1];
    if (last && last.role === role) {
      last.messages.push(msg);
    } else {
      groups.push({ role, messages: [msg] });
    }
  }
  return groups;
}

// ── Messages render ────────────────────────────────────────────────────────

let _lastMsgCount = -1;

function updateMessages(state: AppState) {
  const container = document.getElementById("messages");
  const indicator = document.getElementById("reading-indicator");
  const area = document.getElementById("messages-area");
  if (!container) return;

  const query = state.searchQuery.toLowerCase().trim();
  const filtered = query
    ? state.messages.filter((m) => extractMessageText(m).toLowerCase().includes(query))
    : state.messages;

  if (filtered.length === 0 && !state.streamText && !state.isSending) {
    if (container.querySelector(".empty-state")) {
      indicator?.classList.add("hidden");
      return;
    }
    container.innerHTML = renderEmptyState();
    attachSuggestionListeners(container);
    indicator?.classList.add("hidden");
    return;
  }

  const groups = groupMessages(filtered);
  let html = groups.map((g, i) => renderGroup(g, i === groups.length - 1, false)).join("");

  if (state.streamText !== null) {
    const lastGroup = groups[groups.length - 1];
    const streamMsg: ChatMessage = {
      role: "assistant",
      content: [{ type: "text", text: state.streamText }],
    };
    if (lastGroup?.role === "assistant") {
      const lastGroupHtml = renderGroup(
        { role: "assistant", messages: [...lastGroup.messages, streamMsg] },
        true,
        true,
      );
      const splitIdx = html.lastIndexOf('<div class="msg-group msg-group--assistant');
      html = splitIdx !== -1 ? html.slice(0, splitIdx) + lastGroupHtml : html + lastGroupHtml;
    } else {
      html += renderGroup({ role: "assistant", messages: [streamMsg] }, true, true);
    }
    indicator?.classList.add("hidden");
  } else if (state.isSending) {
    indicator?.classList.remove("hidden");
  } else {
    indicator?.classList.add("hidden");
  }

  const wasAtBottom = area
    ? area.scrollHeight - area.scrollTop - area.clientHeight < 120
    : true;
  const countChanged = filtered.length !== _lastMsgCount;
  _lastMsgCount = filtered.length;

  container.innerHTML = html;
  addCodeCopyButtons(container);
  addMessageCopyButtons(container);

  if (wasAtBottom || countChanged) {
    requestAnimationFrame(() => {
      if (area) area.scrollTop = area.scrollHeight;
    });
  }
}

function renderGroup(group: MessageGroup, _isLast: boolean, hasStream: boolean): string {
  const isUser = group.role === "user";
  const avatarHtml = isUser
    ? `<div class="avatar avatar--user">Вы</div>`
    : `<div class="avatar avatar--ai">AI</div>`;

  const msgs = group.messages;
  const msgsHtml = msgs
    .map((msg, idx) => {
      const isStreamingMsg = hasStream && idx === msgs.length - 1 && !isUser;
      return renderMessageItem(msg, isStreamingMsg, idx > 0);
    })
    .join("");

  return `
    <div class="msg-group msg-group--${isUser ? "user" : "assistant"}">
      ${isUser ? "" : avatarHtml}
      <div class="msg-group-body">${msgsHtml}</div>
      ${isUser ? avatarHtml : ""}
    </div>
  `;
}

function renderMessageItem(msg: ChatMessage, isStreaming: boolean, consecutive: boolean): string {
  const text = extractMessageText(msg);
  if (!text && !isStreaming) return "";

  const timeStr = msg.timestamp
    ? new Date(msg.timestamp).toLocaleTimeString("ru-RU", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  const isUser = msg.role === "user";
  const contentHtml = isUser
    ? `<div class="msg-text">${esc(text).replace(/\n/g, "<br>")}</div>`
    : `<div class="msg-text">${renderMarkdown(text)}</div>`;

  const cursor = isStreaming ? `<span class="stream-cursor"></span>` : "";

  return `
    <div class="msg-item${consecutive ? " msg-item--consecutive" : ""}${isStreaming ? " msg-item--streaming" : ""}">
      <div class="msg-content">${contentHtml}${cursor}</div>
      <div class="msg-meta">
        ${timeStr ? `<span class="msg-time">${esc(timeStr)}</span>` : ""}
        <button class="msg-copy-btn" title="Копировать сообщение">${ICONS.copy}</button>
      </div>
    </div>
  `;
}

// ── Markdown ───────────────────────────────────────────────────────────────

function renderMarkdown(text: string): string {
  if (!text) return "";
  try {
    const raw = String(marked.parse(text));
    return DOMPurify.sanitize(raw, {
      ALLOWED_TAGS: [
        "p", "br", "strong", "em", "del", "code", "pre", "ul", "ol", "li",
        "blockquote", "h1", "h2", "h3", "h4", "h5", "h6",
        "a", "hr", "table", "thead", "tbody", "tr", "td", "th",
        "details", "summary",
      ],
      ALLOWED_ATTR: ["href", "rel", "target", "class"],
      ALLOW_DATA_ATTR: false,
    });
  } catch {
    return esc(text).replace(/\n/g, "<br>");
  }
}

// ── Code copy buttons ──────────────────────────────────────────────────────

function addCodeCopyButtons(container: HTMLElement) {
  container.querySelectorAll<HTMLElement>("pre code").forEach((codeEl) => {
    const pre = codeEl.parentElement;
    if (!pre || pre.closest(".code-wrap")) return;

    const wrap = document.createElement("div");
    wrap.className = "code-wrap";

    const header = document.createElement("div");
    header.className = "code-header";

    const langClass = Array.from(codeEl.classList).find((c) => c.startsWith("language-"));
    const lang = langClass ? langClass.replace("language-", "") : "code";

    const langSpan = document.createElement("span");
    langSpan.className = "code-lang";
    langSpan.textContent = lang;

    const copyBtn = document.createElement("button");
    copyBtn.className = "code-copy-btn";
    copyBtn.innerHTML = `${ICONS.copy}<span>Копировать</span>`;
    copyBtn.addEventListener("click", () => {
      void navigator.clipboard.writeText(codeEl.textContent ?? "").then(() => {
        copyBtn.innerHTML = `${ICONS.check}<span>Скопировано!</span>`;
        showToast("Скопировано!");
        setTimeout(() => {
          copyBtn.innerHTML = `${ICONS.copy}<span>Копировать</span>`;
        }, 2000);
      });
    });

    header.appendChild(langSpan);
    header.appendChild(copyBtn);

    pre.parentNode!.insertBefore(wrap, pre);
    wrap.appendChild(header);
    wrap.appendChild(pre);
  });
}

// ── Message copy buttons ───────────────────────────────────────────────────

function addMessageCopyButtons(container: HTMLElement) {
  container.querySelectorAll<HTMLElement>(".msg-copy-btn").forEach((btn) => {
    const textEl = btn.closest(".msg-item")?.querySelector(".msg-text");
    if (!textEl) return;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const text = textEl.textContent ?? "";
      void navigator.clipboard.writeText(text).then(() => showToast("Скопировано!"));
    });
  });
}

// ── Empty state ────────────────────────────────────────────────────────────

function renderEmptyState(): string {
  const suggestions = [
    "Помоги написать код",
    "Объясни концепцию",
    "Проанализируй данные",
    "Придумай идеи",
  ];
  return `
    <div class="empty-state">
      <div class="empty-logo">C</div>
      <h2 class="empty-title">OpenClaw</h2>
      <p class="empty-sub">Чем могу помочь?</p>
      <div class="empty-suggestions">
        ${suggestions.map((s) => `<button class="suggestion-btn">${esc(s)}</button>`).join("")}
      </div>
    </div>
  `;
}

function attachSuggestionListeners(container: HTMLElement) {
  container.querySelectorAll<HTMLElement>(".suggestion-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const input = document.getElementById("chat-input") as HTMLTextAreaElement | null;
      if (!input) return;
      input.value = btn.textContent ?? "";
      input.dispatchEvent(new Event("input"));
      input.focus();
    });
  });
}

// ── Log panel ──────────────────────────────────────────────────────────────

function updateLogPanel(state: AppState) {
  const panel = document.getElementById("log-panel");
  const entries = document.getElementById("log-entries");
  if (!panel || !entries) return;

  panel.classList.toggle("hidden", !state.logPanelOpen);

  if (state.toolLogs.length === 0) {
    entries.innerHTML = `
      <div class="log-empty">
        <div class="log-empty-icon">${ICONS.logs}</div>
        <p>Инструменты не вызывались в этой сессии</p>
      </div>
    `;
    return;
  }

  entries.innerHTML = state.toolLogs.map((log) => renderLogEntry(log)).join("");

  entries.querySelectorAll<HTMLElement>(".log-entry-header").forEach((header) => {
    header.addEventListener("click", () => {
      header.closest(".log-entry")?.classList.toggle("log-entry--expanded");
    });
  });
}

function renderLogEntry(log: ToolLogEntry): string {
  const phaseClass =
    log.phase === "done"
      ? "log-entry--done"
      : log.phase === "error"
        ? "log-entry--error"
        : "log-entry--running";

  const phaseIcon =
    log.phase === "done"
      ? ICONS.check
      : log.phase === "error"
        ? `<span style="color:var(--red)">✕</span>`
        : `<span class="spin">◌</span>`;

  const duration =
    log.phase !== "running"
      ? `${((log.updatedAt - log.startedAt) / 1000).toFixed(2)}s`
      : "…";

  const argsStr = log.args ? JSON.stringify(log.args, null, 2).slice(0, 1200) : "";
  const outputStr = log.output ? log.output.slice(0, 2000) : "";
  const hasContent = !!(argsStr || outputStr);

  return `
    <div class="log-entry ${phaseClass}">
      <div class="log-entry-header">
        <span class="log-phase">${phaseIcon}</span>
        <span class="log-name">${ICONS.tool}${esc(log.name)}</span>
        <span class="log-duration">${esc(duration)}</span>
        ${hasContent ? `<span class="log-chevron">${ICONS.chevronRight}</span>` : ""}
      </div>
      ${
        hasContent
          ? `<div class="log-entry-body">
              ${argsStr ? `<div class="log-section"><div class="log-label">Аргументы</div><pre class="log-code">${esc(argsStr)}</pre></div>` : ""}
              ${outputStr ? `<div class="log-section"><div class="log-label">Результат</div><pre class="log-code">${esc(outputStr)}</pre></div>` : ""}
            </div>`
          : ""
      }
    </div>
  `;
}

// ── Mode toggle ────────────────────────────────────────────────────────────

function updateModeToggle(state: AppState) {
  document.querySelectorAll<HTMLElement>("[data-mode]").forEach((btn) => {
    btn.classList.toggle("mode-btn--active", btn.dataset.mode === state.mode);
  });
}

// ── Send button ────────────────────────────────────────────────────────────

function updateSendButton(state: AppState) {
  const btn = document.getElementById("send-btn");
  const icon = document.getElementById("send-icon");
  if (!btn || !icon) return;
  const busy = state.isSending || Boolean(state.streamRunId);
  btn.classList.toggle("send-btn--stop", busy);
  icon.innerHTML = busy ? ICONS.stop : ICONS.send;
  btn.title = busy ? "Остановить" : "Отправить (Enter)";
}

// ── Log badge ──────────────────────────────────────────────────────────────

function updateLogBadge(state: AppState) {
  const badge = document.getElementById("log-badge");
  if (!badge) return;
  const running = state.toolLogs.filter((l) => l.phase === "running").length;
  badge.textContent = String(running);
  badge.classList.toggle("hidden", running === 0);
}

// ── Helpers ────────────────────────────────────────────────────────────────

function extractMessageText(msg: ChatMessage): string {
  return msg.content
    .filter((b): b is Extract<ContentBlock, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

void (null as unknown as ContentBlock);
