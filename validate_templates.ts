/**
 * Template repo validator — run via `pnpm test` (tsx validate_templates.ts).
 *
 * Validates the templates/ tree (which mirrors the published blob container
 * exactly) and every template document:
 *   1. templates/manifest.json is a JSON array of unique, safe folder ids, and
 *      every id has a matching regular folder (case-sensitive).
 *   2. Every folder under templates/ is listed in the index, and contains
 *      only expected files (manifest.json, plus optional card images).
 *   3. Each manifest.json is at most 1 MiB, parses, and passes the template envelope
 *      JSON Schema (schemas/template.schema.json — the language-neutral source
 *      of truth shared with the portal repo). The embedded workflow.definition
 *      is governed by the official Azure Logic Apps schema pinned in its
 *      $schema field; the envelope only enforces that pin (the official
 *      2016-06-01 schema predates Standard/agentic action types, so CI does
 *      not validate against it).
 *   4. metadata.id matches its folder name; ids are unique.
 *   5. metadata.source is "builtin" and metadata.author is "Microsoft".
 *   6. No credential-bearing values (headers, SAS/query secrets, bearer
 *      tokens, connection strings) — the portal's generate flow scrubs these
 *      to "***"; this is the backstop.
 *   7. Trigger samples and mocks reference existing workflow steps, including
 *      nested actions and agent tools.
 *   8. Connection names use the _#workflowname# placeholder; declarations and
 *      connector/model references agree in both directions.
 */

import * as fs from 'fs';
import * as path from 'path';
import Ajv2020 from 'ajv/dist/2020';
import type { ErrorObject } from 'ajv';

const TEMPLATES_DIR = path.join(__dirname, 'templates');
const SCHEMA_PATH = path.join(__dirname, 'schemas', 'template.schema.json');
const MAX_TEMPLATE_BYTES = 1024 * 1024; // 1 MiB
const REQUIRED_SOURCE = 'builtin';
const REQUIRED_AUTHOR = 'Microsoft';

/** Files allowed inside a template folder besides the required manifest.json. */
const ALLOWED_EXTRA_FILES = /\.(png|svg)$/;

// ---------------------------------------------------------------------------
// Secret lint — mirrors the scrub lists in the portal's
// portal/src/data/templates/templateFromRun.ts. Values matching these must
// have been redacted to "***" by the generate flow.
// ---------------------------------------------------------------------------

const SENSITIVE_HEADERS = [
  'authorization',
  'cookie',
  'x-api-key',
  'x-functions-key',
];

const SENSITIVE_HEADER_PREFIXES = ['x-ms-client-principal', 'x-ms-token-aad-'];

const SENSITIVE_QUERY_PARAMS = new Set(['code', 'sig', 'sp', 'sv', 'se', 'sr']);

const REDACTED = '***';

const AUTHENTICATION_TYPES = new Set([
  'basic',
  'clientcertificate',
  'activedirectoryoauth',
  'raw',
  'managedserviceidentity',
]);

/** Text-level patterns that indicate an unscrubbed secret anywhere in the file. */
const SECRET_TEXT_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: 'bearer token', pattern: /Bearer\s+[A-Za-z0-9._~+/-]{16,}=*/ },
  { name: 'storage connection string (AccountKey=)', pattern: /AccountKey=[^*"\s;][^"\s;]*/i },
  { name: 'connection string (SharedAccessKey=)', pattern: /SharedAccessKey=[^*"\s;][^"\s;]*/i },
  { name: 'SAS signature in URL (sig=)', pattern: /[?&]sig=(?!\*{3})[A-Za-z0-9%+/=]{8,}/ },
  { name: 'function key in URL (code=)', pattern: /[?&]code=(?!\*{3})[A-Za-z0-9%_=-]{16,}/ },
];

