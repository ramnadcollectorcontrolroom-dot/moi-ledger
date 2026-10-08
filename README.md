# MOI Ledger (மொய் கணக்கு)

A Tamil-first, offline-friendly ledger for event gift-money records. The interface is plain HTML, CSS, and JavaScript modules. Firebase Authentication provides email/password accounts and Cloud Firestore syncs account-owned records; IndexedDB remains the offline working copy.

## Run in VS Code

1. Open this folder in VS Code.
2. Install the **Live Server** extension if it is not already installed.
3. In the Explorer, right-click `index.html` and choose **Open with Live Server**.
4. The app opens at a local address such as `http://127.0.0.1:5500`. Keep using the same browser and address so it can access the same local data.
5. Configure Firebase as described below, then create an account or sign in. Create an event and use **Entry / வரவு** to add received moi. Enter submits the form and focuses the name field for the next person.

Do not open `index.html` directly with a `file://` URL. Service workers require HTTPS or localhost; Live Server provides the localhost origin needed for offline caching.

## Install on Android

1. Start Live Server on a computer connected to the same Wi-Fi network as the Android phone.
2. For a quick test, find the computer's local IP address and open `http://COMPUTER-IP:5500` in Chrome on the phone. This network address is for testing only: Android generally requires HTTPS (or localhost) for PWA installation and service-worker support.
3. For normal installation, publish the folder to any static host that provides HTTPS, or serve it locally through an HTTPS-capable development setup.
4. Open the HTTPS app URL in Chrome, wait for the first page load to finish, then choose **Install app** from Chrome's menu (or use the app's Install button when offered).
5. Open the installed app once while online. Its app shell is then cached for offline use. You can add and view records offline after that.

## Configure Firebase login and cloud sync

1. Create a Firebase project at [Firebase Console](https://console.firebase.google.com/). The Spark (no-cost) plan is sufficient to get started, subject to Firebase quotas and terms.
2. In **Project settings → General**, add a **Web app** and copy its Firebase configuration.
3. Put the `apiKey`, `authDomain`, `projectId`, and `appId` values in `firebase-config.js`, replacing the `YOUR_...` placeholders. These web-app values are public identifiers, not passwords. Do not put service-account keys or administrator credentials in this app.
4. In **Authentication → Sign-in method**, enable **Email/Password**. In **Authentication → Settings → Authorized domains**, make sure `localhost` and your deployed HTTPS host are listed.
5. Create a **Cloud Firestore** database.
6. Publish the rules in `firestore.rules` in **Firestore → Rules**. They restrict each signed-in user to their own `users/{uid}` data. Do not deploy permissive test-mode rules.
7. Host the app over HTTPS (or localhost for development), reload, create an account, then sign in. For email/password reset, configure the allowed email template/domain in Firebase Authentication as needed.

After first sign-in, existing local records are assigned to that account only after confirmation. Each device is associated with one Firebase account; signing into a different account on a device that is already linked is blocked to avoid uploading one family's records into another account. Sign out does not erase local data.

## Features

- Event records and per-event totals; Tamil and English interface.
- Fast received-moi entry with serial numbering, village suggestions, duplicate warning, and a previous-gift reminder.
- Given-moi records and person/village net balances.
- Village subtotals, routes with drag-and-drop ordering, and a printable invitation list.
- Dashboard totals and a small village bar chart.
- Event CSV export (UTF-8 with BOM, opens in Excel), browser print-to-PDF, CSV import, and complete JSON backup/restore.
- Light/dark appearance and an optional four-digit screen PIN.
- Firebase email/password login, password reset, per-account Firestore rules, and sync between signed-in devices.

## Data and limitations

- IndexedDB is the offline working copy; signed-in changes sync with that Firebase account when online. Clearing browser storage or uninstalling may remove the local copy; use **Settings → Full backup** regularly and keep the downloaded JSON somewhere safe.
- Offline access requires a prior successful sign-in on that device. New accounts, first sign-in, password reset, and cloud sync require internet. Firebase SDK files are cached after they load online.
- Cloud sync uses per-record update times; simultaneous edits to the same record resolve to the most recently updated version. Use one account for your family ledger. Backups are additional protection, not a substitute for Firebase security rules.
- Firebase web configuration is visible in a client app by design. Firestore security rules enforce account access. The optional PIN and local IndexedDB are not encryption.
- The PIN only covers the app screen. It is not encryption and does not protect the underlying browser database from someone with device/browser access.
- Tamil font styling requests the free Noto Sans Tamil web font when online and uses installed Tamil system fonts as offline fallbacks. Browser print is used for PDF output because it preserves the browser's Tamil text rendering; select **Save as PDF** in the print dialog.
- The Excel-compatible export is CSV, not a formatted `.xlsx` workbook. CSV import expects a header row containing `name`, `village`, and `amount` (or their Tamil equivalents); imported rows are added to the currently selected event.
- Offline mode includes the app code and its local icon. Web fonts may not be available until fetched online at least once; installed Tamil system fonts remain the fallback.

## Development notes

There is no build step or package installation. Firebase SDK modules are loaded from Google's free CDN and cached by the service worker after the first online load. The service worker cache version is `moi-ledger-v3` in `service-worker.js`; increment it after changing cached app-shell files when testing an already installed copy.
