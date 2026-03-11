# Dalili React Native Frontend (Mobile + Web)

This folder contains a single Expo React Native frontend that talks to the backend in this repository.

## What It Covers

- Staff workflows:
  - Auth
  - Staff account provisioning (admin/super admin)
  - Appointment scheduling, patient lookup, check-in, and cancellation
  - Patient registration and updates
  - Queue management
  - Queue triage outcome sync (queue impact + suggested diagnoses)
  - Triage workflow
  - Triage nurse clinician handoff capture (name + employee ID + notes)
  - Encounter workflow (ambient audio transcription, SOAP draft generation, diagnosis, meds, completion, addendums)
  - Advisory care-plan suggestions (labs/meds/treatment) with physician Agree step
  - Diagnosis agreement step before completion when diagnoses are present
  - System-computed transcript discrepancy accuracy on note confirmation
  - Prescription generation + print tracking
  - AI differential suggestions from encounter context
  - Clinical portal operations:
    - Break-glass / next-of-kin authorization capture
    - Renewal and transfer review queues
    - Messaging inbox/send/read
    - Labs and referrals add/list/update/print
- Kiosk workflow:
  - Kiosk token flow (MRN+DOB or Name+DOB identification)
  - Queue check-in with category selection
  - Appointment check-in at kiosk
- Patient portal workflow:
  - Snapshot and full-record views
  - Self check-in (including QR deep-link prefill)
  - Pending appointment check-in and appointment history
  - Medication contraindications view
  - Messaging send/read
  - Prescription renewals
  - Cross-facility transfer requests
  - Authorization history
- Web + Mobile support from one codebase

## Frontend Structure

```
src/
  app/            # top-level app shell composition
  api/            # typed API clients/services
  assets/images/  # frontend image assets
  components/ui/  # reusable UI primitives
  config/         # environment and option constants
  constants/      # shared theme constants
  hooks/          # reusable hooks (e.g., deep-link prefill)
  screens/        # role-specific feature screens
  state/          # session/auth state
  utils/          # formatting helpers
```

## Run

1. Start the backend (this repo) on port `8080`.
2. In another terminal:

```bash
cd frontend
npm install
npm run start
```

Then choose:
- `w` for web
- `a` for Android
- `i` for iOS (macOS)

## API URL

- Default web URL: `http://localhost:8080`
- Default Android emulator URL: `http://10.0.2.2:8080`
- You can change this in the login screen ("Backend Base URL").

## Notes

- This frontend is built to match currently available backend endpoints.
- Ambient capture uses microphone recording and backend AI transcription (`/api/encounters/{id}/ambient/transcribe`).
