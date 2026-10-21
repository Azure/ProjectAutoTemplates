import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test, type TestContext } from 'node:test';
import { validateTemplates, type ValidationResult } from './validate_templates';

function createTemplate(id = 'sample-template') {
  const triggers: Record<string, unknown> = { Start: { type: 'Request', kind: 'Http' } };
  const actions: Record<string, unknown> = { Response: { type: 'Response', inputs: { statusCode: 200 } } };
  const mocks: Record<string, unknown> = {};
  const connections: Record<string, unknown> = {};
  return {
    kind: 'AutoTemplate',
    apiVersion: 'v1',
    metadata: {
      id,
      name: 'Sample template',
      description: 'A request-response workflow.',
      category: ['api'],
      author: 'Microsoft',
      source: 'builtin',
      featuredConnectors: ['connectionProviders/request'],
    },
    workflow: {
      definition: {
        $schema: 'https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#',
        triggers,
        actions,
      },
    },
    trigger: { name: 'Start', outputs: { method: 'POST', headers: {}, queries: {} } },
    mocks,
    connections,
  };
}

function fixture(t: TestContext) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'template-validator-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const templatesDir = path.join(root, 'templates');
  fs.mkdirSync(templatesDir);
  function writeIndex(value: unknown) {
    fs.writeFileSync(path.join(templatesDir, 'manifest.json'), JSON.stringify(value));
  }
  function writeTemplate(value: unknown, id = 'sample-template') {
    const folder = path.join(templatesDir, id);
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(folder, 'manifest.json'), JSON.stringify(value));
  }
  writeIndex(['sample-template']);
  writeTemplate(createTemplate());
  return { root, templatesDir, writeIndex, writeTemplate, validate: () => validateTemplates(templatesDir) };
}

function messages(result: ValidationResult): string {
  return result.errors.map(({ file, message }) => `${file}: ${message}`).join('\n');
}

function runCLI(templatesDir: string, githubActions = false) {
  const validator = path.join(__dirname, 'validate_templates.ts');
  return spawnSync(process.execPath, [
    '--import', 'tsx', '-e',
    `const { runValidation } = require(${JSON.stringify(validator)}); process.exitCode = runValidation(process.argv[1]);`,
    templatesDir,
  ], {
    cwd: __dirname,
    encoding: 'utf8',
    env: { ...process.env, GITHUB_ACTIONS: String(githubActions) },
  });
}

test('accepts a valid template and regular card images', (t) => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.templatesDir, 'sample-template', 'card.png'), '');
  fs.writeFileSync(path.join(f.templatesDir, 'sample-template', 'card.svg'), '');
  assert.deepEqual(f.validate(), { templateCount: 1, errors: [] });
});

test('accepts a regular catalog README without indexing or counting it as a template', (t) => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.templatesDir, 'README.md'), '# Template reference\n');
  assert.deepEqual(f.validate(), { templateCount: 1, errors: [] });
});

for (const name of ['readme.md', 'Readme.md', 'README.MD', 'notes.md']) {
  test(`rejects unapproved catalog documentation ${name}`, (t) => {
    const f = fixture(t);
    fs.writeFileSync(path.join(f.templatesDir, name), '# Documentation\n');
    assert.match(messages(f.validate()), new RegExp(`templates/${name.replace('.', '\\.')}: unexpected entry`));
  });
}

test('rejects a directory masquerading as the catalog README', (t) => {
  const f = fixture(t);
  fs.mkdirSync(path.join(f.templatesDir, 'README.md'));
  assert.match(messages(f.validate()), /templates\/README.md: must be a regular file/);
});

test('does not follow a linked catalog README', (t) => {
  const f = fixture(t);
  fs.symlinkSync(
    path.join(f.templatesDir, 'sample-template'),
    path.join(f.templatesDir, 'README.md'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  assert.match(messages(f.validate()), /templates\/README.md: must be a regular file/);
});

test('validates every published template with the stronger checks', () => {
  const result = validateTemplates();
  assert.equal(result.errors.length, 0, messages(result));
  assert.ok(result.templateCount > 0);
});

for (const id of ['', '.', '..', '../outside', '..\\outside', 'C:\\outside', '/outside', ' spaced ', 'bad%2fid']) {
  test(`rejects unsafe index id ${JSON.stringify(id)} without following it`, (t) => {
    const f = fixture(t);
    f.writeIndex(['sample-template', id]);
    assert.match(messages(f.validate()), /invalid folder id/);
  });
}

for (const value of [null, {}, 'sample-template', [1], ['sample-template', null]]) {
  test(`rejects invalid index shape ${JSON.stringify(value)}`, (t) => {
    const f = fixture(t);
    f.writeIndex(value);
    assert.match(messages(f.validate()), /must be a JSON array of strings/);
  });
}

test('reports duplicates without validating the same template twice', (t) => {
  const f = fixture(t);
  f.writeIndex(['sample-template', 'sample-template']);
  const result = f.validate();
  assert.equal(result.templateCount, 1);
  assert.equal(result.errors.length, 1);
  assert.match(messages(result), /duplicate id "sample-template"/);
});

test('reports invalid index JSON and still validates template folders', (t) => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.templatesDir, 'manifest.json'), '[');
  const template = createTemplate();
  template.metadata.author = 'Someone else';
  f.writeTemplate(template);
  const errors = messages(f.validate());
  assert.match(errors, /templates\/manifest.json: invalid JSON/);
  assert.match(errors, /metadata.author/);
});

