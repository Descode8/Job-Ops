# Marty Wright Contractor Portal

## Run the App

```bash
cd contractor-portal  # Move into the Expo app directory
npm install           # Install the project dependencies
npm start             # Start Expo for Expo Go on your local network
```

### Connect Supabase

Copy `contractor-portal/.env.example` to `contractor-portal/.env` and replace the values with the public URL and anon key from **Supabase > Settings > API**:

```dotenv
EXPO_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-public-anon-key
```

Restart Expo after changing `.env`. The app now sends phone OTP codes through Supabase and only allows an authenticated user with an active row in `public.contractors` to continue. Never put a service-role key in `.env` or the mobile app.

Keep this terminal running. Connect your iPhone to the same Wi-Fi network, open **Expo Go**, and scan the QR code shown by Expo. If your network blocks device connections, use the tunnel option instead:

```bash
npx expo start --tunnel  # Start Expo through a tunnel for Expo Go
```

For other targets, run one of these commands:

```bash
npm run android       # Start the app on an Android emulator or device
npm run ios           # Start the app on an iOS simulator or device
npm run web           # Start the app in a web browser
```

> **A mobile-first job management platform for contractors and office staff.**

The Marty Wright Contractor Portal will let contractors securely sign in with a username and password, view assigned work, update job progress, capture field photos, upload invoices and receipts, and submit completed work from a mobile device. Office staff will use a companion web dashboard to assign jobs, review submissions, approve or reject work, and generate reports.

## Table of Contents

