/**
 * MANUAL COPY of project-otto portal/src/types/workflowDefinition.ts.
 *
 * The portal repo is the source of truth. When the portal schema changes,
 * copy the file here verbatim (keeping this header) until a shared package
 * exists. Drift between the two files means CI here validates a different
 * format than the portal actually reads.
 */
import { z } from 'zod';

/**
 * Position schema for workflow elements on the canvas
 */
export const PositionSchema = z.object({
  x: z.number(),
  y: z.number(),
});

export type Position = z.infer<typeof PositionSchema>;

/**
 * Metadata schema for operations (triggers and actions)
 * Position data is stored here to be compatible with backend
 */
export const OperationMetadataSchema = z.object({
  position: PositionSchema.optional(),
  /**
   * Custom positions for agent-tool nodes (relative to the parent agent),
   * keyed by tool name. Persisted so manual drags survive re-layout.
   */
  toolNodePositions: z.record(z.string(), PositionSchema).optional(),
  /**
   * Marks a top-level action as free-floating (not connected to the trigger).
   * Mirrored from `action.detached` on serialize and lifted back on load so
   * the disconnected state survives a save/reload — see `workflowSerializer`
   * and `normalizeAction` in `workflowStore`.
   */
  detached: z.boolean().optional(),
}).passthrough(); // Allow additional metadata fields

export type OperationMetadata = z.infer<typeof OperationMetadataSchema>;

/**
 * RunAfter schema defines dependencies between actions
 * Maps action names to arrays of statuses (e.g., "Succeeded", "Failed", "Skipped")
 */
export const RunAfterSchema = z.record(z.string(), z.array(z.string()));

export type RunAfter = z.infer<typeof RunAfterSchema>;

/**
 * Limit schema for action execution limits (timeout, iteration count)
 * Used by Agent actions and loop actions (Until, Foreach)
 */
export const LimitSchema = z.object({
  /** Maximum number of iterations (for loops/agents) */
  count: z.union([z.number(), z.string()]).optional(),
  /** Maximum execution time in ISO 8601 duration format (e.g., "PT1H", "P1D") */
  timeout: z.string().optional(),
});

export type Limit = z.infer<typeof LimitSchema>;

/**
 * Recurrence schema for polling triggers
 */
export const RecurrenceSchema = z.object({
  frequency: z.string(),
  interval: z.number(),
  startTime: z.string().optional(),
  timeZone: z.string().optional(),
});

/**
 * Trigger schema for workflow triggers
 * Note: inputs can be an object OR a string/primitive for expression-based triggers
 * Uses .passthrough() to preserve unknown fields (e.g., position) from backend
 */
export const TriggerSchema = z.object({
  type: z.string(),
  kind: z.string().optional(),
  inputs: z.union([z.record(z.unknown()), z.string(), z.number(), z.boolean(), z.array(z.unknown())]).nullish(),
  metadata: OperationMetadataSchema.optional(),
  /** SplitOn expression for batch triggers (e.g., ApiConnectionNotification) */
  splitOn: z.string().optional(),
  /** Recurrence configuration for polling triggers */
  recurrence: RecurrenceSchema.optional(),
}).passthrough();

export type Trigger = z.infer<typeof TriggerSchema>;

/**
 * Base action schema with common fields
 * Note: inputs can be an object OR a string/primitive (e.g., Compose action uses "@expression" syntax)
 */
export const BaseActionSchema = z.object({
  type: z.string(),
  inputs: z.union([z.record(z.unknown()), z.string(), z.number(), z.boolean(), z.array(z.unknown())]).nullish(),
  runAfter: RunAfterSchema.optional(),
  metadata: OperationMetadataSchema.optional(),
  trackedProperties: z.record(z.unknown()).optional(),
  detached: z.boolean().optional(),
  /** Execution limits (timeout, iteration count) for Agent actions */
  limit: LimitSchema.optional(),
});

export type BaseAction = z.infer<typeof BaseActionSchema>;

/**
 * Generic action schema for standard actions.
 * Uses .passthrough() to preserve unknown fields when a specific schema
 * (If/Switch/Foreach/Until) fails validation and falls through to this fallback.
 * Without passthrough, Zod's default "strip" mode silently drops fields like
 * 'cases', 'expression', 'foreach', 'actions', 'else', 'default' — causing
 * data loss for scope actions that don't match their specific schema exactly.
 */
