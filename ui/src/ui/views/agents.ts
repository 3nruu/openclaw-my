import { html, nothing } from "lit";
import { t } from "../../i18n/index.ts";
import { icons } from "../icons.ts";
import type {
  AgentIdentityResult,
  AgentsFilesListResult,
  AgentsListResult,
  ChannelsStatusSnapshot,
  CronJob,
  CronStatus,
  GatewayAgentRow,
  ModelCatalogEntry,
  SkillStatusReport,
  ToolsCatalogResult,
  ToolsEffectiveResult,
} from "../types.ts";
import { renderAgentOverview } from "./agents-panels-overview.ts";
import {
  renderAgentFiles,
  renderAgentChannels,
  renderAgentCron,
} from "./agents-panels-status-files.ts";
export type { AgentsPanel } from "./agents.types.ts";
import { renderAgentTools, renderAgentSkills } from "./agents-panels-tools-skills.ts";
import {
  agentAvatarHue,
  buildAgentContext,
  normalizeAgentLabel,
  resolveAgentEmoji,
  resolveModelLabel,
} from "./agents-utils.ts";
import type { AgentsPanel } from "./agents.types.ts";

export type ConfigState = {
  form: Record<string, unknown> | null;
  loading: boolean;
  saving: boolean;
  dirty: boolean;
};

export type ChannelsState = {
  snapshot: ChannelsStatusSnapshot | null;
  loading: boolean;
  error: string | null;
  lastSuccess: number | null;
};

export type CronState = {
  status: CronStatus | null;
  jobs: CronJob[];
  loading: boolean;
  error: string | null;
};

export type AgentFilesState = {
  list: AgentsFilesListResult | null;
  loading: boolean;
  error: string | null;
  active: string | null;
  contents: Record<string, string>;
  drafts: Record<string, string>;
  saving: boolean;
};

export type AgentSkillsState = {
  report: SkillStatusReport | null;
  loading: boolean;
  error: string | null;
  agentId: string | null;
  filter: string;
};

export type ToolsCatalogState = {
  loading: boolean;
  error: string | null;
  result: ToolsCatalogResult | null;
};

export type ToolsEffectiveState = {
  loading: boolean;
  error: string | null;
  result: ToolsEffectiveResult | null;
};

export type AgentsProps = {
  basePath: string;
  loading: boolean;
  error: string | null;
  agentsList: AgentsListResult | null;
  selectedAgentId: string | null;
  activePanel: AgentsPanel;
  config: ConfigState;
  channels: ChannelsState;
  cron: CronState;
  agentFiles: AgentFilesState;
  agentIdentityLoading: boolean;
  agentIdentityError: string | null;
  agentIdentityById: Record<string, AgentIdentityResult>;
  agentSkills: AgentSkillsState;
  toolsCatalog: ToolsCatalogState;
  toolsEffective: ToolsEffectiveState;
  runtimeSessionKey: string;
  runtimeSessionMatchesSelectedAgent: boolean;
  modelCatalog: ModelCatalogEntry[];
  onRefresh: () => void;
  onSelectAgent: (agentId: string) => void;
  onSelectPanel: (panel: AgentsPanel) => void;
  onLoadFiles: (agentId: string) => void;
  onSelectFile: (name: string) => void;
  onFileDraftChange: (name: string, content: string) => void;
  onFileReset: (name: string) => void;
  onFileSave: (name: string) => void;
  onToolsProfileChange: (agentId: string, profile: string | null, clearAllow: boolean) => void;
  onToolsOverridesChange: (agentId: string, alsoAllow: string[], deny: string[]) => void;
  onConfigReload: () => void;
  onConfigSave: () => void;
  onModelChange: (agentId: string, modelId: string | null) => void;
  onModelFallbacksChange: (agentId: string, fallbacks: string[]) => void;
  onChannelsRefresh: () => void;
  onCronRefresh: () => void;
  onCronRunNow: (jobId: string) => void;
  onSkillsFilterChange: (next: string) => void;
  onSkillsRefresh: () => void;
  onAgentSkillToggle: (agentId: string, skillName: string, enabled: boolean) => void;
  onAgentSkillsClear: (agentId: string) => void;
  onAgentSkillsDisableAll: (agentId: string) => void;
  onSetDefault: (agentId: string) => void;
  onClearAgentSelection?: () => void;
};

