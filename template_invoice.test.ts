import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import { test } from 'node:test';
import Ajv2020 from 'ajv/dist/2020';

interface Action {
  type: string;
  actions?: Record<string, Action>;
  else?: { actions?: Record<string, Action> };
  tools?: Record<string, { actions?: Record<string, Action> }>;
}

interface InvoiceTemplate {
  workflow: { definition: { actions: Record<string, Action> } };
  mocks: Record<string, unknown>;
}

const template: InvoiceTemplate = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, 'templates', 'tool-invoice-flow', 'manifest.json'),
    'utf8',
  ),
);
const schema = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'schemas', 'template.schema.json'), 'utf8'),
);
const ajv = new Ajv2020({ allErrors: true, allowUnionTypes: true });
const validateTemplate = ajv.compile(schema);
const validateMock = ajv.compile<{ runForReal?: boolean }>(
  schema.$defs.templateMockOutput,
);

function externalActions(
  actions: Record<string, Action>,
  parent = 'actions',
): Array<{ name: string; location: string }> {
  const result: Array<{ name: string; location: string }> = [];
  for (const [name, action] of Object.entries(actions)) {
    const location = `${parent}.${name}`;
    switch (action.type) {
      case 'Http':
      case 'ApiConnection':
      case 'ServiceProvider':
        result.push({ name, location });
        break;
      case 'Agent':
      case 'If':
        break;
      default:
        assert.fail(`${location}: classify new action type "${action.type}" in the invoice test`);
    }
    if (action.actions) {
      result.push(...externalActions(action.actions, `${location}.actions`));
    }
    if (action.else?.actions) {
      result.push(...externalActions(action.else.actions, `${location}.else.actions`));
    }
    for (const [toolName, tool] of Object.entries(action.tools ?? {})) {
      result.push(...externalActions(tool.actions ?? {}, `${location}.tools.${toolName}.actions`));
    }
  }
  return result;
}

function assertInvoiceMocks(candidate: InvoiceTemplate): void {
  const missing = externalActions(candidate.workflow.definition.actions)
    .filter(({ name }) => {
      const mock = candidate.mocks[name];
      return !validateMock(mock) || mock.runForReal === true;
    })
    .map(({ location }) => location);
  assert.deepEqual(missing, [], `Missing canned mock output: ${missing.join(', ')}`);
}

test('invoice template passes the canonical schema', () => {
  assert.equal(validateTemplate(template), true, ajv.errorsText(validateTemplate.errors));
});

test('invoice mocks cover every external call, including both branches and agent tools', () => {
  assertInvoiceMocks(template);
});

test('invoice coverage includes the reported actions, false branch, and vendor inner action', () => {
  const names = externalActions(template.workflow.definition.actions).map(({ name }) => name);
  for (const name of [
    'Notify', 'Update_CRM', 'Close_Ticket',
    'Archive_document', 'Update_Ticket', 'Get_rows_V2_Action',
  ]) {
    assert.ok(names.includes(name), `${name} must be checked for mock output`);
  }
});

test('invoice agent and condition execute normally instead of returning canned output', () => {
  assert.equal(Object.hasOwn(template.mocks, 'Invoice_Validation_Agent'), false);
  assert.equal(Object.hasOwn(template.mocks, 'Condition'), false);
});

for (const name of ['Notify', 'Update_CRM', 'Close_Ticket']) {
  test(`detects a missing ${name} mock`, () => {
    const candidate = structuredClone(template);
    delete candidate.mocks[name];
    assert.throws(() => assertInvoiceMocks(candidate), new RegExp(`\\b${name}\\b`));
  });

  for (const [label, mock] of [
    ['live opt-out', { runForReal: true }],
    ['missing output', { status: 'Succeeded' }],
    ['invalid status code', { status: 'Succeeded', outputs: { statusCode: 200 } }],
  ] as const) {
    test(`rejects ${label} in place of the ${name} canned output`, () => {
      const candidate = structuredClone(template);
      candidate.mocks[name] = mock;
      assert.throws(() => assertInvoiceMocks(candidate), new RegExp(`\\b${name}\\b`));
    });
  }
}
