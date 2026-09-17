import type { Plan } from './plan-model.mjs';

export type CloudPrincipal = { userId: string; scopes: string[] };
export type CloudPlanEnvelope = { plan: Plan; revision: number };
export type CloudPlanIntake = Pick<Plan, 'name' | 'school' | 'semester' | 'educationLevel' | 'timezone'>;
export type CloudPlanSummary = Pick<Plan, 'profileId' | 'name' | 'school' | 'semester' | 'timezone' | 'revision'>;
/** Implementations must scope every operation by userId and atomically compare baseRevision before writing. */
export type CloudPlanRepository = {
  listPlans(userId: string): Promise<CloudPlanSummary[]>;
  createPlan(userId: string, intake: CloudPlanIntake): Promise<CloudPlanEnvelope>;
  /** Atomically insert only, preserve profileId, start cloud revision 1, and reject an existing owner/profile row. */
  importPlan(userId: string, plan: Plan): Promise<CloudPlanEnvelope>;
  getPlan(userId: string, profileId: string): Promise<CloudPlanEnvelope | null>;
  savePlan(userId: string, profileId: string, input: { plan: Plan; baseRevision: number }): Promise<CloudPlanEnvelope>;
};
export const MCP_PROTOCOL_VERSIONS: readonly string[];
export const MAX_MCP_BODY_BYTES: number;
export const CLOUD_SKILL_URI: string;
export const CLOUD_SKILL_TEXT: string;
export const CLOUD_TOOLS: Array<{
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  securitySchemes: Array<{ type: 'oauth2'; scopes: string[] }>;
  annotations: { readOnlyHint: boolean; destructiveHint: boolean; openWorldHint: boolean; idempotentHint: boolean };
  _meta: Record<string, unknown>;
}>;
/** The route verifies the token's signature, issuer, audience and expiry before supplying principal. */
export function handleCloudMcp(request: Request, context: {
  principal: CloudPrincipal | null;
  repository: CloudPlanRepository;
  origin: string;
}): Promise<Response>;
