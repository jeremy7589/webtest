# Make good agreement (MGA) annual reporting: setup guide

The Bore Search Tool includes a reporting module for the annual make good agreement report that responsible tenure holders must lodge with OGIA by 31 October each year (Water Act 2000, section 437B; reporting period 1 October to 30 September). The form reproduces `MGA_reporting_template_v0.2.xlsx` field for field.

**How it works in production.** A company officer opens the tool, chooses their company, enters the access code OGIA issued to that company and their work email, and fills in one report per bore. On submit the page sends the report to a Power Automate flow owned by OGIA (flow A). The flow checks the access code and email domain, appends the row to OGIA's master register (an Excel workbook on OneDrive or SharePoint), answers the page with a receipt number, and then emails a receipt from OGIA.UWIR@dlgwv.qld.gov.au to the officer with a copy to the OGIA mailbox. Nothing needs ArcGIS Online, company accounts or IT changes on the company side. Each company only ever sees its own reports because the page stores them per company in the officer's browser; the register itself is only visible to OGIA.

If the flow cannot be reached (outage, network block, out-of-date flow address) the page offers to send the same report by email instead: it downloads the row as an Excel file and opens a pre-addressed email to OGIA.UWIR carrying a coded copy of the row. A second, optional flow (flow B) files those emails into the register automatically after checking the sender's domain; emails it cannot read are flagged for manual entry.

Every version of a report carries a client reference (`ClientRef`). Both flows look it up before adding a row, so a retry after a timeout, or an email sent twice, never produces a second row.

**Pilot first.** To show the whole chain working before OGIA is involved, follow `PILOT_SETUP.md`: it builds the same two flows in a personal Power Automate environment with the pilot owner's own OneDrive and mailbox (the `power_automate/pilot` folder holds the matching flow definitions and register). This guide is the production version for OGIA's shared mailbox and register.

## What is in this folder

| File | Purpose |
|---|---|
| `index.html` | The tool. Demo mode until `CONFIG.MGA.endpoint` is set (search for `CONFIG.MGA` near the top of the script). |
| `power_automate/MGA_master_register.xlsx` | The master register. Upload it to OneDrive or SharePoint, unchanged. Sheets: READ ME, MGA data (table `MGAData`, 22 columns), Tenure holders (table `TenureHolders`, access codes), Field description. |
| `power_automate/flow_A_http_submission.definition.json` | The submission flow, action by action, in Power Automate's own definition format. Use it as the reference while building the flow (section 2) or compare with Peek code afterwards. Every action carries a description saying which designer action it is. |
| `power_automate/flow_B_email_fallback.definition.json` | Optional flow that files emailed reports into the register (section 6). |
| `power_automate/sample_request.json`, `sample_request_verify.json`, `sample_response.json`, `sample_response_duplicate.json` | What the page sends (a submission and a sign-in check) and expects back. Use them as test bodies. |
| `power_automate/email_bodies/*.html` | The receipt and notice bodies as plain HTML, ready to paste into the designer's code view. |
| `power_automate/sample_email.txt` | An email exactly as the page prepares it (subject, text and coded block), for testing flow B. |

## 1. Before you start (10 minutes)

