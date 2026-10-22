# MGA annual reporting: who can submit, who can see what, and how sign-in works

Prepared for the OGIA director. Covers the two ways the Bore Search Tool can take make good agreement (MGA) reports, what each one guarantees, and what a stronger option would need.

## What can be reported

- **Any bore, any company.** Reports are not limited to bores on the UWIR immediately affected area (IAA) list or to the Surat Cumulative Management Area (CMA). Any responsible tenure holder can report any bore for which it has make good obligations, including agreements made directly with a landholder. The form checks a registration number against OGIA's Surat CMA bore list when it can, and says so plainly when a bore is outside it; it never blocks the report. Bores without a registration number are reported by name.
- **Any stage.** A bore whose assessment has not started, has started, or is complete can be reported. Only a completed assessment asks for dates and an outcome; only an executed agreement asks for an agreement date and measures.
- **Companies.** The ten tenure holders in the UWIR 2025 tenure layer are listed (Arrow, Origin, Santos, QGC, Senex, AGL, ADZ Energy, Bridgeport Energy, Denison Gas, OGT). Any other company chooses "Other" and types its name (email mode), or asks OGIA for an access code (filed mode).

## Mode 1: email lodgement (what runs today, no setup)

**Who can submit.** Anyone who opens the page. The officer picks a company and types a work email; there is no password or code. The report leaves from the officer's own mail program, so OGIA receives it from a real mailbox.

**Identity check.** Only the sender address of the email. OGIA should treat a report as coming from a company when the sender's domain is that company's (for example @arrowenergy.com.au), the same check OGIA applies to any emailed report today. Sender addresses can be forged from outside unless the department's mail system rejects mail that fails DMARC; ICT can confirm whether it does.

**Who can see what.**
- The officer sees only the reports saved in their own browser on their own computer. Nothing is stored on a server, so no company can see another company's reports through the page, and a different computer shows an empty list.
- OGIA sees every report in the receiving mailbox, as the email text plus the attached Excel row.
- Nothing is published. The page holds no report data.

**Record and audit trail.** The email itself: sender, time received, the report, the attached row, and a reference number (EMAIL-...). The officer keeps the sent email as their proof of lodgement.

**Limits.** No access control beyond the sender address; no automatic register (someone pastes rows or the optional flow B files them); no receipt from OGIA.

## Mode 2: filed through OGIA's flow (after approval, about 45 minutes to set up)

**Who can submit.** Only someone who holds the company's access code and uses an email address on that company's domain. OGIA issues one code per company and keeps the list in the Tenure holders sheet of the register: change a code there and the old one stops working at once; set Active to No to suspend a company. A company that is not on the sheet cannot file at all until OGIA adds it.

**What the flow checks on every submission:** the company exists and is active; the access code matches (case-insensitive); the email is a single, well-formed address; the part after the @ is the company's domain. If any check fails nothing is written and the page shows the reason. The company name written into the register always comes from OGIA's own sheet, never from what the page sent, so a code for one company cannot file under another's name.

**Who can see what.**
- Officers: only their own company's reports, in their own browser, as in mode 1. They never see the register.
- OGIA: the register is an Excel workbook in OGIA's OneDrive or SharePoint, visible only to the people OGIA shares it with, under normal Microsoft 365 permissions. The receipt for every submission is copied to OGIA's mailbox.
- Nothing is published. The flow address sits in the page so the page can call it, but without a valid code the flow answers "refused" and writes nothing.

**Record and audit trail.** Each row carries: receipt number, time received (Brisbane), submitter's email and name, the earlier receipt it replaces if amended, source (tool or email) and version. The receipt email goes to the officer and to OGIA. Power Automate keeps a 28-day run history of every call, accepted or refused.

**Limits.** The code is shared per company, not per person: anyone at the company who has it can file, and the Submitted by column says who did. A company's code given to an outsider would let them file under that company's name until OGIA changes it; the receipt copy to OGIA and the email domain check make that visible. It is not a personal log-in.

## If the director wants personal log-ins (stronger option)

Real per-person sign-in, where each officer has an account, can see their company's lodged reports on any computer, and OGIA can revoke a person, needs an identity system. Two Microsoft options fit the department's tenancy:

- **Power Pages** (Microsoft's external portal product): officers register and sign in; reports are stored in a database (Dataverse) with rules that let each company see only its own records. Costs a licence per authenticated user per month and some build effort; ICT and the licensing team would need to price it.
- **Microsoft Entra guest accounts** for each company officer, with a SharePoint list per company or item-level permissions. Uses existing licences but every guest has to be invited and managed by OGIA, and the experience is less guided than the current form.

Either is a project in its own right. The recommendation is to run this season on mode 2 (codes plus domain check plus receipts) and decide on personal log-ins with a year of real use behind it.

## Privacy

The form refuses dollar amounts and personal contact details in the comments, as the Water Act guidance requires, and the confirmation asks the officer to confirm the report contains neither. Officer names and work emails are stored with each report (mode 2) or in the email (mode 1). Landholder names are not collected. The register holds negotiation status per bore, so it should sit under the records classification OGIA uses for make good material.
