import { html, nothing, type TemplateResult } from "lit";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import DOMPurify from "dompurify";
import { marked } from "marked";
import type { ChatProps } from "./chat.ts";
import { extractTextCached } from "../chat/message-extract.ts";
import { normalizeMessage, normalizeRoleForGrouping } from "../chat/message-normalizer.ts";
import {
  SLASH_COMMANDS,
  CATEGORY_LABELS,
  getSlashCommandCompletions,
  getHiddenCommandCount,
  type SlashCommandDef,
  type SlashCommandCategory,
} from "../chat/slash-commands.ts";
import { icons } from "../icons.ts";

marked.use({ async: false, breaks: true, gfm: true });

// ── Module-level UI state (no re-render needed for these) ─────────────────

let _logPanelOpen = false;
let _searchQuery = "";

// Ephemeral slash-menu state — mirrors the original chat view.
const slashState = {
  open: false,
  items: [] as SlashCommandDef[],
  index: 0,
  mode: "command" as "command" | "args",
  command: null as SlashCommandDef | null,
  argItems: [] as string[],
  expanded: false,
};

function resetSlashState() {
  slashState.mode = "command";
  slashState.command = null;
  slashState.argItems = [];
  slashState.items = [];
  slashState.expanded = false;
}

function updateSlashMenu(value: string, requestUpdate: () => void): void {
  const argMatch = value.match(/^\/(\S+)\s(.*)$/);
  if (argMatch) {
    const cmdName = argMatch[1].toLowerCase();
    const argFilter = argMatch[2].toLowerCase();
    const cmd = SLASH_COMMANDS.find((c) => c.name === cmdName);
    if (cmd?.argOptions?.length) {
      const filtered = argFilter
        ? cmd.argOptions.filter((opt) => opt.toLowerCase().startsWith(argFilter))
        : cmd.argOptions;
      if (filtered.length > 0) {
        slashState.mode = "args";
        slashState.command = cmd;
        slashState.argItems = filtered;
        slashState.open = true;
        slashState.index = 0;
        slashState.items = [];
        requestUpdate();
        return;
      }
    }
    slashState.open = false;
    resetSlashState();
    requestUpdate();
    return;
  }

  const match = value.match(/^\/(\S*)$/);
  if (match) {
    const items = getSlashCommandCompletions(match[1], { showAll: slashState.expanded });
    slashState.items = items;
    slashState.open = items.length > 0;
    slashState.index = 0;
    slashState.mode = "command";
    slashState.command = null;
    slashState.argItems = [];
  } else {
    slashState.open = false;
    resetSlashState();
  }
  requestUpdate();
}

function selectSlashCommand(
  cmd: SlashCommandDef,
  props: ChatProps,
  requestUpdate: () => void,
): void {
  if (cmd.argOptions?.length) {
    props.onDraftChange(`/${cmd.name} `);
    slashState.mode = "args";
    slashState.command = cmd;
    slashState.argItems = cmd.argOptions;
    slashState.open = true;
    slashState.index = 0;
    slashState.items = [];
    requestUpdate();
    return;
  }
  slashState.open = false;
  resetSlashState();
  if (cmd.executeLocal && !cmd.args) {
    props.onDraftChange(`/${cmd.name}`);
    requestUpdate();
    props.onSend();
  } else {
    props.onDraftChange(`/${cmd.name} `);
    requestUpdate();
  }
}

function tabCompleteSlashCommand(
  cmd: SlashCommandDef,
  props: ChatProps,
  requestUpdate: () => void,
): void {
  if (cmd.argOptions?.length) {
    props.onDraftChange(`/${cmd.name} `);
    slashState.mode = "args";
    slashState.command = cmd;
    slashState.argItems = cmd.argOptions;
    slashState.open = true;
    slashState.index = 0;
    slashState.items = [];
    requestUpdate();
    return;
  }
  slashState.open = false;
  resetSlashState();
  props.onDraftChange(cmd.args ? `/${cmd.name} ` : `/${cmd.name}`);
  requestUpdate();
}

function selectSlashArg(
  arg: string,
  props: ChatProps,
  requestUpdate: () => void,
  execute: boolean,
): void {
  const cmdName = slashState.command?.name ?? "";
  slashState.open = false;
  resetSlashState();
  props.onDraftChange(`/${cmdName} ${arg}`);
  requestUpdate();
  if (execute) props.onSend();
}