1. **Licence.** The trigger "When an HTTP request is received" is a premium connector. Only the flow owner needs a Power Automate Premium (per user) licence; the company officers who submit need nothing. Excel Online (Business), Office 365 Outlook and Content Conversion are standard connectors. If OGIA cannot get a premium licence, build flow B only and leave `endpoint` empty: the page then lodges by email every time.
2. **Owner account.** Build the flows under a shared or service account that OGIA controls (not a person who may leave), with **Send As** permission on the OGIA.UWIR@dlgwv.qld.gov.au shared mailbox (Microsoft 365 admin centre, Teams and groups, Shared mailboxes, Send as). "Send on behalf" is not enough. The mailbox must be a true shared mailbox, not a personal mailbox converted to shared (the shared-mailbox send action does not work with those).
3. **DLP check.** In the Power Platform admin centre (Policies, Data policies) confirm the environment's policy puts HTTP Request, Excel Online (Business), Office 365 Outlook and Content Conversion in the same group (usually Business). A tenant data policy that blocks or separates the HTTP trigger shows either as a data-policy error when you save, or as the flow saving and then appearing as Suspended in My flows (reason: company DLP violation); in both cases only the Power Platform administrator can change the policy.
4. **Upload the register.** Put `MGA_master_register.xlsx` in a OneDrive for Business folder of the owner account (or a SharePoint library). Do not rename sheets, tables or column headers. Open the Tenure holders sheet: replace the EmailDomain values with each company's real email domain if different, written with the leading `@` as shipped, for example `@arrowenergy.com.au` (never leave one blank: the flow refuses a company with a blank domain), and replace every AccessCode placeholder (`SET-BY-OGIA-...`) with a code of OGIA's own, for example three groups of four letters and digits. The codes must never be written into this guide, the page or anything published; this folder has been in a public repository, which is why the file ships with placeholders. Codes can be changed at any time; the flow reads the sheet on every submission.

## 2. Create flow A (about 35 minutes, click by click)

Power Automate (make.powerautomate.com) > My flows > New flow > **Instant cloud flow** > name `OGIA MGA submission` > trigger **When an HTTP request is received** > Create.

Action names matter: the expressions below refer to earlier actions by name with spaces written as underscores (`body('Parse_report')`). Rename each action exactly as shown before writing expressions that use it.

1. **Trigger.** Open the trigger. Who can trigger the flow: **Anyone** (listed as a legacy setting below "Any user in my tenant"; the page has no Microsoft sign-in, so the other two modes cannot work). Method: **POST**. Leave the Request Body JSON Schema empty (the page sends JSON as `text/plain` to avoid browser preflight; the next step parses it). In the trigger's Settings turn on **Concurrency Control** with Degree of Parallelism **1**, so two companies submitting at the same moment never write the workbook together. Save once to obtain the URL (copy it later from the trigger: HTTP URL).
2. **Parse JSON** (Data Operations). Rename to `Parse report`. Content: expression `json(string(triggerBody()))` (string() makes it work whether a test tool sent `application/json` or the page sent `text/plain`). Schema: paste the `schema` object of the `Parse_report` action from `flow_A_http_submission.definition.json` exactly as it is. Do not use "Use sample payload to generate schema": a schema generated from a submission types every field, and the page's sign-in check (action `verify`) carries no report at all and unregistered bores have an empty RN, so those runs would fail before any Response and the page would show the service as unavailable.
3. **List rows present in a table** (Excel Online (Business)). Rename to `Lookup tenure holder`. Location: OneDrive for Business (or the SharePoint site). Document Library: OneDrive. File: `MGA_master_register.xlsx`. Table: `TenureHolders`. Show advanced options, Filter Query, expression:
   `concat('Code eq ''', toUpper(string(coalesce(body('Parse_report')?['holder'], ''))), '''')`
4. **Compose**. Rename to `Holder row`. Inputs, expression:
   `if(greater(length(body('Lookup_tenure_holder')?['value']), 0), first(body('Lookup_tenure_holder')?['value']), json('{}'))`
   (an empty object when the code is unknown, so the checks below compare against blanks instead of failing on null).
5. **Condition**. Rename to `Check access`. Add six rows joined with **AND** (each left side is an expression; `e` below stands for `string(coalesce(body('Parse_report')?['submitter']?['email'], ''))`, written out in full each time):
   - `length(body('Lookup_tenure_holder')?['value'])` is greater than `0`
   - `toLower(string(coalesce(outputs('Holder_row')?['Active'], '')))` is equal to `yes`
   - `toUpper(string(coalesce(outputs('Holder_row')?['AccessCode'], '#none')))` is equal to expression `toUpper(string(coalesce(body('Parse_report')?['accessCode'], '')))`
   - `length(string(coalesce(outputs('Holder_row')?['EmailDomain'], '')))` is greater than `1`
   - `and(equals(length(split(e, '@')), 2), not(contains(e, ';')), not(contains(e, ',')), not(contains(e, ' ')), less(length(e), 255))` is equal to expression `true` (exactly one well-formed address: the receipt is sent to it, so a list of addresses must be refused)
   - `equals(toLower(last(split(e, '@'))), toLower(replace(string(coalesce(outputs('Holder_row')?['EmailDomain'], '#none')), '@', '')))` is equal to expression `true` (the part after the last `@` must equal the company's domain, whether or not the sheet's EmailDomain was typed with the `@`)
   The exact expressions are in the definition file under `Check_access`.
