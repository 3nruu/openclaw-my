import { html, nothing } from "lit";
import { t, i18n, SUPPORTED_LOCALES, type Locale, isSupportedLocale } from "../../i18n/index.ts";
import type { EventLogEntry } from "../app-events.ts";
import { buildExternalLinkRel, EXTERNAL_LINK_TARGET } from "../external-link.ts";
import { formatRelativeTimestamp, formatDurationHuman } from "../format.ts";
import type { GatewayHelloOk } from "../gateway.ts";
import { icons } from "../icons.ts";
import { formatEventPayload } from "../presenter.ts";
import type { UiSettings } from "../storage.ts";
import { normalizeLowercaseStringOrEmpty } from "../string-coerce.ts";
import type {
  AttentionItem,
  ChannelAccountSnapshot,
  ChannelsStatusSnapshot,
  CronJob,
  CronStatus,
  ModelAuthStatusResult,
  SessionsListResult,
  SessionsUsageResult,
  SkillStatusReport,
} from "../types.ts";
import { renderConnectCommand } from "./connect-command.ts";
import { renderOverviewAttention } from "./overview-attention.ts";
import { renderOverviewCards } from "./overview-cards.ts";
import {
  resolveAuthHintKind,
  shouldShowInsecureContextHint,
  shouldShowPairingHint,
} from "./overview-hints.ts";
import { renderOverviewLogTail } from "./overview-log-tail.ts";

export type OverviewProps = {
  connected: boolean;
  hello: GatewayHelloOk | null;
  settings: UiSettings;
  password: string;
  lastError: string | null;
  lastErrorCode: string | null;
  presenceCount: number;
  sessionsCount: number | null;
  cronEnabled: boolean | null;
  cronNext: number | null;
  lastChannelsRefresh: number | null;
  warnQueryToken: boolean;
  modelAuthStatus: ModelAuthStatusResult | null;
  usageResult: SessionsUsageResult | null;
  sessionsResult: SessionsListResult | null;
  skillsReport: SkillStatusReport | null;
  cronJobs: CronJob[];
  cronStatus: CronStatus | null;
  attentionItems: AttentionItem[];
  eventLog: EventLogEntry[];
  overviewLogLines: string[];
  channelsSnapshot: ChannelsStatusSnapshot | null;
  showGatewayToken: boolean;
  showGatewayPassword: boolean;
  onSettingsChange: (next: UiSettings) => void;
  onPasswordChange: (next: string) => void;
  onSessionKeyChange: (next: string) => void;
  onToggleGatewayTokenVisibility: () => void;
  onToggleGatewayPasswordVisibility: () => void;
  onConnect: () => void;
  onRefresh: () => void;
  onNavigate: (tab: string) => void;
  onRefreshLogs: () => void;
};

type Severity = "ok" | "warn" | "danger";

function eventSeverity(event: string, payload: unknown): Severity {
  const haystack = `${event} ${typeof payload === "string" ? payload : ""}`.toLowerCase();
  if (/(error|fail|reject|deni|critical|broken|crash)/.test(haystack)) {
    return "danger";
  }
  if (/(warn|expir|stale|throttl|degraded|backoff|at \d{2,3}%)/.test(haystack)) {
    return "warn";
  }
  return "ok";
}

function channelStatus(accounts: ChannelAccountSnapshot[] | undefined): Severity | "off" {
  if (!accounts || accounts.length === 0) {
    return "off";
  }
  if (accounts.some((a) => a.connected === true)) {
    return "ok";
  }
  if (accounts.some((a) => a.running === true || a.linked === true)) {
    return "warn";
  }
  if (accounts.some((a) => Boolean(a.lastError))) {
    return "danger";
  }
  return "off";
}

function channelDisplayId(accounts: ChannelAccountSnapshot[] | undefined): string {
  if (!accounts || accounts.length === 0) {
    return "—";
  }
  const account = accounts.find((a) => a.accountId) ?? accounts[0];
  return account?.accountId || account?.name || "—";
}

function formatTokensCompact(n: number): string {
  if (!Number.isFinite(n) || n <= 0) {
    return "0";
  }
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  }
  if (n >= 1_000) {
    return `${Math.round(n / 1_000)}k`;
  }
  return String(Math.round(n));
}

function tokensToday(usage: SessionsUsageResult | null): number {
  if (!usage) {
    return 0;
  }
  const today = new Date().toISOString().slice(0, 10);
  const todayEntry = usage.aggregates?.daily?.find((d) => d.date === today);
  if (todayEntry && Number.isFinite(todayEntry.tokens)) {
    return todayEntry.tokens;
  }
  return usage.totals?.totalTokens ?? 0;
}