function renderSlashMenu(
  requestUpdate: () => void,
  props: ChatProps,
): TemplateResult | typeof nothing {
  if (!slashState.open) return nothing;

  if (slashState.mode === "args" && slashState.command && slashState.argItems.length > 0) {
    return html`
      <div class="slash-menu" role="listbox" aria-label="Command arguments">
        <div class="slash-menu-group">
          <div class="slash-menu-group__label">
            /${slashState.command.name} ${slashState.command.description}
          </div>
          ${slashState.argItems.map(
            (arg, i) => html`
              <div
                class="slash-menu-item ${i === slashState.index ? "slash-menu-item--active" : ""}"
                role="option"
                aria-selected=${i === slashState.index}
                @click=${() => selectSlashArg(arg, props, requestUpdate, true)}
                @mouseenter=${() => {
                  slashState.index = i;
                  requestUpdate();
                }}
              >
                ${slashState.command?.icon
                  ? html`<span class="slash-menu-icon">${icons[slashState.command.icon]}</span>`
                  : nothing}
                <span class="slash-menu-name">${arg}</span>
                <span class="slash-menu-desc">/${slashState.command?.name} ${arg}</span>
              </div>
            `,
          )}
        </div>
        <div class="slash-menu-footer">
          <kbd>↑↓</kbd> navigate <kbd>Tab</kbd> fill <kbd>Enter</kbd> run <kbd>Esc</kbd> close
        </div>
      </div>
    `;
  }

  if (slashState.items.length === 0) return nothing;

  const grouped = new Map<
    SlashCommandCategory,
    Array<{ cmd: SlashCommandDef; globalIdx: number }>
  >();
  for (let i = 0; i < slashState.items.length; i++) {
    const cmd = slashState.items[i];
    const cat = cmd.category ?? "session";
    let list = grouped.get(cat);
    if (!list) {
      list = [];
      grouped.set(cat, list);
    }
    list.push({ cmd, globalIdx: i });
  }

  const sections: TemplateResult[] = [];
  for (const [cat, entries] of grouped) {
    sections.push(html`
      <div class="slash-menu-group">
        <div class="slash-menu-group__label">${CATEGORY_LABELS[cat]}</div>
        ${entries.map(
          ({ cmd, globalIdx }) => html`
            <div
              class="slash-menu-item ${globalIdx === slashState.index
                ? "slash-menu-item--active"
                : ""}"
              role="option"
              aria-selected=${globalIdx === slashState.index}
              @click=${() => selectSlashCommand(cmd, props, requestUpdate)}
              @mouseenter=${() => {
                slashState.index = globalIdx;
                requestUpdate();
              }}
            >
              ${cmd.icon ? html`<span class="slash-menu-icon">${icons[cmd.icon]}</span>` : nothing}
              <span class="slash-menu-name">/${cmd.name}</span>
              ${cmd.args ? html`<span class="slash-menu-args">${cmd.args}</span>` : nothing}
              <span class="slash-menu-desc">${cmd.description}</span>
              ${cmd.argOptions?.length
                ? html`<span class="slash-menu-badge">${cmd.argOptions.length} options</span>`
                : cmd.executeLocal && !cmd.args
                  ? html`<span class="slash-menu-badge">instant</span>`
                  : nothing}
            </div>
          `,
        )}
      </div>
    `);
  }

  const hiddenCount = slashState.expanded ? 0 : getHiddenCommandCount();
  return html`
    <div class="slash-menu" role="listbox" aria-label="Slash commands">
      ${sections}
      ${hiddenCount > 0
        ? html`<button
            class="slash-menu-show-more"
            @click=${(e: Event) => {
              e.preventDefault();
              e.stopPropagation();
              slashState.expanded = true;
              updateSlashMenu(props.draft, requestUpdate);
            }}
          >
            Show ${hiddenCount} more command${hiddenCount !== 1 ? "s" : ""}
          </button>`
        : nothing}
      <div class="slash-menu-footer">
        <kbd>↑↓</kbd> navigate <kbd>Tab</kbd> fill <kbd>Enter</kbd> select <kbd>Esc</kbd> close
      </div>
    </div>
  `;
}

// ── Helpers ───────────────────────────────────────────────────────────────

interface MsgGroup {
  role: string;
  messages: unknown[];
}

function isUserRole(role: string): boolean {
  return role.toLowerCase() === "user";
}

function isSystemRole(role: string): boolean {
  return role.toLowerCase() === "system";
}

function groupMatchesQuery(group: MsgGroup, query: string): boolean {
  if (!query) return true;
  for (const msg of group.messages) {
    const text = extractTextCached(msg) ?? "";
    if (text.toLowerCase().includes(query)) return true;
  }
  return false;
}

