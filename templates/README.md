# Template reference

Use this reference when adding or updating a template. Start with the
[contribution guide](../CONTRIBUTING.md) for generation, import testing, the
**validator**, and the pull request workflow.

- [Directory and publish index](#directory-and-publish-index)
- [Template format](#template-format)
- [Template categories](#template-categories)
- [Template configuration](#template-configuration)
- [GitHub issue to Azure DevOps Boards setup](#github-issue-to-azure-devops-boards-setup)

## Directory and publish index

```text
templates/
  README.md                    # authoring reference, not a template
  manifest.json                # JSON array of template folder ids: the publish allow-list
  <template-id>/
    manifest.json              # required template document
    card.png                   # optional image; regular .png and .svg files are allowed
```

The top-level [`manifest.json`](manifest.json) is the publish gate: every template
folder must be listed exactly once. An unlisted folder or an id without a matching
folder fails validation. `README.md` is documentation and must not be added to the
index.

Folder ids must start with a letter or digit and contain only letters, digits,
hyphens, or underscores. The folder name must match `metadata.id` exactly,
including casing.

The tree accepts only the index, this regular `README.md` file, and regular
template directories. Each template directory may contain only a regular
`manifest.json` and optional `.png`/`.svg` files. Symbolic links and nested asset
directories are rejected. JSON manifests must be at most 1 MiB (1,048,576 bytes).

## Template format

Every template `manifest.json` must satisfy the
[template envelope schema](../schemas/template.schema.json), the source of truth
for metadata, trigger samples, mocks, and connections:

| Field | Requirements |
| --- | --- |
| `kind`, `apiVersion` | `"AutoTemplate"` and `"v1"`, respectively. |
| `metadata` | `id` (must match the folder name), `name`, `description`, `category` (non-empty array of supported ids), `author` (`"Microsoft"`), `source` (`"builtin"`), and `featuredConnectors` (array of connector ids shown on the card, such as `"/managedApis/sql"`). Use optional `tags` for discovery terms. |
| `workflow` | The workflow to import. Its `definition.$schema` must declare the official Azure Logic Apps workflow definition schema described below. |
| `trigger` | Sample trigger outputs used to pre-fill test runs. |
| `mocks` | Canned per-action outputs with `status` of `"Succeeded"` or `"Failed"`, or `{ "runForReal": true }` opt-outs. |
| `connections` | Connection references whose names end with the `_#workflowname#` placeholder for rewriting at import time. |

The validator also checks relationships the envelope schema cannot express:
`trigger.name` must match a workflow trigger, mock keys must match action names
(including nested branches, loops, scopes, and agent tools), and every connection
must be both declared and referenced by a connector or agent model. All names are
case-sensitive. Mentioning a connection in arbitrary text or sample data does not
count as referencing it.

### Workflow schema and validation limits

The embedded `workflow.definition` is governed by the official Azure Logic Apps
schema, not re-described by the template envelope. Its `$schema` must be:

```text
https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#
```

That official 2016-06-01 schema predates Logic Apps Standard and agentic action
types such as `Agent` and `ServiceProvider`. CI enforces this schema pin but does
not validate definitions against it, so the portal import test remains essential.

The envelope schema is validation-only and does not assign defaults or transform
values. For sharing it with other repositories, see
[Schema sharing](../README.md#schema-sharing).

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
rejected. `ai` is an ordinary category, not a default or a fallback; no category is
assigned automatically. General discovery terms and connector names can remain
in `metadata.tags`.

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
| [Get a Pull Request (Azure DevOps)](get-a-pull-request-azure-devops/manifest.json) | Bind the Azure DevOps Repos connection and set `Get_pull_request`'s project, repository ID, and pull request ID. Keep its synthetic mock enabled for draft testing; disable the mock only to retrieve a real pull request. The HTTP request starts the workflow; inspect the action output for the pull request details (there is no HTTP Response action). |
| [Azure DevOps PR Review Lifecycle](azure-dev-ops-pr-review-lifecycle/manifest.json) | Bind the Repos connection and set the project and repository in every connector action, including `Cleanup_created_PR`'s nested `Abandon_PR`. Set distinct existing source/target branch refs in `Create_PR` with changes available to review. Set the same reviewer identity in `Add_reviewer`'s body, `Set_vote`, `Reject_PR`, and `Remove_reviewer`; voting requires a connection authorized to act as that reviewer. Live runs create a PR, change approval/rejection votes, create and resolve a thread, remove the reviewer, and attempt to abandon the created PR even if an intermediate step fails. |
| [Azure DevOps Push and Commit Insights](azure-dev-ops-push-and-commit-insights/manifest.json) | Bind the Repos connection and set the project and repository in every applicable action. Select an existing push ID in `Get_push_commits`, a commit in `Get_commit_changes` and `Report_status`, base/target commits in `Get_diffs`, and an existing path and commit version in `List_items`. The push must contain a commit and the selected path must return at least one item to pass the embedded validation steps. A live run writes a commit status through `Report_status`. |
| [Azure DevOps PR Discussion Automation](azure-dev-ops-pr-discussion-automation/manifest.json) | Bind the Repos connection and set the project and repository in every connector action, including `Cleanup_created_PR`'s nested `Abandon_PR`. Set distinct existing source/target branch refs in `Create_PR` with changes available to review. Live runs create a PR and discussion, add/edit a reply, add/remove a like, delete the reply, and attempt to abandon the created PR even if an intermediate step fails. Use a connection authorized for these operations. |
| [Azure Key Vault secret rotation](automate-azure-key-vault-secret-rotation/manifest.json) | Set the Key Vault connection and `Update_Secret` vault hostname to the same vault, authorize the workflow's managed identity to update secrets, and select the Teams approval team/channel. Approved updates create a new secret value and expiration; coordinate the change with downstream consumers. |
| [Excel feedback summary](excel-feedback-ai-teams-email/manifest.json) | Select the feedback workbook/table, Teams team/channel, and email recipient. |
| [Gmail attachments to Google Drive](gmail-email-attachments-google-drive/manifest.json) | Select the Gmail label and destination Google Drive folder. |
| [Google Sheets invoice reminders](google-sheets-gmail-invoice-reminders/manifest.json) | Update the spreadsheet, worksheet, column mappings, paid status, and time zone in `Settings`; align the recurrence time zone. |
| [Email invoice extraction to Excel](invoice-docintel-ai-excel/manifest.json) | Select the Outlook folder, Document Intelligence connection, and Excel workbook/table with the seven invoice-field columns used by `Add_Invoice_Row`. The first attachment must be the invoice PDF. |
| [Office 365 attachments to OneDrive for Business](office365-email-attachments-onedrive/manifest.json) | Select the Outlook mail folder and destination OneDrive for Business folder. |
| [Office 365 attachments to SharePoint](office365-email-attachments-sharepoint/manifest.json) | Select the Outlook mail folder, SharePoint site, and document-library folder. |
| [Outlook.com attachments to OneDrive](outlook-email-attachments-onedrive/manifest.json) | Select the Outlook.com mail folder and destination personal OneDrive folder. |
| [Google Sheets feedback summary](sheets-feedback-ai-gmail/manifest.json) | Replace the Google Sheet file id, select the feedback worksheet, and set the Gmail recipient. |
| [Excel invoice reminders with Outlook.com](weekday-excel-invoice-reminders-outlook-com/manifest.json) | Update the workbook/table, column mappings, paid status, and time zone in `Settings`; align the recurrence time zone. |
| [Azure DevOps Boards work item event automation](scenario-01-work-item-event-automation/manifest.json) | Bind the shared Boards connection, select the same project for the trigger and both actions, and configure the area path, team, supported work item type, and update fields. |
| [Azure DevOps Boards WIQL query reporting](scenario-04-wiql-query-reporting/manifest.json) | Bind the shared Boards connection, select the same project for all three actions, configure the saved query in both Get and Run, select the query's team context, and review the hourly schedule. |
| [Azure DevOps Boards sprint and iteration planning](scenario-05-sprint-iteration-planning/manifest.json) | Bind the shared Boards connection, select the same project/team for all three actions, choose an iteration and supported backlog level, and review the hourly schedule. |

Invoice reminder samples use fixed dates. Adjust those sample dates to exercise
the overdue, due-soon, and future-invoice cases relative to the day of a test run.
Keep redacted mock values as `"***"`; never replace them with real credentials.

The three Azure DevOps lifecycle, push-insights, and discussion templates require
no HTTP request body; resource selections are configured in the actions, not in
the trigger sample. Keep **all** connector mocks enabled for draft testing. Use a
dedicated test repository for live runs, configure every action first, and
disable mocks consistently, including nested cleanup actions. Mixing real writes
with mocked creation or cleanup can leave test artifacts behind or target a
synthetic resource ID. Cleanup abandons a created PR; it does not delete the PR,
its discussion history, or any source branches. Check Monitoring and clean up any
remaining test artifacts if an action or cleanup fails.

## GitHub issue to Azure DevOps Boards setup

The [`github-new-issue-to-azure-devops-boards` template](github-new-issue-to-azure-devops-boards/manifest.json)
keeps source and destination resource fields empty so imports do not subscribe to
the author's repository or write to the author's project. Configure the GitHub
trigger's **Owner** and **Repository**, bind both connector connections, and choose
the Boards action's **Project** before publishing. The default work item type is
**Issue**; select a type supported by the destination project's process if it does
not support Issue. The GitHub connection must be able to create and remove
repository webhooks, and the Boards connection must be able to create the selected
work item type.

Only `opened` issue events create a work item. The description uses the incoming
issue's `html_url`, so it follows the configured repository without editing an
expression. The trigger payload and mocked Boards response are synthetic sample
data. Keep the Boards action mock enabled for draft testing; disable it only when
intentionally testing real writes to a configured project.
