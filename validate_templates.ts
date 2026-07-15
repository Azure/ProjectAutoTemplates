/**
 * Template repo validator — run via `pnpm test` (tsx validate_templates.ts).
 *
 * Validates the templates/ tree (which mirrors the published blob container
 * exactly) and every template document:
 *   1. templates/manifest.json is a JSON array of unique folder ids, and every
 *      id has a matching folder (case-sensitive) containing manifest.json.
 *   2. Every folder under templates/ is listed in the index, and contains
 *      only expected files (manifest.json, plus optional card images).
 *   3. Each manifest.json is < 1 MB, parses, and passes the Template Zod schema
 *      (schemas/template.ts — a manual copy of the portal's canonical schema).
 *   4. metadata.id matches its folder name; ids are unique.
 *   5. metadata.source is "builtin" and metadata.author is "Microsoft".
 *   6. No credential-bearing values (headers, SAS/query secrets, bearer
 *      tokens, connection strings) — the portal's generate flow scrubs these
 *      to "***"; this is the backstop.
 *   7. Connection names use the _#workflowname# placeholder and are actually
 *      referenced by the workflow definition.
 */

import * as fs from 'fs';
import * as path from 'path';
import { validateTemplate, type Template } from './schemas/template';

const TEMPLATES_DIR = path.join(__dirname, 'templates');
const MAX_TEMPLATE_BYTES = 1024 * 1024; // 1 MB
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
// Helpers
// ---------------------------------------------------------------------------

/** Case-sensitive existence check — Windows/macOS filesystems would otherwise
 *  pass a wrong-case id that breaks the case-sensitive blob layout. */
function existsCaseSensitive(dir: string, name: string): boolean {
  return fs.readdirSync(dir).includes(name);
}

function listTemplateFolders(): string[] {
  return fs
    .readdirSync(TEMPLATES_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const errors: string[] = [];

function fail(message: string): void {
  errors.push(message);
}

// 0. templates/ tree exists
if (!fs.existsSync(TEMPLATES_DIR) || !fs.statSync(TEMPLATES_DIR).isDirectory()) {
  console.error('✖ templates/ directory is missing from the repo root.');
  process.exit(1);
}

// 1. Index shape
const indexPath = path.join(TEMPLATES_DIR, 'manifest.json');
let index: string[] = [];
if (!fs.existsSync(indexPath)) {
  fail('templates/manifest.json: missing');
} else {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    if (!Array.isArray(parsed) || !parsed.every((v): v is string => typeof v === 'string')) {
      fail('templates/manifest.json: must be a JSON array of strings');
    } else {
      index = parsed;
      const dupes = index.filter((id, i) => index.indexOf(id) !== i);
      for (const dupe of new Set(dupes)) {
        fail(`templates/manifest.json: duplicate id "${dupe}"`);
      }
    }
  } catch (e) {
    fail(`templates/manifest.json: invalid JSON — ${(e as Error).message}`);
  }
}

// 2. Index ↔ folders agree, case-sensitively; folders hold only expected files
const folders = listTemplateFolders();
for (const id of index) {
  if (!existsCaseSensitive(TEMPLATES_DIR, id)) {
    fail(`templates/manifest.json: listed id "${id}" has no matching folder (case-sensitive)`);
  } else if (!existsCaseSensitive(path.join(TEMPLATES_DIR, id), 'manifest.json')) {
    fail(`templates/${id}: folder exists but has no manifest.json`);
  }
}
for (const folder of folders) {
  if (!index.includes(folder)) {
    fail(`templates/${folder}: template folder exists but is not listed in templates/manifest.json — add it to the index or delete the folder`);
  }
  for (const entry of fs.readdirSync(path.join(TEMPLATES_DIR, folder))) {
    if (entry !== 'manifest.json' && !ALLOWED_EXTRA_FILES.test(entry)) {
      fail(`templates/${folder}/${entry}: unexpected file — template folders may only contain manifest.json and image assets`);
    }
  }
}

// 3–7. Per-template checks
for (const id of index) {
  const templatePath = path.join(TEMPLATES_DIR, id, 'manifest.json');
  if (!fs.existsSync(templatePath)) continue; // already reported above

  const label = `templates/${id}/manifest.json`;
  const raw = fs.readFileSync(templatePath, 'utf8');

  if (Buffer.byteLength(raw, 'utf8') > MAX_TEMPLATE_BYTES) {
    fail(`${label}: exceeds ${MAX_TEMPLATE_BYTES / 1024 / 1024} MB size limit`);
    continue;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    fail(`${label}: invalid JSON — ${(e as Error).message}`);
    continue;
  }

  const result = validateTemplate(parsed);
  if (!result.success) {
    for (const issue of result.errors) {
      fail(`${label}: schema — ${issue}`);
    }
    continue;
  }
  const template: Template = result.data;

  if (template.metadata.id !== id) {
    fail(`${label}: metadata.id is "${template.metadata.id}" but must match the folder name "${id}"`);
  }
  if (template.metadata.source !== REQUIRED_SOURCE) {
    fail(`${label}: metadata.source is "${template.metadata.source}" but must be "${REQUIRED_SOURCE}"`);
  }
  if (template.metadata.author !== REQUIRED_AUTHOR) {
    fail(`${label}: metadata.author is "${template.metadata.author}" but must be "${REQUIRED_AUTHOR}"`);
  }

  // Secret lint — structural walk + raw-text patterns
  for (const issue of findStructuralSecrets(parsed)) {
    fail(`${label}: secret lint — ${issue}`);
  }
  for (const { name, pattern } of SECRET_TEXT_PATTERNS) {
    if (pattern.test(raw)) {
      fail(`${label}: secret lint — contains what looks like a ${name}; scrub it to "${REDACTED}" before contributing`);
    }
  }

  // Connection placeholder + reference consistency. The schema already
  // enforces the _#workflowname# suffix on keys; also require the definition
  // to actually reference each declared connection.
  const definitionText = JSON.stringify(template.workflow);
  for (const connectionName of Object.keys(template.connections)) {
    if (!definitionText.includes(`"${connectionName}"`)) {
      fail(`${label}: connections declares "${connectionName}" but the workflow definition never references it`);
    }
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

if (errors.length > 0) {
  console.error(`\n✖ Validation failed with ${errors.length} error(s):\n`);
  for (const error of errors) {
    console.error(`  • ${error}`);
  }
  console.error('');
  process.exit(1);
}

console.log(`✔ ${index.length} template(s) validated successfully.`);