test('reports missing template trees, indexes, and listed folders', (t) => {
  const f = fixture(t);
  assert.match(messages(validateTemplates(path.join(f.root, 'missing'))), /unable to read directory/);
  fs.unlinkSync(path.join(f.templatesDir, 'manifest.json'));
  assert.match(messages(f.validate()), /templates\/manifest.json: missing/);
  f.writeIndex(['sample-template', 'missing']);
  assert.match(messages(f.validate()), /listed id "missing" has no matching regular folder/);
});

test('rejects a file masquerading as an indexed folder without crashing', (t) => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.templatesDir, 'not-a-folder'), '');
  f.writeIndex(['sample-template', 'not-a-folder']);
  assert.match(messages(f.validate()), /listed id "not-a-folder" has no matching regular folder/);
});

test('checks folder and manifest casing even on case-insensitive filesystems', (t) => {
  const f = fixture(t);
  f.writeIndex(['Sample-template']);
  assert.match(messages(f.validate()), /listed id "Sample-template".*case-sensitive/);
  f.writeIndex(['sample-template']);
  fs.renameSync(
    path.join(f.templatesDir, 'sample-template', 'manifest.json'),
    path.join(f.templatesDir, 'sample-template', 'Manifest.json'),
  );
  assert.match(messages(f.validate()), /missing manifest.json \(case-sensitive\)/);
});

test('validates unlisted templates so one run reports all their problems', (t) => {
  const f = fixture(t);
  const template = createTemplate('unlisted');
  template.trigger.name = 'Missing';
  f.writeTemplate(template, 'unlisted');
  const errors = messages(f.validate());
  assert.match(errors, /templates\/unlisted: template folder is not listed/);
  assert.match(errors, /templates\/unlisted\/manifest.json: trigger.name/);
});

test('rejects unexpected root files and template files and image directories', (t) => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.templatesDir, 'extra.json'), '{}');
  fs.writeFileSync(path.join(f.templatesDir, 'sample-template', 'extra.txt'), '');
  fs.writeFileSync(path.join(f.templatesDir, 'sample-template', 'README.md'), '# Documentation\n');
  fs.mkdirSync(path.join(f.templatesDir, 'sample-template', 'fake.png'));
  const errors = messages(f.validate());
  assert.match(errors, /templates\/extra.json: unexpected entry/);
  assert.match(errors, /sample-template\/extra.txt: unexpected entry/);
  assert.match(errors, /sample-template\/README.md: unexpected entry/);
  assert.match(errors, /sample-template\/fake.png: unexpected entry/);
});

test('rejects directories named manifest.json without crashing', (t) => {
  const f = fixture(t);
  const manifest = path.join(f.templatesDir, 'sample-template', 'manifest.json');
  fs.unlinkSync(manifest);
  fs.mkdirSync(manifest);
  assert.match(messages(f.validate()), /manifest.json: must be a regular file/);
  const index = path.join(f.templatesDir, 'manifest.json');
  fs.unlinkSync(index);
  fs.mkdirSync(index);
  assert.match(messages(f.validate()), /templates\/manifest.json: must be a regular file/);
});

test('does not follow linked template folders or template roots', (t) => {
  const f = fixture(t);
  const link = path.join(f.templatesDir, 'linked-template');
  fs.symlinkSync(path.join(f.templatesDir, 'sample-template'), link, process.platform === 'win32' ? 'junction' : 'dir');
  f.writeIndex(['sample-template', 'linked-template']);
  assert.match(messages(f.validate()), /listed id "linked-template" has no matching regular folder/);
  assert.match(messages(validateTemplates(link)), /must be a regular directory/);
});

