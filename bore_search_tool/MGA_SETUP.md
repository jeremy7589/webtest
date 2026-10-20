# Make good agreement (MGA) annual reporting: setup guide

The Bore Search Tool includes a reporting module for the annual make good agreement report that responsible tenure holders must lodge with OGIA by 31 October each year (Water Act 2000, section 437B; reporting period 1 October to 30 September). The form reproduces `MGA_reporting_template_v0.2.xlsx` field for field.

**How it works in production.** A company officer opens the tool, chooses their company, enters the access code OGIA issued to that company and their work email, and fills in one report per bore. On submit the page sends the report to a Power Automate flow owned by OGIA. The flow checks the access code and email domain, appends the row to OGIA's master register (an Excel workbook on OneDrive or SharePoint), emails a receipt from OGIA.UWIR@dlgwv.qld.gov.au to the officer with a copy to the OGIA mailbox, and returns a receipt number that the page shows. Nothing needs ArcGIS Online, company accounts or IT changes on the company side. Each company only ever sees its own reports because the page stores them per company in the officer's browser; the register itself is only visible to OGIA.

If the flow cannot be reached (outage, network block) the page offers to send the same report by email instead: it downloads the row as an Excel file and opens a pre-addressed email to OGIA.UWIR. A second, optional flow can file those emails into the register automatically.

## What is in this folder

| File | Purpose |
|---|---|
| `index.html` | The tool. Demo mode until `CONFIG.MGA.endpoint` is set (search for `CONFIG.MGA` near the top of the script). |
| `power_automate/MGA_master_register.xlsx` | The master register. Upload it to OneDrive or SharePoint, unchanged. Sheets: READ ME, MGA data (table `MGAData`), Tenure holders (table `TenureHolders`, access codes), Field description. |
| `power_automate/flow_A_http_submission.definition.json` | The submission flow, action by action, in Power Automate's own definition format. Use it as the reference while building the flow (section 3) or compare with Peek code afterwards. |
| `power_automate/flow_B_email_fallback.definition.json` | Optional flow that files emailed reports into the register (section 6). |
| `power_automate/sample_request.json`, `sample_response.json` | What the page sends and expects back. Use the request as the test body. |

## 1. Before you start (10 minutes)

1. **Licence.** The trigger "When an HTTP request is received" is a premium connector. Only the flow owner needs a Power Automate Premium (per user) licence; the company officers who submit need nothing. Excel Online (Business) and Office 365 Outlook are standard connectors. If OGIA cannot get a premium licence, use flow B only (email path, standard connectors) and leave `endpoint` empty: the page then submits by email every time.
2. **Owner account.** Build the flow under a shared or service account that OGIA controls (not a person who may leave), with Send As permission on the OGIA.UWIR@dlgwv.qld.gov.au shared mailbox (Microsoft 365 admin centre, Teams and groups, Shared mailboxes, Send as). "Send on behalf" is not enough.
3. **DLP check.** In the Power Platform admin centre (Policies, Data policies) confirm the environment's policy puts HTTP Request, Excel Online (Business) and Office 365 Outlook in the same group (usually Business). A policy that blocks the HTTP trigger shows as the flow being suspended after save.
4. **Upload the register.** Put `MGA_master_register.xlsx` in a OneDrive for Business folder of the owner account (or a SharePoint library). Do not rename sheets, tables or column headers. Open the Tenure holders sheet: replace the EmailDomain values with each company's real email domain if different, and keep the AccessCode values private (current codes: ARROW ARW-QVIK-J9VB, ORIGIN ORG-YUB2-5R2X, SANTOS SAN-FXLD-N0G3, QGC QGC-86MB-7V8U). Codes can be changed at any time; the flow reads the sheet on every submission.

## 2. Create flow A (about 25 minutes, click by click)

Power Automate (make.powerautomate.com) > My flows > New flow > **Instant cloud flow** > name `OGIA MGA submission` > trigger **When an HTTP request is received** > Create.

