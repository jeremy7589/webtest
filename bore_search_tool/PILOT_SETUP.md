# MGA reporting pilot: run the whole chain in your own Microsoft environment

This gets the Bore Search Tool's MGA module working end to end (page, flow, Excel register, receipt email) using only things you control: a Power Automate environment that belongs to you, a workbook in your own OneDrive, your own mailbox (Jeremy.Wolff@dlgwv.qld.gov.au) and your personal GitHub Pages site. Nothing touches OGIA's mailbox, OneDrive or Power Platform environment, so you can demonstrate it to your manager first and hand the production version (`MGA_SETUP.md`) to OGIA afterwards.

Time: about 1.5 hours the first time, most of it clicking through flow A. Everything below uses the `power_automate/pilot` folder.

| Pilot file | What it is |
|---|---|
| `pilot/MGA_master_register_pilot.xlsx` | The register, with every company named "... (PILOT TEST)" so every row, receipt and screen is visibly a test, and every EmailDomain set to `@dlgwv.qld.gov.au` so you can sign in as any of the four companies with your own address. The AccessCode column holds placeholders (`CHANGE-ME-ARROW` and so on): type your own codes before uploading. Nothing in this repository is secret, so no real code may ever be written into it. |
| `pilot/flow_A_http_submission.definition.json` | Flow A for your own mailbox: receipts go out with "Send an email (V2)" from you, copies and failure notices come to you. |
| `pilot/flow_B_email_fallback.definition.json` | Flow B on your own Inbox ("When a new email arrives (V3)"). Optional for the demo. |
| `pilot/sample_request.json`, `sample_request_verify.json`, `sample_response*.json`, `sample_email.txt` | Test payloads (a submission, a sign-in check, the expected answers). The sample email is addressed to you. |
| `pilot/email_bodies/*.html` | Receipt and notice bodies as plain HTML for pasting into the designer's code view. |

The page (`index.html`) is already set to send email lodgements and show your address: `CONFIG.MGA.submitEmail` is `Jeremy.Wolff@dlgwv.qld.gov.au`. For production, change it to `OGIA.UWIR@dlgwv.qld.gov.au` together with the flow URL.

## Step 1. Get a Power Automate environment of your own (15 minutes)

The submission flow needs the premium trigger "When an HTTP request is received". You do not need a paid licence for a pilot, but the free routes are closing, so the dates below matter (checked against Microsoft Learn on 21 October 2026).

**Option A: Power Apps Developer Plan (free; sign up before 15 November 2026).** Go to https://www.microsoft.com/power-platform/products/power-apps/free, choose "Start free" and sign in with your work account (Jeremy.Wolff@dlgwv.qld.gov.au; personal Microsoft accounts are refused). Signing up creates a personal developer environment in the department's tenant, named after you, that only you use; it includes all premium connectors for development and testing, 750 flow runs a month, and nothing in it is visible in OGIA's environment. Microsoft is retiring these environments: from 15 November 2026 signing up no longer creates one, existing ones are suspended on 15 December 2026 and deleted on 15 January 2027. For a manager demo in the next few weeks that is fine; it is not a home for the flows beyond mid December. Until then the usual inactivity rule also applies: an environment nobody has used for 30 days is disabled (warnings at 23 and 27 days) and deleted 15 days later, so open the flow or run a test once a fortnight.

If the sign-up stops with a message such as "Your tenant's administrators have disabled environment creation for non-admin users", "Self service signup is blocked by tenant policy", "A self-service signup plan is required to successfully complete this request" or "Your IT department turned off signup", the department has restricted it: go to option B.

**Option B: 90-day Power Automate trial licence, in a Trial environment.** In make.powerautomate.com choose "Try free" (or Settings, View my licenses, Start a trial): the self-service trial gives your account the same rights as Power Automate Premium for 90 days, including the HTTP trigger. To keep the pilot out of the shared default environment, create your own Trial environment once the trial licence is active (it is the licence that entitles you to one): Power Platform admin centre (admin.powerplatform.microsoft.com), Environments, New, Type "Trial", 30 days, extendable once by another 30 days in its last week; it is deleted after 30 days without activity. If the Trial type is missing or refused, build in the default environment instead: the flow is still yours and private, only visible to tenant administrators. If "Try free" does not complete, trials are blocked for the tenant: go to option C.