function groupMessages(messages: unknown[]): MsgGroup[] {
  const groups: MsgGroup[] = [];
  for (const msg of messages) {
    const n = normalizeMessage(msg);
    const role = normalizeRoleForGrouping(n.role);
    if (role === "tool" || role === "toolResult") continue;
    // system messages (slash-command results like /help) render as their own "system" group
    const groupRole = role === "system" ? "system" : role;
    const last = groups[groups.length - 1];
    if (last && last.role === groupRole) {
      last.messages.push(msg);
    } else {
      groups.push({ role: groupRole, messages: [msg] });
    }
  }
  return groups;
}

function renderMd(text: string): string {
  const raw = String(marked.parse(text));
  return DOMPurify.sanitize(raw, {
    ALLOWED_TAGS: [
      "p","br","strong","b","em","i","s","del","code","pre",
      "ul","ol","li","h1","h2","h3","h4","h5","h6",
      "a","blockquote","hr","table","thead","tbody","tr","th","td",
      "span","div",
    ],
    ALLOWED_ATTR: ["href","target","rel","class"],
  });
}

function avatarTpl(role: string, props: ChatProps): TemplateResult {
  if (isUserRole(role)) {
    return html`<div class="chs-av chs-av--user">You</div>`;
  }
  if (props.assistantAvatarUrl) {
    return html`<img class="chs-av chs-av--bot" src=${props.assistantAvatarUrl} alt="" />`;
  }
  const letter = (props.assistantName ?? "A")[0]?.toUpperCase() ?? "A";
  return html`<div class="chs-av chs-av--bot">${letter}</div>`;
}

function extractAttachmentSummary(msg: unknown): string {
  const n = normalizeMessage(msg);
  const labels: string[] = [];
  for (const item of n.content) {
    if (item.type === "attachment" && item.attachment) {
      const kind = item.attachment.kind;
      const icon = kind === "image" ? "🖼" : kind === "audio" ? "🎧" : kind === "video" ? "🎬" : "📎";
      labels.push(`${icon} ${item.attachment.label || kind}`);
    }
  }
  return labels.join("  ·  ");
}

function toolLogTpl(msg: unknown, i: number): TemplateResult {
  const m = msg as Record<string, unknown>;
  const name =
    typeof m.toolName === "string" ? m.toolName
    : typeof m.tool_name === "string" ? m.tool_name
    : `tool-${i + 1}`;
  const text = extractTextCached(msg) ?? "";
  const preview = text.length > 500 ? `${text.slice(0, 500)}\u2026` : text;
  return html`
    <div class="chs-log">
      <div class="chs-log-name">${name}</div>
      ${preview ? html`<pre class="chs-log-body">${preview}</pre>` : nothing}
    </div>
  `;
}

// ── Thinking toggle helper ─────────────────────────────────────────────────

function sendCmd(props: ChatProps, cmd: string) {
  const prev = props.draft;
  props.onDraftChange(cmd);
  // send on next microtask so Lit can propagate the draft change
  Promise.resolve().then(() => {
    props.onSend();
    // restore original draft after send clears it
    if (prev) {
      setTimeout(() => props.onDraftChange(prev), 50);
    }
  });
}

// ── Main render ───────────────────────────────────────────────────────────

