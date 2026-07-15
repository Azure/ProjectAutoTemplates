/**
 * MANUAL COPY of project-otto portal/src/types/template.ts.
 *
 * The portal repo is the source of truth. When the portal schema changes,
 * copy the file here (keeping this header and the adjusted
 * ./workflowDefinition import) until a shared package exists. Drift between
 * the two files means CI here validates a different format than the portal
 * actually reads.
 */
/**
 * Template Format Types
 *
 * Defines the canonical manifest.json file format — a self-contained bundle
 * that includes a workflow definition, mock data, trigger sample data, and
 * connections in a single file.
 *
 * This is the *file-format* type. Runtime state shapes live in
 * `templateMode.ts`. An adapter layer in `data/templates/templateAdapter.ts`
 * converts Template → TemplateDefinition + TemplateExtras.
 */

import { z } from 'zod';
import { WorkflowDefinitionSchema } from './workflowDefinition';

// =============================================================================
// SCHEMAS
// =============================================================================

const templateMetadataSchema = z.object({
  /** Stable, URL-safe identifier (e.g. "tool-call-uri-http"). */
  id: z.string().min(1),
  /** Human-readable template name. */
  name: z.string().min(1),
  /** One-to-two sentence description. */
  description: z.string().min(1),
  /**
   * One or more free-form category strings (mapped to `TemplateCategory[]`
   * by the adapter). Accepts a bare string for back-compat with templates
   * authored before multi-category support — normalized to a non-empty
   * array at parse time.
   */
  category: z
    .union([z.string().min(1), z.array(z.string().min(1)).min(1)])
    .transform((v) => (Array.isArray(v) ? v : [v])),
  /** Search / filter tags. */
  tags: z.array(z.string().min(1)).default([]),
  /** Author or organisation. */
  author: z.string().min(1),
  /** Provenance label (e.g. "builtin", "community"). */
  source: z.string().min(1),
});

const templateTriggerSchema = z.object({
  /** Trigger action name (must match a key in workflow.triggers). */
  name: z.string().min(1),
  /** Sample outputs used to pre-fill the Test Draft editor. */
  outputs: z.object({
    method: z.string().min(1),
    headers: z.record(z.string(), z.unknown()),
    queries: z.record(z.string(), z.unknown()),
    body: z.unknown().optional(),
  }),
});

// Per-action mock entry. Two valid shapes:
//   • `{ runForReal: true }` — explicit opt-out; the runtime executes the
//     action live and no canned output is needed.
//   • `{ status, outputs }` (with `runForReal` absent or false) — the runtime
//     uses the canned output instead of executing the action.
const templateMockOutputSchema = z.union([
  z.object({
    runForReal: z.literal(true),
  }),
  z.object({
    runForReal: z.literal(false).optional(),
    /** Mock run status. */
    status: z.enum(['Succeeded', 'Failed']),
    outputs: z.object({
      statusCode: z.string().min(1),
      body: z.unknown().optional(),
      headers: z.record(z.string(), z.unknown()).optional(),
    }),
  }),
]);

const templateConnectionSchema = z.object({
  /** Connection type: 'shared' for managed APIs, 'inapp' for built-in connectors, 'agent' for agent connections */
  connectorType: z.enum(['shared', 'inapp', 'agent']),
  /** API identifier path, e.g. '/managedApis/sql' or '/serviceProviders/AzureBlob' */
  apiId: z.string().min(1),
});

export const templateSchema = z.object({
  $schema: z.string().optional(),
  kind: z.literal('OttoTemplate'),
  apiVersion: z.literal('v1'),

  metadata: templateMetadataSchema,
  workflow: WorkflowDefinitionSchema,
  trigger: templateTriggerSchema,
  mocks: z.record(z.string(), templateMockOutputSchema).default({}),
  // Sticky-note metadata copied from `notes.json` / `notes-draft.json` so
  // templates round-trip the canvas annotations alongside mocks. Shape mirrors
  // `WorkflowDefinitionSchema.notes` (per-note id → { content, color, metadata }).
  notes: WorkflowDefinitionSchema.shape.notes,
  connections: z.record(
    z.string().regex(/^\S*_#workflowname#$/, {
      message: 'connections key must end with _#workflowname#',
    }),
    templateConnectionSchema,
  ).default({}),
});

// =============================================================================
// TYPES
// =============================================================================

export type Template = z.infer<typeof templateSchema>;
export type TemplateMetadata = z.infer<typeof templateMetadataSchema>;
export type TemplateTrigger = z.infer<typeof templateTriggerSchema>;
export type TemplateMockOutput = z.infer<typeof templateMockOutputSchema>;
export type TemplateConnection = z.infer<typeof templateConnectionSchema>;

// =============================================================================
// VALIDATION HELPER
// =============================================================================

/**
 * Validate an unknown value against `templateSchema`.
 *
 * Returns a discriminated result:
 * - `{ success: true,  data: Template }` on success
 * - `{ success: false, errors: string[] }` on failure
 */
export function validateTemplate(
  data: unknown,
): { success: true; data: Template } | { success: false; errors: string[] } {
  const result = templateSchema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  }

  const errors = result.error.issues.map((issue) => {
    const path = issue.path.length > 0 ? `${issue.path.join('.')}: ` : '';
    return `${path}${issue.message}`;
  });

  return { success: false, errors };
}
