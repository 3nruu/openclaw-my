// Standalone gateway client — no imports from openclaw backend src/
// Constants and helpers are inlined from the backend protocol definitions.

// ── Inlined constants ──────────────────────────────────────────────────────

const CLIENT_ID = "openclaw-control-ui";
const CLIENT_MODE = "webchat";
const ROLE = "operator";
const SCOPES = [
  "operator.admin",
  "operator.read",
  "operator.write",
  "operator.approvals",
  "operator.pairing",
];

const ConnectErrorDetailCodes = {
  AUTH_TOKEN_MISSING: "AUTH_TOKEN_MISSING",
  AUTH_BOOTSTRAP_TOKEN_INVALID: "AUTH_BOOTSTRAP_TOKEN_INVALID",
  AUTH_PASSWORD_MISSING: "AUTH_PASSWORD_MISSING",
  AUTH_PASSWORD_MISMATCH: "AUTH_PASSWORD_MISMATCH",
  AUTH_RATE_LIMITED: "AUTH_RATE_LIMITED",
  PAIRING_REQUIRED: "PAIRING_REQUIRED",
  CONTROL_UI_DEVICE_IDENTITY_REQUIRED: "CONTROL_UI_DEVICE_IDENTITY_REQUIRED",
  DEVICE_IDENTITY_REQUIRED: "DEVICE_IDENTITY_REQUIRED",
  AUTH_TOKEN_MISMATCH: "AUTH_TOKEN_MISMATCH",
  AUTH_DEVICE_TOKEN_MISMATCH: "AUTH_DEVICE_TOKEN_MISMATCH",
} as const;

function buildDeviceAuthPayload(p: {
  deviceId: string;
  signedAtMs: number;
  token: string | null;
  nonce: string;
}): string {
  return [
    "v2", p.deviceId, CLIENT_ID, CLIENT_MODE, ROLE,
    SCOPES.join(","), String(p.signedAtMs), p.token ?? "", p.nonce,
  ].join("|");
}

function readConnectErrorDetailCode(details: unknown): string | null {
  if (!details || typeof details !== "object" || Array.isArray(details)) return null;
  const code = (details as { code?: unknown }).code;
  return typeof code === "string" && code.trim().length > 0 ? code : null;
}

function readConnectErrorRecoveryAdvice(details: unknown): {
  canRetryWithDeviceToken?: boolean;
  recommendedNextStep?: string;
} {
  if (!details || typeof details !== "object" || Array.isArray(details)) return {};
  const raw = details as Record<string, unknown>;
  return {
    canRetryWithDeviceToken: raw.canRetryWithDeviceToken === true,
    recommendedNextStep: typeof raw.recommendedNextStep === "string"
      ? raw.recommendedNextStep
      : undefined,
  };
}

// ── Types ──────────────────────────────────────────────────────────────────

export type GatewayEventFrame = {
  type: "event";
  event: string;
  payload?: unknown;
  seq?: number;
};

export type GatewayResponseFrame = {
  type: "res";
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: { code: string; message: string; details?: unknown; retryable?: boolean; retryAfterMs?: number };
};

export type GatewayErrorInfo = {
  code: string;
  message: string;
  details?: unknown;
  retryable?: boolean;
  retryAfterMs?: number;
};

export type GatewayHelloOk = {
  type: "hello-ok";
  protocol: number;
  server?: { version?: string; connId?: string };
  auth?: { deviceToken?: string; role?: string; scopes?: string[]; issuedAtMs?: number };
  canvasHostUrl?: string;
};

export class GatewayRequestError extends Error {
  readonly gatewayCode: string;
  readonly details?: unknown;
  readonly retryable: boolean;
  readonly retryAfterMs?: number;

  constructor(err: GatewayErrorInfo) {
    super(err.message);
    this.name = "GatewayRequestError";
    this.gatewayCode = err.code;
    this.details = err.details;
    this.retryable = err.retryable === true;
    this.retryAfterMs = err.retryAfterMs;
  }
}

