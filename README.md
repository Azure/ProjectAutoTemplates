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
  <template-id>/manifest.json  # full template document (kind: OttoTemplate, apiVersion: v1)
schemas/                       # Zod schemas used by CI validation
validate_templates.ts          # validation entry point (run by CI on every PR)
```

The `templates/` directory mirrors the published content exactly, and its top-level
`manifest.json` doubles as the publish gate: a template folder that exists but is not
listed there fails validation and is not published.

## Template format

Every template `manifest.json` must satisfy the `Template` schema in
[`schemas/template.ts`](schemas/template.ts):

- `kind: "OttoTemplate"` and `apiVersion: "v1"`
- `metadata` — `id` (must match the folder name), `name`, `description`, `category`,
  `tags`, `author` (must be `"Microsoft"`), `source` (must be `"builtin"`)
- `workflow` — the workflow definition
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

## Schema sync

`schemas/template.ts` and `schemas/workflowDefinition.ts` are manual copies of the portal's
canonical schemas. When the portal format changes, the copies here must be updated in the
same release — see the header comments in those files.

## Trademarks

This project may contain trademarks or logos for projects, products, or services.
Authorized use of Microsoft trademarks or logos is subject to and must follow
[Microsoft's Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).
Use of Microsoft trademarks or logos in modified versions of this project must not cause
confusion or imply Microsoft sponsorship. Any use of third-party trademarks or logos are
subject to those third-party's policies.

## License

Licensed under the [MIT](LICENSE) license.
