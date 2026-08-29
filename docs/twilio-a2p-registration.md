# JobOps Twilio A2P 10DLC registration notes

Replace every bracketed value before submitting this material to Twilio. Do not enter a URL until it is publicly reachable.

## Campaign description

Descode LLC operates JobOps. This campaign sends recurring transactional SMS messages to contractors who have expressly opted in. Messages include account verification codes, account invitations, work-order assignments, scheduling information, work-order modifications, acceptance or rejection status, completion status, and service-related notifications. The campaign does not send promotional or third-party marketing messages.

## Message flow / opt-in description

Contractors opt in through JobOps by providing their mobile number and separately checking an unchecked SMS-consent checkbox. The disclosure identifies Descode LLC and JobOps, describes the transactional message categories, states that frequency varies and message/data rates may apply, explains STOP and HELP, states that consent is not a condition of purchase, and links the Privacy Policy and Terms of Service. JobOps records consent status, UTC timestamp, source, and disclosure version in Supabase. SMS consent is optional and is not combined with acceptance of legal terms. Automated transactional messages are sent only to active contractors with recorded consent.

Public opt-in evidence: [REPLACE WITH PUBLICLY ACCESSIBLE JOBOPS OPT-IN SCREENSHOT OR LIVE ONBOARDING URL]

Privacy Policy: [REPLACE WITH FINAL PUBLIC PRIVACY POLICY URL]

Terms of Service: [REPLACE WITH FINAL PUBLIC TERMS OF SERVICE URL]

## Representative message samples

1. `JobOps by Descode LLC: Work Order has been created for you. Please Accept/Reject in the JobOps app. Reply STOP to unsubscribe.`
2. `JobOps by Descode LLC: WO# [work order number] has been modified by [name]. Changes: [description]. Reply STOP to unsubscribe.`
3. `JobOps by Descode LLC: WO# [work order number] has been Accepted by [name]. Reply STOP to unsubscribe.`
4. `JobOps by Descode LLC: WO# [work order number] has been Completed by [name] on [day and date] at [time]. Reply STOP to unsubscribe.`
5. `JobOps by Descode LLC: [admin name] has invited you to join JobOps. Your username is: [email]. Your temporary password is: [temporary password]. Reply STOP to unsubscribe.`

## Keywords and automatic responses

- Opt-out keywords: use Twilio's default or Advanced Opt-Out configuration, including `STOP`, `STOPALL`, `UNSUBSCRIBE`, `CANCEL`, `END`, and `QUIT`.
- Help keyword: `HELP`.
- Help response: `JobOps by Descode LLC: For assistance, contact [REPLACE WITH DESCODE LLC SUPPORT EMAIL]. Reply STOP to unsubscribe.`
- Opt-out response: `JobOps by Descode LLC: You have been unsubscribed and will receive no further non-essential JobOps texts. Reply START to resubscribe.`

Configure the registered US 10DLC number in the approved Twilio Messaging Service sender pool. Configure Supabase Auth's OTP template to identify `JobOps by Descode LLC`; OTP delivery is separate from the JobOps Edge Function used for work-order notifications.