1. **Trigger.** Open the trigger. Who can trigger the flow: **Anyone**. Method: **POST**. Leave the Request Body JSON Schema empty (the page sends JSON as `text/plain` to avoid browser preflight; the next step parses it). Save once to obtain the URL (copy it later from the trigger: HTTP URL).
2. **Parse JSON** (Data Operations). Rename to `Parse report`. Content: expression `json(triggerBody())`. Schema: click "Use sample payload to generate schema" and paste `sample_request.json`, or paste the schema from the definition file.
3. **List rows present in a table** (Excel Online (Business)). Rename to `Lookup tenure holder`. Location: OneDrive for Business (or the SharePoint site). Document Library: OneDrive. File: `MGA_master_register.xlsx`. Table: `TenureHolders`. Show advanced options, Filter Query, expression: `concat('Code eq ''', toUpper(body('Parse_report')?['holder']), '''')`.
4. **Compose**. Rename to `Holder row`. Inputs, expression: `first(body('Lookup_tenure_holder')?['value'])`.
5. **Condition**. Rename to `Check access`. Add four rows joined with AND:
   - expression `length(body('Lookup_tenure_holder')?['value'])` is greater than `0`
   - expression `toLower(string(outputs('Holder_row')?['Active']))` is equal to `yes`
   - expression `outputs('Holder_row')?['AccessCode']` is equal to expression `body('Parse_report')?['accessCode']`
   - expression `endsWith(toLower(body('Parse_report')?['submitter']?['email']), toLower(outputs('Holder_row')?['EmailDomain']))` is equal to expression `true`
6. **If no** branch: **Response** (Request). Status code `403`. Headers: `Content-Type` `application/json` and `Access-Control-Allow-Origin` `*`. Body:
   `{ "ok": false, "error": "Access code not recognised for this tenure holder." }` (the definition file has a longer expression that distinguishes a wrong email domain; optional).
7. **If yes** branch: **Condition**. Rename to `Is verify`: expression `body('Parse_report')?['action']` is equal to `verify`.
   - If yes: **Response**, status `200`, same two headers, body `{ "ok": true, "holder": "@{outputs('Holder_row')?['Code']}", "holderName": "@{outputs('Holder_row')?['HolderName']}" }`.
   - If no (a submission), add the following in order:
     1. **Compose** `Submission ID`: `concat('MGA-', formatDateTime(utcNow(), 'yyyyMMdd'), '-', toUpper(substring(replace(guid(), '-', ''), 0, 6)))`
     2. **Compose** `Received at`: `convertTimeZone(utcNow(), 'UTC', 'E. Australia Standard Time', 'yyyy-MM-dd HH:mm')`
     3. **Add a row into a table** (Excel Online (Business)) `Add row to register`: same file, Table `MGAData`. The designer lists every column of the table. Fill each of the first 14 columns with the expression `body('Parse_report')?['report']?['templateRow']?['<column header>']` (for example `...['Tenure Holder']`, `...['RN']`, `...['Comments']`; the headers match the template exactly). Then: Submission ID = `outputs('Submission_ID')`, Submitted at = `outputs('Received_at')`, Submitted by = `body('Parse_report')?['submitter']?['email']`, Submitter name = `body('Parse_report')?['submitter']?['name']`, Replaces submission = `body('Parse_report')?['report']?['replacesSubmissionId']`, Source = `Bore Search Tool`, App version = `body('Parse_report')?['app']?['version']`.
     4. **Send an email from a shared mailbox (V2)** (Office 365 Outlook) `Email receipt`: Original Mailbox Address `OGIA.UWIR@dlgwv.qld.gov.au`; To = `body('Parse_report')?['submitter']?['email']`; Cc `OGIA.UWIR@dlgwv.qld.gov.au`; Subject and Body as in the definition file (receipt number, received time, tenure holder, period, bore, statuses, measures, comments, how to amend).
     5. **Response** `Respond submitted`: status `200`, the two headers, body `{ "ok": true, "submissionId": "@{outputs('Submission_ID')}", "receivedAt": "@{outputs('Received_at')}", "receiptTo": "@{body('Parse_report')?['submitter']?['email']}" }`.
     6. **Response** `Respond failed`: status `500`, the two headers, body `{ "ok": false, "error": "OGIA's register could not be updated. Please try again in a few minutes or send the report by email." }`. Open its settings (three dots, Configure run after) and tick **has failed** and **has timed out** for both `Add row to register` and `Email receipt`, unticking "is successful".
