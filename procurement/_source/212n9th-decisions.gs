/**
 * Knock Twice - 212 N 9th budget page: client decisions (Google Apps Script).
 *
 * The budget page's "Send to Knock Twice" posts the client's whole set of
 * decisions here. Each send:
 *   1. appends one row per piece to the "Client Actions" tab (created on the
 *      first send), marked New, Changed or Same against their last send, plus
 *      a Withdrawn row for anything they took back. Rows are never edited or
 *      removed by this script, so the tab is the full history;
 *   2. carries your Team status and Team reply forward onto any piece the
 *      client left unchanged, so your answers stay attached;
 *   3. emails a summary of what changed.
 *
 * Your team answers in the last two columns: Team status is a dropdown
 * (Accepted, Declined, Answered) and Team reply is free text. Answer on the
 * piece's newest row. The page reads both back and shows them to the client.
 * To make a preferred alternate official, change the Status column on the
 * BUDGET VISIBILITY DASH tab as usual.
 *
 * -- SETUP ------------------------------------------------------------------
 * Runs as its own project in your Drive and opens the Sheet by SHEET_ID
 * below. (Attached to the Sheet instead, it inherits the Sheet's drive and
 * sharing rules, which can block the client with "Access Denied".)
 *   1. Go to script.google.com -> New project.
 *   2. Replace everything in Code.gs with this file. Save.
 *   3. Deploy -> New deployment -> gear icon -> Web app.
 *        Execute as: Me.   Who has access: Anyone.   Deploy.
 *      Authorize when asked: it needs this Sheet and permission to send email.
 *   4. Copy the Web app URL (it ends in /exec). That goes in the page's
 *      CONFIG.decisions.endpoint.
 * To update later: Deploy -> Manage deployments -> edit (pencil) ->
 * Version: New version -> Deploy. The URL stays the same.
 */

