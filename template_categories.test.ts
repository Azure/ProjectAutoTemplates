import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import { test } from 'node:test';
import Ajv2020 from 'ajv/dist/2020';

const schema = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'schemas', 'template.schema.json'), 'utf8'),
);
const template = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, 'templates', 'receive-request-send-response', 'manifest.json'),
    'utf8',
  ),
);
const validateTemplateSchema = new Ajv2020({
  allErrors: true,
  allowUnionTypes: true,
}).compile(schema);

const categories = [
  'ai',
  'sales',
  'it-ops',
  'marketing',
  'engineering',
  'support',
  'operations',
  'communication',
  'api',
  'summarization',
  'categorization',
  'finance',
  'document-processing',
  'data',
  'other',
];

function withCategory(category: unknown) {
  return { ...template, metadata: { ...template.metadata, category } };
}

test('declares the approved category ids', () => {
  assert.deepEqual(schema.$defs.templateMetadata.properties.category.items.enum, categories);
});

for (const category of categories) {
  test(`accepts category ${category}`, () => {
    assert.equal(validateTemplateSchema(withCategory([category])), true);
  });
}

test('accepts multiple purpose-based categories', () => {
  assert.equal(
    validateTemplateSchema(
      withCategory(['ai', 'finance', 'document-processing', 'summarization']),
    ),
    true,
  );
});

const invalidCategories: Array<[string, unknown]> = [
  ['retired automation id', ['automation']],
  ['retired Automation display label', ['Automation']],
  ['retired id mixed with a supported id', ['ai', 'automation']],
  ['unknown id', ['unknown-category']],
  ['display label instead of an id', ['AI']],
  ['alternate spelling', ['summarisation']],
  ['alternate separator', ['it_ops']],
  ['surrounding whitespace', [' api ']],
  ['empty id', ['']],
  ['empty array', []],
  ['scalar instead of an array', 'ai'],
  ['null category', null],
  ['non-string id', [1]],
  ['duplicate ids', ['ai', 'ai']],
  ['other before a named category', ['other', 'api']],
  ['other after a named category', ['api', 'other']],
];

for (const [name, category] of invalidCategories) {
  test(`rejects ${name}`, () => {
    assert.equal(validateTemplateSchema(withCategory(category)), false);
  });
}

test('requires an explicit category without defaulting to AI', () => {
  const document = withCategory(['ai']);
  delete document.metadata.category;

  assert.equal(validateTemplateSchema(document), false);
  assert.equal(Object.hasOwn(document.metadata, 'category'), false);
  assert.equal(
    Object.hasOwn(schema.$defs.templateMetadata.properties.category, 'default'),
    false,
  );
});
