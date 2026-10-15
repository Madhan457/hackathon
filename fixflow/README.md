# FixFlow

FixFlow is a static HTML/CSS/vanilla JavaScript application. It connects directly to Cloud Firestore through the Firebase Web SDK. There is no Java, Node.js, or separate API server.

## Project Structure

```text
fixflow/
|-- .gitignore
|-- README.md
`-- frontend/
    |-- .firebaserc
    |-- firebase.js
    |-- firebase.json
    |-- firestore.rules
    |-- index.html
    |-- script.js
    `-- style.css
```

## Firebase Configuration

The existing Firebase Web app config is preserved in `frontend/firebase.js` for project `hackathon-d2299`; its Firebase SDK imports use version `11.10.0`. The app validates the required config fields before initializing Auth and Firestore.

1. Open the [Firebase console](https://console.firebase.google.com/) and select project `hackathon-d2299`.
2. Open **Project settings > General > Your apps**. Select the existing Web app or register a Web app if none exists. Copy its `firebaseConfig` values into `frontend/firebase.js`. Keep `projectId` as `hackathon-d2299`. The Web API key is a public client identifier, not a service-account credential; never put a service-account JSON/private key in this frontend.
3. In **Build > Authentication**, click **Get started** if prompted. Under **Sign-in method**, enable **Anonymous** and **Email/Password**. Anonymous sign-in lets reporters create reports. A maintenance operator signs in with an email/password Firebase Auth account. If the browser reports `auth/configuration-not-found`, Authentication is not initialized for the project, or the Web API key is not associated with this project.
4. In **Build > Firestore Database**, create or enable a Native mode database for `hackathon-d2299`.
5. Replace `replace-with-maintenance-email@example.invalid` in `frontend/firestore.rules` with the exact maintenance account email. The UI lets a signed-in email account attempt to load the queue; Firestore rules remain the authority and reject accounts outside this allowlist.
6. Create the maintenance email/password user in **Authentication > Users**. Do not put its password in source code.

## Firestore Security

`frontend/firestore.rules` applies to `faultReports`:

- Only allowlisted maintenance accounts can read/list reports or update them.
- Signed-in users, including anonymous reporters, can create reports only with the expected fields, value limits, `OPEN` status, and server timestamps.
- Maintenance updates can change only `status` and `updatedAt`; allowed statuses are `OPEN`, `IN_PROGRESS`, and `RESOLVED`.
- Deletes are denied. There is no delete UI or `deleteDoc()` call.

Never replace these checks with public `allow read, write: if true` rules. Configure and deploy the rules after setting the real maintenance email:

```powershell
npm install -g firebase-tools
firebase login
cd fixflow/frontend
firebase deploy --project hackathon-d2299 --only firestore:rules
```

Reports from anonymous users can be submitted, but only maintenance users can see the shared dashboard and live report queue. This protects reporter details from unauthenticated reads. Authentication and Firestore rules are both required for this access model.

## Run with VS Code Live Server

1. Complete the Firebase Web config, Authentication providers, Firestore database, and rules setup above.
2. In VS Code, open `fixflow/frontend/index.html`, right-click, and choose **Open with Live Server**.
3. Use `http://localhost:5500/index.html`. ES modules require an HTTP origin; do not open the file directly with `file://`.
4. Submit a report as an anonymous reporter. Sign in as an allowlisted maintenance account to see live reports and totals, then test status changes, search, and filters.

Firebase-specific permission, configuration, authentication, and network errors are shown in the dashboard. A success message is shown only after Firestore confirms a write.

## Firebase Hosting

The Hosting configuration and project alias are already set to `hackathon-d2299`. After the config and security rules are complete, deploy the static app and rules:

```powershell
cd fixflow/frontend
firebase deploy --project hackathon-d2299 --only hosting,firestore:rules
```

Open the Hosting URL printed by Firebase and repeat the report, sign-in, live-list, status, search, and filter checks. No Firebase Storage is used. Firestore has a no-cost quota; review current Firebase pricing and enable billing only if expected usage or selected features require it.

## Verification Notes

JavaScript dashboard logic uses Firestore snapshots as its only report source; there are no seeded/sample reports or hardcoded totals. This workspace had no Firebase Web config or project credentials, so live Firestore reads/writes cannot be exercised here. After adding your config and setting up Auth/Firestore, use the Live Server steps above to verify report creation, real-time reading, status updates, search/filter behavior, and counts against your actual project.