export function resolveGatewayErrorDetailCode(error: { details?: unknown } | null | undefined): string | null {
  return readConnectErrorDetailCode(error?.details);
}

export function isNonRecoverableAuthError(error: GatewayErrorInfo | undefined): boolean {
  if (!error) return false;
  const code = resolveGatewayErrorDetailCode(error);
  return (
    code === ConnectErrorDetailCodes.AUTH_TOKEN_MISSING ||
    code === ConnectErrorDetailCodes.AUTH_BOOTSTRAP_TOKEN_INVALID ||
    code === ConnectErrorDetailCodes.AUTH_PASSWORD_MISSING ||
    code === ConnectErrorDetailCodes.AUTH_PASSWORD_MISMATCH ||
    code === ConnectErrorDetailCodes.AUTH_RATE_LIMITED ||
    code === ConnectErrorDetailCodes.PAIRING_REQUIRED ||
    code === ConnectErrorDetailCodes.CONTROL_UI_DEVICE_IDENTITY_REQUIRED ||
    code === ConnectErrorDetailCodes.DEVICE_IDENTITY_REQUIRED
  );
}

function isTrustedEndpoint(url: string): boolean {
  try {
    const u = new URL(url, window.location.href);
    const h = u.hostname.toLowerCase().trim();
    if (h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "[::1]" || h.startsWith("127.")) return true;
    return u.host === new URL(window.location.href).host;
  } catch {
    return false;
  }
}

// ── Device auth token store ─────────────────────────────────────────────────

const DEVICE_AUTH_KEY = "openclaw.device.auth.v1";

type DeviceAuthStore = {
  version: 1;
  deviceId: string;
  tokens: Record<string, { token: string; scopes: string[]; issuedAt?: number } | undefined>;
};

