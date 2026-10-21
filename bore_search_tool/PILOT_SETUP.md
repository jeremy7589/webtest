# MGA reporting pilot: run the whole chain in your own Microsoft environment

This gets the Bore Search Tool's MGA module working end to end (page, flow, Excel register, receipt email) using only things you control: a Power Automate environment that belongs to you, a workbook in your own OneDrive, your own mailbox (Jeremy.Wolff@dlgwv.qld.gov.au) and your personal GitHub Pages site. Nothing touches OGIA's mailbox, OneDrive or Power Platform environment, so you can demonstrate it to your manager first and hand the production version (`MGA_SETUP.md`) to OGIA afterwards.

Time: about 1.5 hours the first time, most of it clicking through flow A. Everything below uses the `power_automate/pilot` folder.

| Pilot file | What it is |
|---|---|
| `pilot/MGA_master_register_pilot.xlsx` | The register, with every company's EmailDomain set to `@dlgwv.qld.gov.au` so you can sign in as any of the four companies with your own address. Same access codes as production. |
| `pilot/flow_A_http_submission.definition.json` | Flow A for your own mailbox: receipts go out with "Send an email (V2)" from you, copies and failure notices come to you. |
| `pilot/flow_B_email_fallback.definition.json` | Flow B on your own Inbox ("When a new email arrives (V3)"). Optional for the demo. |
| `pilot/sample_request.json`, `sample_response*.json`, `sample_email.txt` | Test payloads. The sample email is addressed to you. |

The page (`index.html`) is already set to send email lodgements and show your address: `CONFIG.MGA.submitEmail` is `Jeremy.Wolff@dlgwv.qld.gov.au`. For production, change it to `OGIA.UWIR@dlgwv.qld.gov.au` together with the flow URL.

## Step 1. Get a Power Automate environment of your own (15 minutes)

The submission flow needs the premium trigger "When an HTTP request is received". You do not need a paid licence for a pilot, but the free routes are closing, so the dates below matter (checked against Microsoft Learn on 21 October 2026).

**Option A: Power Apps Developer Plan (free; sign up before 15 November 2026).** Go to https://www.microsoft.com/power-platform/products/power-apps/free, choose "Start free" and sign in with your work account (Jeremy.Wolff@dlgwv.qld.gov.au; personal Microsoft accounts are refused). Signing up creates a personal developer environment in the department's tenant, named after you, that only you use; it includes all premium connectors for development and testing, 750 flow runs a month, and nothing in it is visible in OGIA's environment. Microsoft is retiring these environments: from 15 November 2026 signing up no longer creates one, existing ones are suspended on 15 December 2026 and deleted on 15 January 2027. For a manager demo in the next few weeks that is fine; it is not a home for the flows beyond mid December. Until then the usual inactivity rule also applies: an environment nobody has used for 30 days is disabled (warnings at 23 and 27 days) and deleted 15 days later, so open the flow or run a test once a fortnight.

Afterwards, in make.powerautomate.com use the environment picker (top right) to switch from the department's default environment to your developer environment before you create anything. Everything in the rest of this guide happens inside that environment.

If the sign-up stops with a message such as "Your tenant's administrators have disabled environment creation for non-admin users", "Self service signup is blocked by tenant policy", "A self-service signup plan is required to successfully complete this request" or "Your IT department turned off signup", the department has restricted it: go to option B.

**Option B: 90-day Power Automate trial licence, in a Trial environment.** In make.powerautomate.com choose "Try free" (or Settings, View my licenses, Start a trial): the self-service trial gives your account the same rights as Power Automate Premium for 90 days, including the HTTP trigger. To keep the pilot out of the shared default environment, create your own Trial environment once the trial licence is active (it is the licence that entitles you to one): Power Platform admin centre (admin.powerplatform.microsoft.com), Environments, New, Type "Trial", 30 days, extendable once by another 30 days in its last week; it is deleted after 30 days without activity. If the Trial type is missing or refused, build in the default environment instead: the flow is still yours and private, only visible to tenant administrators. If "Try free" does not complete, trials are blocked for the tenant: go to option C.