export function renderAgents(props: AgentsProps) {
  const agents = props.agentsList?.agents ?? [];
  const defaultId = props.agentsList?.defaultId ?? null;
  // List mode = no agent explicitly selected. We do not fall back to defaultId
  // here so the user lands on the cards grid first.
  const selectedId = props.selectedAgentId ?? null;
  const selectedAgent = selectedId
    ? (agents.find((agent) => agent.id === selectedId) ?? null)
    : null;

  if (!selectedAgent) {
    return renderAgentsList(props, agents, defaultId);
  }

  const selectedSkillCount =
    props.agentSkills.agentId === selectedAgent.id
      ? (props.agentSkills.report?.skills?.length ?? null)
      : null;
  const channelEntryCount = props.channels.snapshot
    ? Object.keys(props.channels.snapshot.channelAccounts ?? {}).length
    : null;
  const cronJobCount = props.cron.jobs.filter((j) => j.agentId === selectedAgent.id).length;
  const tabCounts: Record<string, number | null> = {
    files: props.agentFiles.list?.files?.length ?? null,
    skills: selectedSkillCount,
    channels: channelEntryCount,
    cron: cronJobCount || null,
  };

  return html`
    <div class="agents-layout">
      ${renderAgentDetailHeader(props, selectedAgent, defaultId)}
      <section class="agents-main">
        ${html`
              ${renderAgentTabs(
                props.activePanel,
                (panel) => props.onSelectPanel(panel),
                tabCounts,
              )}
              ${props.activePanel === "overview"
                ? renderAgentOverview({
                    agent: selectedAgent,
                    basePath: props.basePath,
                    defaultId,
                    configForm: props.config.form,
                    agentFilesList: props.agentFiles.list,
                    agentIdentity: props.agentIdentityById[selectedAgent.id] ?? null,
                    agentIdentityError: props.agentIdentityError,
                    agentIdentityLoading: props.agentIdentityLoading,
                    configLoading: props.config.loading,
                    configSaving: props.config.saving,
                    configDirty: props.config.dirty,
                    modelCatalog: props.modelCatalog,
                    onConfigReload: props.onConfigReload,
                    onConfigSave: props.onConfigSave,
                    onModelChange: props.onModelChange,
                    onModelFallbacksChange: props.onModelFallbacksChange,
                    onSelectPanel: props.onSelectPanel,
                  })
                : nothing}
              ${props.activePanel === "files"
                ? renderAgentFiles({
                    agentId: selectedAgent.id,
                    agentFilesList: props.agentFiles.list,
                    agentFilesLoading: props.agentFiles.loading,
                    agentFilesError: props.agentFiles.error,
                    agentFileActive: props.agentFiles.active,
                    agentFileContents: props.agentFiles.contents,
                    agentFileDrafts: props.agentFiles.drafts,
                    agentFileSaving: props.agentFiles.saving,
                    onLoadFiles: props.onLoadFiles,
                    onSelectFile: props.onSelectFile,
                    onFileDraftChange: props.onFileDraftChange,
                    onFileReset: props.onFileReset,
                    onFileSave: props.onFileSave,
                  })
                : nothing}
              ${props.activePanel === "tools"
                ? renderAgentTools({
                    agentId: selectedAgent.id,
                    configForm: props.config.form,
                    configLoading: props.config.loading,
                    configSaving: props.config.saving,
                    configDirty: props.config.dirty,
                    toolsCatalogLoading: props.toolsCatalog.loading,
                    toolsCatalogError: props.toolsCatalog.error,
                    toolsCatalogResult: props.toolsCatalog.result,
                    toolsEffectiveLoading: props.toolsEffective.loading,
                    toolsEffectiveError: props.toolsEffective.error,
                    toolsEffectiveResult: props.toolsEffective.result,
                    runtimeSessionKey: props.runtimeSessionKey,
                    runtimeSessionMatchesSelectedAgent: props.runtimeSessionMatchesSelectedAgent,
                    onProfileChange: props.onToolsProfileChange,
                    onOverridesChange: props.onToolsOverridesChange,
                    onConfigReload: props.onConfigReload,
                    onConfigSave: props.onConfigSave,
                  })
                : nothing}
              ${props.activePanel === "skills"
                ? renderAgentSkills({
                    agentId: selectedAgent.id,
                    report: props.agentSkills.report,
                    loading: props.agentSkills.loading,
                    error: props.agentSkills.error,
                    activeAgentId: props.agentSkills.agentId,
                    configForm: props.config.form,
                    configLoading: props.config.loading,
                    configSaving: props.config.saving,
                    configDirty: props.config.dirty,
                    filter: props.agentSkills.filter,
                    onFilterChange: props.onSkillsFilterChange,
                    onRefresh: props.onSkillsRefresh,
                    onToggle: props.onAgentSkillToggle,
                    onClear: props.onAgentSkillsClear,
                    onDisableAll: props.onAgentSkillsDisableAll,
                    onConfigReload: props.onConfigReload,
                    onConfigSave: props.onConfigSave,
                  })
                : nothing}
              ${props.activePanel === "channels"
                ? renderAgentChannels({
                    context: buildAgentContext(
                      selectedAgent,
                      props.config.form,
                      props.agentFiles.list,
                      defaultId,
                      props.agentIdentityById[selectedAgent.id] ?? null,
                    ),
                    configForm: props.config.form,
                    snapshot: props.channels.snapshot,
                    loading: props.channels.loading,
                    error: props.channels.error,
                    lastSuccess: props.channels.lastSuccess,
                    onRefresh: props.onChannelsRefresh,
                    onSelectPanel: props.onSelectPanel,
                  })
                : nothing}
              ${props.activePanel === "cron"
                ? renderAgentCron({
                    context: buildAgentContext(
                      selectedAgent,
                      props.config.form,
                      props.agentFiles.list,
                      defaultId,
                      props.agentIdentityById[selectedAgent.id] ?? null,
                    ),
                    agentId: selectedAgent.id,
                    jobs: props.cron.jobs,
                    status: props.cron.status,
                    loading: props.cron.loading,
                    error: props.cron.error,
                    onRefresh: props.onCronRefresh,
                    onRunNow: props.onCronRunNow,
                    onSelectPanel: props.onSelectPanel,
                  })
                : nothing}
            `}
      </section>
    </div>
  `;
}