**Option C: ask ICT for one Power Automate Premium (per user) licence** assigned to you, quoting the demo. This is also what OGIA needs for production, so the request is worth making early.

**Not available:** the Microsoft 365 Developer Program sandbox (a free test tenant) now requires a Visual Studio Professional or Enterprise subscription or a Microsoft partner membership.

Whichever option you used: open make.powerautomate.com, use the environment picker (top right) to select your developer or Trial environment, and check its name is shown there before creating connections or flows. Everything in the rest of this guide happens inside that environment.

Two checks before you continue:
- In your environment, Data, Connections: create connections for Excel Online (Business) and Office 365 Outlook with your work account.
- Data Loss Prevention policies set by the department apply to developer and trial environments too. A tenant data policy that blocks or separates the HTTP trigger shows either as a data-policy error when you save, or as the flow saving and then appearing as Suspended in My flows (reason: company DLP violation); in both cases only the Power Platform administrator can change the policy. That is the one blocker this guide cannot route around; the email-only path (flow B, standard connectors) still works in that case and the page lodges every report by email.

## Step 2. Upload the pilot register (2 minutes)

Open `pilot/MGA_master_register_pilot.xlsx`, go to the Tenure holders sheet and replace the four `CHANGE-ME-...` codes with codes of your own (anything you can remember for the demo; write them down somewhere private). Save, then put the file in a folder of your OneDrive for Business, for example `Documents/MGA pilot`. Do not rename the sheets, the tables (`MGAData`, `TenureHolders`) or any column header. Open it once in Excel for the web and close it again, so OneDrive has finished indexing it before the flow looks for it.

## Step 3. Build flow A (about 40 minutes)

Follow section 2 of `MGA_SETUP.md` step by step, with these pilot differences:

- **File:** choose `MGA_master_register_pilot.xlsx` in your OneDrive wherever the production guide says `MGA_master_register.xlsx`.
- **The `Email receipt` action** (section 2, step 7, innermost list, item 7): use **Send an email (V2)** (not "from a shared mailbox"). Leave "From" empty so it sends as you. To = `body('Parse_report')?['submitter']?['email']`, Cc = `Jeremy.Wolff@dlgwv.qld.gov.au`, Subject = `concat('MGA annual report received (PILOT): ', outputs('Submission_ID'), ' (', outputs('Holder_row')?['HolderName'], ', RN ', outputs('Receipt_fields')?['rn'], ', period ', outputs('Receipt_fields')?['period'], ')')` (the production subject with "(PILOT)" added), Body pasted in code view from `pilot/email_bodies/flow_A_receipt_body.html`.
- **The `Receipt failed notice` action** (item 8 of the same list): To = `Jeremy.Wolff@dlgwv.qld.gov.au`, Body from `pilot/email_bodies/flow_A_receipt_failed_notice.html`.
- **Parse report schema:** paste it from the definition file as the production guide says; never generate it from the sample, or sign-in breaks.
- **Trigger:** "Who can trigger the flow" shows "Anyone" as a legacy setting below "Any user in my tenant"; pick Anyone, the page cannot sign in to Microsoft.
- Everything else (trigger settings, Parse report, the lookups, the six-row Check access condition, Client ref and Find existing, the Add row mapping with Tenure Holder from `outputs('Holder_row')?['HolderName']`, Respond submitted before the email, Respond failed's run-after, the retry policy) is identical. The definitions in `pilot/` already contain these addresses, so you can compare with Peek code at any time.

Save, then copy the trigger's HTTP URL.

## Step 4. Test the flow without the page (10 minutes)

Use Postman, Insomnia, or the flow's own Test pane:

1. POST the contents of `pilot/sample_request_verify.json` to the URL with header `Content-Type: text/plain`, after changing `accessCode` to the Arrow code you typed into the pilot register. Expected: HTTP 200 with `"ok": true` and "Arrow Energy". This is the sign-in check the page makes.
2. POST the contents of `pilot/sample_request.json` the same way (your Arrow code; the pilot sample already uses your own address as the submitter, which the pilot register expects). Expected: HTTP 200 like `sample_response.json`, a new row in the MGA data sheet (open the workbook in Excel for the web to see it appear, allow up to 30 seconds), and a receipt email in your Inbox with a formatted table and the receipt number filled in.
3. Wait about a minute (the Excel filter can lag a fresh write), then POST exactly the same submission body again. Expected: HTTP 200 like `sample_response_duplicate.json` and no second row.
4. Change `accessCode` to anything else and POST. Expected: HTTP 403, no row.

If a step fails, open the flow's run history and click the red action: the error text names the problem (a wrong file, a column name, a missing connection). Fix and re-run from the Test pane.

## Before you publish: two short messages (5 minutes)

The pilot runs an internet-facing flow address inside the department's Microsoft tenant, writes to a workbook in your departmental OneDrive and makes your departmental mailbox send automated receipts, all from a page on your personal GitHub site. None of that is hidden from the tenant administrators, and the Developer Plan terms exclude production use. Before step 5, tell two people in writing, a few lines each: your manager (what the demo is for, that it writes only to a test workbook in your OneDrive, sends receipts only to departmental addresses, and will be switched off on a stated date) and the Power Platform administrator or ICT service desk (same facts, plus the environment name, so a flow with an anonymous HTTP trigger in your environment is not a surprise to them). Keep their replies with the pilot notes.

## Step 5. Put the URL in the page and publish it (10 minutes)

1. In `index.html`, find `CONFIG.MGA` and paste the flow URL into `endpoint`. Keep the whole URL: a flow created today has an address of the form `https://<environment>.environment.api.powerplatform.com/powerautomate/automations/direct/workflows/<id>/triggers/manual/paths/invoke?api-version=1&sp=...&sv=1.0&sig=...`, often longer than 255 characters, and the `sig` part is what lets the page call it. Leave `submitEmail` as your address.
2. Your repository `jeremy7589/webtest` already publishes GitHub Pages from the `main` branch, and your other tool lives at `https://jeremy7589.github.io/webtest/waterusecsg_test1/`. Put the bore tool next to it, publishing **only** `index.html`: on GitHub, switch to `main`, Add file > Create new file, name it `bore_search_tool/index.html`, paste the edited file, Commit changes. Do not merge the `claude/bore-search-tool-ogia-mhlcce` branch into `main` and do not upload the `power_automate` folder or the guides: everything on `main` is served to the public. (If you prefer to edit on GitHub: create the file first, then use the pencil icon to find `endpoint: ""` under `CONFIG.MGA` and paste the URL between the quotes.) Within a few minutes (GitHub allows up to ten) the page is live at `https://jeremy7589.github.io/webtest/bore_search_tool/`, served over HTTPS automatically. Open it with a hard refresh (Ctrl+F5) if you had an older copy open.
3. Open that address in Edge or Chrome. The browser tab title must start with "[PILOT]" (a "[DEMO]" title or a demo role picker in the MGA sheet means the `endpoint` edit did not reach GitHub). Click the MGA button: the sheet asks for company, access code and email, with an amber "PILOT" label in its banner. Choose Arrow Energy (the list shows the ordinary company names; the "(PILOT TEST)" suffix comes from your register after sign-in), enter your Arrow code and your own email, Continue. You should land on the empty report list with "Reporting as Arrow Energy (PILOT TEST) · jeremy.wolff@dlgwv.qld.gov.au" in the banner and nothing after it. If the banner ends with "(service unavailable: email submission)" and shows a "Retry connection" chip, or a toast says the submission address is out of date, the flow was not reached: press F12 and look for a CORS error (then follow section 3 step 6 of `MGA_SETUP.md`) or a 401/404 (then the URL in `endpoint` is wrong). In our checks on 21 October 2026 Microsoft's gateway added the `Access-Control-Allow-Origin: *` header itself on both the old and the new flow addresses, which is why the Response actions do not set it; the console check is there in case your environment behaves differently.

The flow URL is visible to anyone who reads the page source. For the pilot that is acceptable because the access codes you typed into the pilot register (and nowhere else) still gate every write, because the register is a throwaway copy in your own OneDrive, and because you will regenerate the key (trigger settings) or delete the flow when the pilot is over. Every anonymous call still uses one of the Developer Plan's 750 runs a month, so share the page address only for the days you need it, add `<meta name="robots" content="noindex">` to the page head if you leave it up for long, and look at My flows, 28-day run history, before the demo for runs you did not make. Do not put OGIA's production URL on a personal GitHub site.

## Step 6. Demo script for your manager (10 minutes)

Have Outlook and the register open in other browser tabs (the register in Excel for the web, never in desktop Excel, and do not edit it during the demo). Writes take up to 30 seconds to show; refresh the tab. The page opens on the period that has just ended (2025-26) until late January; if you present later than that, pick "Period 2025-26" in the dropdown of the report list, where the red "Was due 31 Oct 2026" chip and the Late badge on submitted rows are the overdue indicators worth pointing out.

1. **The problem.** Open the page, search a bore (for example RN 6777), show the card: UWIR category, make good status, tenure holder. Say: "Every company with make good obligations must lodge an annual report on each of these bores by 31 October. Today that is a spreadsheet emailed around. This is the same template as a guided form, with the submission landing straight in OGIA's register."
2. **Sign in as a company.** MGA button, Arrow Energy, access code, your email. Point out: one code per company, checked against the email domain, so Arrow staff can only ever see and lodge Arrow reports.
3. **Report on this bore.** From the bore card choose "Report on this bore": the RN is pre-filled and the bore check shows OGIA's recorded status and the tenure holder. Fill the four sections; show the guard that refuses a dollar amount in the comments, and the warning when a report is missing the progress update the Act requires.
4. **Submit.** Confirm, then show the receipt number on screen, the receipt email arriving in your Inbox (subject "MGA annual report received (PILOT)", cc to you standing in for OGIA.UWIR), and the new row in the workbook in OneDrive, with Tenure Holder "Arrow Energy (PILOT TEST)". Say: "In production the row lands in OGIA's register, the holder name is the real one and the receipt comes from OGIA.UWIR."
5. **Amend.** Open the submitted report, Amend, change a word, submit again: a second row with "Replaces submission" pointing at the first. OGIA keeps the latest per bore. (Show "Discard amendment" too: a lodged report can be amended but never withdrawn.)
6. **Resilience.** Explain (no need to break anything live): if the service is down the page lodges by email with the same row attached, a retry after a timeout is recognised and never files twice, and a stale flow address tells the officer exactly what to do.
7. **What OGIA needs to do.** One Premium licence for the flow owner, Send As on the OGIA.UWIR mailbox, 1.5 hours of clicking from `MGA_SETUP.md`, and the four access codes sent to the companies. Nothing on the company side.

Reset between rehearsals: in the page, Sign out, then in the browser clear site data for jeremy7589.github.io (or use a private window); delete the test rows in the workbook in Excel for the web, close it, and wait a few minutes before the next run so the connector's lock on the file has lifted.

## Step 7. Optional: flow B on your own Inbox (30 minutes)

Follow section 6 of `MGA_SETUP.md` with these differences: the trigger is **When a new email arrives (V3)** on your own mailbox (Folder Inbox, Subject Filter `MGA lodgement by email`), with only the first trigger condition (the one about "mga annual report received"); do not add the sender condition, because in the pilot you send the lodgement email to yourself. "Flag email (V2)" needs no mailbox address. The notices go to `Jeremy.Wolff@dlgwv.qld.gov.au`, bodies from `pilot/email_bodies/`. Test by sending yourself `pilot/sample_email.txt` (subject line and body; HTML or plain-text format both work): a row with Submission ID `EMAIL-...` appears, and sending the same email a minute later adds nothing.

## When the pilot is over

Do these in this order, on the day you stop:

1. On GitHub (`main`), edit `bore_search_tool/index.html` and set `endpoint` back to `""`, or delete the file: the public page returns to demo mode, which says "Nothing is sent to OGIA". Do this first; a live-mode page pointing at a dead flow tells visitors to lodge by email instead.
2. Then regenerate the trigger key (trigger settings) or delete the pilot flows. Turning a flow off is not enough: the page treats a dead address as "out of date" and offers email.
3. Delete the pilot workbook from OneDrive, and the pilot receipts and notices from your Inbox and Sent Items once the manager has seen them (they are departmental records; check the retention rule with the records team if in doubt).
4. When OGIA has built the production flows from `MGA_SETUP.md`, set `CONFIG.MGA.submitEmail` to `OGIA.UWIR@dlgwv.qld.gov.au` and `endpoint` to OGIA's flow URL, and host that page on a departmental site, not the personal GitHub account.
5. Give OGIA the `power_automate` folder (not `pilot`) and `MGA_SETUP.md`.