export function renderChatSimple(props: ChatProps): TemplateResult {
  const allGroups = groupMessages(props.messages);
  const groups = _searchQuery
    ? allGroups.filter((g) => groupMatchesQuery(g, _searchQuery))
    : allGroups;
  const isEmpty = allGroups.length === 0 && !props.stream && !props.loading;
  const noMatches = _searchQuery && groups.length === 0 && allGroups.length > 0;
  const isThinking = Boolean(props.thinkingLevel);
  const hasTools = props.toolMessages.length > 0;
  const requestUpdate = props.onRequestUpdate ?? (() => {});

  return html`
    <div class="chs-root" id="chs-root">

      <!-- ── Header ── -->
      <header class="chs-header">
        <div class="chs-search-wrap">
          <svg class="chs-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            class="chs-search"
            placeholder="Search…"
            type="search"
            autocomplete="off"
            .value=${_searchQuery}
            @input=${(e: Event) => {
              _searchQuery = (e.target as HTMLInputElement).value.toLowerCase();
              requestUpdate();
            }}
          />
        </div>

        <div class="chs-header-actions">
          <button
            class="chs-pill ${isThinking ? "chs-pill--on" : ""}"
            title=${isThinking ? "Thinking on — click to switch to Instant" : "Instant mode — click to enable Thinking"}
            @click=${() => sendCmd(props, isThinking ? "/thinking off" : "/thinking on")}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46
                2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58
                2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"/>
              <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46
                2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58
                2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z"/>
            </svg>
            ${isThinking ? "Thinking" : "Instant"}
          </button>

          <button
            class="chs-icon-btn"
            title="Refresh chat"
            @click=${() => props.onRefresh()}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 2v6h6"/><path d="M3 13a9 9 0 1 0 3-7.7L3 8"/>
            </svg>
          </button>

          <button
            class="chs-icon-btn ${hasTools && _logPanelOpen ? "chs-icon-btn--active" : ""}"
            title="Activity panel"
            @click=${(e: MouseEvent) => {
              _logPanelOpen = !_logPanelOpen;
              const root = (e.currentTarget as Element).closest("#chs-root") as HTMLElement | null;
              root?.classList.toggle("chs-root--panel", _logPanelOpen);
              (e.currentTarget as HTMLElement).classList.toggle("chs-icon-btn--active", _logPanelOpen);
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
            </svg>
            ${hasTools ? html`<span class="chs-badge">${props.toolMessages.length}</span>` : nothing}
          </button>
        </div>
      </header>

      <!-- ── Body ── -->
      <div class="chs-body">

        <!-- Feed -->
        <div class="chs-feed-wrap">
          <div class="chs-feed" id="chs-feed">

            ${isEmpty ? html`
              <div class="chs-empty">
                <div class="chs-empty-glyph">
                  ${props.assistantAvatarUrl
                    ? html`<img src=${props.assistantAvatarUrl} alt="" />`
                    : html`<svg width="26" height="26" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" stroke-width="1.6"
                        stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                      </svg>`}
                </div>
                <p class="chs-empty-title">${props.assistantName ?? "Assistant"}</p>
                <p class="chs-empty-sub">How can I help you today?</p>
              </div>` : nothing}

            ${noMatches ? html`
              <div class="chs-empty chs-empty--search">
                <p class="chs-empty-sub">No messages match "${_searchQuery}".</p>
              </div>` : nothing}

            ${groups.map(g => {
              if (isSystemRole(g.role)) {
                return html`
                  <div class="chs-group chs-group--system">
                    <div class="chs-bubbles">
                      ${g.messages.map(msg => {
                        const text = extractTextCached(msg) ?? "";
                        if (!text) return nothing;
                        return html`<div class="chs-bubble chs-bubble--system">
                          ${unsafeHTML(renderMd(text))}
                        </div>`;
                      })}
                    </div>
                  </div>`;
              }
              const isUser = isUserRole(g.role);
              return html`
                <div class="chs-group ${isUser ? "chs-group--user" : "chs-group--bot"}">
                  <div class="chs-av-wrap">${avatarTpl(g.role, props)}</div>
                  <div class="chs-bubbles">
                    ${g.messages.map(msg => {
                      const text = extractTextCached(msg) ?? "";
                      const attachments = extractAttachmentSummary(msg);
                      if (!text && !attachments) {
                        return isUser
                          ? html`<div class="chs-bubble chs-bubble--empty">—</div>`
                          : nothing;
                      }
                      return html`<div class="chs-bubble">
                        ${text ? unsafeHTML(renderMd(text)) : nothing}
                        ${attachments ? html`<div class="chs-attach">${attachments}</div>` : nothing}
                      </div>`;
                    })}
                  </div>
                </div>`;
            })}

            ${props.stream ? html`
              <div class="chs-group chs-group--bot chs-group--live">
                <div class="chs-av-wrap">${avatarTpl("assistant", props)}</div>
                <div class="chs-bubbles">
                  <div class="chs-bubble">${unsafeHTML(renderMd(props.stream))}</div>
                </div>
              </div>` : nothing}

            ${props.loading && !props.stream ? html`
              <div class="chs-group chs-group--bot">
                <div class="chs-av-wrap">${avatarTpl("assistant", props)}</div>
                <div class="chs-bubbles">
                  <div class="chs-dots"><span></span><span></span><span></span></div>
                </div>
              </div>` : nothing}

          </div>

          <!-- Input -->
          <div class="chs-input-area">
            <div class="chs-input-box">
              ${renderSlashMenu(requestUpdate, props)}
              <textarea
                class="chs-input"
                placeholder="Message…"
                .value=${props.draft}
                ?disabled=${!props.canSend && !props.canAbort}
                @input=${(e: Event) => {
                  const el = e.target as HTMLTextAreaElement;
                  props.onDraftChange(el.value);
                  el.style.height = "auto";
                  el.style.height = Math.min(el.scrollHeight, 200) + "px";
                  updateSlashMenu(el.value, requestUpdate);
                }}
                @blur=${() => {
                  // Delay close so click on menu item fires first.
                  setTimeout(() => {
                    if (slashState.open) {
                      slashState.open = false;
                      resetSlashState();
                      requestUpdate();
                    }
                  }, 150);
                }}
                @keydown=${(e: KeyboardEvent) => {
                  // Slash menu — arg mode
                  if (
                    slashState.open &&
                    slashState.mode === "args" &&
                    slashState.argItems.length > 0
                  ) {
                    const len = slashState.argItems.length;
                    switch (e.key) {
                      case "ArrowDown":
                        e.preventDefault();
                        slashState.index = (slashState.index + 1) % len;
                        requestUpdate();
                        return;
                      case "ArrowUp":
                        e.preventDefault();
                        slashState.index = (slashState.index - 1 + len) % len;
                        requestUpdate();
                        return;
                      case "Tab":
                        e.preventDefault();
                        selectSlashArg(
                          slashState.argItems[slashState.index],
                          props,
                          requestUpdate,
                          false,
                        );
                        return;
                      case "Enter":
                        e.preventDefault();
                        selectSlashArg(
                          slashState.argItems[slashState.index],
                          props,
                          requestUpdate,
                          true,
                        );
                        return;
                      case "Escape":
                        e.preventDefault();
                        slashState.open = false;
                        resetSlashState();
                        requestUpdate();
                        return;
                    }
                  }
                  // Slash menu — command mode
                  if (slashState.open && slashState.items.length > 0) {
                    const len = slashState.items.length;
                    switch (e.key) {
                      case "ArrowDown":
                        e.preventDefault();
                        slashState.index = (slashState.index + 1) % len;
                        requestUpdate();
                        return;
                      case "ArrowUp":
                        e.preventDefault();
                        slashState.index = (slashState.index - 1 + len) % len;
                        requestUpdate();
                        return;
                      case "Tab":
                        e.preventDefault();
                        tabCompleteSlashCommand(
                          slashState.items[slashState.index],
                          props,
                          requestUpdate,
                        );
                        return;
                      case "Enter":
                        e.preventDefault();
                        selectSlashCommand(
                          slashState.items[slashState.index],
                          props,
                          requestUpdate,
                        );
                        return;
                      case "Escape":
                        e.preventDefault();
                        slashState.open = false;
                        resetSlashState();
                        requestUpdate();
                        return;
                    }
                  }
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (props.canSend && props.draft.trim()) props.onSend();
                  }
                }}
              ></textarea>
              <div class="chs-input-btn-wrap">
                ${props.canAbort
                  ? html`<button class="chs-send-btn chs-send-btn--stop"
                      @click=${() => props.onAbort?.()}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                        <rect x="4" y="4" width="16" height="16" rx="3"/>
                      </svg>
                    </button>`
                  : html`<button class="chs-send-btn"
                      ?disabled=${!props.canSend || !props.draft.trim()}
                      @click=${() => props.onSend()}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" stroke-width="2.2"
                        stroke-linecap="round" stroke-linejoin="round">
                        <line x1="12" y1="19" x2="12" y2="5"/>
                        <polyline points="5 12 12 5 19 12"/>
                      </svg>
                    </button>`}
              </div>
            </div>
            ${!props.connected
              ? html`<p class="chs-status">Connecting…</p>`
              : props.error
              ? html`<p class="chs-status chs-status--err">${props.error}</p>`
              : nothing}
          </div>
        </div>

        <!-- Activity / tool log side panel -->
        <aside class="chs-panel" id="chs-panel">
          <div class="chs-panel-hd">
            <span>Activity</span>
            <button class="chs-icon-btn" title="Close panel" @click=${(e: MouseEvent) => {
              _logPanelOpen = false;
              const root = (e.currentTarget as Element).closest("#chs-root") as HTMLElement | null;
              root?.classList.remove("chs-root--panel");
              root?.querySelector(".chs-icon-btn--active")?.classList.remove("chs-icon-btn--active");
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
          <div class="chs-panel-bd">
            ${props.toolMessages.length === 0
              ? html`<p class="chs-panel-empty">No tool activity yet.<br/>Reasoning and tool calls will appear here.</p>`
              : props.toolMessages.map((m, i) => toolLogTpl(m, i))}
          </div>
        </aside>

      </div>
    </div>
  `;
}