export const GenericActionSchema = BaseActionSchema.extend({
  kind: z.string().optional(),
}).passthrough();

export type GenericAction = z.infer<typeof GenericActionSchema>;

/**
 * Forward declarations and lazy schema for recursive types
 */
const ActionsSchema: z.ZodType = z.lazy(() => z.record(z.string(), ActionSchema));

/**
 * Expression can be either a string (e.g., "@equals(1,1)") or an object (e.g., { and: [...] })
 */
const ExpressionSchema = z.union([z.string(), z.record(z.unknown())]);

/**
 * If action schema for conditional logic
 */
const IfActionSchemaBase: z.ZodType = BaseActionSchema.extend({
  type: z.literal('If'),
  expression: ExpressionSchema.optional(),
  actions: ActionsSchema.optional(),
  else: z
    .object({
      actions: ActionsSchema.optional(),
    })
    .optional(),
});

export const IfActionSchema: z.ZodType = IfActionSchemaBase;

export type IfAction = z.infer<typeof IfActionSchemaBase>;

/**
 * Switch case schema
 */
const SwitchCaseSchema: z.ZodType = z.lazy(() =>
  z.object({
    case: z.union([z.string(), z.number()]),
    actions: ActionsSchema.optional(),
  })
);

/**
 * Switch action schema for multi-branch logic
 */
const SwitchActionSchemaBase: z.ZodType = BaseActionSchema.extend({
  type: z.literal('Switch'),
  expression: ExpressionSchema.optional(),
  cases: z.record(z.string(), SwitchCaseSchema),
  default: z
    .object({
      actions: ActionsSchema.optional(),
    })
    .optional(),
});

export const SwitchActionSchema: z.ZodType = SwitchActionSchemaBase;

export type SwitchAction = z.infer<typeof SwitchActionSchemaBase>;

/**
 * Foreach action schema for loops.
 * Logic Apps Standard supports multiple child actions inside ForEach.
 */
const ForeachActionSchemaBase: z.ZodType = BaseActionSchema.extend({
  type: z.literal('Foreach'),
  foreach: z.string(),
  actions: ActionsSchema,
});

export const ForeachActionSchema: z.ZodType = ForeachActionSchemaBase;

export type ForeachAction = z.infer<typeof ForeachActionSchemaBase>;

/**
 * Until (Do-Until) action schema for loop-until-condition
 */
const UntilActionSchemaBase: z.ZodType = BaseActionSchema.extend({
  type: z.literal('Until'),
  expression: z.string().optional(),
  actions: ActionsSchema,
  limit: z
    .object({
      count: z.number().optional(),
      timeout: z.string().optional(),
    })
    .optional(),
});

export const UntilActionSchema: z.ZodType = UntilActionSchemaBase;

export type UntilAction = z.infer<typeof UntilActionSchemaBase>;

/**
 * Agent tool schema - represents a tool/skill available to an agent.
 *
 * MCP tools follow the Logic Apps Standard runtime contract:
 *   {
 *     type: 'McpClientTool',
 *     kind: 'Builtin' | 'Managed',
 *     inputs: {
 *       connectionReference: { connectionName: <connections.json key> },
 *       parameters: { toolName, mcpServerPath?, ...userParams }
 *     }
 *   }
 *
 * For non-MCP tools (workflow, subworkflow), the `type` field is the loose
 * legacy string ('workflow', 'subworkflow', undefined) and `inputs` is absent.
 *
 * This is the single canonical schema — it MUST be the one referenced by the
 * action union below, otherwise `WorkflowDefinitionSchema.safeParse` will
 * silently strip `kind` and `inputs` when loading a workflow from disk.
 */
export const AgentToolSchema: z.ZodType = z.lazy(() =>
  z.object({
    actions: ActionsSchema.optional(),
    description: z.string().optional(),
    type: z.string().optional(),
    kind: z.string().optional(),
    inputs: z
      .object({
        connectionReference: z
          .object({
            connectionName: z.string(),
          })
          .passthrough()
          .optional(),
        parameters: z.record(z.string(), z.unknown()).optional(),
      })
      .passthrough()
      .optional(),
    agentParameterSchema: z.record(z.unknown()).nullish(),
  })
  .passthrough()
);