function isSensitiveHeader(key: string): boolean {
  const lower = key.toLowerCase();
  if (SENSITIVE_HEADERS.includes(lower)) return true;
  return SENSITIVE_HEADER_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

/**
 * Walk the parsed document looking for objects under a "headers" or
 * "queries" key whose sensitive entries hold a real (non-"***") value, and
 * "authentication" blocks holding GUID-looking or long opaque strings.
 */
function findStructuralSecrets(value: unknown, docPath: string[] = []): string[] {
  const errors: string[] = [];
  if (value === null || typeof value !== 'object') return errors;

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const childPath = [...docPath, key];
    const lowerKey = key.toLowerCase();

    if ((lowerKey === 'headers' || lowerKey === 'queries') && child && typeof child === 'object') {
      for (const [entryKey, entryValue] of Object.entries(child as Record<string, unknown>)) {
        const sensitive =
          lowerKey === 'headers'
            ? isSensitiveHeader(entryKey)
            : SENSITIVE_QUERY_PARAMS.has(entryKey.toLowerCase());
        if (sensitive && typeof entryValue === 'string' && entryValue !== REDACTED && entryValue !== '') {
          errors.push(
            `${[...childPath, entryKey].join('.')}: sensitive ${lowerKey === 'headers' ? 'header' : 'query parameter'} "${entryKey}" holds a real value — must be scrubbed to "${REDACTED}"`,
          );
        }
      }
    }

    if (lowerKey === 'authentication' && child && typeof child === 'object') {
      for (const [authKey, authValue] of Object.entries(child as Record<string, unknown>)) {
        // Known authentication type labels are not credential values.
        if (
          authKey.toLowerCase() === 'type' &&
          typeof authValue === 'string' &&
          AUTHENTICATION_TYPES.has(authValue.toLowerCase())
        ) {
          continue;
        }
        if (
          typeof authValue === 'string' &&
          authValue !== REDACTED &&
          !authValue.startsWith('@') && // expressions like @parameters(...) are fine
          !authValue.includes('#workflowname#') &&
          /^[A-Za-z0-9+/=._~-]{16,}$/.test(authValue)
        ) {
          errors.push(
            `${[...childPath, authKey].join('.')}: authentication value looks like a secret — must be scrubbed to "${REDACTED}"`,
          );
        }
      }
    }

    errors.push(...findStructuralSecrets(child, childPath));
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Schema validation — compiled from the shared JSON Schema. The schema is
// validation-only: it requires supported category ids in metadata.category
// and does not apply defaults or transforms.
// ---------------------------------------------------------------------------

/** The fields this script reads after schema validation has passed. */
interface Template {
  metadata: { id: string; author: string; source: string };
  workflow: { definition: Record<string, unknown> };
  trigger: { name: string };
  mocks?: Record<string, unknown>;
  connections?: Record<string, unknown>;
}

const ajv = new Ajv2020({ allErrors: true, allowUnionTypes: true });
const validateTemplateSchema = ajv.compile<Template>(
  JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8')),
);

/**
 * Flatten Ajv errors into readable "path: message" strings. Branch-selector
 * errors ("must match a schema in anyOf") are dropped — the per-branch errors
 * they summarize are already included — and duplicates collapsed.
 */
function formatSchemaErrors(errors: ErrorObject[] | null | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const err of errors ?? []) {
    if (err.keyword === 'anyOf') continue;
    const segments = err.instancePath
      .split('/')
      .slice(1)
      .map((seg) => seg.replace(/~1/g, '/').replace(/~0/g, '~'));
    if (err.keyword === 'required') segments.push(err.params.missingProperty);
    if (err.keyword === 'additionalProperties') segments.push(err.params.additionalProperty);
    if (err.keyword === 'propertyNames') segments.push(err.params.propertyName);
    const docPath = segments.join('.');
    const message = `${docPath ? `${docPath}: ` : ''}${err.message ?? 'is invalid'}`;
    if (!seen.has(message)) {
      seen.add(message);
      out.push(message);
    }
  }
  return out.length > 0 ? out : ['does not match the template schema'];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function jsonErrorMessage(error: unknown): string {
  // JSON.parse errors can include source text containing an unredacted secret.
  const location = errorMessage(error).match(/position \d+|line \d+ column \d+/g);
  return `invalid JSON${location ? ` (${location.join(', ')})` : ''}`;
}

const MANAGED_CONNECTION_TYPES = new Set([
  'ApiConnection',
  'ApiConnectionWebhook',
  'ApiConnectionNotification',
]);
const SERVICE_PROVIDER_TYPES = new Set(['ServiceProvider', 'ServiceProviderWebhook']);

function findReferenceErrors(template: Template): string[] {
  const errors: string[] = [];
  const actionNames = new Set<string>();
  const referencedConnections = new Set<string>();
  const definition = template.workflow.definition;
  const connections = template.connections ?? {};

  function checkConnection(reference: unknown, docPath: string): void {
    if (typeof reference !== 'string' || !/^\S*_#workflowname#$/.test(reference)) {
      errors.push(`${docPath}: connection reference must end with "_#workflowname#"`);
      return;
    }
    referencedConnections.add(reference);
    if (!Object.hasOwn(connections, reference)) {
      errors.push(`${docPath}: connection "${reference}" is not declared in connections`);
    }
  }

  function visitStep(step: Record<string, unknown>, docPath: string): void {
    const inputs = step.inputs;
    if (typeof step.type === 'string' && MANAGED_CONNECTION_TYPES.has(step.type)) {
      const host = isRecord(inputs) ? inputs.host : undefined;
      const reference = isRecord(host) && isRecord(host.connection) ? host.connection.referenceName : undefined;
      checkConnection(reference, `${docPath}.inputs.host.connection.referenceName`);
    }
    if (typeof step.type === 'string' && SERVICE_PROVIDER_TYPES.has(step.type)) {
      const provider = isRecord(inputs) ? inputs.serviceProviderConfiguration : undefined;
      checkConnection(
        isRecord(provider) ? provider.connectionName : undefined,
        `${docPath}.inputs.serviceProviderConfiguration.connectionName`,
      );
    }
    if (step.type === 'Agent' && isRecord(inputs) && isRecord(inputs.modelConfigurations)) {
      for (const [name, model] of Object.entries(inputs.modelConfigurations)) {
        if (isRecord(model) && Object.hasOwn(model, 'referenceName')) {
          checkConnection(model.referenceName, `${docPath}.inputs.modelConfigurations.${name}.referenceName`);
        }
      }
    }
  }

  function visitActions(value: unknown, docPath: string): void {
    if (!isRecord(value)) {
      errors.push(`${docPath}: must be an object of workflow actions`);
      return;
    }
    for (const [name, action] of Object.entries(value)) {
      const actionPath = `${docPath}.${name}`;
      if (!isRecord(action)) {
        errors.push(`${actionPath}: action must be an object`);
        continue;
      }
      actionNames.add(name);
      visitStep(action, actionPath);
      if (Object.hasOwn(action, 'actions')) visitActions(action.actions, `${actionPath}.actions`);
      for (const branch of ['else', 'default']) {
        if (!Object.hasOwn(action, branch)) continue;
        const container = action[branch];
        if (!isRecord(container)) {
          errors.push(`${actionPath}.${branch}: must be an object`);
        } else if (Object.hasOwn(container, 'actions')) {
          visitActions(container.actions, `${actionPath}.${branch}.actions`);
        }
      }
      for (const collection of ['cases', 'tools']) {
        if (!Object.hasOwn(action, collection)) continue;
        const containers = action[collection];
        if (!isRecord(containers)) {
          errors.push(`${actionPath}.${collection}: must be an object`);
          continue;
        }
        for (const [containerName, container] of Object.entries(containers)) {
          const containerPath = `${actionPath}.${collection}.${containerName}`;
          if (!isRecord(container)) {
            errors.push(`${containerPath}: must be an object`);
          } else if (Object.hasOwn(container, 'actions')) {
            visitActions(container.actions, `${containerPath}.actions`);
          }
        }
      }
    }
  }

  if (!isRecord(definition.triggers)) {
    errors.push('workflow.definition.triggers: must be an object of workflow triggers');
  } else {
    if (!Object.hasOwn(definition.triggers, template.trigger.name)) {
      errors.push(`trigger.name: "${template.trigger.name}" does not match a workflow.definition.triggers key (case-sensitive)`);
    }
    for (const [name, trigger] of Object.entries(definition.triggers)) {
      if (!isRecord(trigger)) {
        errors.push(`workflow.definition.triggers.${name}: trigger must be an object`);
      } else {
        visitStep(trigger, `workflow.definition.triggers.${name}`);
      }
    }
  }
  visitActions(definition.actions, 'workflow.definition.actions');
  for (const name of Object.keys(template.mocks ?? {})) {
    if (!actionNames.has(name)) {
      errors.push(`mocks.${name}: no matching workflow action (case-sensitive); rename or remove this mock`);
    }
  }
  for (const name of Object.keys(connections)) {
    if (!referencedConnections.has(name)) {
      errors.push(`connections.${name}: declared connection is not referenced by a workflow connector or agent model; remove it or fix the reference`);
    }
  }
  return errors;
}

export interface ValidationIssue {
  file: string;
  message: string;
}

export interface ValidationResult {
  templateCount: number;
  errors: ValidationIssue[];
}

export function validateTemplates(templatesDir = TEMPLATES_DIR): ValidationResult {
  const errors: ValidationIssue[] = [];
  const result: ValidationResult = { templateCount: 0, errors };
  const fail = (file: string, message: string): void => {
    errors.push({ file, message });
  };

  function readDirectory(dir: string, label: string): fs.Dirent[] | undefined {
    try {
      if (!fs.lstatSync(dir).isDirectory()) {
        fail(label, 'must be a regular directory, not a file or symbolic link');
        return;
      }
      return fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
      fail(label, `unable to read directory: ${errorMessage(error)}`);
    }
  }

  function readFile(filePath: string, label: string): string | undefined {
    try {
      const stat = fs.lstatSync(filePath);
      if (!stat.isFile()) {
        fail(label, 'must be a regular file, not a directory or symbolic link');
        return;
      }
      if (stat.size > MAX_TEMPLATE_BYTES) {
        fail(label, `exceeds ${MAX_TEMPLATE_BYTES} byte (1 MiB) size limit`);
        return;
      }
      return fs.readFileSync(filePath, 'utf8');
    } catch (error) {
      fail(label, `unable to read file: ${errorMessage(error)}`);
    }
  }

  const entries = readDirectory(templatesDir, 'templates');
  if (!entries) return result;
  const indexLabel = 'templates/manifest.json';
  let index: string[] = [];
  if (!entries.some((entry) => entry.name === 'manifest.json')) {
    fail(indexLabel, 'missing; add a JSON array of template folder ids');
  } else {
    const rawIndex = readFile(path.join(templatesDir, 'manifest.json'), indexLabel);
    if (rawIndex !== undefined) {
      try {
        const parsed: unknown = JSON.parse(rawIndex);
        if (!Array.isArray(parsed) || !parsed.every((value): value is string => typeof value === 'string')) {
          fail(indexLabel, 'must be a JSON array of strings');
        } else {
          const seen = new Set<string>();
          for (const id of parsed) {
            if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(id)) {
              fail(indexLabel, `invalid folder id "${id}"; use letters, digits, hyphens, or underscores, starting with a letter or digit`);
              continue;
            }
            if (seen.has(id)) fail(indexLabel, `duplicate id "${id}"`);
            seen.add(id);
          }
          index = [...seen];
        }
      } catch (error) {
        fail(indexLabel, jsonErrorMessage(error));
      }
    }
  }

  const folders = entries.filter((entry) => entry.name !== 'manifest.json' && entry.isDirectory());
  for (const entry of entries) {
    if (entry.name !== 'manifest.json' && !entry.isDirectory()) {
      fail(`templates/${entry.name}`, 'unexpected entry; only the index and regular template directories are allowed');
    }
  }
  for (const id of index) {
    if (!folders.some((folder) => folder.name === id)) {
      fail(indexLabel, `listed id "${id}" has no matching regular folder (case-sensitive)`);
    }
  }

  for (const folder of folders) {
    const id = folder.name;
    const folderLabel = `templates/${id}`;
    if (!index.includes(id)) {
      fail(folderLabel, 'template folder is not listed in templates/manifest.json; add its id to the index or remove the folder');
    }
    const folderPath = path.join(templatesDir, id);
    const files = readDirectory(folderPath, folderLabel);
    if (!files) continue;
    for (const entry of files) {
      if (entry.name === 'manifest.json') continue;
      if (!entry.isFile() || !ALLOWED_EXTRA_FILES.test(entry.name)) {
        fail(`${folderLabel}/${entry.name}`, 'unexpected entry; template folders may only contain regular manifest.json, .png, and .svg files');
      }
    }
    if (!files.some((entry) => entry.name === 'manifest.json')) {
      fail(folderLabel, 'missing manifest.json (case-sensitive)');
      continue;
    }
    const label = `${folderLabel}/manifest.json`;
    const raw = readFile(path.join(folderPath, 'manifest.json'), label);
    if (raw === undefined) continue;
    for (const { name, pattern } of SECRET_TEXT_PATTERNS) {
      if (pattern.test(raw)) {
        fail(label, `secret lint: contains what looks like a ${name}; scrub it to "${REDACTED}" before contributing`);
      }
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      fail(label, jsonErrorMessage(error));
      continue;
    }
    for (const issue of findStructuralSecrets(parsed)) {
      fail(label, `secret lint: ${issue}`);
    }
    if (!validateTemplateSchema(parsed)) {
      for (const issue of formatSchemaErrors(validateTemplateSchema.errors)) {
        fail(label, `schema: ${issue}`);
      }
      continue;
    }
    if (parsed.metadata.id !== id) {
      fail(label, `metadata.id is "${parsed.metadata.id}" but must match the folder name "${id}"`);
    }
    if (parsed.metadata.source !== REQUIRED_SOURCE) {
      fail(label, `metadata.source is "${parsed.metadata.source}" but must be "${REQUIRED_SOURCE}"`);
    }
    if (parsed.metadata.author !== REQUIRED_AUTHOR) {
      fail(label, `metadata.author is "${parsed.metadata.author}" but must be "${REQUIRED_AUTHOR}"`);
    }
    for (const issue of findReferenceErrors(parsed)) {
      fail(label, issue);
    }
    result.templateCount++;
  }
  return result;
}

function escapeAnnotation(value: string): string {
  return value.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

export function runValidation(templatesDir = TEMPLATES_DIR): number {
  const { errors, templateCount } = validateTemplates(templatesDir);
  if (errors.length > 0) {
    console.error(`\n✖ Validation failed with ${errors.length} error(s):\n`);
    for (const { file, message } of errors) {
      const readable = `${file}: ${message}`.replace(/\r/g, '\\r').replace(/\n/g, '\\n');
      console.error(`  • ${readable}`);
      if (process.env.GITHUB_ACTIONS === 'true') {
        const annotationFile = escapeAnnotation(file).replace(/:/g, '%3A').replace(/,/g, '%2C');
        console.error(`::error file=${annotationFile}::${escapeAnnotation(message)}`);
      }
    }
    console.error('\nFix the errors above, then run "pnpm run validate" before opening or updating the PR.\n');
    return 1;
  }
  console.log(`✔ ${templateCount} template(s) validated successfully.`);
  return 0;
}

if (require.main === module) {
  process.exitCode = runValidation();
}