function renderAccessCard(props: OverviewProps) {
  const snapshot = props.hello?.snapshot as
    | { authMode?: "none" | "token" | "password" | "trusted-proxy" }
    | undefined;
  const isTrustedProxy = snapshot?.authMode === "trusted-proxy";
  const currentLocale = isSupportedLocale(props.settings.locale)
    ? props.settings.locale
    : i18n.getLocale();

  const pairingHint = (() => {
    if (!shouldShowPairingHint(props.connected, props.lastError, props.lastErrorCode)) {
      return null;
    }
    return html`
      <div class="muted" style="margin-top: 8px">
        ${t("overview.pairing.hint")}
        <div style="margin-top: 6px">
          <span class="mono">openclaw devices list</span><br />
          <span class="mono">openclaw devices approve &lt;requestId&gt;</span>
        </div>
        <div style="margin-top: 6px; font-size: 12px;">${t("overview.pairing.mobileHint")}</div>
        <div style="margin-top: 6px">
          <a
            class="session-link"
            href="https://docs.openclaw.ai/web/control-ui#device-pairing-first-connection"
            target=${EXTERNAL_LINK_TARGET}
            rel=${buildExternalLinkRel()}
            title="Device pairing docs (opens in new tab)"
            >Docs: Device pairing</a
          >
        </div>
      </div>
    `;
  })();

  const authHint = (() => {
    const authHintKind = resolveAuthHintKind({
      connected: props.connected,
      lastError: props.lastError,
      lastErrorCode: props.lastErrorCode,
      hasToken: Boolean(props.settings.token.trim()),
      hasPassword: Boolean(props.password.trim()),
    });
    if (authHintKind == null) {
      return null;
    }
    if (authHintKind === "required") {
      return html`
        <div class="muted" style="margin-top: 8px">
          ${t("overview.auth.required")}
          <div style="margin-top: 6px">
            <span class="mono">openclaw dashboard --no-open</span> → tokenized URL<br />
            <span class="mono">openclaw doctor --generate-gateway-token</span> → set token
          </div>
          <div style="margin-top: 6px">
            <a
              class="session-link"
              href="https://docs.openclaw.ai/web/dashboard"
              target=${EXTERNAL_LINK_TARGET}
              rel=${buildExternalLinkRel()}
              title="Control UI auth docs (opens in new tab)"
              >Docs: Control UI auth</a
            >
          </div>
        </div>
      `;
    }
    return html`
      <div class="muted" style="margin-top: 8px">
        ${t("overview.auth.failed", { command: "openclaw dashboard --no-open" })}
      </div>
    `;
  })();

  const insecureContextHint = (() => {
    if (props.connected || !props.lastError) {
      return null;
    }
    const isSecureContext = typeof window !== "undefined" ? window.isSecureContext : true;
    if (isSecureContext) {
      return null;
    }
    if (!shouldShowInsecureContextHint(props.connected, props.lastError, props.lastErrorCode)) {
      return null;
    }
    return html`
      <div class="muted" style="margin-top: 8px">
        ${t("overview.insecure.hint", { url: "http://127.0.0.1:18789" })}
      </div>
    `;
  })();

  const queryTokenHint = (() => {
    if (props.connected || !props.lastError || !props.warnQueryToken) {
      return null;
    }
    const lower = normalizeLowercaseStringOrEmpty(props.lastError);
    const authFailed = lower.includes("unauthorized") || lower.includes("device identity required");
    if (!authFailed) {
      return null;
    }
    return html`
      <div class="muted" style="margin-top: 8px">
        Auth token must be passed as a URL fragment:
        <span class="mono">#token=&lt;token&gt;</span>.
      </div>
    `;
  })();

  return html`
    <div class="card">
      <div class="card-title">${t("overview.access.title")}</div>
      <div class="card-sub">${t("overview.access.subtitle")}</div>
      <div class="ov-access-grid" style="margin-top: 16px;">
        <label class="field ov-access-grid__full">
          <span>${t("overview.access.wsUrl")}</span>
          <input
            .value=${props.settings.gatewayUrl}
            @input=${(e: Event) => {
              const v = (e.target as HTMLInputElement).value;
              props.onSettingsChange({
                ...props.settings,
                gatewayUrl: v,
                token: v.trim() === props.settings.gatewayUrl.trim() ? props.settings.token : "",
              });
            }}
            placeholder="ws://100.x.y.z:18789"
          />
        </label>
        ${isTrustedProxy
          ? ""
          : html`
              <label class="field">
                <span>${t("overview.access.token")}</span>
                <div style="display: flex; align-items: center; gap: 8px; min-width: 0;">
                  <input
                    type=${props.showGatewayToken ? "text" : "password"}
                    autocomplete="off"
                    style="flex: 1 1 0%; min-width: 0; box-sizing: border-box;"
                    .value=${props.settings.token}
                    @input=${(e: Event) => {
                      const v = (e.target as HTMLInputElement).value;
                      props.onSettingsChange({ ...props.settings, token: v });
                    }}
                    placeholder="OPENCLAW_GATEWAY_TOKEN"
                  />
                  <button
                    type="button"
                    class="btn btn--icon ${props.showGatewayToken ? "active" : ""}"
                    style="flex-shrink: 0; width: 36px; height: 36px; box-sizing: border-box;"
                    title=${props.showGatewayToken ? "Hide token" : "Show token"}
                    aria-label="Toggle token visibility"
                    aria-pressed=${props.showGatewayToken}
                    @click=${props.onToggleGatewayTokenVisibility}
                  >
                    ${props.showGatewayToken ? icons.eye : icons.eyeOff}
                  </button>
                </div>
              </label>
              <label class="field">
                <span>${t("overview.access.password")}</span>
                <div style="display: flex; align-items: center; gap: 8px; min-width: 0;">
                  <input
                    type=${props.showGatewayPassword ? "text" : "password"}
                    autocomplete="off"
                    style="flex: 1 1 0%; min-width: 0; width: 100%; box-sizing: border-box;"
                    .value=${props.password}
                    @input=${(e: Event) => {
                      const v = (e.target as HTMLInputElement).value;
                      props.onPasswordChange(v);
                    }}
                    placeholder="system or shared password"
                  />
                  <button
                    type="button"
                    class="btn btn--icon ${props.showGatewayPassword ? "active" : ""}"
                    style="flex-shrink: 0; width: 36px; height: 36px; box-sizing: border-box;"
                    title=${props.showGatewayPassword ? "Hide password" : "Show password"}
                    aria-label="Toggle password visibility"
                    aria-pressed=${props.showGatewayPassword}
                    @click=${props.onToggleGatewayPasswordVisibility}
                  >
                    ${props.showGatewayPassword ? icons.eye : icons.eyeOff}
                  </button>
                </div>
              </label>
            `}
        <label class="field">
          <span>${t("overview.access.sessionKey")}</span>
          <input
            .value=${props.settings.sessionKey}
            @input=${(e: Event) => {
              const v = (e.target as HTMLInputElement).value;
              props.onSessionKeyChange(v);
            }}
          />
        </label>
        <label class="field">
          <span>${t("overview.access.language")}</span>
          <select
            .value=${currentLocale}
            @change=${(e: Event) => {
              const v = (e.target as HTMLSelectElement).value as Locale;
              void i18n.setLocale(v);
              props.onSettingsChange({ ...props.settings, locale: v });
            }}
          >
            ${SUPPORTED_LOCALES.map((loc) => {
              const key = loc.replace(/-([a-zA-Z])/g, (_, c) => c.toUpperCase());
              return html`<option value=${loc} ?selected=${currentLocale === loc}>
                ${t(`languages.${key}`)}
              </option>`;
            })}
          </select>
        </label>
      </div>
      <div class="row" style="margin-top: 14px;">
        <button class="btn" @click=${() => props.onConnect()}>${t("common.connect")}</button>
        <button class="btn" @click=${() => props.onRefresh()}>${t("common.refresh")}</button>
        <span class="muted"
          >${isTrustedProxy
            ? t("overview.access.trustedProxy")
            : t("overview.access.connectHint")}</span
        >
      </div>
      ${props.lastError
        ? html`<div class="callout danger" style="margin-top: 14px;">
            <div>${props.lastError}</div>
            ${pairingHint ?? ""} ${authHint ?? ""} ${insecureContextHint ?? ""}
            ${queryTokenHint ?? ""}
          </div>`
        : nothing}
      ${!props.connected
        ? html`
            <div class="login-gate__help" style="margin-top: 16px;">
              <div class="login-gate__help-title">${t("overview.connection.title")}</div>
              <ol class="login-gate__steps">
                <li>
                  ${t("overview.connection.step1")}
                  ${renderConnectCommand("openclaw gateway run")}
                </li>
                <li>
                  ${t("overview.connection.step2")} ${renderConnectCommand("openclaw dashboard")}
                </li>
                <li>${t("overview.connection.step3")}</li>
                <li>
                  ${t("overview.connection.step4")}<code
                    >openclaw doctor --generate-gateway-token</code
                  >
                </li>
              </ol>
              <div class="login-gate__docs">
                ${t("overview.connection.docsHint")}
                <a
                  class="session-link"
                  href="https://docs.openclaw.ai/web/dashboard"
                  target="_blank"
                  rel="noreferrer"
                  >${t("overview.connection.docsLink")}</a
                >
              </div>
            </div>
          `
        : nothing}
    </div>
  `;
}

