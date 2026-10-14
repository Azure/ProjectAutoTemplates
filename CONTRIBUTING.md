# Contributing templates

This guide covers adding or updating a template and preparing a pull request.
For the detailed authoring rules, see the [template reference](templates/README.md).

## Before you start

Work on a branch in your clone or fork of this repository. You need access to the
Project Auto portal to generate and import-test templates. Use Node.js 22 and
pnpm 11 to match the [CI environment](.github/workflows/validate.yml).

## 1. Generate and test the template

1. Build and test your workflow in the Project Auto portal.
2. Use **Create template** on a monitoring run to download sanitized JSON rather
   than hand-writing a template. The portal scrubs credentials such as auth
   headers, SAS signatures, and connection strings; never add them back.
3. Import the downloaded JSON through the **Import from json** card in the
   templates gallery and test it end-to-end. For updates, import and test the
   updated JSON too.

Review samples, mocks, and connection metadata for credentials or personal data.
Keep redacted values as `"***"` and use synthetic sample data. Passing validation
does not replace this review or the portal import test.

## 2. Add or update the catalog files

Save the template as `templates/<template-id>/manifest.json`, then add any new id
to [`templates/manifest.json`](templates/manifest.json). Keep existing ids when
updating a template and do not add duplicates.

Before validating, check the [directory rules](templates/README.md#directory-and-publish-index),
[template format](templates/README.md#template-format), and
[category guidance](templates/README.md#template-categories). The folder name must
match `metadata.id`. If contributors or users need new setup instructions, update
the [configuration notes](templates/README.md#template-configuration) too.

## 3. Run the validator

**There is a built-in validator. Run the full preflight from the repository root
before opening or updating a PR:**

```sh
pnpm install --frozen-lockfile
pnpm run validate
```

`pnpm run validate` performs TypeScript checking, validates the entire template
catalog, and runs schema and validator regression tests. It checks:

- The publish index, folder names, allowed files, and manifest size limits.
- The template envelope schema, including metadata and supported category ids.
- Trigger, mock, and connection references, including nested actions and agent tools.
- Common credential-bearing values that must remain redacted.

Validation is read-only: it reports errors but does not rewrite or fix templates.
For a faster editing loop, `pnpm run test` skips TypeScript checking; it still
validates the full catalog and runs the regression tests. Use `pnpm run validate`
for the final preflight.

### Fixing validation failures

Read the file path and field in each diagnostic, make the suggested correction,
and rerun `pnpm run validate`. Unlisted folders are validated too, so one run can
report both a missing index entry and problems inside that template.

| Diagnostic points to | What to check |
| --- | --- |
| `templates/manifest.json` or a template folder | Add each new id exactly once and match the folder's spelling and casing. Follow the [directory rules](templates/README.md#directory-and-publish-index). |
| `schema:` or `metadata` | Follow the [format requirements](templates/README.md#template-format) and use supported [category ids](templates/README.md#template-categories), not display labels. |
| `trigger.name`, a mock, or a connection | Match the workflow's case-sensitive names, including nested actions and agent tools; keep declarations and references consistent. |
| `secret lint:` | Remove real credential values and restore `"***"` redaction. Check the generated JSON before sharing it. |

Secret lint runs even when the envelope is invalid. Diagnostics do not print
detected credential values or invalid JSON snippets.

## 4. Open or update the pull request

Open a PR against `main` and complete the repository's
[pull request checklist](.github/PULL_REQUEST_TEMPLATE.md). Explain what the
template demonstrates or what changed, include your import-test result, and note
any setup a reviewer needs to reproduce it.

The [Validate templates workflow](.github/workflows/validate.yml) runs the same
full preflight for PRs targeting `main` and pushes to `main`. If it fails, inspect
the PR's checks: catalog validator failures appear as file annotations and in the
workflow logs. Fix the reported errors, rerun the local preflight, and push the
correction.
