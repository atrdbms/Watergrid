/**
 * Amrabad Tiger Reserve – Watergrid: "Add record" save service.
 *
 * Paste this into the Apps Script editor of the "watergrid" Google Sheet
 * (Extensions > Apps Script), then deploy it as a Web app. See README.md.
 * All names start with WG_ / wg so this file can sit beside other scripts
 * in the same project (e.g. an AppSheet photo-URL script) without clashing.
 *
 * What it does when the website sends a new record:
 *  - checks the entry code (Script property ENTRY_CODE, if set)
 *  - gives the record the next ID_No
 *  - saves the photo (if any) into the Drive folder WG_PHOTO_FOLDER_ID,
 *    shared as "anyone with the link can view", like the existing photos
 *  - appends one row to the "artificial" tab, matching columns by their header names
 */

const WG_SHEET_NAME = 'artificial';
const WG_PHOTO_FOLDER_ID = 'PASTE_DRIVE_FOLDER_ID_HERE'; // folder for new photos (e.g. your artificial_Images folder)
const WG_TIME_ZONE = 'Asia/Kolkata';

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    const d = JSON.parse(e.postData.contents || '{}');

    const code = PropertiesService.getScriptProperties().getProperty('ENTRY_CODE');
    if (code && String(d.code || '') !== code) return wgOut({ ok: false, error: 'The entry code is not correct.' });

    const required = { structure: 'Structure', division: 'Division', range: 'Range', section: 'Section', beat: 'Beat' };
    const missing = Object.keys(required).filter(k => !String(d[k] || '').trim()).map(k => required[k]);
    if (missing.length) return wgOut({ ok: false, error: 'Missing: ' + missing.join(', ') });

    const sh = SpreadsheetApp.getActive().getSheetByName(WG_SHEET_NAME);
    if (!sh) return wgOut({ ok: false, error: 'Tab "' + WG_SHEET_NAME + '" not found in the sheet.' });

    const lastCol = sh.getLastColumn();
    const head = sh.getRange(1, 1, 1, lastCol).getValues()[0];
    const key = h => String(h).toLowerCase().replace(/[^a-z0-9]/g, '');
    const col = {};
    head.forEach((h, i) => { col[key(h)] = i; });
    if (!('idno' in col)) return wgOut({ ok: false, error: 'Column ID_No not found in the sheet.' });

    // Next ID
    const lastRow = sh.getLastRow();
    let maxId = 1000;
    if (lastRow > 1) {
      sh.getRange(2, col.idno + 1, lastRow - 1, 1).getValues().forEach(r => {
        const n = Number(r[0]);
        if (!isNaN(n) && n > maxId) maxId = n;
      });
    }
    const id = maxId + 1;

    const now = new Date();
    const time = Utilities.formatDate(now, WG_TIME_ZONE, 'HH:mm:ss');
    const date = /^\d{2}\/\d{2}\/\d{4}$/.test(d.date || '') ? d.date : Utilities.formatDate(now, WG_TIME_ZONE, 'dd/MM/yyyy');

    // Photo
    // Photo: a problem here never blocks saving the record; it is reported back as photoError
    let photoUrl = '', photoFile = '', photoError = '';
    if (d.photo && String(d.photo).indexOf('base64,') > 0) {
      try {
        const b64 = String(d.photo).split('base64,')[1];
        const name = id + '.Photo.' + Utilities.formatDate(now, WG_TIME_ZONE, 'HHmmss') + '.jpg';
        const blob = Utilities.newBlob(Utilities.base64Decode(b64), 'image/jpeg', name);
        const file = DriveApp.getFolderById(WG_PHOTO_FOLDER_ID).createFile(blob);
        // The folder is already shared "anyone with the link"; this extra step may be refused by Google, which is fine
        try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) {}
        photoUrl = 'https://drive.google.com/uc?export=view&id=' + file.getId();
        photoFile = 'artificial_Images/' + name;
      } catch (e) {
        photoError = String(e && e.message || e);
      }
    }

    const row = new Array(lastCol).fill('');
    const set = (k, v) => { if (k in col && v !== undefined && v !== null) row[col[k]] = String(v).trim(); };
    set('idno', id);
    set('division', d.division);
    set('range', d.range);
    set('section', d.section);
    set('beat', d.beat);
    set('compn0', d.compt);
    set('location', d.location);
    set('scheme', d.scheme);
    set('year', d.year);
    set('structure', d.structure);
    set('latitude', d.lat);
    set('longitude', d.lng);
    set('photo', photoFile);
    set('photourl', photoUrl);
    set('picturetakendate', date);
    set('time', time);
    set('gridid', d.grid);
    set('corebuffer', d.zone);
    set('remarks', d.remarks);

    // Write as plain text so dates like 21/11/2026 stay exactly as typed (same as existing rows)
    const r = lastRow + 1;
    sh.getRange(r, 1, 1, lastCol).setNumberFormat('@').setValues([row]);

    return wgOut({ ok: true, id: id, row: r, photoUrl: photoUrl, photoFile: photoFile, photoError: photoError, time: time });
  } catch (err) {
    return wgOut({ ok: false, error: String(err && err.message || err) });
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function doGet() {
  return wgOut({ ok: true, message: 'Watergrid add-record service is running.' });
}

function wgOut(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

/** Run this once from the editor to grant permissions and check the setup. */
function wgCheckSetup() {
  const sh = SpreadsheetApp.getActive().getSheetByName(WG_SHEET_NAME);
  Logger.log('Sheet tab: ' + (sh ? sh.getName() + ' (' + sh.getLastRow() + ' rows)' : 'NOT FOUND'));
  Logger.log('Photo folder: ' + DriveApp.getFolderById(WG_PHOTO_FOLDER_ID).getName());
  Logger.log('Entry code set: ' + !!PropertiesService.getScriptProperties().getProperty('ENTRY_CODE'));
}
