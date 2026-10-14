# Project Auto Templates

[![Validate templates](https://github.com/Azure/ProjectAutoTemplates/actions/workflows/validate.yml/badge.svg)](https://github.com/Azure/ProjectAutoTemplates/actions/workflows/validate.yml)

This repository hosts **templates** for Project Auto: self-contained `manifest.json` bundles
that package a workflow definition together with mock data, trigger sample data, and
connection metadata so a workflow can be imported, tested, and run end-to-end from the
templates gallery.

## Contributing

Adding or updating a template? Start with the [contribution guide](CONTRIBUTING.md)
for the portal-to-PR workflow and the **`pnpm run validate` preflight** enforced by CI.
Use the [template reference](templates/README.md) for format requirements, categories,
and configuration notes.

## Repository layout

```text
CONTRIBUTING.md                 # contributor workflow, validator, and PR guidance
templates/
  README.md                     # template format, categories, and configuration
  manifest.json                 # JSON array of template folder ids: the publish allow-list
  <template-id>/manifest.json    # full template document (kind: AutoTemplate, apiVersion: v1)
schemas/                        # shared JSON Schema for the template envelope
validate_templates.ts           # catalog validator, included in PR CI
```

[`templates/manifest.json`](templates/manifest.json) controls which template folders
are published. Every template folder must be listed; `templates/README.md` is
documentation, not a catalog entry.

## Schema sharing

[`schemas/template.schema.json`](schemas/template.schema.json) is the **source of truth**
for the template envelope and uses [JSON Schema (draft 2020-12)](https://json-schema.org/).
For authoring rules and the limits of workflow-definition validation, see
[Template format](templates/README.md#template-format).

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
