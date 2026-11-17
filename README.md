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

### Use the Copilot skill

This repository includes a [`contribute-template`](.github/skills/contribute-template/SKILL.md)
skill for GitHub Copilot. Give it your portal-generated template JSON, and it
walks you through the contribution:

1. It asks you to confirm that you imported the exact JSON with **Import from JSON**
   in the templates gallery, created a workflow from it, and got a successful test
   run. If you haven't, it gives you the testing steps and stops. If the import
   or test failed, it helps you find the cause. You can change your answer at
   any time, for example by saying "I've tested it now".
2. It checks the JSON for credentials and personal data.
3. It adds `templates/<id>/manifest.json`, updates `templates/manifest.json`,
   and runs `pnpm run validate`.
4. It drafts the pull request with your test result and asks you to confirm
   before opening it.

To use it, open a Copilot session in your clone of this repository and ask, for
example: "Contribute this template: `path/to/manifest.json`". If you've already
saved it as `templates/<id>/manifest.json`, just say "Contribute my template";
it finds the new file and asks you to confirm it. Any change to the
template JSON after testing means you need to import and test it again.

## Repository layout

```text
CONTRIBUTING.md                 # contributor workflow, validator, and PR guidance
.github/skills/contribute-template/SKILL.md  # Copilot skill for template contributions
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