6. **If no** branch: **Response** (Request). Rename `Respond denied`. Status code `403`. Header `Content-Type` `application/json`. Body:
   `{ "ok": false, "error": "Access code not recognised for this tenure holder." }` (the definition file has a longer expression that says "Use a <domain> email address" when the code is right, the company active, and only the email domain wrong; optional).
7. **If yes** branch: **Condition**. Rename to `Is verify`: expression `body('Parse_report')?['action']` is equal to `verify`.
   - **If yes**: **Response** `Respond verified`, status `200`, header `Content-Type` `application/json`, body `{ "ok": true, "holder": "@{outputs('Holder_row')?['Code']}", "holderName": "@{outputs('Holder_row')?['HolderName']}" }`.
   - **If no** (a submission), add the following in order:
     1. **Compose** `Client ref`: `toUpper(replace(string(coalesce(body('Parse_report')?['report']?['clientRef'], '')), ' ', ''))`
     2. **List rows present in a table** `Find existing`: same file, Table `MGAData`, Filter Query expression `if(empty(outputs('Client_ref')), 'ClientRef eq ''NONE-NEVER-MATCHES''', concat('ClientRef eq ''', outputs('Client_ref'), ''''))`, Top Count `1`.
     3. **Condition** `Already lodged`: `length(body('Find_existing')?['value'])` is greater than `0`.
        - **If yes**: **Response** `Respond already`, status `200`, header `Content-Type` `application/json`, body
          `{ "ok": true, "duplicate": true, "submissionId": "@{first(body('Find_existing')?['value'])?['Submission ID']}", "receivedAt": "@{first(body('Find_existing')?['value'])?['Submitted at']}", "receiptTo": "@{body('Parse_report')?['submitter']?['email']}" }`
          (this is what makes a retry after a timeout safe: the page shows the existing receipt and nothing is filed twice).
        - **If no**, in order:
          1. **Compose** `Submission ID`: `concat('MGA-', formatDateTime(convertTimeZone(utcNow(), 'UTC', 'E. Australia Standard Time'), 'yyyyMMdd'), '-', toUpper(substring(replace(guid(), '-', ''), 0, 6)))`
          2. **Compose** `Received at`: `convertTimeZone(utcNow(), 'UTC', 'E. Australia Standard Time', 'yyyy-MM-dd HH:mm')`
          3. **Add a row into a table** (Excel Online (Business)) `Add row to register`: same file, Table `MGAData`. The designer lists every column of the table. Fill them as follows:
             - Tenure Holder = `outputs('Holder_row')?['HolderName']` (from the verified register row, never from the page)
             - RN = `body('Parse_report')?['report']?['templateRow']?['RN']`
             - the next 12 template columns (Bore assessment status to Reporting period) = `body('Parse_report')?['report']?['templateRow']?['<column header>']`, the header spelt exactly as in the table (for example `...['Bore assessment status']`, `...['Comments']`)
             - Submission ID = `outputs('Submission_ID')`, Submitted at = `outputs('Received_at')`, Submitted by = `body('Parse_report')?['submitter']?['email']`, Submitter name = `body('Parse_report')?['submitter']?['name']`, Replaces submission = `body('Parse_report')?['report']?['replacesSubmissionId']`, Source = `Bore Search Tool`, App version = `body('Parse_report')?['app']?['version']`, ClientRef = `outputs('Client_ref')`.
             Open this action's Settings and set the **Retry Policy** to Fixed Interval, Count `2`, Interval `PT10S`, so a locked workbook makes the run fail inside the 45 seconds the page waits rather than hanging for minutes.
          4. **Response** `Respond submitted`: status `200`, header `Content-Type` `application/json`, body
             `{ "ok": true, "submissionId": "@{outputs('Submission_ID')}", "receivedAt": "@{outputs('Received_at')}", "receiptTo": "@{body('Parse_report')?['submitter']?['email']}" }`.
             The page is answered **before** the receipt email is sent, so a mail problem can never turn a filed report into an error.
          5. **Response** `Respond failed`: status `500`, header `Content-Type` `application/json`, body
             `{ "ok": false, "error": "OGIA's register could not be updated and nothing was filed. Try again in a few minutes or send the report by email." }`.
             Open its menu (three dots), **Configure run after**, and set it to run after `Add row to register` only, ticking **has failed** and **has timed out** and unticking **is successful**. Do not add a second predecessor: an action with two predecessors runs only when both finished in a ticked state, which is why the earlier draft of this flow could never return this response.
          6. **Compose** `Receipt fields`. Configure run after `Respond submitted` with **is successful**, **has failed** and **has timed out** all ticked (the receipt must still go out when the browser gave up waiting before the response). Inputs: copy the whole `inputs` object of the `Receipt_fields` action from the definition file (19 entries). Each entry wraps one value that came from the page in `replace(replace(replace(string(coalesce(..., '')), '&', '&amp;'), '<', '&lt;'), '>', '&gt;')`, so nothing a caller types can inject HTML or links into an email sent from OGIA's mailbox; the receipt body and subject read only these escaped values.
          7. **Send an email from a shared mailbox (V2)** (Office 365 Outlook) `Email receipt`: Original Mailbox Address `OGIA.UWIR@dlgwv.qld.gov.au`; To = `body('Parse_report')?['submitter']?['email']`; Cc `OGIA.UWIR@dlgwv.qld.gov.au`; Subject = `concat('MGA annual report received: ', outputs('Submission_ID'), ' (', outputs('Holder_row')?['HolderName'], ', RN ', outputs('Receipt_fields')?['rn'], ', period ', outputs('Receipt_fields')?['period'], ')')`. Body: in the Body field click the `</>` (code view) button, then paste the whole of `email_bodies/flow_A_receipt_body.html` (plain HTML, ready to paste; do not copy it out of the JSON file, where every quote carries a backslash). When you leave the field, each `@{...}` becomes a dynamic-content token; open Peek code on the action afterwards and check that the Body shows `@{outputs('Submission_ID')}` and the other expressions, not literal text. The subject must keep starting with "MGA annual report received" because flow B ignores exactly that.
          8. **Send an email (V2)** (Office 365 Outlook, from the owner's own mailbox) `Receipt failed notice`: To `OGIA.UWIR@dlgwv.qld.gov.au`, Subject `concat('MGA receipt email failed: ', outputs('Submission_ID'))`, Body from `email_bodies/flow_A_receipt_failed_notice.html` (code view again), Importance High. Configure run after: `Email receipt` **has failed** or **has timed out** only. This is how OGIA learns that a filed report got no receipt (usually a Send As permission problem).
8. **Save**. Copy the trigger's HTTP URL (it includes a `sig=` parameter; it is generated on save and changes if you regenerate the key or re-import the flow).

## 3. Test the flow before touching the page (10 minutes)

1. With any HTTP client (or the flow's Test pane), POST the contents of `sample_request_verify.json` to the URL with header `Content-Type: text/plain`, after replacing `accessCode` with the Arrow code from the Tenure holders sheet. Expected: HTTP 200 with `"ok": true` and the holder name. This is the call the page makes at sign-in; it carries no report.
2. POST the contents of `sample_request.json` the same way, with the Arrow code and any new letters in `clientRef`. Expected: HTTP 200 with a body like `sample_response.json`, a new row in MGA data (Tenure Holder "Arrow Energy", ClientRef filled), and a receipt email in the OGIA.UWIR mailbox and in the submitter address, showing a formatted table with the receipt number filled in.
3. Wait about a minute (the Excel connector's filter can lag a fresh write), then POST the same submission body again unchanged. Expected: HTTP 200 like `sample_response_duplicate.json` and **no** second row.
4. POST with a wrong `accessCode`. Expected: HTTP 403 and no row. POST with `holder` set to `NOBODY`. Expected: HTTP 403 (not a failed run).
5. Rename the MGAData table temporarily (or point the action at a wrong table) and POST once more. Expected: HTTP 500 with the "could not be updated" message, not a 502 from the gateway. Put the table name back.
6. **Browser check (do not skip).** Host `index.html` over HTTPS with `endpoint` set (section 4), open it in Edge or Chrome, open the MGA module and sign in with a real code. Sign-in appears to succeed even when the flow was not reached, because the page then falls back to email lodgement: the sign that the flow answered is a banner that reads only "Reporting as <company> · <email>", with no "(service unavailable: email submission)" suffix, no "Retry connection" chip and no toast about the submission address. If you see those, press F12: a CORS error means the header below is missing; a 401 or 404 means the URL in `endpoint` is wrong or stale. The Response actions deliberately carry no `Access-Control-Allow-Origin` header: in checks made on 21 October 2026, Microsoft's gateway added `Access-Control-Allow-Origin: *` to every answer on both the old `logic.azure.com` and the new `api.powerplatform.com` flow addresses, and browser pages that call flows directly rely on that. If the sign-in nevertheless fails and the browser console (F12) shows a CORS error saying the header is missing, add header `Access-Control-Allow-Origin` with value `*` to each of the five Response actions and test again. If the console instead reports the header "contains multiple values", remove it again. It is a five-minute fix either way.

Check the run history (My flows, the flow, 28-day run history) for the exact action that failed if anything differs.

## 4. Switch the page to live mode

In `index.html` find `CONFIG.MGA` and set `endpoint` to the flow URL (keep the whole URL, including `sig=`). Leave `submitEmail` as the OGIA mailbox, `emailFallback: true` and `timeoutMs: 45000`. Host the page over HTTPS. The demo role picker disappears automatically; the sheet now asks for company, access code and email.

Give each company its access code and the page URL. Tell them: one officer per submission, reports are kept in the browser they used, the receipt email is their proof of lodgement, and amendments are made by opening the submitted report and choosing Amend. If the page ever says the submission address is out of date, the flow URL has changed (key regenerated, flow re-imported, or a Microsoft address change such as the retirement of `logic.azure.com` flow addresses on 30 November 2025): update `endpoint` and re-publish the page; officers can lodge by email in the meantime.

## 5. Each year: OGIA runbook

**Mid September (owner of the flow):**
- Confirm the flow is On, its owner account still holds the Premium licence, and the connections are not expired (My flows, the flow, Details). Fix any "connection needs attention" banner.
- POST `sample_request.json` once (section 3 step 1 and 2) and delete the test rows afterwards. This proves the trigger URL still works; Microsoft has moved HTTP trigger hosts before and the old URL stops working on a date they announce.
- Confirm "Who can trigger the flow" is still Anyone, and that the receipt email arrived from OGIA.UWIR (Send As still works).
- Open the hosted page, sign in with a code: no CORS error, no "address out of date" message.
- Delete the `MGA-EXAMPLE` row if it is still in MGA data.

**1 October:** the page automatically offers the period that just ended (for example 2025-26, due 31 October 2026). Reports for a period that has not ended are kept as drafts.

**October (OGIA mailbox owner):**
- Watch the OGIA.UWIR Inbox for flagged emails and "ACTION needed" notices: those reports were emailed and need to be pasted into MGA data by hand (Source = Manual; copy ClientRef from the attached file) or checked with the company (unverified sender). Open the register in Excel for the web, not the desktop app, while the flows are live: the connector cannot write to a workbook that desktop Excel holds open, and a write can take up to 30 seconds to show.
- Filter MGA data by Reporting period; where a bore has several Submission IDs keep the latest (Replaces submission names the earlier one). Spot-check Source = Email rows against the sender's domain.
- Rows arriving after 31 October show in the officers' list with a Late badge; the Submitted at column is the evidence.

**November:** copy the register to the records system as the workbook of record. Rotate access codes if company staff have changed (edit the Tenure holders sheet; tell the companies). Reconcile: one current row per bore per tenure holder.

## 6. Optional flow B: file emailed reports automatically (standard connectors, about 30 minutes)

Trigger **When a new email arrives in a shared mailbox (V2)** on `OGIA.UWIR@dlgwv.qld.gov.au`, folder Inbox, Subject Filter `MGA lodgement by email` (the subject the page writes). In the trigger's Settings add two **Trigger conditions**, so flow A's own receipts and anything the OGIA mailbox sends never start a run:
- `@not(startsWith(toLower(string(coalesce(triggerOutputs()?['body/subject'], ''))), 'mga annual report received'))`
- `@not(equals(toLower(string(coalesce(triggerOutputs()?['body/from'], ''))), 'ogia.uwir@dlgwv.qld.gov.au'))`

Then, in order (names as before, spaces become underscores in expressions):
1. **Html to text** (Content Conversion). Content, expression: `if(equals(triggerOutputs()?['body/isHtml'], true), triggerOutputs()?['body/body'], replace(replace(string(coalesce(triggerOutputs()?['body/body'], '')), '<', '&lt;'), '>', '&gt;'))` (a plain-text email is escaped first, otherwise the converter would swallow the `<<MGA-JSON>>` markers as tags).
2. **Compose** `Text compact`: `replace(replace(replace(replace(string(coalesce(body('Html_to_text'), '')), decodeUriComponent('%0D'), ''), decodeUriComponent('%0A'), ''), decodeUriComponent('%09'), ''), ' ', '')`. The converter breaks lines every 80 characters and mail programs wrap text too; removing all whitespace first means a break can never split a marker or the coded block (base64 has no spaces of its own).
3. **Condition** `Has block`: `indexOf(outputs('Text_compact'), '<<MGA-JSON>>')` is greater than `-1` AND `indexOf(outputs('Text_compact'), '<</MGA-JSON>>')` is greater than `-1`.
   - **If no**: **Flag email (V2)** (Message Id from the trigger, Flag Status `flagged`, Original Mailbox Address OGIA.UWIR), then **Send an email (V2)** to OGIA.UWIR with subject `ACTION needed: emailed make good report needs manual entry` and the body from `email_bodies/flow_B_notice_manual_entry.html` (paste in code view). The page omits the block when the comments are long, so this branch is normal, not an error.
   - **If yes**, continue:
4. **Compose** `Block`: `substring(outputs('Text_compact'), add(indexOf(outputs('Text_compact'), '<<MGA-JSON>>'), 12), sub(indexOf(outputs('Text_compact'), '<</MGA-JSON>>'), add(indexOf(outputs('Text_compact'), '<<MGA-JSON>>'), 12)))`
5. **Compose** `Decoded`: `base64ToString(outputs('Block'))`.
6. **Parse JSON** `Parse block`: content `json(outputs('Decoded'))`, schema from the definition file. Keys: `h` holder code, `p` period, `e` email, `n` name, `ref` client reference, `rep` replaced submission, `app` version, `r` the row with `rn, bas, bad, sod, bao, mgs, agd, mgt, dcs, dcd, cmt, bn` (RN, Bore assessment status, Bore assessment date, Submitted to OGIA date, Bore assessment outcome, MGA status, Agreement Date, Make good measure type, Decommission status, Decommission date, Comments, Bore name).
7. **List rows present in a table** `Lookup tenure holder` on `TenureHolders`, Filter Query `concat('Code eq ''', toUpper(string(coalesce(body('Parse_block')?['h'], ''))), '''')`, and **Compose** `Holder row` exactly as in flow A step 4.
8. **Condition** `Check sender` (AND): the same rows as flow A's `Check access` except the access-code row, with `triggerOutputs()?['body/from']` in place of the submitter email (five rows: a row found, Active yes, EmailDomain not blank, one well-formed address, domain after the `@` matches). Copy them from `Check_sender` in the definition file.
   - **If no**: **Flag email (V2)** and **Send an email (V2)** to OGIA.UWIR, subject `ACTION needed: emailed make good report from an unverified sender`, body from `email_bodies/flow_B_notice_unverified_sender.html` (code view). Nothing is filed: an email cannot carry the access code, so the sender's domain is the only check, and it must match the Tenure holders sheet.
   - **If yes**: **Compose** `Client ref` = `toUpper(replace(string(coalesce(body('Parse_block')?['ref'], '')), ' ', ''))`; **List rows present in a table** `Find existing` on `MGAData` with the same Filter Query as flow A's `Find existing` action (section 2, step 7, item 2); **Condition** `Already filed` (`length(body('Find_existing')?['value'])` greater than `0`): if yes a **Compose** noting the duplicate, if no **Add a row into a table** on `MGAData`: Tenure Holder = `outputs('Holder_row')?['HolderName']`, RN = `body('Parse_block')?['r']?['rn']`, each template column = `body('Parse_block')?['r']?['<short key>']`, Reporting period = `body('Parse_block')?['p']`, Submission ID = `concat('EMAIL-', outputs('Client_ref'))`, Submitted at = `convertTimeZone(utcNow(), 'UTC', 'E. Australia Standard Time', 'yyyy-MM-dd HH:mm')`, Submitted by = `triggerOutputs()?['body/from']`, Submitter name = `body('Parse_block')?['n']`, Replaces submission = `body('Parse_block')?['rep']`, Source = `Email`, App version = `body('Parse_block')?['app']`, ClientRef = `outputs('Client_ref')`.

Test it by sending `sample_email.txt` (subject line and body, in HTML or plain-text format) from an address on a listed domain to OGIA.UWIR, and once more from a personal address: the first files a row with Submission ID `EMAIL-...`, the second is flagged. Full detail in `flow_B_email_fallback.definition.json`.

## 7. Security notes for the director

- The access code is a shared secret per company, sent over HTTPS and checked by OGIA's flow together with the officer's email domain. It stops casual misuse and mistakes, not a determined insider; the receipt copied to the OGIA mailbox and the Submitted by column make every submission attributable and reviewable. The Tenure Holder written to the register always comes from OGIA's own Tenure holders sheet, so a code for one company cannot file rows under another company's name.
- The flow URL contains a signature that lets anyone who has it call the flow, and it is visible in the page source by design. Without a valid access code the flow only answers 403 and writes nothing, but every call still consumes a flow run and one Excel read, so the production flow should run under a Premium licence (40,000 requests a day) rather than a trial or developer plan, and the 28-day run history is worth a glance in October. Regenerate the key (trigger settings) if the URL leaks or misuse appears, then update `endpoint` and re-publish the page. Until the page is updated, officers see "submission address out of date" and lodge by email.
- Email lodgement cannot carry the access code. Flow B therefore files an emailed report only when the sender's domain matches the company's EmailDomain; anything else is flagged for a person to check. Sender addresses can be forged from outside unless the department rejects mail that fails DMARC, so treat Source = Email rows as needing a glance.
- The page never stores reports anywhere but the officer's browser and OGIA's register; nothing goes to a third party. The register holds no bore owner names, phone numbers or money amounts: the form blocks those in comments, and the receipt email escapes whatever text the submitter typed.
- The demonstration copy (no endpoint set) shows fictitious statuses against real bore numbers; every demo comment starts with "(demo text)" and demo exports are marked "DEMONSTRATION DATA". Keep the demo copy off public pages once the live page exists.

## Questions to settle with the director

- Does a receipt from the flow count as lodgement under s437B, or must the company still email the workbook? (If the latter, keep flow A and ask companies to also attach the Excel export; the receipt still proves the date.)
- Definitive list of tenure holders for the Tenure holders sheet (the UWIR 2025 tenure layer also lists Senex, AGL, ADZ Energy, Bridgeport Energy, Denison Gas and OGT) and their email domains.
- Who at OGIA owns the flow and the register, and who can change access codes.
- Retention: the register holds negotiation status per property; confirm the records class and who may open the workbook.