/**
 * Agent action schema for AI agent nodes (forward declaration before ActionSchema)
 */
const AgentActionSchemaForUnion = BaseActionSchema.extend({
  type: z.literal('Agent'),
  kind: z.string().optional(),
  tools: z.record(z.string(), AgentToolSchema).optional(),
});

/**
 * Union of all action types
 */
export const ActionSchema: z.ZodType = z.lazy(() =>
  z.union([IfActionSchema, SwitchActionSchema, ForeachActionSchema, UntilActionSchema, AgentActionSchemaForUnion, GenericActionSchema])
);

export type Action = z.infer<typeof ActionSchema>;

/**
 * Workflow definition schema
 */
export const DefinitionSchema = z.object({
  $schema: z.string().optional(),
  triggers: z.record(z.string(), TriggerSchema),
  actions: z.record(z.string(), ActionSchema),
  contentVersion: z.string(),
  outputs: z.record(z.unknown()).optional(),
  parameters: z.record(z.unknown()).optional(),
});

export type Definition = z.infer<typeof DefinitionSchema>;

/**
 * Complete workflow definition schema
 */
export const WorkflowDefinitionSchema = z.object({
  definition: DefinitionSchema,
  kind: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  notes: z.record(z.string(), z.object({
    content: z.string(),
    color: z.string(),
    metadata: z.object({
      position: PositionSchema,
      width: z.number(),
      height: z.number(),
    }),
  })).optional(),
});

export type WorkflowDefinition = z.infer<typeof WorkflowDefinitionSchema>;

/**
 * Type guard for If actions
 */
export const isIfAction = (action: Action): action is IfAction => {
  return action.type === 'If';
};

/**
 * Type guard for Switch actions
 */
export const isSwitchAction = (action: Action): action is SwitchAction => {
  return action.type === 'Switch';
};

/**
 * Type guard for Foreach actions
 */
export const isForeachAction = (action: Action): action is ForeachAction => {
  return action.type === 'Foreach';
};

/**
 * Type guard for Until actions
 */
export const isUntilAction = (action: Action): action is UntilAction => {
  return action.type === 'Until';
};

export type AgentTool = {
  actions?: Record<string, Action>;
  description?: string;
  /**
   * Tool type discriminator.
   *  - `'McpClientTool'` — MCP tool (runtime contract; see file header)
   *  - `'workflow'` — action-based tool (default; inner actions in `actions`)
   *  - `'subworkflow'` — handoff to another agent's workflow
   */
  type?: string;
  /** MCP-only. `'Builtin'` for BYO (mcpclient), `'Managed'` for managed APIs. */
  kind?: 'Builtin' | 'Managed' | string;
  /**
   * MCP-only. Mirrors the runtime's tool inputs.
   * - `connectionReference.connectionName` keys into
   *   `connections.json.agentMcpConnections` (Builtin) or the managed-API
   *   connection map (Managed).
   * - `parameters.toolName` is the MCP-exposed tool name.
   * - `parameters.mcpServerPath` is required for Managed (swagger path).
   * - Additional `parameters.*` carry user-supplied tool inputs.
   */
  inputs?: {
    connectionReference?: {
      connectionName: string;
      [k: string]: unknown;
    };
    parameters?: Record<string, unknown>;
    [k: string]: unknown;
  };
  agentParameterSchema?: Record<string, unknown> | null;
  /** Subworkflow reference (for type='subworkflow' tools - handoffs to other agents) */
  subworkflow?: {
    workflowName: string;
  };
};

/**
 * Knowledge source type discriminator
 */
export type KnowledgeSourceType = 'DocumentUpload' | 'FoundryIQ' | 'AzureAISearch' | 'WorkIQ';

/**
 * Retrieval settings for a knowledge base attached to an agent action
 */
export interface KnowledgeBaseRetrievalSettings {
  topK?: number;
  scoreThreshold?: number;
  retrievalReasoningEffort?: 'minimal' | 'low' | 'medium';
}

