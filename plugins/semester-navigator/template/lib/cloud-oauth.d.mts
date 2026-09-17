export const OAUTH_SCOPES: readonly ['semester:read', 'semester:write'];
export const OAUTH_ABUSE_LIMITS: Readonly<{
  registrationWindowSeconds: number; registrationAttemptsPerNetwork: number; registrationAttemptsGlobal: number;
  /** Anonymous registrations expire unless authenticated consent promotes them. */
  pendingClientTtlSeconds: number;
  tokenWindowSeconds: number; tokenAttemptsPerNetwork: number; tokenAttemptsGlobal: number; cleanupBatchSize: number;
}>;
export interface OAuthRecord { kind: string; key: string; value: string; expiresAt: number | null; }
export interface OAuthStore {
  put(record: OAuthRecord): Promise<void>;
  get(kind: string, key: string): Promise<OAuthRecord | null>;
  /** Must atomically delete only the exact stored value; return whether deleted. */
  consume(kind: string, key: string, expectedValue: string): Promise<boolean>;
  delete(kind: string, key: string): Promise<void>;
  /** Atomically reserve one slot only if the durable count is below limit. */
  takeLimit(input: { key: string; limit: number; expiresAt: number | null }): Promise<boolean>;
  /** Delete at most limit expired records/counters per table. Never null expiries. */
  cleanupExpired(now: number, limit: number): Promise<void>;
}
export type OAuthIdentity = { ok: true; userId: string; clientId: string; scopes: string[] } | { ok: false; response: Response; challenge: string };
export interface OAuthService {
  resourceMetadata(request: Request): Promise<Response>;
  authorizationMetadata(request: Request): Promise<Response>;
  register(request: Request): Promise<Response>;
  /** userId must be supplied by the host's verified browser session. */
  authorize(request: Request, identity?: { userId?: string }): Promise<Response>;
  token(request: Request): Promise<Response>;
  revoke(request: Request): Promise<Response>;
  authenticate(request: Request, requiredScopes?: string[]): Promise<OAuthIdentity>;
  challenge(requiredScopes?: string[], error?: string): string;
}
export function createOAuthService(options: {
  origin: string;
  store: OAuthStore;
  /** Unix seconds, not JavaScript milliseconds. */
  clock?: () => number;
  /** Must return cryptographically secure bytes; injection is for tests. */
  random?: (size: number) => Uint8Array;
  /** Trusted edge identifier only. Omission uses a bounded shared bucket. No raw identifier is persisted. */
  trustedNetworkId?: string;
  abuseLimits?: Partial<typeof OAUTH_ABUSE_LIMITS>;
}): OAuthService;
