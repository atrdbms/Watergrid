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
    const lat = Number(d.lat), lng = Number(d.lng);
    if (String(d.lat || '').trim() === '' || String(d.lng || '').trim() === '' || !(lat > 6 && lat < 37 && lng > 68 && lng < 98))
      return wgOut({ ok: false, error: 'Latitude and longitude are required (decimal numbers, e.g. 16.44747 and 79.16115).' });

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

    // Store values with the same types as the existing rows: numbers as numbers, date/time as real date/time
    const row = new Array(lastCol).fill('');
    const set = (k, v) => { if (k in col && v !== undefined && v !== null) row[col[k]] = String(v).trim(); };
    const setNum = (k, v) => { const t = String(v == null ? '' : v).trim(); if (k in col) row[col[k]] = t !== '' && !isNaN(Number(t)) ? Number(t) : t; };
    const dm = date.split('/').map(Number);
    const dateSerial = (Date.UTC(dm[2], dm[1] - 1, dm[0]) - Date.UTC(1899, 11, 30)) / 86400000;
    const tm = time.split(':').map(Number);
    const timeSerial = (tm[0] * 3600 + tm[1] * 60 + tm[2]) / 86400;
    setNum('idno', id);
    set('division', d.division);
    set('range', d.range);
    set('section', d.section);
    set('beat', d.beat);
    setNum('compn0', d.compt);
    set('location', d.location);
    set('scheme', d.scheme);
    setNum('year', d.year);
    set('structure', d.structure);
    setNum('latitude', d.lat);
    setNum('longitude', d.lng);
    set('photo', photoFile);
    set('photourl', photoUrl);
    if ('picturetakendate' in col) row[col.picturetakendate] = dateSerial;
    if ('time' in col) row[col.time] = timeSerial;
    // Grid_ID always comes from the location (2x2 km grid); form value only if the point is outside all grid boxes
    let gridId = '';
    try { gridId = wgGridAt(d.lat, d.lng); } catch (e) {}
    setNum('gridid', gridId !== '' ? gridId : d.grid);
    set('corebuffer', d.zone);
    set('remarks', d.remarks);

    // Copy the cell formats of the first data row (number, date dd/mm/yyyy, time) so the new row looks the same
    const r = lastRow + 1;
    const target = sh.getRange(r, 1, 1, lastCol);
    if (lastRow >= 2) sh.getRange(2, 1, 1, lastCol).copyTo(target, SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
    target.setValues([row]);

    return wgOut({ ok: true, id: id, row: r, grid: row[col.gridid], photoUrl: photoUrl, photoFile: photoFile, photoError: photoError, time: time });
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

/* ---------------- Grid_ID from the 2x2 km grid (2x2grids.kml) ---------------- */
const WG_GRIDS_URL = 'https://raw.githubusercontent.com/atrdbms/watergrid/main/grids.json';
let wgGridsCache = null;
function wgLoadGrids() {
  if (!wgGridsCache) {
    const j = JSON.parse(UrlFetchApp.fetch(WG_GRIDS_URL).getContentText());
    wgGridsCache = j.grids.map(g => ({ id: g[0], ring: [[g[7][0], g[7][1]], [g[7][2], g[7][3]], [g[7][4], g[7][5]], [g[7][6], g[7][7]]] }));
  }
  return wgGridsCache;
}
/** Returns the Grid_ID of the grid box containing the point, or '' if it is outside all boxes. */
function wgGridAt(lat, lng) {
  lat = Number(lat); lng = Number(lng);
  if (!(lat > 6 && lat < 37 && lng > 68 && lng < 98)) return '';
  for (const g of wgLoadGrids()) {
    let inside = false;
    for (let i = 0, j = 3; i < 4; j = i++) {
      const [xi, yi] = g.ring[i], [xj, yj] = g.ring[j];
      if ((yi > lat) !== (yj > lat) && lng < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
    }
    if (inside) return g.id;
  }
  return '';
}
/**
 * Run once from the editor: rewrites the Grid_ID column for every record whose
 * Latitude/Longitude falls inside a grid box. Records outside all boxes, or
 * without a valid location, are left unchanged. Undo with File > Version history if needed.
 */
function wgFixGridIds() {
  const sh = SpreadsheetApp.getActive().getSheetByName(WG_SHEET_NAME);
  const lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
  const head = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h).toLowerCase().replace(/[^a-z0-9]/g, ''));
  const gc = head.indexOf('gridid'), la = head.indexOf('latitude'), lo = head.indexOf('longitude');
  if (gc < 0 || la < 0 || lo < 0) throw new Error('Grid_ID, Latitude or Longitude column not found');
  const data = sh.getRange(2, 1, lastRow - 1, lastCol).getValues();
  const out = sh.getRange(2, gc + 1, lastRow - 1, 1).getValues();
  let changed = 0, same = 0, outside = 0, noLoc = 0;
  data.forEach((r, i) => {
    if (r.every(c => c === '' || c === null)) return;
    const lat = Number(r[la]), lng = Number(r[lo]);
    if (!(lat > 6 && lat < 37 && lng > 68 && lng < 98)) { noLoc++; return; }
    const g = wgGridAt(lat, lng);
    if (g === '') { outside++; return; }
    if (String(out[i][0]).trim() === String(g)) { same++; return; }
    out[i][0] = Number(g); changed++;
  });
  sh.getRange(2, gc + 1, lastRow - 1, 1).setValues(out);
  const msg = 'Grid_ID updated: ' + changed + ' changed, ' + same + ' already correct, ' + outside + ' outside all grid boxes (unchanged), ' + noLoc + ' without a valid location (unchanged).';
  Logger.log(msg);
  return msg;
}
