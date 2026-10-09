<!-- Thank you for contributing a template! Please complete the checklist below. -->

## What does this PR add or change?

<!-- Short description of the template(s) added or changed and what they demonstrate. -->

## Checklist

- [ ] The template was generated with the portal's **Create template** flow (not hand-written)
- [ ] The template was tested end-to-end via the **Import from json** card in the templates gallery
- [ ] The template folder name (`templates/<id>/`) matches `metadata.id`
- [ ] The id is appended to `templates/manifest.json`
- [ ] Trigger samples, mocks, and connection references match the workflow, including nested actions and agent tools
- [ ] No credentials, tokens, SAS signatures, or personal data anywhere in the JSON — sensitive values are `"***"`
- [ ] `pnpm run validate` passes locally (the same type, catalog, and regression checks run in PR CI)
