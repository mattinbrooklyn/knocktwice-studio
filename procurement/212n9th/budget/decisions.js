/* ──────────────────────────────────────────────────────────────
   DECISIONS — the client's side of the conversation for 212 N 9th.

   On each piece the client can approve our recommendation, prefer one of
   its alternates, or leave a note. Picks save on this device as they go.
   "Send to Knock Twice" posts the whole set to a Google Apps Script
   (procurement/_source/212n9th-decisions.gs), which appends it to the
   Client Actions tab of the project Sheet and emails the team.

   Sending is never final: they can change anything and send again, and the
   latest send is the one that counts. Nothing here moves the official
   totals. A preferred alternate only changes the "with your picks" figure;
   the team makes it official by changing the Status column in the Sheet.

   The team answers in the Client Actions tab (Team status, Team reply) and
   this page shows those answers back on each piece.

   Off until CONFIG.decisions.endpoint is set. Add #preview-decisions to the
   URL to see the controls before then (sending stays off).
   ────────────────────────────────────────────────────────────── */
(function () {
  const B = window.KTBudget;
  if (!B) return;
  const { CONFIG, money, esc, parseCSV, key } = B;
  const D = CONFIG.decisions || {};
  const previewing = location.hash === "#preview-decisions";
  if (!D.endpoint && !previewing) return;
  const canSend = Boolean(D.endpoint);
  const app = document.getElementById("app");
  const GENERAL = "|General note";   // the key a general note travels under

  /* ── State ───────────────────────────────────────────────────────────
     A pick is { approved, prefer, note }: approved and prefer (an alternate's
     name) are exclusive; a note can sit with either or alone.

     local (this device):  picks, dirty, lastSent
     sheet (Client Actions, latest send):  id, when, from, picks, team

     While the client hasn't touched anything since their last send, the
     page shows what was sent, so a partner on another device sees it too.
     Once they edit, their own picks take over until they send. */
  let local = readStore();
  let sheet = null;
  let summary = null;
  let index = {};                  // pieceKey → { room, piece, against, alts }
  const editing = new Set();       // pieces whose note box is open

  const blank = () => ({ approved: false, prefer: "", note: "" });
  const tidy = p => ({ approved: !!(p && p.approved), prefer: (p && p.prefer) || "", note: ((p && p.note) || "").trim() });
  const isEmpty = p => { const t = tidy(p); return !t.approved && !t.prefer && !t.note; };
  const same = (a, b) => { const x = tidy(a), y = tidy(b); return x.approved === y.approved && x.prefer === y.prefer && x.note === y.note; };

  function readStore() {
    const empty = { picks: {}, dirty: false, lastSent: null };
    try { return Object.assign(empty, JSON.parse(localStorage.getItem(D.storageKey) || "{}")); }
    catch (e) { return empty; }
  }
  function saveStore() {
    try { localStorage.setItem(D.storageKey, JSON.stringify(local)); } catch (e) { /* private mode: picks live for this visit only */ }
  }

  // The last send, from whichever source is newer. Right after sending, the
  // Sheet can take a moment to show it, so this device's own record wins.
  function sent() {
    const mine = local.lastSent, theirs = sheet;
    if (mine && (!theirs || mine.id > theirs.id)) return mine;
    return theirs || { id: "", when: "", from: "", picks: {} };
  }
  const working = () => (local.dirty ? local.picks : sent().picks) || {};
  const pickOf = k => tidy(working()[k]);

  function setPick(k, change) {
    const next = Object.assign({}, working());
    const p = Object.assign(tidy(next[k]), change);
    if (isEmpty(p)) delete next[k]; else next[k] = p;
    local.picks = next;
    local.dirty = true;
    saveStore();
  }

  // Pieces (and the general note) whose current pick differs from the last send.
  function pendingKeys() {
    const w = working(), s = sent().picks || {};
    const keys = new Set([...Object.keys(w), ...Object.keys(s)]);
    return [...keys].filter(k => (k === GENERAL || index[k]) && !same(w[k], s[k]));
  }

  /* ── The piece index, rebuilt each time the budget draws ─────────── */
  function buildIndex(S) {
    index = {};
    S.rooms.forEach(room => room.pieces.forEach(p => {
      const alts = {};
      p.alternates.forEach(it => { alts[it.name] = it; });
      index[room.name + "|" + p.name] = {
        room: room.name, piece: p.name, alts,
        names: p.recommended.map(it => it.name).join(" + "),
        against: p.recommended.reduce((n, it) => n + it.total, 0),
      };
    }));
  }

  // Recommended total with the client's preferred alternates swapped in.
  function withPicks() {
    let total = summary ? summary.sourced : 0;
    Object.entries(working()).forEach(([k, p]) => {
      const x = index[k], alt = x && p.prefer && x.alts[p.prefer];
      if (alt) total += alt.total - x.against;
    });
    return total;
  }

  function counts() {
    const c = { approved: 0, prefer: 0, notes: 0 };
    Object.entries(working()).forEach(([k, p]) => {
      if (!index[k]) return;
      if (p.approved) c.approved++;
      if (p.prefer && index[k].alts[p.prefer]) c.prefer++;
      if ((p.note || "").trim()) c.notes++;
    });
    return c;
  }
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const signed = n => (n < 0 ? "−" : "+") + money(Math.abs(n));

  /* ── Read the Client Actions tab ─────────────────────────────────── */
  async function readSheet() {
    const url = `https://docs.google.com/spreadsheets/d/${CONFIG.sheetId}/gviz/tq?tqx=out:csv&headers=1&sheet=${encodeURIComponent(D.tab)}&_=${Date.now()}`;
    try {
      const res = await fetch(url);
      if (!res.ok) return;
      const text = await res.text();
      if (text.trimStart().startsWith("<")) return;
      sheet = parseActions(parseCSV(text));
      mount();
    } catch (e) { /* offline or blocked: the page works from this device's record */ }
  }

  function parseActions(rows) {
    if (!rows.length) return null;
    const header = rows[0].map(key);
    const at = name => header.indexOf(key(name));
    const c = { sent: at("Sent"), sub: at("Submission"), from: at("From"), room: at("Room"), piece: at("Piece"),
                decision: at("Decision"), choice: at("Choice"), note: at("Note"), status: at("Team status"), reply: at("Team reply") };
    // Google hands back the Sheet's first tab when this one doesn't exist yet,
    // so only trust rows that really come from the Client Actions log.
    if (c.sub < 0 || c.decision < 0 || c.piece < 0) return null;
    const get = (r, i) => (i >= 0 ? (r[i] ?? "").trim() : "");
    const body = rows.slice(1);
    const id = body.reduce((top, r) => (get(r, c.sub) > top ? get(r, c.sub) : top), "");
    if (!id) return null;
    const out = { id, when: "", from: "", picks: {}, team: {} };
    body.filter(r => get(r, c.sub) === id).forEach(r => {
      out.when = get(r, c.sent); out.from = get(r, c.from);
      const decision = get(r, c.decision);
      if (decision === "Withdrawn") return;
      const k = get(r, c.room) + "|" + get(r, c.piece);
      out.picks[k] = {
        approved: decision === "Approved",
        prefer: decision === "Prefers alternate" ? get(r, c.choice) : "",
        note: get(r, c.note),
      };
      const status = get(r, c.status), reply = get(r, c.reply);
      if (status || reply) out.team[k] = { status, reply };
    });
    return out;
  }

  /* ── Draw ────────────────────────────────────────────────────────── */
  function mount() {
    if (!summary) return;
    app.querySelectorAll(".piece[data-key]").forEach(drawPiece);
    drawReview();
    drawTray();
  }

  function drawPiece(el) {
    const k = el.dataset.key, x = index[k];
    if (!x) return;
    const p = pickOf(k);
    const actions = el.querySelector(".piece-actions");
    actions.querySelectorAll(".dc-pill").forEach(n => n.remove());
    actions.insertAdjacentHTML("beforeend",
      `<button type="button" class="dc-pill dc-approve" data-dc="approve" aria-pressed="${p.approved}">${p.approved ? "Approved" : "Approve"}</button>` +
      `<button type="button" class="dc-pill" data-dc="note" aria-pressed="${editing.has(k)}">${p.note ? "Edit note" : "Add a note"}</button>`);

    // Each alternate gets its own "Prefer this". A chosen one stays open.
    el.querySelectorAll(".alt[data-alt]").forEach(row => {
      const chosen = p.prefer === row.dataset.alt;
      row.classList.toggle("is-picked", chosen);
      row.querySelector(".dc-prefer")?.remove();
      row.insertAdjacentHTML("beforeend",
        `<button type="button" class="dc-prefer" data-dc="prefer" aria-pressed="${chosen}"><span>${chosen ? "Your pick" : "Prefer this"}</span></button>`);
    });
    if (p.prefer && x.alts[p.prefer]) {
      el.querySelector(".alts")?.setAttribute("data-open", "");
      el.querySelector(".alts-toggle")?.setAttribute("aria-expanded", "true");
    }

    // The note box. Kept if already open, so typing is never interrupted.
    // What's been said about this piece sits last; the note box goes above it.
    let status = el.querySelector(".dc-status");
    if (!status) { el.insertAdjacentHTML("beforeend", `<div class="dc-status" aria-live="polite"></div>`); status = el.querySelector(".dc-status"); }
    let box = el.querySelector(".dc-note-edit");
    if (editing.has(k) && !box) {
      status.insertAdjacentHTML("beforebegin",
        `<div class="dc-note-edit"><textarea class="dc-input" data-dc-note rows="2" placeholder="A question or a thought for the team">${esc(p.note)}</textarea>` +
        `<button type="button" class="dc-pill" data-dc="note-done">Done</button></div>`);
      el.querySelector("[data-dc-note]").focus();
    } else if (!editing.has(k) && box) box.remove();

    const s = sent(), sentPick = tidy(s.picks[k]), lines = [];
    if (p.approved) lines.push(`<span class="dc-mark is-approved"></span>You approved this.`);
    if (p.prefer && x.alts[p.prefer]) lines.push(`<span class="dc-mark is-prefer"></span>You prefer the ${esc(p.prefer)}, ${signed(x.alts[p.prefer].total - x.against)}.`);
    if (p.note && !editing.has(k)) lines.push(`Your note: “${esc(p.note)}”`);
    const team = sheet && sheet.team[k];
    if (team && same(sheet.picks[k], p)) {
      lines.push(`<span class="dc-team"><b>Knock Twice${team.status ? " · " + esc(team.status) : ""}</b>${team.reply ? ": " + esc(team.reply) : ""}</span>`);
    }
    if (!same(p, sentPick)) lines.push(`<span class="dc-meta">Not sent yet</span>`);
    else if (!isEmpty(p) && s.when) lines.push(`<span class="dc-meta">Sent ${esc(s.when)}</span>`);

    status.innerHTML = lines.map(l => `<p>${l}</p>`).join("");
  }

  // The review-and-send section. Its inputs are built once and never redrawn,
  // so typing a note is never interrupted; only the list refreshes.
  function drawReview() {
    let sec = document.getElementById("your-decisions");
    if (!sec) {
      app.insertAdjacentHTML("beforeend", `
        <section class="section" id="your-decisions">
          <h2 class="section-h">Your decisions</h2>
          <p class="section-intro">Nothing here is final. Send what you have and change it any time.</p>
          <div class="dc-summary"></div>
          <button type="button" class="dc-pill dc-general-toggle" data-dc="general" aria-expanded="false">Add a note for the team</button>
          <div class="dc-general" hidden>
            <label class="dc-visually-hidden" for="dc-general">A note for the team</label>
            <textarea class="dc-input" id="dc-general" rows="2" placeholder="Anything else for the team"></textarea>
          </div>
          <div class="dc-form" hidden>
            <div class="dc-send-row">
              <button type="button" class="dc-pill dc-send" data-dc="send">Send to Knock Twice</button>
            </div>
            <p class="dc-result" aria-live="polite"></p>
            <p class="dc-last"></p>
          </div>
        </section>`);
      sec = document.getElementById("your-decisions");
      const general = tidy(working()[GENERAL]).note;
      sec.querySelector("#dc-general").value = general;
      if (general) openGeneral(sec);
    }

    const w = working(), pending = new Set(pendingKeys()), c = counts();
    const byRoom = {};
    Object.keys(w).filter(k => index[k] && !isEmpty(w[k])).forEach(k => {
      (byRoom[index[k].room] = byRoom[index[k].room] || []).push(k);
    });
    let html = "";
    if (!Object.keys(byRoom).length) {
      html = `<p class="dc-empty">Approve, prefer or note pieces above and they'll gather here.</p>`;
    } else {
      html += `<div class="dc-list">`;
      // Rooms and pieces in page order, not the order they were picked.
      summary.rooms.forEach(room => {
        const ks = room.pieces.map(p => room.name + "|" + p.name).filter(k => (byRoom[room.name] || []).includes(k));
        if (!ks.length) return;
        html += `<p class="section-title dc-room">${esc(room.name)}</p>`;
        ks.forEach(k => {
          const x = index[k], p = tidy(w[k]), alt = p.prefer && x.alts[p.prefer];
          const what = alt ? `<span class="dc-mark is-prefer"></span>Prefers the ${esc(p.prefer)}`
            : p.approved ? `<span class="dc-mark is-approved"></span>Approved` : `<span class="dc-mark"></span>Note`;
          const price = alt ? money(alt.total) : p.approved ? money(x.against) : "";
          const sub = [p.note ? `“${esc(p.note)}”` : "", pending.has(k) ? "not sent yet" : ""].filter(Boolean).join(" · ");
          html += `<div class="dc-row"><span><b>${esc(x.piece)}</b> ${what}</span><span class="dc-price">${price}</span>` +
                  (sub ? `<span class="dc-sub">${sub}</span>` : "") + `</div>`;
        });
      });
      html += `</div>`;
      const diff = withPicks() - summary.sourced;
      html += `<p class="dc-total">${[plural(c.approved, "approved", "approved"), plural(c.prefer, "alternate", "alternates"), plural(c.notes, "note", "notes")].join(" · ")}.` +
              (Math.abs(diff) >= 0.5 ? ` With your picks, recommended comes to <b>${money(withPicks())}</b>, ${signed(diff)} against ours.` : "") + `</p>`;
    }
    sec.querySelector(".dc-summary").innerHTML = html;

    // The Send row only appears once there's something to send.
    const s0 = sent();
    sec.querySelector(".dc-form").hidden = !(Object.keys(byRoom).length || tidy(w[GENERAL]).note || s0.id);

    const btn = sec.querySelector(".dc-send");
    const nothingNew = !pending.size;
    btn.disabled = !canSend || nothingNew;
    const s = sent();
    sec.querySelector(".dc-last").textContent = !canSend
      ? "Sending switches on once this page is connected."
      : s.when ? `Last sent ${s.when}.${nothingNew ? " Change anything above to send again." : ""}` : "";
  }

  function openGeneral(sec) {
    sec.querySelector(".dc-general").hidden = false;
    sec.querySelector(".dc-general-toggle").hidden = true;
  }

  function drawTray() {
    const n = pendingKeys().length;
    let tray = document.querySelector(".dc-tray");
    document.body.classList.toggle("has-tray", n > 0);
    if (!n) { tray?.remove(); return; }
    if (!tray) {
      document.body.insertAdjacentHTML("beforeend",
        `<div class="dc-tray" role="region" aria-label="Decisions not yet sent"><div class="dc-tray-inner">` +
        `<span class="dc-tray-text"></span><button type="button" class="dc-pill" data-dc="review">Review and send</button></div></div>`);
      tray = document.querySelector(".dc-tray");
    }
    const diff = withPicks() - (summary ? summary.sourced : 0);
    tray.querySelector(".dc-tray-text").innerHTML = `<b>${plural(n, "change", "changes")} not sent</b>` +
      (Math.abs(diff) >= 0.5 ? ` · with your picks ${money(withPicks())} (${signed(diff)})` : "");
  }

  /* ── Send ────────────────────────────────────────────────────────── */
  async function send() {
    const sec = document.getElementById("your-decisions");
    const result = sec.querySelector(".dc-result"), btn = sec.querySelector(".dc-send");
    const say = (text, error) => { result.textContent = text; result.classList.toggle("is-error", !!error); };

    const w = working();
    const decisions = Object.keys(w).filter(k => index[k] && !isEmpty(w[k])).map(k => {
      const x = index[k], p = tidy(w[k]), alt = p.prefer && x.alts[p.prefer];
      return {
        room: x.room, piece: x.piece,
        decision: alt ? "Prefers alternate" : p.approved ? "Approved" : "Note",
        choice: alt ? p.prefer : p.approved ? x.names : "",
        price: alt ? alt.total : p.approved ? x.against : "",
        note: p.note,
      };
    });
    const general = tidy(w[GENERAL]).note;
    const payload = {
      project: "212 N 9th", from: "Client", general, decisions,   // one shared link, so no name to ask for
      recommended: summary.sourced, withPicks: withPicks(),
      pageUrl: location.origin + location.pathname,
    };

    btn.disabled = true; say("Sending…");
    try {
      // A plain-text body keeps this a "simple" request, which Apps Script accepts.
      const res = await fetch(D.endpoint, { method: "POST", body: JSON.stringify(payload) });
      const reply = await res.json();
      if (!reply.ok) throw new Error(reply.error || "The script didn't accept it.");
      local.lastSent = { id: reply.submission, when: reply.when, from: "Client", picks: JSON.parse(JSON.stringify(w)) };
      local.dirty = false;
      saveStore();
      say("Sent. Thank you. We'll reply here on each piece.");
      mount();
    } catch (e) {
      say("Couldn't send just now. Everything is saved on this device, so nothing is lost. Try again in a moment.", true);
      btn.disabled = false;
    }
  }

  /* ── Events: one listener for every control, present or future ───── */
  app.addEventListener("click", e => {
    const btn = e.target.closest("[data-dc]");
    if (!btn) return;
    const piece = btn.closest(".piece[data-key]"), k = piece && piece.dataset.key;
    switch (btn.dataset.dc) {
      case "approve": setPick(k, { approved: !pickOf(k).approved, prefer: "" }); break;
      case "prefer": {
        const name = btn.closest(".alt").dataset.alt;
        setPick(k, { prefer: pickOf(k).prefer === name ? "" : name, approved: false });
        break;
      }
      case "note": if (editing.has(k)) editing.delete(k); else editing.add(k); break;
      case "note-done": editing.delete(k); break;
      case "send": send(); return;
      case "general": {
        const sec = document.getElementById("your-decisions");
        openGeneral(sec);
        sec.querySelector("#dc-general").focus();
        return;
      }
      default: return;
    }
    mount();
  });
  document.addEventListener("click", e => {
    if (e.target.closest('[data-dc="review"]')) document.getElementById("your-decisions")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  app.addEventListener("input", e => {
    const t = e.target;
    if (t.matches("[data-dc-note]")) {
      setPick(t.closest(".piece[data-key]").dataset.key, { note: t.value });
      drawReview(); drawTray();
      const piece = t.closest(".piece");
      drawPiece(piece);   // the open box is left alone, only its status line updates
    } else if (t.id === "dc-general") {
      setPick(GENERAL, { note: t.value });
      drawReview(); drawTray();
    }
  });

  /* ── Start ───────────────────────────────────────────────────────── */
  document.querySelector(".notes p")?.insertAdjacentText("beforeend",
    " Your picks save on this device until you send them.");

  function onRendered(S) {
    summary = S;
    buildIndex(S);
    document.getElementById("your-decisions")?.remove();   // the budget redraw replaced the page body
    mount();
  }
  document.addEventListener("budget:rendered", e => onRendered(e.detail));
  if (B.summary) onRendered(B.summary);
  readSheet();
})();