/**
 * A knowledge base reference attached to an agent action
 */
export interface KnowledgeBaseReference {
  knowledgeHubName: string;
  sourceType: KnowledgeSourceType;
  retrievalSettings?: KnowledgeBaseRetrievalSettings;
}

/**
 * Agent action schema for AI agent nodes
 */
const AgentActionSchemaBase = BaseActionSchema.extend({
  type: z.literal('Agent'),
  kind: z.string().optional(),
  tools: z.record(z.string(), AgentToolSchema).optional(),
});

export const AgentActionSchema: z.ZodType = AgentActionSchemaBase;

export type AgentAction = BaseAction & {
  type: 'Agent';
  kind?: string;
  tools?: Record<string, AgentTool>;
};

/**
 * Type guard for Agent actions
 */
export const isAgentAction = (action: Action): action is AgentAction => {
  return action.type === 'Agent';
};

/**
 * MCP-tool runtime contract uses `type: 'McpClientTool'`. This is the only
 * tool kind whose payload follows the MCP runtime shape (connectionReference +
 * inputs.parameters.allowedTools).
 */
export const isMcpAgentTool = (tool: AgentTool | undefined | null): boolean => {
  return tool?.type === 'McpClientTool';
};

/**
 * True when `value` is one of the Foundry Agent model-type identifiers
 * (`'FoundryAgentService'` or `'FoundryAgentServiceV2'`). Useful as a
 * single source of truth for the string-level check that distinguishes
 * Foundry agents from native (Azure OpenAI / OpenAI) agents.
 */
export const isFoundryAgentModelType = (value: unknown): boolean =>
  value === 'FoundryAgentService' || value === 'FoundryAgentServiceV2';

/**
 * True when `value` looks like a Coding Agent harness identifier (today
 * only `'GHCP'`). Any non-empty string is treated as a coding harness so
 * future harness types light up the coding-agent UI without a code change.
 */
export const isCodingAgentHarnessType = (value: unknown): boolean =>
  typeof value === 'string' && value.length > 0;

/**
 * Type guard for Foundry Agent actions (agentModelType === 'FoundryAgentService' or 'FoundryAgentServiceV2')
 */
export const isFoundryAgentAction = (action: Action): action is AgentAction => {
  if (!isAgentAction(action)) return false;
  const inputs = action.inputs;
  if (!inputs || typeof inputs !== 'object' || Array.isArray(inputs)) return false;
  // Check top-level agentModelType (set at creation time via defaultInputs)
  if (isFoundryAgentModelType((inputs as Record<string, unknown>).agentModelType)) return true;
  // Check nested parameters.agentModelType (after serialization/save)
  const params = (inputs as Record<string, unknown>).parameters;
  if (params && typeof params === 'object' && !Array.isArray(params)) {
    return isFoundryAgentModelType((params as Record<string, unknown>).agentModelType);
  }
  return false;
};

/**
 * Type guard for Coding Agent actions — an Agent whose `agentModelSettings`
 * carries an `agentHarness.type` (today only `'GHCP'`). Detection mirrors
 * `isFoundryAgentAction`: the harness object may sit either at the top level
 * (legacy/in-flight creation) or, post-serialization, under `parameters`.
 */
export const isCodingAgentAction = (action: Action): action is AgentAction => {
  if (!isAgentAction(action)) return false;
  const inputs = action.inputs;
  if (!inputs || typeof inputs !== 'object' || Array.isArray(inputs)) return false;
  const readHarnessType = (settingsHost: unknown): unknown => {
    if (!settingsHost || typeof settingsHost !== 'object' || Array.isArray(settingsHost)) {
      return undefined;
    }
    const settings = (settingsHost as Record<string, unknown>).agentModelSettings;
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return undefined;
    const harness = (settings as Record<string, unknown>).agentHarness;
    if (!harness || typeof harness !== 'object' || Array.isArray(harness)) return undefined;
    return (harness as Record<string, unknown>).type;
  };
  if (isCodingAgentHarnessType(readHarnessType(inputs))) return true;
  const params = (inputs as Record<string, unknown>).parameters;
  return isCodingAgentHarnessType(readHarnessType(params));
};
