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
  (non-empty array of supported category ids), `tags`, `author` (must be `"Microsoft"`),
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

## Template categories

`metadata.category` uses the lowercase ids below, enforced by the shared schema.
Choose no more than three categories based on the description and the actual
workflow, including agent instructions and nested tools. Prefer two categories
when they adequately describe the template. Categories can describe both the
business purpose and the capabilities that are central to the workflow.

| Label | Id | Use for |
| --- | --- | --- |
| AI | `ai` | Workflows that execute an AI model, agent, or AI-powered document analysis. Being callable by an agent alone is not enough. |
| Sales | `sales` | Sales processes, leads, customers, and sales-order handling. |
| IT Ops | `it-ops` | Infrastructure monitoring, provisioning, service incidents, and IT administration. |
| Marketing | `marketing` | Campaigns, audience engagement, and marketing content. |
| Engineering | `engineering` | Software-development workflows and reusable technical building blocks. |
| Support | `support` | Customer issues, feedback handling, ticket triage, and escalation. |
| Operations | `operations` | Internal business processes, approval rules, and order operations. |
| Communication | `communication` | Email, messaging, and collaboration as a core purpose, not just an incidental notification. |
| API | `api` | Reusable request-response endpoints, HTTP/webhook integration patterns, and callable service wrappers. An HTTP trigger or connector callback alone does not qualify. |
| Summarization | `summarization` | Generating condensed summaries or reports from source content. |
| Categorization | `categorization` | Assigning labels, sentiment, ratings, or routing groups using AI or explicit rules. Does not imply AI. |
| Finance | `finance` | Expense review, invoicing, accounting, and financial validation. |
| Document Processing | `document-processing` | Extracting, structuring, or validating content from documents and reports. |
| Data | `data` | Structured-data retrieval, queries, synchronization, transformation, and analytics. |
| Other | `other` | A fallback only when none of the named categories fits. Must be used alone. |

Category ids must be unique within a template, with a maximum of three. Unknown
ids, display labels in place of ids, and the retired `automation` category are
rejected. `ai` is an ordinary category, not a default or a fallback; no category
is assigned automatically. General discovery terms and connector names can
remain in `metadata.tags`.

For example, an expense-report agent belongs in
`["ai", "finance", "document-processing"]`, not Sales. A rule-based support-email
triage workflow belongs in
`["support", "communication", "categorization"]`, not AI. Do not infer Sales from
a Salesforce connector, IT Ops from a ServiceNow connector, or API from an HTTP
trigger when those are incidental to the workflow's purpose.

Consumers must support these ids and their display labels when adopting this
schema. Older copies of templates using `automation` must be reclassified by
purpose rather than renamed to `ai`. This repository does not configure portal
category controls or default gallery filters.

## Template configuration

After importing a template, connect each service and replace example resource
locations and recipients before running against live services. The following
templates include sample trigger data and mocked connector outputs; AI agent
actions still require a configured model connection.

| Template | Configuration before a live run |
| --- | --- |
| [Azure Key Vault secret rotation](templates/automate-azure-key-vault-secret-rotation/manifest.json) | Set the Key Vault connection and `Update_Secret` vault hostname to the same vault, authorize the workflow's managed identity to update secrets, and select the Teams approval team/channel. Approved updates create a new secret value and expiration; coordinate the change with downstream consumers. |
| [Excel feedback summary](templates/excel-feedback-ai-teams-email/manifest.json) | Select the feedback workbook/table, Teams team/channel, and email recipient. |
| [Gmail attachments to Google Drive](templates/gmail-email-attachments-google-drive/manifest.json) | Select the Gmail label and destination Google Drive folder. |
| [Google Sheets invoice reminders](templates/google-sheets-gmail-invoice-reminders/manifest.json) | Update the spreadsheet, worksheet, column mappings, paid status, and time zone in `Settings`; align the recurrence time zone. |
| [Email invoice extraction to Excel](templates/invoice-docintel-ai-excel/manifest.json) | Select the Outlook folder, Document Intelligence connection, and Excel workbook/table with the seven invoice-field columns used by `Add_Invoice_Row`. The first attachment must be the invoice PDF. |
| [Office 365 attachments to OneDrive for Business](templates/office365-email-attachments-onedrive/manifest.json) | Select the Outlook mail folder and destination OneDrive for Business folder. |
| [Office 365 attachments to SharePoint](templates/office365-email-attachments-sharepoint/manifest.json) | Select the Outlook mail folder, SharePoint site, and document-library folder. |
| [Outlook.com attachments to OneDrive](templates/outlook-email-attachments-onedrive/manifest.json) | Select the Outlook.com mail folder and destination personal OneDrive folder. |
| [Google Sheets feedback summary](templates/sheets-feedback-ai-gmail/manifest.json) | Replace the Google Sheet file id, select the feedback worksheet, and set the Gmail recipient. |
| [Excel invoice reminders with Outlook.com](templates/weekday-excel-invoice-reminders-outlook-com/manifest.json) | Update the workbook/table, column mappings, paid status, and time zone in `Settings`; align the recurrence time zone. |

Invoice reminder samples use fixed dates. Adjust those sample dates to exercise
the overdue, due-soon, and future-invoice cases relative to the day of a test run.
Keep redacted mock values as `"***"`; never replace them with real credentials.

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

## GitHub issue to Azure DevOps Boards setup

The `github-new-issue-to-azure-devops-boards` template keeps source and destination
resource fields empty so imports do not subscribe to the author's repository or
write to the author's project. Configure the GitHub trigger's **Owner** and
**Repository**, bind both connector connections, and choose the Boards action's
**Project** before publishing. The default work item type is **Issue**; select
a type supported by the destination project's process if it does not support
Issue. The GitHub connection must be able to create and remove repository
webhooks, and the Boards connection must be able to create the selected work item
type.

Only `opened` issue events create a work item. The description uses the incoming
issue's `html_url`, so it follows the configured repository without editing an
expression. The trigger payload and mocked Boards response are synthetic sample
data. Keep the Boards action mock enabled for draft testing; disable it only
when intentionally testing real writes to a configured project.

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
