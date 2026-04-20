import { html, nothing, type TemplateResult } from "lit";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import DOMPurify from "dompurify";
import { marked } from "marked";
import type { ChatProps } from "./chat.ts";
import { extractTextCached } from "../chat/message-extract.ts";
import { normalizeMessage, normalizeRoleForGrouping } from "../chat/message-normalizer.ts";

marked.use({ async: false, breaks: true, gfm: true });

interface SimpleGroup {
  role: string;
  messages: unknown[];
}

function groupMessages(messages: unknown[]): SimpleGroup[] {
  const groups: SimpleGroup[] = [];
  for (const msg of messages) {
    const normalized = normalizeMessage(msg);
    const role = normalizeRoleForGrouping(normalized.role);
    // tool results go to the right panel, skip in main thread
    if (role === "tool" || role === "toolResult") continue;
    if (role === "system") continue;
    const last = groups[groups.length - 1];
    if (last && last.role === role) {
      last.messages.push(msg);
    } else {
      groups.push({ role, messages: [msg] });
    }
  }
  return groups;
}

function renderMd(text: string): string {
  const raw = String(marked.parse(text));
  return DOMPurify.sanitize(raw, {
    ALLOWED_TAGS: [
      "p", "br", "strong", "b", "em", "i", "s", "del", "code", "pre",
      "ul", "ol", "li", "h1", "h2", "h3", "h4", "h5", "h6",
      "a", "blockquote", "hr", "table", "thead", "tbody", "tr", "th", "td",
      "span", "div",
    ],
    ALLOWED_ATTR: ["href", "target", "rel", "class", "data-lang"],
  });
}

function avatarEl(role: string, props: ChatProps): TemplateResult {
  if (role === "user" || role === "User") {
    return html`<div class="sc-av sc-av--user">You</div>`;
  }
  if (props.assistantAvatar) {
    return html`<img class="sc-av sc-av--bot" src=${props.assistantAvatar} alt="" />`;
  }
  const initial = (props.assistantName ?? "A")[0]?.toUpperCase() ?? "A";
  return html`<div class="sc-av sc-av--bot">${initial}</div>`;
}

function renderToolLog(msg: unknown, index: number): TemplateResult {
  const m = msg as Record<string, unknown>;
  const toolName =
    typeof m.toolName === "string"
      ? m.toolName
      : typeof m.tool_name === "string"
        ? m.tool_name
        : `tool-${index + 1}`;
  const text = extractTextCached(msg) ?? "";
  const preview = text.length > 400 ? `${text.slice(0, 400)}…` : text;
  return html`
    <div class="sc-log">
      <div class="sc-log-name">${toolName}</div>
      ${preview ? html`<pre class="sc-log-out">${preview}</pre>` : nothing}
    </div>
  `;
}

export function renderChatSimple(props: ChatProps): TemplateResult {
  const groups = groupMessages(props.messages);
  const hasTools = props.toolMessages.length > 0;
  const isEmpty = groups.length === 0 && !props.stream && !props.loading;

  return html`
    <div class="sc-root${hasTools ? " sc-root--split" : ""}">

      <!-- ── Main column ── -->
      <div class="sc-main">

        <div class="sc-feed">
          ${isEmpty
            ? html`
              <div class="sc-empty">
                <div class="sc-empty-glyph">◈</div>
                <p class="sc-empty-name">${props.assistantName}</p>
                <p class="sc-empty-hint">Ask anything. I'm ready.</p>
              </div>`
            : nothing}

          ${groups.map(
            (g) => html`
            <div class="sc-group sc-group--${g.role === "user" || g.role === "User" ? "user" : "bot"}">
              <div class="sc-group-av">${avatarEl(g.role, props)}</div>
              <div class="sc-group-body">
                ${g.messages.map((msg) => {
                  const text = extractTextCached(msg) ?? "";
                  return text
                    ? html`<div class="sc-bubble">${unsafeHTML(renderMd(text))}</div>`
                    : nothing;
                })}
              </div>
            </div>`,
          )}

          ${props.stream
            ? html`
              <div class="sc-group sc-group--bot sc-group--live">
                <div class="sc-group-av">${avatarEl("assistant", props)}</div>
                <div class="sc-group-body">
                  <div class="sc-bubble">${unsafeHTML(renderMd(props.stream))}</div>
                </div>
              </div>`
            : nothing}

          ${props.loading && !props.stream
            ? html`
              <div class="sc-group sc-group--bot">
                <div class="sc-group-av">${avatarEl("assistant", props)}</div>
                <div class="sc-group-body">
                  <div class="sc-dots"><span></span><span></span><span></span></div>
                </div>
              </div>`
            : nothing}
        </div>

        <!-- ── Input ── -->
        <div class="sc-bar">
          <div class="sc-bar-inner">
            <textarea
              class="sc-input"
              placeholder="Message…"
              .value=${props.draft}
              ?disabled=${!props.canSend && !props.canAbort}
              @input=${(e: Event) =>
                props.onDraftChange((e.target as HTMLTextAreaElement).value)}
              @keydown=${(e: KeyboardEvent) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (props.canSend && props.draft.trim()) props.onSend();
                }
              }}
            ></textarea>
            <div class="sc-bar-actions">
              ${props.canAbort
                ? html`<button class="sc-btn sc-btn--stop" @click=${() => props.onAbort?.()}>
                    ■ Stop
                  </button>`
                : html`<button
                    class="sc-btn sc-btn--send"
                    ?disabled=${!props.canSend || !props.draft.trim()}
                    @click=${() => props.onSend()}
                  >↑</button>`}
            </div>
          </div>
          ${!props.connected
            ? html`<p class="sc-notice">Connecting…</p>`
            : nothing}
          ${props.error
            ? html`<p class="sc-notice sc-notice--err">${props.error}</p>`
            : nothing}
        </div>
      </div>

      <!-- ── Tool log panel ── -->
      ${hasTools
        ? html`
          <div class="sc-panel">
            <div class="sc-panel-hd">
              <span>Tool Logs</span>
              <span class="sc-panel-badge">${props.toolMessages.length}</span>
            </div>
            <div class="sc-panel-bd">
              ${props.toolMessages.map((msg, i) => renderToolLog(msg, i))}
            </div>
          </div>`
        : nothing}
    </div>
  `;
}
