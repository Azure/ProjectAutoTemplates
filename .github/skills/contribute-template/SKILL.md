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

If the contributor already gave a file path or pasted JSON, use it. Otherwise,
look for a candidate before asking: run `git status --porcelain -- templates/`
and collect untracked (`??`) or modified (` M`) `templates/<id>/manifest.json`
files. An untracked folder can show as `?? templates/<id>/`; check for
`manifest.json` inside it.

- **One candidate:** ask "Is this the template you want to contribute:
  `templates/<id>/manifest.json` (new or update)?" Continue only on a yes.
- **Several:** list them and ask which one to use.
- **None, or the contributor says no:** ask for a file path or pasted JSON.

Never use a detected file without the contributor's confirmation. Only look
inside the repository; don't scan other folders such as Downloads.

Accept one template per run. Parse it and stop with a clear message if it
isn't valid JSON.

Read `metadata.id` and `metadata.name`. Decide whether this is a new template
or an update from what's tracked in git, not from whether the folder exists on
disk: a detected untracked file is **new**, and a detected modified file is an
**update**. For a path or pasted JSON, if `templates/<metadata.id>/manifest.json`
is already tracked, confirm whether this is an **update** to that template or a
new template that needs a different id. Never overwrite an existing template
without confirmation.

The JSON should come from the portal's **Create template** flow on a succeeded
run. If the contributor wrote or heavily edited it by hand, tell them to
generate it from the portal and stop.

## 2. Confirm the portal test (required gate)

Ask the question below. Use your question tool with choices if available;
don't continue on silence or an ambiguous answer.

Ask: "Did you import this exact JSON with **Import from JSON**, create a
workflow from it, and get a successful test run with the expected result?"

Choices:

- Yes, import and workflow test both succeeded
- Not yet. I'll test it first (tell me how)
- I tested it, but the import or test failed

Only the first answer continues. For the others, don't create a branch,
commit, or PR.

**Not yet:** give the testing steps below, then stop. Tell the contributor to
come back and say "I've tested it" when done, and ask the gate question again.

**Failed:** ask whether the import or the workflow test failed, and for the
error message or failing action. Never ask them to paste secrets. Then help:

- **Import failed:** check the JSON against the
  [template format](../../../templates/README.md#template-format) and explain
  what's wrong. If the JSON is malformed or incomplete, ask them to regenerate
  it with **Create template**.
- **Test failed or gave the wrong result:** check the failing action's
  connection, parameters, and test data, and whether trigger samples and mocks
  match the workflow. If the template itself needs a fix, the contributor
  should fix the workflow in the portal and regenerate the JSON.

After any fix, give the testing steps again and re-ask the gate question with
the updated JSON.

**Changing the answer:** the contributor can change their answer at any time
by telling you, for example "I've tested it now" or "Actually, the test
failed". Ask the gate question again and follow the new answer. If a "Yes" is
withdrawn, stop any PR work that hasn't happened yet. If the PR already
exists, tell the contributor and offer to mark it as a draft or add a comment
until a passing test is confirmed.

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

**After a "Yes":** ask for a one- or two-sentence test result, for example: "Imported in
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
