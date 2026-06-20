/**
 * Knock Twice — Room for Two estimate: response logger (Google Apps Script).
 *
 * Receives each "Send" from the estimate page and appends a row to a
 * "Responses" tab in this same spreadsheet. Optionally emails you on each one.
 * This replaces Formspree — every submission becomes a row you own.
 *
 * ── SETUP (one time) ───────────────────────────────────────────────────────
 *   1. Open the estimate Google Sheet → Extensions → Apps Script.
 *   2. Delete any sample code, paste ALL of this, and click Save (disk icon).
 *   3. (Optional) put your email in NOTIFY_EMAIL below to get notified per send.
 *   4. Deploy → New deployment → click the gear → "Web app".
 *        • Description:     Estimate responses
 *        • Execute as:      Me
 *        • Who has access:  Anyone
 *      Click Deploy. Google will ask you to authorize — click through the
 *      "unverified app" warning (Advanced → Go to <project> → Allow).
 *   5. COPY the "Web app" URL it shows (ends in /exec) and send it to Claude.
 *
 *   To change this later: Deploy → Manage deployments → edit (pencil) →
 *   Version: "New version" → Deploy. The URL stays the same.
 */

const RESPONSES_TAB = 'Responses';
const NOTIFY_EMAIL  = '';   // e.g. 'you@knocktwice.studio' — leave blank for no email

function doPost(e) {
  try {
    const d = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(RESPONSES_TAB);
    if (!sheet) {
      sheet = ss.insertSheet(RESPONSES_TAB);
      sheet.appendRow(['Received', 'Round', 'Cart total', 'In cart',
                       'Alternates requested', "Don't need",
                       'Not yet reviewed', 'Project']);
      sheet.getRange('1:1').setFontWeight('bold');
      sheet.setFrozenRows(1);
    }
    sheet.appendRow([
      new Date(),
      d.round       || '',
      d.cartTotal   || '',
      d.inCart      || '',
      d.alternates  || '',
      d.dontNeed    || '',
      d.notReviewed || '',
      d.project     || ''
    ]);
    if (NOTIFY_EMAIL) {
      MailApp.sendEmail(NOTIFY_EMAIL, d.subject || 'New estimate submission',
        'Round: ' + (d.round || '') +
        '\n\nIn cart: '              + (d.inCart      || '—') +
        '\nAlternates requested: '   + (d.alternates  || '—') +
        "\nDon't need: "             + (d.dontNeed    || '—') +
        '\nNot yet reviewed: '       + (d.notReviewed || '—') +
        '\nCart total: '             + (d.cartTotal   || '—'));
    }
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Visiting the web-app URL in a browser shows this — a quick "is it live?" check.
function doGet() {
  return ContentService.createTextOutput('Knock Twice estimate responder is live.');
}