var SHEET_ID = '1KhWinSYJopcwviQjfrZb1ks1ZHi3ZJqQDtG0OYWu5IM';   // the 212 N 9th Sheet; blank = the Sheet this script is attached to
var TAB = 'Client Actions';
var NOTIFY_EMAIL = '';   // blank = the Google account that deployed this script
var HEADERS = ['Sent', 'Submission', 'From', 'Room', 'Piece', 'Decision', 'Choice', 'Price', 'Note', 'Change', 'Team status', 'Team reply'];
var TEAM_STATUSES = ['Accepted', 'Declined', 'Answered'];
var GENERAL = 'General note';
var LIMITS = { decisions: 300, text: 2000, short: 300, name: 80 };

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);   // two sends at once must not interleave their rows
  try {
    var d = JSON.parse(e.postData.contents);
    var ss = SHEET_ID ? SpreadsheetApp.openById(SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
    var tz = ss.getSpreadsheetTimeZone();
    var now = new Date();
    var id = 'S' + Utilities.formatDate(now, tz, 'yyyyMMdd-HHmmss');
    var when = Utilities.formatDate(now, tz, 'MMM d, yyyy h:mm a');
    var from = clip_(d.from, LIMITS.name) || 'Client';

    var sheet = tab_(ss);
    var prev = lastSend_(sheet);
    var rows = [], seen = {};

    var decisions = Array.isArray(d.decisions) ? d.decisions.slice(0, LIMITS.decisions) : [];
    decisions.forEach(function (x) {
      var room = clip_(x && x.room, LIMITS.short), piece = clip_(x && x.piece, LIMITS.short);
      if (!piece || piece === GENERAL) return;
      var k = room + '|' + piece;
      if (seen[k]) return;
      seen[k] = true;
      rows.push(compare_({
        room: room, piece: piece,
        decision: clip_(x.decision, 40), choice: clip_(x.choice, LIMITS.short),
        price: isFinite(Number(x.price)) && x.price !== '' ? Number(x.price) : '',
        note: clip_(x.note, LIMITS.text)
      }, prev[k]));
    });

    var general = clip_(d.general, LIMITS.text);
    if (general) {
      seen['|' + GENERAL] = true;
      rows.push(compare_({ room: '', piece: GENERAL, decision: 'Note', choice: '', price: '', note: general }, prev['|' + GENERAL]));
    }

    // Anything in their last send that isn't in this one, they took back.
    Object.keys(prev).forEach(function (k) {
      if (seen[k]) return;
      var p = prev[k];
      rows.push({ room: p.room, piece: p.piece, decision: 'Withdrawn', choice: '', price: '', note: '', change: 'Withdrawn', status: '', reply: '' });
    });

    if (rows.length) {
      var values = rows.map(function (r) {
        return [when, id, from, r.room, r.piece, r.decision, r.choice, r.price, r.note, r.change, r.status, r.reply].map(safe_);
      });
      var start = sheet.getLastRow() + 1;
      sheet.getRange(start, 1, values.length, HEADERS.length).setValues(values);
      sheet.getRange(start, HEADERS.indexOf('Price') + 1, values.length, 1).setNumberFormat('$#,##0.00');
    }

    var emailed = false;
    try {
      MailApp.sendEmail({
        to: NOTIFY_EMAIL || Session.getEffectiveUser().getEmail(),
        subject: '212 N 9th: decisions from ' + from,
        htmlBody: email_(d, rows, from, when, ss.getUrl() + '#gid=' + sheet.getSheetId())
      });
      emailed = true;
    } catch (mailErr) { /* the rows are saved either way; the team sees them in the tab */ }

    return json_({ ok: true, submission: id, when: when, rows: rows.length, emailed: emailed });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

// Marks a row New, Changed or Same against the piece's row in the last send.
// Unchanged rows keep the team's answer so it stays attached to the piece.
function compare_(row, p) {
  row.status = ''; row.reply = '';
  if (!p) { row.change = 'New'; return row; }
  if (p.decision === row.decision && p.choice === row.choice && p.note === row.note) {
    row.change = 'Same'; row.status = p.status; row.reply = p.reply;
  } else {
    row.change = 'Changed';
  }
  return row;
}

// The client's most recent send, keyed room|piece. Withdrawn rows are left
// out: a piece taken back and not re-added has nothing to compare against.
function lastSend_(sheet) {
  var values = sheet.getDataRange().getValues();
  var head = values[0], col = {};
  HEADERS.forEach(function (h) { col[h] = head.indexOf(h); });
  var latest = '';
  values.slice(1).forEach(function (r) { var s = String(r[col.Submission]); if (s > latest) latest = s; });
  var out = {};
  if (!latest) return out;
  values.slice(1).forEach(function (r) {
    if (String(r[col.Submission]) !== latest || r[col.Decision] === 'Withdrawn') return;
    var room = String(r[col.Room]), piece = String(r[col.Piece]);
    out[room + '|' + piece] = {
      room: room, piece: piece,
      decision: String(r[col.Decision]), choice: String(r[col.Choice]), note: String(r[col.Note]),
      status: String(r[col['Team status']]), reply: String(r[col['Team reply']])
    };
  });
  return out;
}

function tab_(ss) {
  var sheet = ss.getSheetByName(TAB);
  if (sheet) return sheet;
  sheet = ss.insertSheet(TAB, ss.getNumSheets());
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
  sheet.setFrozenRows(1);
  var statusCol = HEADERS.indexOf('Team status') + 1;
  sheet.getRange(2, statusCol, 999, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(TEAM_STATUSES, true).setAllowInvalid(true).build());
  // The team's two columns read as theirs at a glance.
  sheet.getRange(1, statusCol, 1, 2).setBackground('#D1C3B6');
  [150, 130, 90, 110, 160, 130, 200, 80, 260, 80, 100, 260].forEach(function (w, i) { sheet.setColumnWidth(i + 1, w); });
  return sheet;
}

// Anything a client typed that starts like a formula is stored as plain text.
function safe_(v) {
  return typeof v === 'string' && /^[=+\-@]/.test(v) ? "'" + v : v;
}

function clip_(v, n) {
  return String(v == null ? '' : v).trim().slice(0, n);
}

function esc_(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function money_(n) {
  return n === '' || n == null ? '' : '$' + Math.round(Number(n)).toLocaleString('en-US');
}

function email_(d, rows, from, when, tabUrl) {
  var changed = rows.filter(function (r) { return r.change !== 'Same'; });
  var unchanged = rows.length - changed.length;
  function li(r) {
    var what = r.decision === 'Withdrawn' ? 'withdrawn'
      : r.decision === 'Prefers alternate' ? 'prefers the ' + esc_(r.choice)
      : r.decision === 'Approved' ? 'approved' : 'note';
    var price = r.price !== '' ? ' &middot; ' + money_(r.price) : '';
    var note = r.note ? '<br><em style="color:#9A7555">&ldquo;' + esc_(r.note) + '&rdquo;</em>' : '';
    var where = r.room ? esc_(r.room) + ' &middot; ' : '';
    return '<li style="margin:6px 0"><b>' + where + esc_(r.piece) + '</b>: ' + what + price +
           ' <span style="color:#9A7555">(' + r.change.toLowerCase() + ')</span>' + note + '</li>';
  }
  var diff = Number(d.withPicks) - Number(d.recommended);
  var totals = isFinite(diff) && Math.abs(diff) >= 0.5
    ? '<p style="margin:0 0 12px">With their picks, recommended comes to <b>' + money_(d.withPicks) + '</b> (' +
      (diff < 0 ? '&minus;' : '+') + money_(Math.abs(diff)) + ' against ours).</p>'
    : '';
  var page = /^https:\/\//.test(String(d.pageUrl || '')) ? ' &middot; <a href="' + esc_(d.pageUrl) + '">Open the budget page</a>' : '';
  return '<div style="font-family:Arial,Helvetica,sans-serif;color:#32261F;max-width:640px;line-height:1.45">' +
    '<h2 style="margin:0 0 2px">212 N 9th: decisions from ' + esc_(from) + '</h2>' +
    '<p style="margin:0 0 12px;color:#9A7555">Sent ' + esc_(when) + '</p>' + totals +
    (changed.length
      ? '<h3 style="margin:16px 0 4px">What changed (' + changed.length + ')</h3><ul style="margin:0;padding-left:18px">' + changed.map(li).join('') + '</ul>'
      : '<p>Nothing changed since their last send.</p>') +
    (unchanged ? '<p style="color:#9A7555">' + unchanged + ' unchanged from their last send.</p>' : '') +
    '<p style="margin-top:16px"><a href="' + esc_(tabUrl) + '">Answer in the Client Actions tab</a>' + page + '</p>' +
    '</div>';
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

// Visiting the web-app URL in a browser shows this: a quick "is it live?" check.
function doGet() {
  return ContentService.createTextOutput('Knock Twice 212 N 9th decisions responder is live.');
}