function renderEventLogPanel(props: OverviewProps) {
  const visible = props.eventLog.slice(0, 8);
  return html`
    <section class="ov-panel ov-panel--event-log">
      <header class="ov-panel__head">
        <div class="ov-panel__heading">
          <h3 class="ov-panel__title">${t("overview.eventLog.title")}</h3>
          <div class="ov-panel__sub">${t("overview.eventLog.subtitle")}</div>
        </div>
        <button class="btn btn--subtle btn--sm" @click=${() => props.onRefresh()}>
          ${t("common.refresh")}
        </button>
      </header>
      ${visible.length === 0
        ? html`<div class="ov-panel__empty muted">${t("overview.eventLog.empty")}</div>`
        : html`
            <div class="ov-event-rows">
              ${visible.map((entry) => {
                const sev = eventSeverity(entry.event, entry.payload);
                const payloadText = entry.payload
                  ? formatEventPayload(entry.payload).slice(0, 120)
                  : "";
                return html`
                  <div class="ov-event-row">
                    <span class="ov-status-dot ov-status-dot--${sev}"></span>
                    <span class="ov-event-row__text">
                      <span class="ov-event-row__name">${entry.event}</span>
                      ${payloadText
                        ? html`<span class="ov-event-row__payload muted">${payloadText}</span>`
                        : nothing}
                    </span>
                    <span class="ov-event-row__time">${formatRelativeTimestamp(entry.ts)}</span>
                  </div>
                `;
              })}
            </div>
          `}
    </section>
  `;
}

