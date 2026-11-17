---
name: contribute-template
description: Add or update a Project Auto template from a portal-generated manifest and open a pull request in Azure/ProjectAutoTemplates. Use when a contributor provides a template manifest JSON file or pasted JSON and asks to contribute, publish, submit, or open a PR for a template. Requires the contributor to confirm a successful Import from JSON and workflow test before the PR is created.
---

# Contribute a template

Turn a portal-generated template manifest into a validated pull request. Do the
file work for the contributor, but never open a PR for a template that wasn't
imported and tested in the portal.

Follow [CONTRIBUTING.md](../../../CONTRIBUTING.md) and the
[template reference](../../../templates/README.md). If they conflict with this
skill, the repository guides win.

## 1. Get the manifest

Ask for the template JSON: a file path or pasted contents. Accept one template
per run. Parse it and stop with a clear message if it isn't valid JSON.

Read `metadata.id` and `metadata.name`. If `templates/<metadata.id>/` already
exists, confirm whether this is an **update** to that template or a new template
that needs a different id. Never overwrite an existing template without
confirmation.

The JSON should come from the portal's **Create template** flow on a succeeded
run. If the contributor wrote or heavily edited it by hand, tell them to
generate it from the portal and stop.

## 2. Confirm the portal test (required gate)

Give the contributor these steps, then ask the question below. Use your
question tool with choices if available; don't continue on silence or an
ambiguous answer.

**How to test your template**

1. In the Project Auto portal, open the templates gallery and select
   **Import from JSON**.
2. Upload the exact JSON file you're contributing, or paste its contents, and
   select **Import**. Fix any validation errors and import again.
3. Select the imported template card, then **Use template** or
   **Use this template**. Create a workflow in an environment and app you can
   safely test in.
4. Configure the required connections. Replace example resources and
   recipients with safe test values.
5. Select **Test** and run the workflow. Confirm it succeeds and produces the
   expected result. Actions without enabled test data run live, so use safe
   targets.

Ask: "Did you import this exact JSON with **Import from JSON**, create a
workflow from it, and get a successful test run with the expected result?"

Choices:

- Yes, import and workflow test both succeeded
- Not yet. I'll test it first
- I tested it, but the import or test failed

Only the first answer continues. For the other answers, stop and repeat the
testing steps. Don't create a branch, commit, or PR.

Then ask for a one- or two-sentence test result, for example: "Imported in
my test environment, created a workflow, test run succeeded and sent the expected email."
Ask which environment they used and any setup a reviewer needs. You'll put
these in the PR body.

If the JSON changes after this point, including your own fixes, tell the
contributor the tested file no longer matches. Ask them to import and test the
final JSON again and repeat this gate before opening the PR.

## 3. Review for sensitive data

Before writing files, scan the JSON and report anything that looks like a real
credential, token, SAS signature, connection string, personal email address,
phone number, internal URL, or sensitive canvas note. Redacted values must stay
`"***"`. Don't print suspected secret values back to the contributor; give the
JSON path only.

If you find sensitive data, stop. The contributor must fix it, regenerate or
edit the JSON, and retest it (step 2).

## 4. Add the catalog files

1. Start from an up-to-date `main` and create a branch such as
   `template/<metadata.id>`.
2. Save the JSON as `templates/<metadata.id>/manifest.json`. Preserve the
   content exactly; don't reformat it in ways that change values.
3. For a new template, add the id to `templates/manifest.json` exactly once.
   For an update, keep the existing entry.
4. If the template needs new setup instructions, add them to the
   configuration notes in `templates/README.md`.

## 5. Validate

From the repository root, run:

```sh
pnpm install --frozen-lockfile
pnpm run validate
```

If validation fails, explain each diagnostic using the table in
CONTRIBUTING.md. Fixes to the publish index or README don't require retesting.
Any change to the template JSON does: return to step 2 with the corrected JSON.

## 6. Open the pull request

Show the contributor the branch, changed files, and draft PR title and body.
Ask for confirmation before committing, pushing, and opening the PR.

Open the PR against `main`, using `.github/PULL_REQUEST_TEMPLATE.md` exactly.
Fill in:

- **What does this PR add or change?** What the template does, whether it's
  new or an update, the portal import-test result and environment from step 2,
  and any reviewer setup.
- **Checklist:** check only items you verified or the contributor confirmed.
  Leave any unconfirmed item unchecked and say why.

Return the PR link. Tell the contributor the template appears in the public
gallery only after the PR is reviewed, merged, and published.