8. **Save**. Copy the trigger's HTTP URL (it includes a `sig=` parameter; it is generated on save and changes if you regenerate the key or re-import the flow).

## 3. Test the flow before touching the page (5 minutes)

Use the flow's own Test with a manual payload, or any HTTP client: POST the contents of `sample_request.json` to the URL with header `Content-Type: text/plain`, after replacing `accessCode` with the real Arrow code from the Tenure holders sheet. Expected: HTTP 200 with a body like `sample_response.json`, a new row in MGA data, and a receipt email in the OGIA.UWIR mailbox (and in the submitter address). Then post it again with a wrong code: expected HTTP 403 and no row. Check the run history (My flows, the flow, 28-day run history) for the exact action that failed if anything differs.

## 4. Switch the page to live mode

In `index.html` find `CONFIG.MGA` and set `endpoint` to the flow URL (keep the whole URL, including `sig=`). Leave `submitEmail` as the OGIA mailbox and `emailFallback: true`. Host the page over HTTPS. The demo role picker disappears automatically; the sheet now asks for company, access code and email.

Give each company its access code and the page URL. Tell them: one officer per submission, reports are kept in the browser they used, the receipt email is their proof of lodgement, and amendments are made by opening the submitted report and choosing Amend.

## 5. Each year

- 1 October: the page automatically offers the period that just ended (for example 2025-26, due 31 October 2026). Reports for a period that has not ended are kept as drafts.
- October: OGIA watches the MGA data sheet. Filter by Reporting period; where a bore has several Submission IDs keep the latest (Replaces submission names the earlier one). Rows arriving after 31 October show in the officers' list with a Late badge.
- After the deadline: copy the register to the records system as the workbook of record. Rotate access codes if staff have changed (edit the Tenure holders sheet; tell the companies).

## 6. Optional flow B: file emailed reports automatically (standard connectors)

Trigger **When a new email arrives in a shared mailbox (V2)** on OGIA.UWIR, folder Inbox, Subject Filter `MGA annual report`. Then **Html to text** (Content Conversion) on the message body, a **Condition** that the text contains `<<MGA-JSON>>`, a **Compose** that cuts the text between `<<MGA-JSON>>` and `<</MGA-JSON>>`, **Parse JSON** on `json(replace(replace(outputs('Block'), decodeUriComponent('%0D'), ''), decodeUriComponent('%0A'), ''))`, and **Add a row into a table** mapping `body('Parse_block')?['report']?['templateRow']?['<column>']` as in flow A with Source `Email`. If the block is missing (someone emailed the Excel file by hand), **Flag** the email for manual entry. Full detail in `flow_B_email_fallback.definition.json`.

## 7. Security notes for the director

- The access code is a shared secret per company, sent over HTTPS and checked by OGIA's flow together with the officer's email domain. It stops casual misuse and mistakes, not a determined insider; the receipt copied to the OGIA mailbox and the Submitted by column make every submission attributable and reviewable.
- The flow URL contains a signature that lets anyone who has it call the flow; without a valid access code the flow only answers 403 and writes nothing. Regenerate the key (trigger settings) if the URL leaks, then update `endpoint`.
- The page never stores reports anywhere but the officer's browser and OGIA's register; nothing goes to a third party. The register holds no bore owner names, phone numbers or money amounts: the form blocks those in comments.

## Questions to settle with the director

- Does a receipt from the flow count as lodgement under s437B, or must the company still email the workbook? (If the latter, keep flow A and ask companies to also attach the Excel export; the receipt still proves the date.)
- Definitive list of tenure holders for the Tenure holders sheet (the UWIR 2025 tenure layer also lists Senex, AGL, ADZ Energy, Bridgeport Energy, Denison Gas and OGT) and their email domains.
- Who at OGIA owns the flow and the register, and who can change access codes.
- Retention: the register holds negotiation status per property; confirm the records class and who may open the workbook.
