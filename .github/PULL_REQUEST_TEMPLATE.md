<!-- Thank you for contributing a template! Please complete the checklist below. -->

Before submitting, follow the [contribution guide](https://github.com/Azure/ProjectAutoTemplates/blob/main/CONTRIBUTING.md)
and review the [template reference](https://github.com/Azure/ProjectAutoTemplates/blob/main/templates/README.md).

## What does this PR add or change?

<!-- Short description of the template(s) added or changed and what they demonstrate. -->
<!-- Include the portal import-test result and any setup needed to reproduce it. -->

## Checklist

For template changes:

- [ ] The template was generated with the portal's **Create template** flow (not hand-written)
- [ ] The template was tested end-to-end via the **Import from json** card in the templates gallery
- [ ] The template folder name (`templates/<id>/`) matches `metadata.id`
- [ ] Any new id is added to `templates/manifest.json` exactly once
- [ ] Trigger samples, mocks, and connection references match the workflow, including nested actions and agent tools
- [ ] No credentials, tokens, SAS signatures, or personal data anywhere in the JSON — sensitive values are `"***"`
- [ ] `pnpm run validate` passes locally (the same type, catalog, and regression checks run in PR CI)

If **Validate templates** fails in the PR checks, use the file annotations and
workflow logs to fix the errors, then rerun `pnpm run validate` before pushing.
