# Project Auto Templates

[![Validate templates](https://github.com/Azure/ProjectAutoTemplates/actions/workflows/validate.yml/badge.svg)](https://github.com/Azure/ProjectAutoTemplates/actions/workflows/validate.yml)

This repository hosts **templates** for Project Auto: self-contained `manifest.json` bundles
that package a workflow definition together with mock data, trigger sample data, and
connection metadata so a workflow can be imported, tested, and run end-to-end from the
templates gallery.

## Repository layout

```
templates/
  manifest.json                # JSON array of template folder ids — the publish allow-list
  <template-id>/manifest.json  # full template document (kind: AutoTemplate, apiVersion: v1)
schemas/                       # JSON Schema (source of truth) used by CI validation
validate_templates.ts          # validation entry point (run by CI on every PR)
```

The `templates/` directory mirrors the published content exactly, and its top-level
`manifest.json` doubles as the publish gate: a template folder that exists but is not
listed there fails validation and is not published.

## Template format

Every template `manifest.json` must satisfy the JSON Schema in
[`schemas/template.schema.json`](schemas/template.schema.json):

- `kind: "AutoTemplate"` and `apiVersion: "v1"`
- `metadata` — `id` (must match the folder name), `name`, `description`, `category`
  (array of category strings), `tags`, `author` (must be `"Microsoft"`),
  `source` (must be `"builtin"`), `featuredConnectors` (array of connector ids
  surfaced on the template card, e.g. `"/managedApis/sql"`)
- `workflow` — the workflow to import. Its `definition` must declare the official
  Azure Logic Apps schema in `$schema`
  (`https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#`),
  which governs the definition's structure — the template schema does not re-describe it
- `trigger` — sample trigger outputs used to pre-fill test runs
- `mocks` — canned per-action outputs with `status` of `"Succeeded"` or `"Failed"`
  (or `{ "runForReal": true }` opt-outs)
- `connections` — connection references; names must end with the `_#workflowname#`
  placeholder so they can be rewritten at import time

## Contributing a template

1. Build and test your workflow in the Project Auto portal.
2. Use the **Create template** flow on a monitoring run to generate a sanitized
   JSON download. The portal scrubs credentials (auth headers, SAS signatures,
   connection strings) automatically — never add them back.
3. Verify the template locally with the **Import from json** card in the templates gallery.
4. Open a pull request that adds `templates/<template-id>/manifest.json` **and** appends
   the id to `templates/manifest.json`.

Every PR runs the validation suite. To run it locally:

```bash
pnpm install
pnpm run test
```

## Schema sharing

[`schemas/template.schema.json`](schemas/template.schema.json) is a standard
[JSON Schema (draft 2020-12)](https://json-schema.org/) and is the **source of truth** for
the template *envelope* format (metadata, trigger sample, mocks, connections).
The embedded `workflow.definition` payload is intentionally out of scope: its authority is
the official Azure Logic Apps workflow definition schema pinned in
`workflow.definition.$schema`. (That official 2016-06-01 schema predates Logic Apps
Standard and agentic action types such as `Agent` and `ServiceProvider`, so CI enforces
the pin but does not validate definitions against it.)

The envelope schema is language-neutral so other repos (e.g. the portal) can consume
the same file instead of maintaining a parallel schema — copy it, or fetch it from

```
https://raw.githubusercontent.com/Azure/ProjectAutoTemplates/main/schemas/template.schema.json
```

The schema is validation-only: consumers are responsible for applying defaults. Format
changes must land here and in consuming repos in the same release.

## Trademarks

This project may contain trademarks or logos for projects, products, or services.
Authorized use of Microsoft trademarks or logos is subject to and must follow
[Microsoft's Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).
Use of Microsoft trademarks or logos in modified versions of this project must not cause
confusion or imply Microsoft sponsorship. Any use of third-party trademarks or logos are
subject to those third-party's policies.

## License

Licensed under the [MIT](LICENSE) license.