function renderAgentTabs(
  active: AgentsPanel,
  onSelect: (panel: AgentsPanel) => void,
  counts: Record<string, number | null>,
) {
  const tabs: Array<{ id: AgentsPanel; label: string }> = [
    { id: "overview", label: "Overview" },
    { id: "files", label: "Files" },
    { id: "tools", label: "Tools" },
    { id: "skills", label: "Skills" },
    { id: "channels", label: "Channels" },
    { id: "cron", label: "Cron Jobs" },
  ];
  return html`
    <div class="agent-tabs">
      ${tabs.map(
        (tab) => html`
          <button
            class="agent-tab ${active === tab.id ? "active" : ""}"
            type="button"
            @click=${() => onSelect(tab.id)}
          >
            ${tab.label}${counts[tab.id] != null
              ? html`<span class="agent-tab-count">${counts[tab.id]}</span>`
              : nothing}
          </button>
        `,
      )}
    </div>
  `;
}

function agentInitial(agent: GatewayAgentRow): string {
  const name = normalizeAgentLabel(agent);
  const trimmed = name.trim();
  if (!trimmed) {
    return "?";
  }
  return trimmed.charAt(0).toUpperCase();
}

function renderAgentAvatar(
  agent: GatewayAgentRow,
  agentIdentity: AgentIdentityResult | null,
  size: "sm" | "md" | "lg" = "md",
) {
  const hue = agentAvatarHue(agent.id);
  const emoji = resolveAgentEmoji(agent, agentIdentity);
  const cls = `agent-avatar agent-avatar--${size}`;
  return html`
    <span
      class=${cls}
      style="--avatar-hue: ${hue};"
      role="img"
      aria-label=${normalizeAgentLabel(agent)}
    >
      <span class="agent-avatar__glyph">${emoji || agentInitial(agent)}</span>
    </span>
  `;
}