test('uses the actual byte size and accepts exactly 1 MiB, not more', (t) => {
  const f = fixture(t);
  const template = createTemplate();
  const padded = { ...template, metadata: { ...template.metadata, padding: '' } };
  const bytes = 1024 * 1024;
  padded.metadata.padding = 'x'.repeat(bytes - Buffer.byteLength(JSON.stringify(padded)));
  f.writeTemplate(padded);
  assert.equal(f.validate().errors.length, 0);
  padded.metadata.padding += 'x';
  f.writeTemplate(padded);
  assert.match(messages(f.validate()), /exceeds 1048576 byte \(1 MiB\) size limit/);
});

test('counts multi-byte text toward the manifest limit', (t) => {
  const f = fixture(t);
  const template = createTemplate();
  template.metadata.description = '\u00e9'.repeat(600_000);
  f.writeTemplate(template);
  assert.match(messages(f.validate()), /size limit/);
});

test('reports the exact missing or unexpected schema property', (t) => {
  const f = fixture(t);
  const template = createTemplate();
  const { featuredConnectors, ...metadata } = template.metadata;
  f.writeTemplate({ ...template, metadata, unexpected: true });
  const errors = messages(f.validate());
  assert.match(errors, /schema: metadata.featuredConnectors: must have required property/);
  assert.match(errors, /schema: unexpected: must NOT have additional properties/);
});

for (const [field, value] of [['id', 'different'], ['author', 'Community'], ['source', 'community']]) {
  test(`retains the metadata ${field} invariant`, (t) => {
    const f = fixture(t);
    const template = createTemplate();
    f.writeTemplate({ ...template, metadata: { ...template.metadata, [field]: value } });
    assert.match(messages(f.validate()), new RegExp(`metadata\\.${field}`));
  });
}

test('requires a case-sensitive sample trigger reference', (t) => {
  const f = fixture(t);
  const template = createTemplate();
  template.trigger.name = 'start';
  f.writeTemplate(template);
  assert.match(messages(f.validate()), /trigger.name: "start" does not match.*case-sensitive/);
});

test('rejects malformed trigger and action collections with actionable errors', (t) => {
  const f = fixture(t);
  const template = createTemplate();
  f.writeTemplate({
    ...template,
    workflow: { definition: { ...template.workflow.definition, triggers: [], actions: null } },
  });
  const errors = messages(f.validate());
  assert.match(errors, /workflow.definition.triggers: must be an object/);
  assert.match(errors, /workflow.definition.actions: must be an object/);
});

test('does not treat inherited names as trigger declarations', (t) => {
  const f = fixture(t);
  const template = createTemplate();
  template.trigger.name = 'toString';
  f.writeTemplate(template);
  assert.match(messages(f.validate()), /trigger.name: "toString" does not match/);
});

const malformedActions: Array<[string, unknown, string]> = [
  ['action', null, 'workflow.definition.actions.Invalid'],
  ['nested actions', { type: 'Scope', actions: [] }, 'Invalid.actions'],
  ['else', { type: 'If', else: null }, 'Invalid.else'],
  ['default', { type: 'Switch', default: [] }, 'Invalid.default'],
  ['cases', { type: 'Switch', cases: [] }, 'Invalid.cases'],
  ['case', { type: 'Switch', cases: { Broken: null } }, 'Invalid.cases.Broken'],
  ['tools', { type: 'Agent', tools: [] }, 'Invalid.tools'],
  ['tool', { type: 'Agent', tools: { Broken: null } }, 'Invalid.tools.Broken'],
];

for (const [name, action, field] of malformedActions) {
  test(`reports malformed ${name} instead of crashing or ignoring it`, (t) => {
    const f = fixture(t);
    const template = createTemplate();
    template.workflow.definition.actions.Invalid = action;
    f.writeTemplate(template);
    assert.ok(f.validate().errors.some(({ message }) => message.includes(`${field}:`)));
  });
}

const leaf = {
  type: 'ApiConnection',
  inputs: { host: { connection: { referenceName: 'service_#workflowname#' } } },
};
const nestedActions: Array<[string, Record<string, unknown>]> = [
  ['scope', { type: 'Scope', actions: { Nested: leaf } }],
  ['foreach', { type: 'Foreach', actions: { Nested: leaf } }],
  ['until', { type: 'Until', actions: { Nested: leaf } }],
  ['if else', { type: 'If', actions: {}, else: { actions: { Nested: leaf } } }],
  ['switch case', { type: 'Switch', cases: { Case: { actions: { Nested: leaf } } } }],
  ['switch default', { type: 'Switch', default: { actions: { Nested: leaf } } }],
  ['agent tool', { type: 'Agent', tools: { Tool: { actions: { Scope: { type: 'Scope', actions: { Nested: leaf } } } } } }],
];