function readDeviceAuthStore(): DeviceAuthStore | null {
  try {
    const raw = localStorage.getItem(DEVICE_AUTH_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as DeviceAuthStore;
    if (!p || p.version !== 1 || typeof p.deviceId !== "string" || typeof p.tokens !== "object") return null;
    return p;
  } catch { return null; }
}

function writeDeviceAuthStore(store: DeviceAuthStore) {
  try { localStorage.setItem(DEVICE_AUTH_KEY, JSON.stringify(store)); } catch { /* best-effort */ }
}

export function loadDeviceAuthToken(deviceId: string): string | null {
  const store = readDeviceAuthStore();
  if (!store || store.deviceId !== deviceId) return null;
  return store.tokens[ROLE]?.token ?? null;
}

export function storeDeviceAuthToken(deviceId: string, token: string, scopes: string[]) {
  const store = readDeviceAuthStore() ?? { version: 1 as const, deviceId, tokens: {} };
  store.tokens[ROLE] = { token, scopes, issuedAt: Date.now() };
  writeDeviceAuthStore(store);
}

export function clearDeviceAuthToken(deviceId: string) {
  const store = readDeviceAuthStore();
  if (!store || store.deviceId !== deviceId) return;
  delete store.tokens[ROLE];
  writeDeviceAuthStore(store);
}

// ── Gateway Browser Client ─────────────────────────────────────────────────

type Pending = { resolve: (v: unknown) => void; reject: (e: unknown) => void };

export type GatewayBrowserClientOptions = {
  url: string;
  token?: string;
  password?: string;
  instanceId?: string;
  onHello?: (hello: GatewayHelloOk) => void;
  onEvent?: (evt: GatewayEventFrame) => void;
  onClose?: (info: { code: number; reason: string; error?: GatewayErrorInfo }) => void;
};

const CONNECT_FAILED_CLOSE_CODE = 4008;

export class GatewayBrowserClient {
  private ws: WebSocket | null = null;
  private pending = new Map<string, Pending>();
  private closed = false;

  private connectNonce: string | null = null;
  private connectSent = false;
  private connectTimer: number | null = null;
  private backoffMs = 800;
  private pendingConnectError: GatewayErrorInfo | undefined;
  private pendingDeviceTokenRetry = false;
  private deviceTokenRetryBudgetUsed = false;

  constructor(private opts: GatewayBrowserClientOptions) {}

  start() {
    this.closed = false;
    this.connect();
  }

  stop() {
    this.closed = true;
    this.clearConnectTimer();
    this.ws?.close();
    this.ws = null;
    this.flushPending(new Error("gateway stopped"));
  }

  get connected() {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  private connect() {
    if (this.closed) return;
    this.ws = new WebSocket(this.opts.url);
    this.ws.addEventListener("open", () => this.queueConnect());
    this.ws.addEventListener("message", (ev) => this.handleMessage(String(ev.data ?? "")));
    this.ws.addEventListener("close", (ev) => {
      const reason = ev.reason ?? "";
      const connectError = this.pendingConnectError;
      this.pendingConnectError = undefined;
      this.ws = null;
      this.flushPending(new Error(`gateway closed (${ev.code}): ${reason}`));
      this.opts.onClose?.({ code: ev.code, reason, error: connectError });
      const code = resolveGatewayErrorDetailCode(connectError);
      if (code === ConnectErrorDetailCodes.AUTH_TOKEN_MISMATCH && this.deviceTokenRetryBudgetUsed && !this.pendingDeviceTokenRetry) return;
      if (!isNonRecoverableAuthError(connectError)) this.scheduleReconnect();
    });
    this.ws.addEventListener("error", () => { /* close fires */ });
  }

  private scheduleReconnect() {
    if (this.closed) return;
    const delay = this.backoffMs;
    this.backoffMs = Math.min(this.backoffMs * 1.7, 15_000);
    this.clearConnectTimer();
    this.connectTimer = window.setTimeout(() => {
      this.connectTimer = null;
      this.connect();
    }, delay);
  }

  private flushPending(err: Error) {
    for (const [, p] of this.pending) p.reject(err);
    this.pending.clear();
  }

  private async sendConnect() {
    if (this.connectSent) return;
    this.connectSent = true;
    this.clearConnectTimer();

    const isSecure = typeof crypto !== "undefined" && !!crypto.subtle;
    let device: { id: string; publicKey: string; signature: string; signedAt: number; nonce: string } | undefined;
    let authDeviceToken: string | undefined;
    let deviceId = "";

    if (isSecure) {
      const { loadOrCreateDeviceIdentity, signDevicePayload } = await import("./device-identity.ts");
      const identity = await loadOrCreateDeviceIdentity();
      deviceId = identity.deviceId;

      const storedToken = loadDeviceAuthToken(deviceId);
      const explicitToken = this.opts.token?.trim();

      if (this.pendingDeviceTokenRetry && explicitToken && storedToken && isTrustedEndpoint(this.opts.url)) {
        authDeviceToken = storedToken;
        this.pendingDeviceTokenRetry = false;
      }

      const nonce = this.connectNonce ?? "";
      const signedAtMs = Date.now();
      const payload = buildDeviceAuthPayload({
        deviceId, signedAtMs,
        token: explicitToken ?? null,
        nonce,
      });
      const signature = await signDevicePayload(identity.privateKey, payload);
      device = { id: identity.deviceId, publicKey: identity.publicKey, signature, signedAt: signedAtMs, nonce };
    }

    const explicitToken = this.opts.token?.trim();
    const explicitPassword = this.opts.password?.trim();

    const connectParams = {
      minProtocol: 3, maxProtocol: 3,
      client: { id: CLIENT_ID, version: "chat-ui", platform: "web", mode: CLIENT_MODE },
      role: ROLE,
      scopes: SCOPES,
      caps: ["tool-events"],
      userAgent: navigator.userAgent,
      locale: navigator.language,
      device,
      auth: (explicitToken || explicitPassword || authDeviceToken)
        ? { token: explicitToken, password: explicitPassword, deviceToken: authDeviceToken }
        : undefined,
    };

    void this.request<GatewayHelloOk>("connect", connectParams)
      .then((hello) => {
        this.pendingDeviceTokenRetry = false;
        this.deviceTokenRetryBudgetUsed = false;
        if (hello?.auth?.deviceToken && deviceId) {
          storeDeviceAuthToken(deviceId, hello.auth.deviceToken, hello.auth.scopes ?? []);
        }
        this.backoffMs = 800;
        this.opts.onHello?.(hello);
      })
      .catch((err: unknown) => {
        const connectErrorCode = err instanceof GatewayRequestError ? resolveGatewayErrorDetailCode(err) : null;
        const advice = err instanceof GatewayRequestError ? readConnectErrorRecoveryAdvice(err.details) : {};
        const canRetry = advice.canRetryWithDeviceToken === true || advice.recommendedNextStep === "retry_with_device_token" || connectErrorCode === ConnectErrorDetailCodes.AUTH_TOKEN_MISMATCH;

        if (!this.deviceTokenRetryBudgetUsed && Boolean(explicitToken) && deviceId && loadDeviceAuthToken(deviceId) && canRetry && isTrustedEndpoint(this.opts.url)) {
          this.pendingDeviceTokenRetry = true;
          this.deviceTokenRetryBudgetUsed = true;
        }

        if (connectErrorCode === ConnectErrorDetailCodes.AUTH_DEVICE_TOKEN_MISMATCH && deviceId) {
          clearDeviceAuthToken(deviceId);
        }

        if (err instanceof GatewayRequestError) {
          this.pendingConnectError = { code: err.gatewayCode, message: err.message, details: err.details, retryable: err.retryable, retryAfterMs: err.retryAfterMs };
        }
        this.ws?.close(CONNECT_FAILED_CLOSE_CODE, "connect failed");
      });
  }

  private handleMessage(raw: string) {
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { return; }

    const frame = parsed as { type?: unknown };

    if (frame.type === "event") {
      const evt = parsed as GatewayEventFrame;
      if (evt.event === "connect.challenge") {
        const nonce = (evt.payload as { nonce?: string } | undefined)?.nonce ?? null;
        if (nonce) { this.connectNonce = nonce; void this.sendConnect(); }
        return;
      }
      void evt.seq;
      try { this.opts.onEvent?.(evt); } catch (e) { console.error("[gateway] event error:", e); }
      return;
    }

    if (frame.type === "res") {
      const res = parsed as GatewayResponseFrame;
      const p = this.pending.get(res.id);
      if (!p) return;
      this.pending.delete(res.id);
      if (res.ok) { p.resolve(res.payload); }
      else { p.reject(new GatewayRequestError({ code: res.error?.code ?? "UNAVAILABLE", message: res.error?.message ?? "request failed", details: res.error?.details, retryable: res.error?.retryable, retryAfterMs: res.error?.retryAfterMs })); }
    }
  }

  request<T = unknown>(method: string, params?: unknown): Promise<T> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("gateway not connected"));
    }
    const id = crypto.randomUUID();
    const frame = { type: "req", id, method, params };
    const p = new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: (v) => resolve(v as T), reject });
    });
    this.ws.send(JSON.stringify(frame));
    return p;
  }

  private queueConnect() {
    this.connectNonce = null;
    this.connectSent = false;
    this.clearConnectTimer();
    this.connectTimer = window.setTimeout(() => { this.connectTimer = null; void this.sendConnect(); }, 750);
  }

  private clearConnectTimer() {
    if (this.connectTimer !== null) { window.clearTimeout(this.connectTimer); this.connectTimer = null; }
  }
}

async function buildConnectDevice(_opts: unknown): Promise<undefined> { return undefined; }
void buildConnectDevice;
