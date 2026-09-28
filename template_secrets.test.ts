import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';

function validateAuthentication(authentication: Record<string, string>) {
  // Keep fixtures under the repo so the copied validator resolves its dependencies.
  const fixtureRoot = fs.mkdtempSync(path.join(__dirname, '.template-secret-test-'));
  try {
    const id = 'receive-request-send-response';
    const template = JSON.parse(
      fs.readFileSync(path.join(__dirname, 'templates', id, 'manifest.json'), 'utf8'),
    );
    template.workflow.definition.actions = {
      Call_service: {
        type: 'Http',
        inputs: {
          method: 'GET',
          uri: 'https://example.invalid',
          authentication,
        },
      },
    };

    fs.mkdirSync(path.join(fixtureRoot, 'templates', id), { recursive: true });
    fs.mkdirSync(path.join(fixtureRoot, 'schemas'));
    fs.copyFileSync(
      path.join(__dirname, 'validate_templates.ts'),
      path.join(fixtureRoot, 'validate_templates.ts'),
    );
    fs.copyFileSync(
      path.join(__dirname, 'schemas', 'template.schema.json'),
      path.join(fixtureRoot, 'schemas', 'template.schema.json'),
    );
    fs.writeFileSync(path.join(fixtureRoot, 'templates', 'manifest.json'), JSON.stringify([id]));
    fs.writeFileSync(
      path.join(fixtureRoot, 'templates', id, 'manifest.json'),
      JSON.stringify(template),
    );

    return spawnSync(
      process.execPath,
      ['--import', 'tsx', path.join(fixtureRoot, 'validate_templates.ts')],
      { cwd: __dirname, encoding: 'utf8', timeout: 30_000 },
    );
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

for (const type of [
  'Basic',
  'ClientCertificate',
  'ActiveDirectoryOAuth',
  'Raw',
  'ManagedServiceIdentity',
  'managedServiceIdentity',
]) {
  test(`accepts the ${type} authentication type without treating it as a secret`, () => {
    const result = validateAuthentication({ type });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
  });
}

test('accepts redacted and expression-based authentication values', () => {
  const result = validateAuthentication({
    type: 'ActiveDirectoryOAuth',
    tenant: '***',
    clientId: '***',
    secret: "@parameters('clientSecret')",
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
});

for (const key of ['secret', 'password', 'pfx', 'tenant']) {
  test(`still rejects an unredacted authentication ${key}`, () => {
    const result = validateAuthentication({
      type: 'managedServiceIdentity',
      [key]: 'synthetic-credential-not-a-real-secret',
    });
    assert.ifError(result.error);
    assert.equal(result.status, 1, result.stderr);
    assert.ok(result.stderr.includes(`authentication.${key}: authentication value looks like a secret`));
  });
}

test('does not exempt unknown authentication type values from secret detection', () => {
  const result = validateAuthentication({ type: 'synthetic-credential-not-a-real-secret' });
  assert.ifError(result.error);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /authentication\.type: authentication value looks like a secret/);
});