for (const [name, action] of nestedActions) {
  test(`finds mocks and connection references inside ${name}`, (t) => {
    const f = fixture(t);
    const template = createTemplate();
    template.workflow.definition.actions = { Container: action };
    template.mocks.Nested = { runForReal: true };
    template.connections['service_#workflowname#'] = { connectorType: 'shared', apiId: '/managedApis/service' };
    f.writeTemplate(template);
    assert.equal(f.validate().errors.length, 0, messages(f.validate()));
    template.connections = {};
    f.writeTemplate(template);
    assert.match(messages(f.validate()), /connection "service_#workflowname#" is not declared/);
  });
}

for (const name of ['Missing', 'response']) {
  test(`rejects stale or wrong-case mock ${name}`, (t) => {
    const f = fixture(t);
    const template = createTemplate();
    template.mocks[name] = { runForReal: true };
    f.writeTemplate(template);
    assert.match(messages(f.validate()), new RegExp(`mocks\\.${name}: no matching workflow action`));
  });
}

test('does not discover actions or connection references in arbitrary payloads', (t) => {
  const f = fixture(t);
  const template = createTemplate();
  template.workflow.definition.actions.Fake = {
    type: 'Compose',
    inputs: {
      actions: { Imaginary: leaf },
      host: { connection: { referenceName: 'service_#workflowname#' } },
      serviceProviderConfiguration: { connectionName: 'service_#workflowname#' },
      modelConfigurations: { model1: { referenceName: 'service_#workflowname#' } },
    },
  };
  template.connections['service_#workflowname#'] = { connectorType: 'shared', apiId: '/managedApis/service' };
  template.mocks.Imaginary = { runForReal: true };
  f.writeTemplate(template);
  const errors = messages(f.validate());
  assert.match(errors, /mocks.Imaginary: no matching workflow action/);
  assert.match(errors, /connections.service_#workflowname#: declared connection is not referenced/);
});

const connectionInputs: Array<[string, Record<string, unknown>, string, string]> = [
  ['managed API', { host: { connection: { referenceName: 'service_#workflowname#' } } }, 'shared', 'ApiConnection'],
  ['managed API webhook', { host: { connection: { referenceName: 'service_#workflowname#' } } }, 'shared', 'ApiConnectionWebhook'],
  ['managed API notification', { host: { connection: { referenceName: 'service_#workflowname#' } } }, 'shared', 'ApiConnectionNotification'],
  ['service provider', { serviceProviderConfiguration: { connectionName: 'service_#workflowname#' } }, 'inapp', 'ServiceProvider'],
  ['service provider webhook', { serviceProviderConfiguration: { connectionName: 'service_#workflowname#' } }, 'inapp', 'ServiceProviderWebhook'],
  ['agent model', { modelConfigurations: { model1: { referenceName: 'service_#workflowname#' } } }, 'agent', 'Agent'],
];

for (const [name, inputs, connectorType, stepType] of connectionInputs) {
  test(`checks declared and undeclared ${name} references on triggers and actions`, (t) => {
    const f = fixture(t);
    const template = createTemplate();
    template.workflow.definition.triggers.Start = { type: stepType, inputs };
    template.workflow.definition.actions.Call = { type: stepType, inputs };
    f.writeTemplate(template);
    const errors = f.validate().errors;
    assert.equal(errors.filter(({ message }) => message.includes('is not declared')).length, 2);
    template.connections['service_#workflowname#'] = { connectorType, apiId: '/example/service' };
    f.writeTemplate(template);
    assert.equal(f.validate().errors.length, 0, messages(f.validate()));
  });
}

for (const duplicate of [true, false]) {
  test(duplicate ? 'rejects duplicate connection API ids' : 'accepts distinct connection API ids', (t) => {
    const f = fixture(t);
    const template = createTemplate();
    template.workflow.definition.actions.First = leaf;
    template.workflow.definition.actions.Second = {
      type: 'ApiConnection',
      inputs: { host: { connection: { referenceName: 'second_#workflowname#' } } },
    };
    template.connections['service_#workflowname#'] = { connectorType: 'shared', apiId: '/managedApis/service' };
    template.connections['second_#workflowname#'] = {
      connectorType: 'shared',
      apiId: duplicate ? '/managedApis/service' : '/managedApis/second',
    };
    f.writeTemplate(template);
    const result = f.validate();
    if (duplicate) {
      assert.equal(result.errors.length, 1, messages(result));
      assert.match(messages(result), /connections.second_#workflowname#\.apiId: duplicates connections.service_#workflowname#\.apiId/);
    } else {
      assert.equal(result.errors.length, 0, messages(result));
    }
  });
}

for (const stepType of ['ApiConnection', 'ServiceProviderWebhook']) {
  test(`requires a connection reference on ${stepType} steps`, (t) => {
    const f = fixture(t);
    const template = createTemplate();
    template.workflow.definition.actions.Call = { type: stepType };
    f.writeTemplate(template);
    assert.match(messages(f.validate()), /connection reference must end/);
  });
}

for (const reference of ['', 'service', 42, null]) {
  test(`rejects malformed workflow connection reference ${JSON.stringify(reference)}`, (t) => {
    const f = fixture(t);
    const template = createTemplate();
    template.workflow.definition.actions.Call = {
      type: 'ServiceProvider',
      inputs: { serviceProviderConfiguration: { connectionName: reference } },
    };
    f.writeTemplate(template);
    assert.match(messages(f.validate()), /inputs.serviceProviderConfiguration.connectionName: connection reference must end/);
  });
}

test('matches connection references case-sensitively', (t) => {
  const f = fixture(t);
  const template = createTemplate();
  template.workflow.definition.actions.Call = leaf;
  template.connections['Service_#workflowname#'] = { connectorType: 'shared', apiId: '/managedApis/service' };
  f.writeTemplate(template);
  const errors = messages(f.validate());
  assert.match(errors, /connection "service_#workflowname#" is not declared/);
  assert.match(errors, /connections.Service_#workflowname#: declared connection is not referenced/);
});

test('continues secret lint when schema validation fails without disclosing values', (t) => {
  const f = fixture(t);
  const template = createTemplate();
  template.metadata.category = ['unknown'];
  template.trigger.outputs.headers = { Authorization: 'synthetic-secret-do-not-print' };
  f.writeTemplate(template);
  const errors = messages(f.validate());
  assert.match(errors, /schema: metadata.category/);
  assert.match(errors, /secret lint: trigger.outputs.headers.Authorization/);
  assert.doesNotMatch(errors, /synthetic-secret-do-not-print/);
});

test('retains text secret lint even for invalid JSON and never echoes source text', (t) => {
  const f = fixture(t);
  fs.writeFileSync(
    path.join(f.templatesDir, 'sample-template', 'manifest.json'),
    'Bearer syntheticsecretdonotprint',
  );
  const errors = messages(f.validate());
  assert.match(errors, /secret lint: contains what looks like a bearer token/);
  assert.match(errors, /invalid JSON/);
  assert.doesNotMatch(errors, /syntheticsecretdonotprint/);
});

test('accepts redacted credentials and supported authentication expressions', (t) => {
  const f = fixture(t);
  const template = createTemplate();
  template.trigger.outputs.headers = { Authorization: '***', 'x-api-key': '' };
  template.workflow.definition.actions.Call = {
    type: 'Http',
    inputs: {
      authentication: { type: 'ManagedServiceIdentity', audience: "@parameters('audience')" },
      queries: { sig: '***' },
    },
  };
  f.writeTemplate(template);
  assert.equal(f.validate().errors.length, 0, messages(f.validate()));
});

test('the CLI returns success for valid fixtures without running on import', (t) => {
  const f = fixture(t);
  const result = runCLI(f.templatesDir);
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /1 template\(s\) validated successfully/);
  assert.equal(result.stderr, '');
});

test('the CLI returns failure and gives the contributor the shared preflight command', (t) => {
  const f = fixture(t);
  f.writeIndex(['sample-template', 'missing']);
  const result = runCLI(f.templatesDir);
  assert.ifError(result.error);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /templates\/manifest.json: listed id "missing"/);
  assert.match(result.stderr, /pnpm run validate/);
  assert.doesNotMatch(result.stderr, /::error/);
  assert.doesNotMatch(result.stdout, /validated successfully/);
});

test('GitHub errors annotate files and escape command data and properties', (t) => {
  const f = fixture(t);
  const template = createTemplate();
  template.trigger.name = 'Missing%\r\n::warning::do-not-execute';
  const id = 'folder,with%characters';
  template.metadata.id = id;
  f.writeTemplate(template, id);
  const result = runCLI(f.templatesDir, true);
  assert.ifError(result.error);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /::error file=templates\/folder%2Cwith%25characters\/manifest.json::trigger.name/);
  assert.match(result.stderr, /Missing%25%0D%0A::warning::do-not-execute/);
  assert.doesNotMatch(result.stderr, /\n::warning::/);
});