**Option C: ask ICT for one Power Automate Premium (per user) licence** assigned to you, quoting the demo. This is also what OGIA needs for production, so the request is worth making early.

**Not available:** the Microsoft 365 Developer Program sandbox (a free test tenant) now requires a Visual Studio Professional or Enterprise subscription or a Microsoft partner membership.

Two checks before you continue:
- In your environment, Data, Connections: create connections for Excel Online (Business) and Office 365 Outlook with your work account.
- Data Loss Prevention policies set by the department apply to developer and trial environments too. If the flow refuses to save with a DLP message when you add the HTTP request trigger, the tenant policy separates or blocks HTTP connectors, and only the Power Platform administrator can change that. That is the one blocker this guide cannot route around; the email-only path (flow B, standard connectors) still works in that case and the page lodges every report by email.

## Step 2. Upload the pilot register (2 minutes)

Put `pilot/MGA_master_register_pilot.xlsx` in a folder of your OneDrive for Business, for example `Documents/MGA pilot`. Do not rename the sheets, the tables (`MGAData`, `TenureHolders`) or any column header. Open it once in Excel online and close it again, so OneDrive has finished indexing it before the flow looks for it.

## Step 3. Build flow A (about 40 minutes)

Follow section 2 of `MGA_SETUP.md` step by step, with these pilot differences:

- **File:** choose `MGA_master_register_pilot.xlsx` in your OneDrive wherever the production guide says `MGA_master_register.xlsx`.
- **Step 7.vii, the receipt:** use **Send an email (V2)** (not "from a shared mailbox"). Leave "From" empty so it sends as you. To = `body('Parse_report')?['submitter']?['email']`, Cc = `Jeremy.Wolff@dlgwv.qld.gov.au`, subject and body exactly as the production guide (copy the HTML body from `pilot/flow_A_http_submission.definition.json`, action `Email_receipt`).
- **Step 7.viii, the failure notice:** To = `Jeremy.Wolff@dlgwv.qld.gov.au`.
- **Trigger:** "Who can trigger the flow" shows "Anyone" as a legacy setting below "Any user in my tenant"; pick Anyone, the page cannot sign in to Microsoft.
- Everything else (trigger settings, Parse report, the lookups, the five-row condition, Client ref and Find existing, the Add row mapping with Tenure Holder from `outputs('Holder_row')?['HolderName']`, Respond submitted before the email, Respond failed's run-after, the retry policy) is identical. The definitions in `pilot/` already contain these addresses, so you can compare with Peek code at any time.

Save, then copy the trigger's HTTP URL.

## Step 4. Test the flow without the page (10 minutes)

Use Postman, Insomnia, or the flow's own Test pane:

1. POST the contents of `pilot/sample_request.json` to the URL with header `Content-Type: text/plain`, after changing `accessCode` to `ARW-QVIK-J9VB` (the Arrow code in the pilot register); the pilot sample already uses your own address as the submitter, which the pilot register expects. Expected: HTTP 200 like `sample_response.json`, a new row in the MGA data sheet (open the workbook in OneDrive to see it appear), and a receipt email in your Inbox.
2. POST exactly the same body again. Expected: HTTP 200 like `sample_response_duplicate.json` and no second row.
3. Change `accessCode` to anything else and POST. Expected: HTTP 403, no row.

If step 1 fails, open the flow's run history and click the red action: the error text names the problem (a wrong file, a column name, a missing connection). Fix and re-run from the Test pane.

## Step 5. Put the URL in the page and publish it (10 minutes)

1. In `index.html`, find `CONFIG.MGA` and paste the flow URL into `endpoint` (whole URL, including `sig=`). Leave `submitEmail` as your address.
2. Your repository `jeremy7589/webtest` already publishes GitHub Pages from the `main` branch, and your other tool lives at `https://jeremy7589.github.io/webtest/waterusecsg_test1/`. Put the bore tool next to it: on GitHub, switch to `main`, add the folder `bore_search_tool` with this `index.html` (Add file > Upload files, or merge the `claude/bore-search-tool-ogia-mhlcce` branch into `main`). Two or three minutes later the page is live at `https://jeremy7589.github.io/webtest/bore_search_tool/`.
3. Open that address in Edge or Chrome, click the MGA button, choose Arrow Energy, enter the Arrow access code and your own email, Continue. You should land on the empty report list with "Reporting as Arrow Energy · jeremy.wolff@dlgwv.qld.gov.au" in the banner. If instead the browser console (F12) shows a CORS error, follow section 3 step 5 of `MGA_SETUP.md` (add or remove the `Access-Control-Allow-Origin: *` header on the Response actions); it is a five-minute fix either way.

The flow URL is visible to anyone who reads the page source. For the pilot that is acceptable because the access code still gates every write and because you will regenerate the key (trigger settings) or delete the flow when the pilot is over. Do not put OGIA's production URL on a personal GitHub site.

## Step 6. Demo script for your manager (10 minutes)

Have Outlook and the OneDrive workbook open in other tabs.

1. **The problem.** Open the page, search a bore (for example RN 6777), show the card: UWIR category, make good status, tenure holder. Say: "Every company with make good obligations must lodge an annual report on each of these bores by 31 October. Today that is a spreadsheet emailed around. This is the same template as a guided form, with the submission landing straight in OGIA's register."
2. **Sign in as a company.** MGA button, Arrow Energy, access code, your email. Point out: one code per company, checked against the email domain, so Arrow staff can only ever see and lodge Arrow reports.
3. **Report on this bore.** From the bore card choose "Report on this bore": the RN is pre-filled and the bore check shows OGIA's recorded status and the tenure holder. Fill the four sections; show the guard that refuses a dollar amount in the comments, and the warning when a report is missing the progress update the Act requires.
4. **Submit.** Confirm, then show the receipt number on screen, the receipt email arriving in your Inbox (cc to you standing in for OGIA.UWIR), and the new row in the workbook in OneDrive. Say: "In production the row lands in OGIA's register and the receipt comes from OGIA.UWIR."
5. **Amend.** Open the submitted report, Amend, change a word, submit again: a second row with "Replaces submission" pointing at the first. OGIA keeps the latest per bore.
6. **Resilience.** Explain (no need to break anything live): if the service is down the page lodges by email with the same row attached, a retry after a timeout is recognised and never files twice, and a stale flow address tells the officer exactly what to do.
7. **What OGIA needs to do.** One Premium licence for the flow owner, Send As on the OGIA.UWIR mailbox, 1.5 hours of clicking from `MGA_SETUP.md`, and the four access codes sent to the companies. Nothing on the company side.

Reset between rehearsals: in the page, Sign out, then in the browser clear site data for jeremy7589.github.io (or use a private window), and delete the test rows in the workbook.

## Step 7. Optional: flow B on your own Inbox (30 minutes)

Follow section 6 of `MGA_SETUP.md` with these differences: the trigger is **When a new email arrives (V3)** on your own mailbox (Folder Inbox, Subject Filter `MGA lodgement by email`), with only the first trigger condition (the one about "mga annual report received"); do not add the sender condition, because in the pilot you send the lodgement email to yourself. "Flag email (V2)" needs no mailbox address. The notices go to `Jeremy.Wolff@dlgwv.qld.gov.au`. Test by sending yourself `pilot/sample_email.txt` (subject line and body): a row with Submission ID `EMAIL-...` appears, and sending the same email again adds nothing.

## When the pilot is over

- Delete the test rows or the whole pilot workbook; delete or turn off the pilot flows, or regenerate the trigger key so the URL in the public page stops working.
- Change `CONFIG.MGA.submitEmail` back to `OGIA.UWIR@dlgwv.qld.gov.au` and `endpoint` to OGIA's flow URL when OGIA has built the production flows from `MGA_SETUP.md`; host the production page on a departmental site, not the personal GitHub account.
- Give OGIA the `power_automate` folder (not `pilot`) and `MGA_SETUP.md`.