- [Project Goals](#project-goals)
- [Recommended Approach](#recommended-approach)
- [Core Features](#core-features)
- [Customer Requirements](#customer-requirements)
- [Technology Stack](#technology-stack)
- [Architecture](#architecture)
- [Repository Structure](#repository-structure)
- [Data Model](#data-model)
- [Important Workflows](#important-workflows)
- [Security Requirements](#security-requirements)
- [Mobile Development Guidance](#mobile-development-guidance)
- [Development Plan](#development-plan)
- [MVP Scope](#mvp-scope)
- [Local Development](#local-development)
- [Definition of Done](#definition-of-done)
- [Current Status](#current-status)

## Project Goals

- Give contractors a simple, reliable mobile workflow for field work.
- Give office staff a centralized system for dispatch, review, and approvals.
- Keep job photos, documents, notes, invoices, and audit history together.
- Protect customer, contractor, and payment-related information.

## Recommended Approach

Build **two user interfaces on one shared backend**:

| Product area | Recommended technology | Purpose |
| --- | --- | --- |
| Contractor mobile app | **React Native + Expo + TypeScript** | iOS and Android field workflow |
| Office admin portal | **Next.js + React + TypeScript** | Dispatching, review, approvals, and reports |
| Shared backend | **Supabase** | Authentication, database, storage, APIs, and server workflows |

This approach gives the project a shared TypeScript ecosystem while still producing a genuine mobile application. Expo reduces native setup during early development, and Supabase fits the relational nature of jobs, properties, contractors, documents, approvals, and payments.

## Core Features

### Contractor Mobile App

- Sign in with a username and password through Supabase Auth.
- View assigned jobs and filter by priority or status.
- Use a separate **Service** tab for repair and service requests.
- Use a **New Work Order** form to create an assignment with an address, description, contractor, priority, deadline, and recipient email.
- View property addresses, job descriptions, requested dates, and deadlines.
- Open an address in the device's maps application.
- Move jobs from **Not Started** to **In Progress**.
- Capture or upload issue, parts-needed, before, after, and completion photos.
- Upload quotes, invoices, receipts, and material lists.
- Record materials used and job notes.
- Submit completed work for office review.
- Receive confirmation and status notifications.

## Customer Requirements

The customer's requested scope is represented by the following product requirements.

### Contractor Access and Work Tracking

- Username and password login through Supabase Auth; SMS verification is not required for the current release.
- Assigned jobs organized by property address and contractor identity.
- Priority levels: **Low**, **Medium**, **High**, and **Emergency**.
- Statuses: **Not Started**, **In Progress**, **Submitted**, **Approved**, **Rejected**, and **Completed**.
- Each job stores its description, requested date, deadline, completion date, contractor ID or phone number, and address.
- A separate **Service** workflow handles repairs, parts-needed work, and service calls.

### Job Evidence and Documents

- Attach issue, parts-needed, before, after, and completed-repair photos to the correct job.
- Upload invoices, quotes, material lists, receipts, and contractor notes.
- Keep files grouped by job and property address in private storage.
- Provide retryable uploads with file type, size, and ownership validation.

### Home Completion Checklist

Each home address has a checklist that contractors complete before submitting work:

`Plumbing`, `Meter`, `HVAC`, `Underpinning`, `Steps / decks`, `Well`, `Septic`, `Plumbing tie-in`, `Waterline`, `Backfill, seed and straw`, `Driveway`, `Get ready`, `Meter install`, and `Final walk-through`.

Completion submissions include the checklist state, completion date, final photos, materials used, final invoice, and contractor notes. The office receives a notification when the contractor submits the job.

### Office and Payment Workflow

- Office staff can assign jobs, change priority, review documents, and approve or reject submissions.
- Creating a work order requires a recipient email before submission.
- Submitting a work order sends its details to the specified email through a server-side email provider.
- Authorized staff can export or email job summaries, photo sets, invoices, quotes, material lists, and completed-work reports as PDFs or standard attachments.
- An approved invoice can create a check request sent to the configured office email. Unapproved invoices must never trigger payment requests.

### Office Admin Portal

- Create and assign jobs to contractors.
- Manage contractor and property information.
- Set job priorities and due dates.
- Monitor work across all contractors.
- Review photos, notes, invoices, quotes, receipts, and material lists.
- Approve or reject submissions with feedback.
- Receive alerts when work is submitted or completed.
- Generate job summaries and completed-work reports.
- Export reports and attachments by email or PDF.
- Generate and email a check request from an approved invoice.

## Technology Stack

### Applications and UI

- **Mobile:** React Native, Expo, Expo Router, TypeScript
- **Admin web portal:** Next.js, React, TypeScript
- **Mobile styling:** NativeWind
- **Web styling:** Tailwind CSS

### Data and Backend

- **Backend platform:** Supabase
- **Database:** PostgreSQL
- **Authentication:** Supabase Auth with email/password credentials; phone remains a contractor contact field
- **File and image storage:** Supabase Storage
- **Authorization:** PostgreSQL Row Level Security (RLS)
- **Server-side workflows:** Supabase Edge Functions
- **Server state and data fetching:** TanStack Query

### Forms, Delivery, and Operations

- **Forms and validation:** React Hook Form, Zod
- **Email delivery:** Resend or Postmark
- **PDF generation:** React PDF or a server-side HTML-to-PDF service
- **Mobile notifications:** Expo Notifications
- **Error monitoring:** Sentry
- **Testing:** Vitest, React Native Testing Library, Playwright
- **Mobile builds and releases:** Expo Application Services (EAS)
- **Web deployment:** Vercel
- **Source control and CI:** GitHub, GitHub Actions

> **Note:** Final vendor choices for SMS, email, and hosting should be based on expected usage, budget, and customer compliance requirements before production launch.

## Architecture

```text
Contractor Mobile App ---+
                         +-- Supabase Auth / API / PostgreSQL / Storage
Office Admin Portal -----+              |
                                        +-- Edge Functions -- Email / check requests
                                        +-- Notifications --- Contractor and office alerts
```

The mobile and web clients must never contain database service-role credentials. Both clients use the public Supabase client key, authenticated sessions, and RLS policies. Privileged operations, including approvals, report generation, check requests, and external email, run in server-side functions.

## Repository Structure

```text
contractor-job-portal/
|-- apps/
|   |-- mobile/                  # Expo / React Native contractor app
|   `-- admin/                   # Next.js office portal
|-- packages/
|   |-- types/                   # Shared TypeScript models
|   |-- validation/              # Shared Zod schemas
|   `-- config/                  # Shared lint and TypeScript configuration
|-- supabase/
|   |-- functions/               # Server-side workflows
|   |-- migrations/              # Versioned database changes
|   `-- seed.sql                 # Local development data
|-- database/                    # Ordered PostgreSQL schema scripts
|-- docs/
|   |-- product-requirements.md
|   `-- architecture.md
|-- .env.example
|-- package.json
`-- README.md
```

A monorepo keeps shared types and validation rules consistent while allowing the mobile and admin applications to be deployed independently.

The initial database structure is documented in [database/](database/README.md). It is designed for Supabase PostgreSQL and is split into ordered SQL files covering contractors, properties, work orders, assignments, files, notes, materials, checklists, reviews, email delivery, notifications, and audit events.

## Data Model

| Entity | Purpose |
| --- | --- |
| `profiles` | User identity, role, phone number, company, and active status |
| `properties` | Property address and customer reference |
| `jobs` | Assignment, description, priority, status, and important dates |
| `job_notes` | Notes authored by contractors or office staff |
| `job_files` | Photos, invoices, quotes, receipts, and material lists |
| `job_materials` | Materials used, quantity, unit, and cost |
| `job_reviews` | Approval decisions, reviewers, and feedback |
| `check_requests` | Approved invoice payment-request details and delivery status |
| `home_checklist_items` | Required completion items and verification state for each property |
| `audit_events` | Security and business-event history |

### Key Values

- `profiles.role`: `contractor`, `office_staff`, or `admin`
- `jobs.priority`: `low`, `medium`, `high`, or `emergency`
- `jobs.status`: `not_started`, `in_progress`, `submitted`, `approved`, `rejected`, or `completed`
- `job_files.file_type`: `issue_photo`, `before_photo`, `after_photo`, `parts_photo`, `invoice`, `quote`, `receipt`, `material_list`, or `other`
- `job_reviews.decision`: `approved` or `rejected`
- `check_requests.status`: `draft`, `sent`, `processed`, or `cancelled`
- `home_checklist_items.key`: `plumbing`, `meter`, `hvac`, `underpinning`, `steps_decks`, `well`, `septic`, `plumbing_tie_in`, `waterline`, `backfill_seed_straw`, `driveway`, `get_ready`, `meter_install`, or `final_walkthrough`

## Important Workflows

### Work Order Creation and Email

1. An authorized user completes the New Work Order form.
2. The form validates the title, property address, description, recipient email, priority, and deadline.
3. The server creates the work-order record and assigns its ID.
4. A server-side function sends the work-order details to the submitted recipient email.
5. The delivery result is stored in the audit log and shown to the submitting user.

The current Expo prototype validates the form and displays a confirmation locally. It does not send real email yet because email credentials and a backend endpoint must never be placed in the mobile app.

### Job Completion

Do not immediately mark a contractor submission as fully completed:

```text
Not Started -> In Progress -> Submitted -> Approved -> Completed
                                      `-> Rejected -> In Progress
```

This preserves office review and prevents an incomplete submission from appearing finished.

### Check Requests

Generate a check request **only after an authorized office user approves the invoice**:

1. Validate the job, invoice, amount, and payee.
2. Create a check-request record.
3. Generate a PDF or structured email.
4. Send it to the configured office address.
5. Record delivery status in the audit log.

Never email a payment request automatically from an unreviewed contractor upload.

### File Storage

Store files in private buckets using paths such as:

```text
jobs/{job-id}/{file-type}/{uuid}-{sanitized-filename}
```

Use short-lived signed URLs for downloads. Contractors should access only files associated with their assigned jobs; office access should be role-based.

## Security Requirements

- Require Supabase Auth credentials before creating an authenticated session.
- Restrict contractor access to invited or pre-approved records in `public.contractors`.
- Rate-limit OTP requests and verification attempts.
- Enable RLS on every exposed database table.
- Keep storage buckets private and protect them with RLS policies.
- Validate file type, size, and ownership on upload.
- Keep service-role keys, SMS credentials, and email credentials out of client apps.
- Use server-side functions for privileged operations.
- Log assignments, status changes, approvals, rejections, exports, and check requests.
- Store contractor phone numbers in a consistent format for contact purposes.
- Use least-privilege roles for contractors, office staff, and administrators.
- Define retention and deletion rules for invoices, receipts, photos, and personal data.
- Confirm customer or government compliance requirements before launch.

## Mobile Development Guidance

Because this is the first mobile application for the developer, start with **Expo and React Native** instead of separate Swift and Kotlin applications.

Key differences from web development:

- React Native uses native components such as `View`, `Text`, and `Pressable` instead of HTML elements.
- Navigation is screen-based; Expo Router provides file-based routes similar to modern web frameworks.
- Camera, photo library, notifications, and file access require device permissions.
- Mobile networks are unreliable, so uploads need progress indicators, retries, and clear failure states.
- Small screens require large touch targets and short forms.
- iOS and Android behavior must both be tested, even when source code is shared.
- Expo Go is useful for early learning; use a development build when native configuration or production testing begins.

For field use, design the app to tolerate weak connectivity. At minimum, preserve typed notes and selected photos during temporary connection failures. A later version can add a durable offline queue for job updates and uploads.

### Recommended Development Setup

- **Editor:** VS Code
- **Language:** TypeScript
- **Package manager:** npm
- **Version control:** Git and GitHub
- **Android testing:** Physical Android phone or Android Studio emulator
- **iPhone testing:** Physical iPhone with Expo Go initially
- **API/database testing:** Supabase dashboard and Postman or Thunder Client

Useful VS Code extensions include **ESLint**, **Prettier**, **Expo Tools**, **Tailwind CSS IntelliSense**, **GitLens**, **Error Lens**, and **DotENV**.

You do not need Xcode or Android Studio to begin. Later, Xcode on a Mac is needed for certain advanced iOS work and local iOS builds. Android Studio is useful when an Android emulator is needed. Expo's cloud build service can generate production builds without requiring most native tooling locally.

## Development Plan

### Phase 0: Product Definition

- Confirm user roles and approval rules.
- Define the exact check-request format and recipient.
- Confirm supported file types and maximum sizes.
- Decide whether contractors self-register or must be invited.
- Create low-fidelity screen designs and validate them with actual contractors.

### Phase 1: Foundation

- Create the monorepo.
- Initialize Expo, Next.js, and Supabase projects.
- Add local, staging, and production environments.
- Create database migrations and seed data.
- Implement username/password authentication and role-based authorization.

### Phase 2: Contractor MVP

- Assigned-job dashboard
- Separate Service tab and service-request workflow
- New Work Order form with recipient email field
- Job-detail screen
- Status updates
- Home-address completion checklist
- Camera and document uploads
- Notes and materials
- Completion submission

### Phase 3: Admin MVP

- Contractor and property management
- Job creation and assignment
- Priority and due-date management
- Submission review
- Approval and rejection workflow
- Basic dashboard and reports

### Phase 4: Automation and Reporting

- Completion notifications
- PDF job summaries
- Email exports
- Approved-invoice check requests
- Audit history

### Phase 5: Hardening and Launch

- Automated tests
- Device and accessibility testing
- Security and RLS review
- Upload performance and failure testing
- Staging pilot with a small contractor group
- App Store and Google Play release preparation
- Monitoring, backups, and support procedures

## MVP Scope

The first release should include only the workflow required to assign, perform, submit, and approve a job:

- Invited contractor username/password login
- Assigned-job list and job details
- Completed-work-order history in the **Complete WO** tab
- Separate Service tab
- New Work Order form and email delivery workflow
- Priority and status display
- Home completion checklist with all required property tasks
- Notes, photos, and document uploads
- Contractor submission
- Admin assignment and review
- Approval or rejection
- Completion notification
- Basic PDF job summary

Defer advanced analytics, customer-facing access, accounting integrations, full offline synchronization, and complex report builders until users validate the core workflow.

## Local Development

The exact commands will be finalized when the project is scaffolded. A likely setup is:

```bash
# Install dependencies
npm install

# Start local Supabase services
npx supabase start

# Start the contractor mobile app
npm run dev:mobile

# Start the office admin portal
npm run dev:admin
```

Create a local environment file from `.env.example`. **Never commit secrets.**

```dotenv
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SMS_PROVIDER_TOKEN=
EMAIL_PROVIDER_API_KEY=
CHECK_REQUEST_RECIPIENT=
```

`SUPABASE_SERVICE_ROLE_KEY`, SMS credentials, and email credentials are server-only values and must not use an `EXPO_PUBLIC_` or `NEXT_PUBLIC_` prefix.

## Definition of Done

- A pre-approved contractor can sign in with a username and password.
- A contractor sees only jobs assigned to that contractor.
- Office staff can create, prioritize, and assign a job.
- A contractor can update status, add notes, and upload required files.
- Failed uploads display a clear error and can be retried.
- A contractor can submit completed work for review.
- Office staff can approve or reject the submission.
- An approved job records its completion date.
- The office receives a completion notification.
- Authorized users can generate a job summary.
- Sensitive tables and files pass access-control tests.
- Major actions are recorded in the audit log.

## Documentation References

- [Expo documentation](https://docs.expo.dev/)
- [Expo development builds](https://docs.expo.dev/develop/development-builds/introduction/)
- [Supabase password authentication](https://supabase.com/docs/guides/auth/passwords)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase Storage access control](https://supabase.com/docs/guides/storage/security/access-control)
- [Next.js App Router](https://nextjs.org/docs/app)

## Current Status

**Interactive Expo prototype in progress.** The mobile shell includes a contractor username/password login screen, branded dashboard, live Supabase queries for assigned jobs, Service, and Complete WO history, a New Work Order form that saves property/order/assignment records, and an interactive home completion checklist. Camera and document uploads, persisted checklist mutations, status submission, notifications, office administration, exports, and real work-order email delivery remain unfinished backend or workflow work.

### First Recommended Build

Prototype the contractor workflow first:

**Username/password login -> Assigned jobs / Service -> Job details -> Checklist and evidence -> Submit for review**