function renderGatewayPanel(props: OverviewProps) {
  const snapshot = props.hello?.snapshot as
    | {
        uptimeMs?: number;
        authMode?: "none" | "token" | "password" | "trusted-proxy";
      }
    | undefined;
  const uptime = snapshot?.uptimeMs ? formatDurationHuman(snapshot.uptimeMs) : t("common.na");
  const tickIntervalMs = props.hello?.policy?.tickIntervalMs;
  const tick = tickIntervalMs
    ? `${(tickIntervalMs / 1000).toFixed(tickIntervalMs % 1000 === 0 ? 0 : 1)}s`
    : t("common.na");
  const authMode = snapshot?.authMode ?? "—";
  const version = props.hello?.server?.version ?? t("common.na");
  const statusLabel = props.connected ? t("common.online") : t("common.offline");
  const statusClass = props.connected ? "ov-status-pill--ok" : "ov-status-pill--danger";

  return html`
    <section class="ov-panel ov-panel--gateway">
      <header class="ov-panel__head">
        <div class="ov-panel__heading">
          <h3 class="ov-panel__title">${t("overview.gateway.title")}</h3>
          <div class="ov-panel__sub">${t("overview.gateway.sub", { auth: authMode })}</div>
        </div>
        <span class="ov-status-pill ${statusClass}">
          <span class="ov-status-dot ov-status-dot--${props.connected ? "ok" : "danger"}"></span>
          ${statusLabel}
        </span>
      </header>
      <div class="ov-kv-list">
        <div class="ov-kv-row">
          <span class="ov-kv-row__label">${t("common.version")}</span>
          <span class="ov-kv-row__value">${version}</span>
        </div>
        <div class="ov-kv-row">
          <span class="ov-kv-row__label">${t("overview.gateway.tick")}</span>
          <span class="ov-kv-row__value">${tick}</span>
        </div>
        <div class="ov-kv-row">
          <span class="ov-kv-row__label">${t("overview.gateway.authMode")}</span>
          <span class="ov-kv-row__value">${authMode}</span>
        </div>
        <div class="ov-kv-row">
          <span class="ov-kv-row__label">${t("overview.snapshot.uptime")}</span>
          <span class="ov-kv-row__value">${uptime}</span>
        </div>
      </div>
    </section>
  `;
}

