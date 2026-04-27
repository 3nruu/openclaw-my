import { html, nothing } from "lit";
import { t } from "../../i18n/index.ts";
import { formatRelativeTimestamp } from "../format.ts";
import type {
  ChannelAccountSnapshot,
  ChannelUiMetaEntry,
  ChannelsStatusSnapshot,
  DiscordStatus,
  GoogleChatStatus,
  IMessageStatus,
  NostrProfile,
  NostrStatus,
  SignalStatus,
  SlackStatus,
  TelegramStatus,
  WhatsAppStatus,
} from "../types.ts";

type ChannelSummaryStatus = "ok" | "warn" | "danger" | "off";

function summarizeChannelStatus(
  accounts: ChannelAccountSnapshot[] | undefined,
): ChannelSummaryStatus {
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

function summaryAccountLabel(accounts: ChannelAccountSnapshot[] | undefined): string {
  if (!accounts || accounts.length === 0) {
    return "—";
  }
  const account = accounts.find((a) => a.accountId) ?? accounts[0];
  return account?.accountId || account?.name || "—";
}
import { renderChannelConfigSection } from "./channels.config.ts";
import { renderDiscordCard } from "./channels.discord.ts";
import { renderGoogleChatCard } from "./channels.googlechat.ts";
import { renderIMessageCard } from "./channels.imessage.ts";
import { renderNostrCard } from "./channels.nostr.ts";
import {
  channelEnabled,
  formatNullableBoolean,
  renderChannelAccountCount,
  resolveChannelDisplayState,
} from "./channels.shared.ts";
import { renderSignalCard } from "./channels.signal.ts";
import { renderSlackCard } from "./channels.slack.ts";
import { renderTelegramCard } from "./channels.telegram.ts";
import type { ChannelKey, ChannelsChannelData, ChannelsProps } from "./channels.types.ts";
import { renderWhatsAppCard } from "./channels.whatsapp.ts";

export function renderChannels(props: ChannelsProps) {
  const channels = props.snapshot?.channels as Record<string, unknown> | null;
  const whatsapp = (channels?.whatsapp ?? undefined) as WhatsAppStatus | undefined;
  const telegram = (channels?.telegram ?? undefined) as TelegramStatus | undefined;
  const discord = (channels?.discord ?? null) as DiscordStatus | null;
  const googlechat = (channels?.googlechat ?? null) as GoogleChatStatus | null;
  const slack = (channels?.slack ?? null) as SlackStatus | null;
  const signal = (channels?.signal ?? null) as SignalStatus | null;
  const imessage = (channels?.imessage ?? null) as IMessageStatus | null;
  const nostr = (channels?.nostr ?? null) as NostrStatus | null;
  const channelOrder = resolveChannelOrder(props.snapshot);
  const orderedChannels = channelOrder
    .map((key, index) => ({
      key,
      enabled: channelEnabled(key, props),
      order: index,
    }))
    .toSorted((a, b) => {
      if (a.enabled !== b.enabled) {
        return a.enabled ? -1 : 1;
      }
      return a.order - b.order;
    });

  return html`
    ${renderChannelsSummary(props, channelOrder)}

    <section class="ov-panel" style="margin-bottom: 16px;">
      <header class="ov-panel__head">
        <div class="ov-panel__heading">
          <h3 class="ov-panel__title">${t("channels.cards.title")}</h3>
          <div class="ov-panel__sub">${t("channels.cards.subtitle")}</div>
        </div>
      </header>
      <div class="grid grid-cols-2">
        ${orderedChannels.map((channel) =>
          renderChannel(channel.key, props, {
            whatsapp,
            telegram,
            discord,
            googlechat,
            slack,
            signal,
            imessage,
            nostr,
            channelAccounts: props.snapshot?.channelAccounts ?? null,
          }),
        )}
      </div>
    </section>

    <details class="ov-secondary">
      <summary class="ov-secondary__toggle">${t("channels.health.toggle")}</summary>
      <div class="ov-secondary__body">
        <section class="card">
          <div class="row" style="justify-content: space-between;">
            <div>
              <div class="card-title">${t("channels.health.title")}</div>
              <div class="card-sub">${t("channels.health.subtitle")}</div>
            </div>
            <div class="muted">
              ${props.lastSuccessAt ? formatRelativeTimestamp(props.lastSuccessAt) : t("common.na")}
            </div>
          </div>
          ${props.lastError
            ? html`<div class="callout danger" style="margin-top: 12px;">${props.lastError}</div>`
            : nothing}
          <pre class="code-block" style="margin-top: 12px;">
${props.snapshot ? JSON.stringify(props.snapshot, null, 2) : t("channels.health.noSnapshotYet")}
          </pre>
        </section>
      </div>
    </details>
  `;
}

function renderChannelsSummary(props: ChannelsProps, channelOrder: ChannelKey[]) {
  const accounts = props.snapshot?.channelAccounts ?? {};
  const labels = props.snapshot?.channelLabels ?? {};
  const labelById = new Map<string, string>();
  for (const meta of props.snapshot?.channelMeta ?? []) {
    labelById.set(meta.id, meta.label);
  }
  const items = channelOrder.map((id) => {
    const status = summarizeChannelStatus(accounts[id]);
    const label = labelById.get(id) ?? labels[id] ?? id;
    const accountId = summaryAccountLabel(accounts[id]);
    return { id, label, status, accountId };
  });
  const onlineCount = items.filter((i) => i.status === "ok").length;
  const totalCount = items.length;
  const allOk = totalCount > 0 && onlineCount === totalCount;
  const noneOk = onlineCount === 0;
  const headerClass = allOk
    ? "ov-status-pill--ok"
    : noneOk
      ? "ov-status-pill--danger"
      : "ov-status-pill--warn";

  return html`
    <section class="ov-panel" style="margin-bottom: 16px;">
      <header class="ov-panel__head">
        <div class="ov-panel__heading">
          <h3 class="ov-panel__title">${t("channels.summary.title")}</h3>
          <div class="ov-panel__sub">${t("channels.summary.subtitle")}</div>
        </div>
        <span class="ov-status-pill ${headerClass}">
          ${t("channels.summary.online", { online: onlineCount, total: totalCount })}
        </span>
      </header>
      ${items.length === 0
        ? html`<div class="ov-panel__empty muted">${t("channels.summary.empty")}</div>`
        : html`
            <div class="ov-channel-list">
              ${items.map(
                (c) => html`
                  <div class="ov-channel-row">
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

function resolveChannelOrder(snapshot: ChannelsStatusSnapshot | null): ChannelKey[] {
  if (snapshot?.channelMeta?.length) {
    return snapshot.channelMeta.map((entry) => entry.id);
  }
  if (snapshot?.channelOrder?.length) {
    return snapshot.channelOrder;
  }
  return ["whatsapp", "telegram", "discord", "googlechat", "slack", "signal", "imessage", "nostr"];
}

function renderChannel(key: ChannelKey, props: ChannelsProps, data: ChannelsChannelData) {
  const accountCountLabel = renderChannelAccountCount(key, data.channelAccounts);
  switch (key) {
    case "whatsapp":
      return renderWhatsAppCard({
        props,
        whatsapp: data.whatsapp,
        accountCountLabel,
      });
    case "telegram":
      return renderTelegramCard({
        props,
        telegram: data.telegram,
        telegramAccounts: data.channelAccounts?.telegram ?? [],
        accountCountLabel,
      });
    case "discord":
      return renderDiscordCard({
        props,
        discord: data.discord,
        accountCountLabel,
      });
    case "googlechat":
      return renderGoogleChatCard({
        props,
        googleChat: data.googlechat,
        accountCountLabel,
      });
    case "slack":
      return renderSlackCard({
        props,
        slack: data.slack,
        accountCountLabel,
      });
    case "signal":
      return renderSignalCard({
        props,
        signal: data.signal,
        accountCountLabel,
      });
    case "imessage":
      return renderIMessageCard({
        props,
        imessage: data.imessage,
        accountCountLabel,
      });
    case "nostr": {
      const nostrAccounts = data.channelAccounts?.nostr ?? [];
      const primaryAccount = nostrAccounts[0];
      const accountId = primaryAccount?.accountId ?? "default";
      const profile =
        (primaryAccount as { profile?: NostrProfile | null } | undefined)?.profile ?? null;
      const showForm =
        props.nostrProfileAccountId === accountId ? props.nostrProfileFormState : null;
      const profileFormCallbacks = showForm
        ? {
            onFieldChange: props.onNostrProfileFieldChange,
            onSave: props.onNostrProfileSave,
            onImport: props.onNostrProfileImport,
            onCancel: props.onNostrProfileCancel,
            onToggleAdvanced: props.onNostrProfileToggleAdvanced,
          }
        : null;
      return renderNostrCard({
        props,
        nostr: data.nostr,
        nostrAccounts,
        accountCountLabel,
        profileFormState: showForm,
        profileFormCallbacks,
        onEditProfile: () => props.onNostrProfileEdit(accountId, profile),
      });
    }
    default:
      return renderGenericChannelCard(key, props, data.channelAccounts ?? {});
  }
}

function renderGenericChannelCard(
  key: ChannelKey,
  props: ChannelsProps,
  channelAccounts: Record<string, ChannelAccountSnapshot[]>,
) {
  const label = resolveChannelLabel(props.snapshot, key);
  const displayState = resolveChannelDisplayState(key, props);
  const lastError =
    typeof displayState.status?.lastError === "string" ? displayState.status.lastError : undefined;
  const accounts = channelAccounts[key] ?? [];
  const accountCountLabel = renderChannelAccountCount(key, channelAccounts);

  return html`
    <div class="card">
      <div class="card-title">${label}</div>
      <div class="card-sub">${t("channels.generic.subtitle")}</div>
      ${accountCountLabel}
      ${accounts.length > 0
        ? html`
            <div class="account-card-list">
              ${accounts.map((account) => renderGenericAccount(account))}
            </div>
          `
        : html`
            <div class="status-list" style="margin-top: 16px;">
              <div>
                <span class="label">${t("common.configured")}</span>
                <span>${formatNullableBoolean(displayState.configured)}</span>
              </div>
              <div>
                <span class="label">${t("common.running")}</span>
                <span>${formatNullableBoolean(displayState.running)}</span>
              </div>
              <div>
                <span class="label">${t("common.connected")}</span>
                <span>${formatNullableBoolean(displayState.connected)}</span>
              </div>
            </div>
          `}
      ${lastError
        ? html`<div class="callout danger" style="margin-top: 12px;">${lastError}</div>`
        : nothing}
      ${renderChannelConfigSection({ channelId: key, props })}
    </div>
  `;
}

function resolveChannelMetaMap(
  snapshot: ChannelsStatusSnapshot | null,
): Record<string, ChannelUiMetaEntry> {
  if (!snapshot?.channelMeta?.length) {
    return {};
  }
  return Object.fromEntries(snapshot.channelMeta.map((entry) => [entry.id, entry]));
}

function resolveChannelLabel(snapshot: ChannelsStatusSnapshot | null, key: string): string {
  const meta = resolveChannelMetaMap(snapshot)[key];
  return meta?.label ?? snapshot?.channelLabels?.[key] ?? key;
}

const RECENT_ACTIVITY_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

function hasRecentActivity(account: ChannelAccountSnapshot): boolean {
  if (!account.lastInboundAt) {
    return false;
  }
  return Date.now() - account.lastInboundAt < RECENT_ACTIVITY_THRESHOLD_MS;
}

function deriveRunningStatus(account: ChannelAccountSnapshot): string {
  if (account.running) {
    return t("common.yes");
  }
  // If we have recent inbound activity, the channel is effectively running
  if (hasRecentActivity(account)) {
    return t("common.active");
  }
  return t("common.no");
}

function deriveConnectedStatus(account: ChannelAccountSnapshot): string {
  if (account.connected === true) {
    return t("common.yes");
  }
  if (account.connected === false) {
    return t("common.no");
  }
  // If connected is null/undefined but we have recent activity, show as active
  if (hasRecentActivity(account)) {
    return t("common.active");
  }
  return t("common.na");
}

function renderGenericAccount(account: ChannelAccountSnapshot) {
  const runningStatus = deriveRunningStatus(account);
  const connectedStatus = deriveConnectedStatus(account);

  return html`
    <div class="account-card">
      <div class="account-card-header">
        <div class="account-card-title">${account.name || account.accountId}</div>
        <div class="account-card-id">${account.accountId}</div>
      </div>
      <div class="status-list account-card-status">
        <div>
          <span class="label">${t("common.running")}</span>
          <span>${runningStatus}</span>
        </div>
        <div>
          <span class="label">${t("common.configured")}</span>
          <span>${account.configured ? t("common.yes") : t("common.no")}</span>
        </div>
        <div>
          <span class="label">${t("common.connected")}</span>
          <span>${connectedStatus}</span>
        </div>
        <div>
          <span class="label">${t("common.lastInbound")}</span>
          <span
            >${account.lastInboundAt
              ? formatRelativeTimestamp(account.lastInboundAt)
              : t("common.na")}</span
          >
        </div>
        ${account.lastError
          ? html` <div class="account-card-error">${account.lastError}</div> `
          : nothing}
      </div>
    </div>
  `;
}
