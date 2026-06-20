/**
 * Knock Twice — Room for Two estimate: response logger (Google Apps Script).
 *
 * On each "Send" from the estimate page it:
 *   1. creates a fresh DETAIL TAB for that submission — one row per line item
 *      (like PRODUCT LIST), with her decision + note + clickable link;
 *   2. appends a summary row to the "SUBMISSIONS" log tab (your running history);
 *   3. emails you a clean, grouped readout (if NOTIFY_EMAIL is set).
 *
 * ── SETUP / UPDATE ─────────────────────────────────────────────────────────
 *   1. Sheet → Extensions → Apps Script. Replace ALL existing code with this. Save.
 *   2. (Optional) put your address in NOTIFY_EMAIL below.
 *   3. Deploy → Manage deployments → edit (pencil) → Version: "New version" →
 *      Deploy. The web-app URL stays the same — nothing else changes.
 */

const LOG_TAB      = 'SUBMISSIONS';
const NOTIFY_EMAIL = '';   // e.g. 'you@knocktwice.studio' — blank = no email

function doPost(e) {
  try {
    var d  = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var tz = ss.getSpreadsheetTimeZone();
    var now = new Date();
    var when = Utilities.formatDate(now, tz, 'MMM d, yyyy  h:mm a');
    var items = d.items || [];

    // 1) Detail tab — one row per line item, newest tab added at the end.
    var tabName = uniqueTabName_(ss, (d.roundLabel || 'Submission') + ' · ' +
                  Utilities.formatDate(now, tz, 'MMM d, h.mma'));
    var sheet = ss.insertSheet(tabName, ss.getNumSheets());
    var headers = ['Piece','Category','Retailer','Size','Color','Qty','Price','Link','Her decision','Her note'];
    sheet.appendRow(headers);
    sheet.getRange('1:1').setFontWeight('bold');
    sheet.setFrozenRows(1);
    items.forEach(function (it) {
      sheet.appendRow([
        it.piece || '', it.category || '', it.retailer || '',
        it.size || '', it.color || '', it.qty || '',
        it.price ? Number(it.price) : '', '',   // Link cell filled as a formula below
        it.status || '', it.note || ''
      ]);
      var row = sheet.getLastRow();
      if (it.link) sheet.getRange(row, 8).setFormula('=HYPERLINK("' + String(it.link).replace(/"/g, '') + '","View ↗")');
      tintDecision_(sheet.getRange(row, 9), it.status);
    });
    if (items.length) sheet.getRange(2, 7, items.length, 1).setNumberFormat('$#,##0.00'); // Price col
    sheet.autoResizeColumns(1, headers.length);

    // 2) Summary row in the running log.
    var log = ss.getSheetByName(LOG_TAB);
    if (!log) {
      log = ss.insertSheet(LOG_TAB, 0);
      log.appendRow(['Received','Round','In cart','Alternates','Don’t need','Not reviewed','Cart total','Detail tab']);
      log.getRange('1:1').setFontWeight('bold');
      log.setFrozenRows(1);
    }
    var c = d.counts || {};
    log.appendRow([when, d.round || '', c.inCart || 0, c.alternates || 0,
                   c.dontNeed || 0, c.notReviewed || 0, d.cartTotal || '', tabName]);

    // 3) Formatted email.
    if (NOTIFY_EMAIL) {
      MailApp.sendEmail({ to: NOTIFY_EMAIL, subject: d.subject || ('Estimate submission — ' + when), htmlBody: buildEmail_(d, when) });
    }
    return ContentService.createTextOutput(JSON.stringify({ ok: true, tab: tabName })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err) })).setMimeType(ContentService.MimeType.JSON);
  }
}

function uniqueTabName_(ss, base) {
  base = String(base).replace(/[:\\\/\?\*\[\]]/g, '.').slice(0, 90);
  var name = base, n = 2;
  while (ss.getSheetByName(name)) { name = base + ' #' + n; n++; }
  return name;
}

function tintDecision_(range, status) {
  range.setBackground(
    status === 'In cart'              ? '#E3F2EA' :
    status === 'Alternate requested'  ? '#FBE3F6' :
    status === 'Don’t need'      ? '#FBE0E0' : '#F1ECE6');
}

function esc_(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildEmail_(d, when) {
  var items = d.items || [];
  function group(label) { return items.filter(function (i) { return i.status === label; }); }
  function li(i) {
    var link  = i.link ? ' · <a href="' + esc_(i.link) + '">view ↗</a>' : '';
    var price = i.price ? ' — $' + Number(i.price).toLocaleString() : '';
    var note  = i.note ? ' — <em>“' + esc_(i.note) + '”</em>' : '';
    return '<li style="margin:2px 0">' + esc_(i.piece) + price + note + link + '</li>';
  }
  function section(title, label, color) {
    var g = group(label);
    if (!g.length) return '';
    return '<h3 style="margin:16px 0 4px;color:' + color + '">' + title + ' (' + g.length + ')</h3>' +
           '<ul style="margin:0;padding-left:18px">' + g.map(li).join('') + '</ul>';
  }
  return '<div style="font-family:Arial,Helvetica,sans-serif;color:#32261F;max-width:640px">' +
    '<h2 style="margin:0 0 2px">' + esc_(d.project || 'Estimate') + '</h2>' +
    '<p style="margin:0 0 4px;color:#9A7555">' + esc_(d.round || '') + ' · submitted ' + esc_(when) +
    ' · cart ' + esc_(d.cartTotal || '') + '</p>' +
    section('In cart', 'In cart', '#2E7D52') +
    section('Alternate requested', 'Alternate requested', '#B5359C') +
    section('Don’t need', 'Don’t need', '#C0392B') +
    section('Not yet reviewed', 'Not yet reviewed', '#9A7555') +
    '</div>';
}

// Visiting the web-app URL in a browser shows this — a quick "is it live?" check.
function doGet() {
  return ContentService.createTextOutput('Knock Twice estimate responder is live.');
}