function deriveAgentStatus(
  agentId: string,
  identity: AgentIdentityResult | null,
  jobs: CronJob[],
  defaultId: string | null,
): { tone: "ok" | "warn" | "off"; label: string } {
  // Backend doesn't expose a per-agent runtime state yet; use coarse cues:
  // default agent → "Running"; agent with cron jobs → "Idle"; else "Idle".
  if (defaultId && agentId === defaultId) {
    return { tone: "ok", label: "Running" };
  }
  if (jobs.some((j) => j.agentId === agentId)) {
    return { tone: "warn", label: "Idle" };
  }
  if (identity) {
    return { tone: "off", label: "Idle" };
  }
  return { tone: "off", label: "Idle" };
}

function shortDescription(
  agent: GatewayAgentRow,
  identity: AgentIdentityResult | null,
  configForm: Record<string, unknown> | null,
): string {
  type DescEntry = { id?: string; description?: string };
  type DescConfig = { agents?: { list?: DescEntry[] } };
  const cfg = (configForm ?? null) as DescConfig | null;
  const list = cfg?.agents?.list ?? [];
  const entry = list.find((row) => row?.id === agent.id);
  const fromConfig = entry?.description;
  if (typeof fromConfig === "string" && fromConfig.trim()) {
    return fromConfig.trim();
  }
  if (identity?.name && identity.name.trim()) {
    return identity.name.trim();
  }
  return normalizeAgentLabel(agent);
}

function renderAgentsList(
  props: AgentsProps,
  agents: GatewayAgentRow[],
  defaultId: string | null,
) {
  return html`
    <div class="agents-layout">
      <section class="agents-list-toolbar">
        <div class="agents-list-toolbar__copy">
          <h2 class="agents-list-toolbar__title">Your agents</h2>
          <div class="agents-list-toolbar__sub">
            ${agents.length} ${agents.length === 1 ? "agent" : "agents"} configured
          </div>
        </div>
        <div class="agents-list-toolbar__actions">
          <button
            class="btn btn--sm btn--ghost"
            ?disabled=${props.loading}
            @click=${() => props.onRefresh()}
          >
            ${props.loading ? t("common.loading") : t("common.refresh")}
          </button>
        </div>
      </section>
      ${props.error
        ? html`<div class="callout danger" style="margin-bottom: 12px;">${props.error}</div>`
        : nothing}
      <section class="agents-list-grid">
        ${agents.map((agent) => {
          const identity = props.agentIdentityById[agent.id] ?? null;
          const isDefault = defaultId === agent.id;
          const status = deriveAgentStatus(agent.id, identity, props.cron.jobs, defaultId);
          const modelLabel = resolveModelLabel(agent.model) || "—";
          const channelsCount = props.channels.snapshot
            ? Object.keys(props.channels.snapshot.channelAccounts ?? {}).length
            : null;
          const cronCount = props.cron.jobs.filter((j) => j.agentId === agent.id).length;
          const lastActive = t("common.na");
          const desc = shortDescription(agent, identity, props.config.form);
          return html`
            <button
              type="button"
              class="agent-card"
              @click=${() => props.onSelectAgent(agent.id)}
              aria-label=${`Open ${normalizeAgentLabel(agent)}`}
            >
              <div class="agent-card__head">
                ${renderAgentAvatar(agent, identity, "md")}
                <div class="agent-card__head-text">
                  <div class="agent-card__name-row">
                    <span class="agent-card__name">${normalizeAgentLabel(agent)}</span>
                    ${isDefault
                      ? html`<span class="agent-card__badge">DEFAULT</span>`
                      : nothing}
                  </div>
                  <div class="agent-card__status-row">
                    <span class="ov-status-dot ov-status-dot--${status.tone}"></span>
                    <span class="agent-card__status">${status.label}</span>
                    <span class="agent-card__sep">·</span>
                    <span class="agent-card__model mono">${modelLabel}</span>
                  </div>
                </div>
              </div>
              <p class="agent-card__desc">${desc}</p>
              <div class="agent-card__footer">
                <span class="agent-card__meta">
                  channels
                  <span class="agent-card__meta-value"
                    >${channelsCount == null ? "—" : channelsCount}</span
                  >
                </span>
                <span class="agent-card__meta">
                  cron <span class="agent-card__meta-value">${cronCount || "—"}</span>
                </span>
                <span class="agent-card__last">${lastActive}</span>
              </div>
            </button>
          `;
        })}
        <button class="agent-card agent-card--add" type="button" disabled title="Coming soon">
          <span class="agent-card__add-icon" aria-hidden="true">${icons.plus}</span>
          <span class="agent-card__add-label">Add agent</span>
        </button>
      </section>
    </div>
  `;
}

