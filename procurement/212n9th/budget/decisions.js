/* ──────────────────────────────────────────────────────────────
   DECISIONS — the client's side of the conversation for 212 N 9th.

   On each piece the client can approve our recommendation, prefer one of
   its alternates, or leave a note. Picks save on this device as they go,
   and a bar fixed to the bottom of the page (as in the Room for Two
   estimate) shows progress, the total with their picks, a "Your picks"
   drawer and Send. "Send to Knock Twice" posts the whole set to a Google
   Apps Script
   (procurement/_source/212n9th-decisions.gs), which appends it to the
   Client Actions tab of the project Sheet and emails the team.

   Sending is never final: they can change anything and send again, and the
   latest send is the one that counts. Nothing here moves the official
   totals. A preferred alternate only changes the "with your picks" figure;
   the team makes it official by changing the Status column in the Sheet.

   The team answers in the Client Actions tab (Team status, Team reply) and
   this page shows those answers back on each piece.

   Off until CONFIG.decisions.endpoint is set. CONFIG.decisions.preview, or
   #preview-decisions in the URL, shows the controls with sending off.
   ────────────────────────────────────────────────────────────── */
(function () {
  const B = window.KTBudget;
  if (!B) return;
  const { CONFIG, money, esc, parseCSV, key } = B;
  const D = CONFIG.decisions || {};
  const previewing = Boolean(D.preview) || location.hash === "#preview-decisions";
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

  const decided = (k, p) => !!(p && index[k] && (p.approved || (p.prefer && index[k].alts[p.prefer])));

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
    drawRooms();
    drawBar();
    drawDrawer();
  }

  // "3/13 decided" on each room card, as the estimate shows "0/7 reviewed".
  function drawRooms() {
    const w = working();
    app.querySelectorAll(".room[data-room]").forEach(card => {
      const ks = [...card.querySelectorAll(".piece[data-key]")].map(el => el.dataset.key);
      const done = ks.filter(k => decided(k, w[k])).length;
      const out = card.querySelector("[data-room-progress]");
      out.textContent = `${done}/${ks.length} decided`;
      out.classList.toggle("partial", done > 0 && done < ks.length);
      out.classList.toggle("complete", ks.length > 0 && done === ks.length);
    });
  }

  function drawPiece(el) {
    const k = el.dataset.key, x = index[k];
    if (!x) return;
    const p = pickOf(k);
    el.classList.toggle("is-approved", p.approved);
    el.classList.toggle("is-preferred", !!(p.prefer && x.alts[p.prefer]));
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

  /* ── The bar and its drawer ──────────────────────────────────────────
     Built once, outside the budget's redraws, so an open drawer or a note
     being typed is never interrupted. */
  function bar() {
    let el = document.getElementById("dc-bar");
    if (el) return el;
    document.body.insertAdjacentHTML("beforeend", `
      <div class="dc-bar" id="dc-bar" role="region" aria-label="Your decisions">
        <div class="dc-drawer" id="dc-drawer" hidden>
          <div class="dc-drawer-inner">
            <div class="dc-list"></div>
            <button type="button" class="dc-pill dc-general-toggle" data-dc="general">Add a note for the team</button>
            <div class="dc-general" hidden>
              <label class="dc-visually-hidden" for="dc-general">A note for the team</label>
              <textarea class="dc-input" id="dc-general" rows="2" placeholder="Anything else for the team"></textarea>
            </div>
          </div>
        </div>
        <div class="dc-bar-inner">
          <div class="dc-progress">
            <div class="dc-headline"></div>
            <div class="dc-track"><div class="dc-fill"></div></div>
            <div class="dc-sub"></div>
          </div>
          <div class="dc-total"><div class="dc-amount"></div><div class="dc-total-label"></div></div>
          <div class="dc-actions">
            <button type="button" class="dc-pill dc-picks-btn" data-dc="picks" aria-expanded="false" aria-controls="dc-drawer">Your picks</button>
            <button type="button" class="dc-send" data-dc="send">Send to Knock Twice</button>
          </div>
          <p class="dc-line" aria-live="polite"></p>
        </div>
      </div>`);
    document.body.classList.add("has-bar");
    el = document.getElementById("dc-bar");
    const general = tidy(working()[GENERAL]).note;
    el.querySelector("#dc-general").value = general;
    if (general) openGeneral();
    return el;
  }

  function openGeneral() {
    const el = bar();
    el.querySelector(".dc-general").hidden = false;
    el.querySelector(".dc-general-toggle").hidden = true;
  }

  function drawBar() {
    const el = bar();
    const w = working(), keys = Object.keys(index), c = counts(), pending = pendingKeys();
    const done = keys.filter(k => decided(k, w[k])).length;
    el.querySelector(".dc-headline").innerHTML = `<b>${done}</b> of ${keys.length} pieces decided`;
    el.querySelector(".dc-fill").style.width = keys.length ? (100 * done / keys.length).toFixed(1) + "%" : "0";
    el.querySelector(".dc-sub").textContent = [
      plural(c.approved, "approved", "approved"), plural(c.prefer, "alternate", "alternates"), plural(c.notes, "note", "notes"),
      pending.length ? plural(pending.length, "change not sent", "changes not sent") : "",
    ].filter(Boolean).join(" · ");

    const total = withPicks(), diff = total - summary.sourced;
    el.querySelector(".dc-amount").textContent = money(total);
    // The delta stays in the body face: Handjet's zeros read as eights.
    el.querySelector(".dc-total-label").innerHTML = Math.abs(diff) >= 0.5 ? `With your picks <span class="dc-delta">${signed(diff)}</span>` : "Recommended";

    const send = el.querySelector(".dc-send");
    send.disabled = !canSend || !pending.length;
    const line = el.querySelector(".dc-line");
    if (!line.dataset.result) {
      const s = sent();
      line.className = "dc-line";
      line.textContent = !canSend ? "Sending is off in this preview."
        : pending.length ? "" : s.when ? `Last sent ${s.when}. Change anything and send again.` : "";
    }
  }

  function drawDrawer() {
    const el = bar(), w = working(), pending = new Set(pendingKeys());
    const byRoom = {};
    Object.keys(w).filter(k => index[k] && !isEmpty(w[k])).forEach(k => {
      (byRoom[index[k].room] = byRoom[index[k].room] || []).push(k);
    });
    let html = "";
    if (!Object.keys(byRoom).length) {
      html = `<p class="dc-empty">Approve, prefer or note pieces in the rooms above and they'll gather here.</p>`;
    } else {
      // Rooms and pieces in page order, not the order they were picked.
      summary.rooms.forEach(room => {
        const ks = room.pieces.map(p => room.name + "|" + p.name).filter(k => (byRoom[room.name] || []).includes(k));
        if (!ks.length) return;
        html += `<span class="section-title dc-room">${esc(room.name)}</span>`;
        ks.forEach(k => {
          const x = index[k], p = tidy(w[k]), alt = p.prefer && x.alts[p.prefer];
          const what = alt ? `<span class="dc-mark is-prefer"></span>Prefers the ${esc(p.prefer)}`
            : p.approved ? `<span class="dc-mark is-approved"></span>Approved` : `<span class="dc-mark"></span>Note`;
          const price = alt ? money(alt.total) : p.approved ? money(x.against) : "";
          const sub = [p.note ? `“${esc(p.note)}”` : "", pending.has(k) ? "not sent yet" : ""].filter(Boolean).join(" · ");
          html += `<div class="dc-row"><span><b>${esc(x.piece)}</b> ${what}</span><span class="dc-price">${price}</span>` +
                  (sub ? `<span class="dc-rowsub">${sub}</span>` : "") + `</div>`;
        });
      });
    }
    el.querySelector(".dc-list").innerHTML = html;
  }

  /* ── Send ────────────────────────────────────────────────────────── */
  async function send() {
    const el = bar(), btn = el.querySelector(".dc-send"), line = el.querySelector(".dc-line");
    const say = (text, kind) => {
      line.textContent = text; line.dataset.result = kind || "";
      line.className = "dc-line" + (kind === "error" ? " is-error" : kind === "ok" ? " is-ok" : "");
    };

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
    const payload = {
      project: "212 N 9th", from: "Client", general: tidy(w[GENERAL]).note, decisions,   // one shared link, so no name to ask for
      recommended: summary.sourced, withPicks: withPicks(),
      pageUrl: location.origin + location.pathname,
    };

    btn.disabled = true; say("Sending…", "busy");
    try {
      // A plain-text body keeps this a "simple" request, which Apps Script accepts.
      const res = await fetch(D.endpoint, { method: "POST", body: JSON.stringify(payload) });
      const reply = await res.json();
      if (!reply.ok) throw new Error(reply.error || "The script didn't accept it.");
      local.lastSent = { id: reply.submission, when: reply.when, from: "Client", picks: JSON.parse(JSON.stringify(w)) };
      local.dirty = false;
      saveStore();
      say("Sent. Thank you. We'll reply here on each piece.", "ok");
      mount();
    } catch (e) {
      say("Couldn't send just now. Everything is saved on this device, so nothing is lost. Try again in a moment.", "error");
      btn.disabled = false;
    }
  }

  /* ── Events: one listener for every control, present or future ───── */
  // Any change clears a finished send's message, so the bar talks about now.
  const clearResult = () => { const line = document.querySelector(".dc-line"); if (line && line.dataset.result !== "busy") line.dataset.result = ""; };

  app.addEventListener("click", e => {
    const btn = e.target.closest("[data-dc]");
    if (!btn) return;
    const piece = btn.closest(".piece[data-key]"), k = piece && piece.dataset.key;
    switch (btn.dataset.dc) {
      case "approve": setPick(k, { approved: !pickOf(k).approved, prefer: "" }); clearResult(); break;
      case "prefer": {
        const name = btn.closest(".alt").dataset.alt;
        setPick(k, { prefer: pickOf(k).prefer === name ? "" : name, approved: false });
        clearResult();
        break;
      }
      case "note": if (editing.has(k)) editing.delete(k); else editing.add(k); break;
      case "note-done": editing.delete(k); break;
      default: return;
    }
    mount();
  });

  document.addEventListener("click", e => {
    const btn = e.target.closest("#dc-bar [data-dc]");
    if (!btn) return;
    switch (btn.dataset.dc) {
      case "send": send(); break;
      case "picks": {
        const drawer = document.getElementById("dc-drawer"), open = drawer.hidden;
        drawer.hidden = !open;
        btn.setAttribute("aria-expanded", String(open));
        break;
      }
      case "general": openGeneral(); document.getElementById("dc-general").focus(); break;
    }
  });

  document.addEventListener("input", e => {
    const t = e.target;
    if (t.matches("[data-dc-note]")) {
      setPick(t.closest(".piece[data-key]").dataset.key, { note: t.value });
      clearResult();
      drawPiece(t.closest(".piece"));   // the open box is left alone, only its status line updates
      drawBar(); drawDrawer();
    } else if (t.id === "dc-general") {
      setPick(GENERAL, { note: t.value });
      clearResult();
      drawBar(); drawDrawer();
    }
  });

  /* ── Start ───────────────────────────────────────────────────────── */
  document.querySelector(".notes p")?.insertAdjacentText("beforeend",
    " Your picks save on this device until you send them.");

  function onRendered(S) {
    summary = S;
    buildIndex(S);
    const intro = document.getElementById("rooms-intro");
    if (intro) intro.textContent = "Open a room to approve our pick, prefer an alternate, or leave a note. Send whenever you're ready; nothing is final.";
    mount();
  }
  document.addEventListener("budget:rendered", e => onRendered(e.detail));
  if (B.summary) onRendered(B.summary);
  readSheet();
})();
