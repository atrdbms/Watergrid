# Amrabad Tiger Reserve – Watergrid Management

A website for reserve staff to explore, map, report on and add water structure records. The data comes from the Google Sheet **watergrid** (tab `artificial`).

## Files

| File | What it is |
|---|---|
| `index.html` | The whole website: dashboard, map, photos, reports, detailed report, records and **+ Add record** |
| `data.json` | A saved copy of the sheet, used only if the live sheet can't be reached |
| `apps-script/Code.gs` | The Google Apps Script that saves new records into the sheet (needed for **+ Add record**) |

## How the data is connected

- **Reading:** the page reads the sheet live through its public CSV link, so the sheet must stay shared as *Anyone with the link – Viewer*. If that fails, the page uses `data.json` and says so in the header.
- **Photos:** loaded from Google Drive by the file ID in `photo_URL`. Photo files must be shared as *Anyone with the link*.
- **Adding records:** the **+ Add record** form sends the record to the Apps Script web app. The script adds a row to the `artificial` tab and saves the photo to Drive.

The settings are in the `CONFIG` block near the bottom of `index.html` (search for `const CONFIG`):

```js
sheetId: '1iV5L_I9GhqzINmQOFl_37LfdYpGsT3vhjuel3HTDeQE',
sheetName: 'artificial',
appsScriptUrl: '',   // paste the Apps Script web app URL here (ends in /exec)
googleMapsKey: '',   // optional, for the "Google satellite" map background
```

## Setting up "+ Add record" (one time, by the sheet owner)

1. Open the **watergrid** Google Sheet with the account that owns it, then go to **Extensions → Apps Script**.
2. Delete any code in `Code.gs`, then paste in the contents of `apps-script/Code.gs` from this repository.
3. In the code, replace `PASTE_DRIVE_FOLDER_ID_HERE` with the ID of the Drive folder where new photos should go. The ID is the part after `/folders/` in the folder's link. This account needs edit access to that folder.
4. Set the entry code staff will type: **Project Settings (gear icon) → Script properties → Add script property**, with name `ENTRY_CODE` and the code you choose as its value. Without this property, anyone who opens the website can add records.
5. Select `checkSetup` in the function list and click **Run**, then allow the permissions it asks for (Sheets and Drive). The log should show the tab and folder names.
6. Click **Deploy → New deployment**, choose type **Web app**, and set:
   - **Execute as:** Me
   - **Who has access:** Anyone
   Click **Deploy** and copy the **Web app URL** (it ends in `/exec`).
7. In `index.html`, paste that URL into `appsScriptUrl: ''`, then commit the change.

If you change `Code.gs` later, update the same deployment (**Deploy → Manage deployments → Edit → Version: New version**) so the URL stays the same.

## What a new record saves

| Sheet column | Filled with |
|---|---|
| ID_No | Next number after the highest existing ID |
| STRUCTURE, DIVISION, RANGE, SECTION, BEAT | From the form (required) |
| Picture taken date | The date on the form (defaults to today), as DD/MM/YYYY |
| Time | The time the record was saved (India time) |
| Photo, photo_URL | Photo saved as `ID.Photo.HHMMSS.jpg` in the Drive folder, shared with anyone with the link |
| COMP_N0, Year, Core_buffer, Scheme, Location, Grid_ID, Latitude, Longitude, Remarks | From "More details (optional)" |

Columns are matched by their header names, so moving columns in the sheet won't break saving. Renaming a header will.
