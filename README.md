# MOI Ledger (மொய் கணக்கு)

A Tamil-first, offline-friendly ledger for event gift-money records. It uses plain HTML, CSS, JavaScript modules, and IndexedDB; there is no server account or paid service.

## Run in VS Code

1. Open this folder in VS Code.
2. Install the **Live Server** extension if it is not already installed.
3. In the Explorer, right-click `index.html` and choose **Open with Live Server**.
4. The app opens at a local address such as `http://127.0.0.1:5500`. Keep using the same browser and address so it can access the same local data.
5. Create an event, then use **Entry / வரவு** to select it and add received moi. Enter submits the form and focuses the name field for the next person.

Do not open `index.html` directly with a `file://` URL. Service workers require HTTPS or localhost; Live Server provides the localhost origin needed for offline caching.

## Install on Android

1. Start Live Server on a computer connected to the same Wi-Fi network as the Android phone.
2. For a quick test, find the computer's local IP address and open `http://COMPUTER-IP:5500` in Chrome on the phone. This network address is for testing only: Android generally requires HTTPS (or localhost) for PWA installation and service-worker support.
3. For normal installation, publish the folder to any static host that provides HTTPS, or serve it locally through an HTTPS-capable development setup.
4. Open the HTTPS app URL in Chrome, wait for the first page load to finish, then choose **Install app** from Chrome's menu (or use the app's Install button when offered).
5. Open the installed app once while online. Its app shell is then cached for offline use. You can add and view records offline after that.

## Features

- Event records and per-event totals; Tamil and English interface.
- Fast received-moi entry with serial numbering, village suggestions, duplicate warning, and a previous-gift reminder.
- Given-moi records and person/village net balances.
- Village subtotals, routes with drag-and-drop ordering, and a printable invitation list.
- Dashboard totals and a small village bar chart.
- Event CSV export (UTF-8 with BOM, opens in Excel), browser print-to-PDF, CSV import, and complete JSON backup/restore.
- Light/dark appearance and an optional four-digit screen PIN.

## Data and limitations

- All records are stored in this browser's IndexedDB on this device. Clearing browser storage or uninstalling may remove them; use **Settings → Full backup** regularly and keep the downloaded JSON somewhere safe.
- The PIN only covers the app screen. It is not encryption and does not protect the underlying browser database from someone with device/browser access.
- Tamil font styling requests the free Noto Sans Tamil web font when online and uses installed Tamil system fonts as offline fallbacks. Browser print is used for PDF output because it preserves the browser's Tamil text rendering; select **Save as PDF** in the print dialog.
- The Excel-compatible export is CSV, not a formatted `.xlsx` workbook. CSV import expects a header row containing `name`, `village`, and `amount` (or their Tamil equivalents); imported rows are added to the currently selected event.
- Offline mode includes the app code and its local icon. Web fonts may not be available until fetched online at least once; installed Tamil system fonts remain the fallback.

## Development notes

There is no build step or package installation. The service worker cache version is `moi-ledger-v1` in `service-worker.js`; increment it after changing cached app-shell files when testing an already installed copy.