function renderAgentDetailHeader(
  props: AgentsProps,
  agent: GatewayAgentRow,
  defaultId: string | null,
) {
  const identity = props.agentIdentityById[agent.id] ?? null;
  const isDefault = defaultId === agent.id;
  const status = deriveAgentStatus(agent.id, identity, props.cron.jobs, defaultId);
  const modelLabel = resolveModelLabel(agent.model) || "—";
  const workspace = agent.workspace ?? "/workspace/main";
  const desc = shortDescription(agent, identity, props.config.form);
  // Pull a short list of tools from the agent's config entry when present.
  type AgentConfigEntry = {
    id?: string;
    tools?: { allow?: string[] };
  };
  type AgentsConfig = { agents?: { list?: AgentConfigEntry[] } };
  const cfg = (props.config.form ?? null) as AgentsConfig | null;
  const cfgEntry = cfg?.agents?.list?.find((row) => row?.id === agent.id);
  const cfgTools = Array.isArray(cfgEntry?.tools?.allow) ? cfgEntry.tools.allow : [];
  const tools = cfgTools.slice(0, 6);

  return html`
    <nav class="agents-detail-back">
      <button
        type="button"
        class="agents-detail-back__btn"
        @click=${() => props.onClearAgentSelection?.()}
      >
        <span class="agents-detail-back__chevron" aria-hidden="true">‹</span>
        <span>Your agents</span>
      </button>
      <span class="agents-detail-back__sep">›</span>
      <span class="agents-detail-back__current">${normalizeAgentLabel(agent)}</span>
    </nav>
    <section class="agents-detail-header">
      <div class="agents-detail-header__main">
        ${renderAgentAvatar(agent, identity, "lg")}
        <div class="agents-detail-header__copy">
          <div class="agents-detail-header__title-row">
            <h1 class="agents-detail-header__name">${normalizeAgentLabel(agent)}</h1>
            ${isDefault
              ? html`<span class="agent-card__badge">DEFAULT</span>`
              : nothing}
            <span class="agents-detail-header__status">
              <span class="ov-status-dot ov-status-dot--${status.tone}"></span>
              ${status.label}
            </span>
          </div>
          <p class="agents-detail-header__desc">${desc}</p>
          <div class="agents-detail-header__chips">
            <span class="agent-card__chip mono">${modelLabel}</span>
            <span class="agent-card__chip mono">${workspace}</span>
            ${tools.map(
              (toolName: string) =>
                html`<span class="agent-card__chip agent-card__chip--accent mono"
                  >${toolName}</span
                >`,
            )}
          </div>
        </div>
      </div>
      <div class="agents-detail-header__actions">
        <button
          type="button"
          class="btn btn--sm btn--ghost"
          @click=${() => void navigator.clipboard.writeText(agent.id)}
          title="Copy agent ID to clipboard"
        >
          Copy ID
        </button>
        <button
          type="button"
          class="btn btn--sm btn--ghost"
          ?disabled=${isDefault}
          @click=${() => props.onSetDefault(agent.id)}
          title=${isDefault ? "Already the default agent" : "Set as the default agent"}
        >
          ${isDefault ? "Default" : "Set Default"}
        </button>
      </div>
    </section>
    ${props.error
      ? html`<div class="callout danger" style="margin-bottom: 12px;">${props.error}</div>`
      : nothing}
  `;
}