function renderChannelsPanel(props: OverviewProps) {
  const snap = props.channelsSnapshot;
  const order = snap?.channelMeta?.length
    ? snap.channelMeta.map((m) => m.id)
    : (snap?.channelOrder ?? []);
  const labels = snap?.channelLabels ?? {};
  const accounts = snap?.channelAccounts ?? {};
  const labelById = new Map<string, string>();
  for (const meta of snap?.channelMeta ?? []) {
    labelById.set(meta.id, meta.label);
  }

  const items = order.slice(0, 6).map((id) => {
    const status = channelStatus(accounts[id]);
    const label = labelById.get(id) ?? labels[id] ?? id;
    const accountId = channelDisplayId(accounts[id]);
    return { id, label, status, accountId };
  });

  return html`
    <section class="ov-panel ov-panel--channels">
      <header class="ov-panel__head">
        <div class="ov-panel__heading">
          <h3 class="ov-panel__title">${t("overview.channels.title")}</h3>
        </div>
        <button class="btn btn--subtle btn--sm" @click=${() => props.onNavigate("channels")}>
          ${t("overview.channels.manage")}
        </button>
      </header>
      ${items.length === 0
        ? html`<div class="ov-panel__empty muted">${t("overview.channels.empty")}</div>`
        : html`
            <div class="ov-channel-list">
              ${items.map(
                (c) => html`
                  <div
                    class="ov-channel-row"
                    role="button"
                    tabindex="0"
                    @click=${() => props.onNavigate("channels")}
                    @keydown=${(e: KeyboardEvent) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        props.onNavigate("channels");
                      }
                    }}
                  >
                    <span class="ov-status-dot ov-status-dot--${c.status}"></span>
                    <span class="ov-channel-row__name">${c.label}</span>
                    <span class="ov-channel-row__id mono">${c.accountId}</span>
                  </div>
                `,
              )}
            </div>
          `}
    </section>
  `;
}

function renderTopStats(props: OverviewProps) {
  const snapshot = props.hello?.snapshot as { uptimeMs?: number } | undefined;
  const uptime = snapshot?.uptimeMs ? formatDurationHuman(snapshot.uptimeMs) : t("common.na");
  const sessions = props.sessionsCount ?? props.presenceCount ?? 0;
  const tokens = formatTokensCompact(tokensToday(props.usageResult));
  const cron = props.cronJobs?.length ?? 0;

  return html`
    <section class="ov-stats">
      <div class="ov-stat ov-stat--ok">
        <div class="ov-stat__label">${t("overview.stats.uptime")}</div>
        <div class="ov-stat__value">${uptime}</div>
      </div>
      <div class="ov-stat">
        <div class="ov-stat__label">${t("overview.stats.sessions")}</div>
        <div class="ov-stat__value">${sessions}</div>
      </div>
      <div class="ov-stat">
        <div class="ov-stat__label">${t("overview.stats.tokensToday")}</div>
        <div class="ov-stat__value">${tokens}</div>
      </div>
      <div class="ov-stat">
        <div class="ov-stat__label">${t("overview.stats.cronJobs")}</div>
        <div class="ov-stat__value">${cron}</div>
      </div>
    </section>
  `;
}

export function renderOverview(props: OverviewProps) {
  return html`
    ${renderTopStats(props)}
    ${!props.connected ? renderAccessCard(props) : nothing}
    ${props.connected
      ? html`
          <div class="ov-dash-grid">
            ${renderEventLogPanel(props)}
            <aside class="ov-dash-grid__side">
              ${renderGatewayPanel(props)} ${renderChannelsPanel(props)}
            </aside>
          </div>
          ${props.attentionItems.length > 0
            ? html`<div class="ov-section-divider"></div>
                ${renderOverviewAttention({ items: props.attentionItems })}`
            : nothing}
          <details class="ov-secondary">
            <summary class="ov-secondary__toggle">
              ${t("overview.secondary.toggle")}
            </summary>
            <div class="ov-secondary__body">
              ${renderOverviewCards({
                usageResult: props.usageResult,
                sessionsResult: props.sessionsResult,
                skillsReport: props.skillsReport,
                cronJobs: props.cronJobs,
                cronStatus: props.cronStatus,
                modelAuthStatus: props.modelAuthStatus,
                presenceCount: props.presenceCount,
                onNavigate: props.onNavigate,
              })}
              ${renderOverviewLogTail({
                lines: props.overviewLogLines,
                onRefreshLogs: props.onRefreshLogs,
              })}
            </div>
          </details>
        `
      : nothing}
  `;
}
