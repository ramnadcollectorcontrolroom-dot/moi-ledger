import { getAll, get, put, remove, replaceAll, bulkPut } from "./db.js";
import { translate } from "./i18n.js";

const STORE_NAMES = ["events", "received", "given", "routes", "settings"];
const app = document.querySelector("#app");
const state = { screen: "events", language: "ta", currency: "₹", theme: "light", activeEventId: null, data: {}, installPrompt: null, draggedVillage: null };

const t = key => translate(key, state.language);
const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const normalized = value => String(value ?? "").trim().toLocaleLowerCase();
const personKey = value => normalized(value).replace(/\s+/g, " ");
const villageKey = value => normalized(value).replace(/\s+/g, " ");
const formatMoney = amount => `${escapeHtml(state.currency)}${Number(amount || 0).toLocaleString(state.language === "ta" ? "ta-IN" : "en-IN", { maximumFractionDigits: 2 })}`;
const dateToday = () => new Date().toISOString().slice(0, 10);
const eventTypes = ["wedding", "ear", "house", "birthday", "other"];

async function loadData() {
  const results = await Promise.all(STORE_NAMES.map(name => getAll(name)));
  state.data = Object.fromEntries(STORE_NAMES.map((name, index) => [name, results[index]]));
  if (state.activeEventId && !state.data.events.some(event => event.id === state.activeEventId)) state.activeEventId = null;
  if (!state.activeEventId && state.data.events.length) state.activeEventId = state.data.events[0].id;
  const villages = getVillages();
  document.querySelector("#village-options").innerHTML = villages.map(v => `<option value="${escapeHtml(v)}"></option>`).join("");
}

function getVillages() {
  const all = [...state.data.received, ...state.data.given].map(row => String(row.village || "").trim()).filter(Boolean);
  return [...new Map(all.map(v => [villageKey(v), v])).values()].sort((a, b) => a.localeCompare(b, state.language));
}

function sum(rows) { return rows.reduce((total, row) => total + (Number(row.amount) || 0), 0); }
function eventReceived(id) { return state.data.received.filter(row => row.eventId === id); }
function activeEvent() { return state.data.events.find(event => event.id === state.activeEventId); }
function eventTypeLabel(type) { return t(type || "other"); }
function timestamp() { return new Date().toISOString(); }

function setScreen(screen) {
  state.screen = screen;
  document.querySelectorAll(".bottom-nav [data-screen]").forEach(button => button.classList.toggle("active", button.dataset.screen === screen));
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function refresh(focusName = false) {
  await loadData();
  render();
  if (focusName) document.querySelector("#person-name")?.focus();
}

function pageHeading(title, hint = "") {
  return `<div class="page-heading"><div><h1>${escapeHtml(title)}</h1>${hint ? `<div class="hint">${escapeHtml(hint)}</div>` : ""}</div></div>`;
}

function dashboard() {
  const receivedTotal = sum(state.data.received);
  const givenTotal = sum(state.data.given);
  const villageTotals = new Map();
  for (const row of state.data.received) {
    const village = String(row.village || (state.language === "ta" ? "ஊர் குறிப்பிடவில்லை" : "Village not specified"));
    villageTotals.set(village, (villageTotals.get(village) || 0) + Number(row.amount || 0));
  }
  const topVillages = [...villageTotals].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const max = Math.max(1, ...topVillages.map(([, amount]) => amount));
  return `<section class="card">
    <h2>${t("dashboard")}</h2>
    <div class="cards">
      <div class="stat-card"><span class="label">${t("received")}</span><span class="value">${formatMoney(receivedTotal)}</span></div>
      <div class="stat-card"><span class="label">${t("given")}</span><span class="value">${formatMoney(givenTotal)}</span></div>
      <div class="stat-card"><span class="label">${t("net")}</span><span class="value">${formatMoney(receivedTotal - givenTotal)}</span><span class="hint">${t("netHint")}</span></div>
      <div class="stat-card"><span class="label">${t("people")}</span><span class="value">${new Set(state.data.received.map(row => `${personKey(row.name)}|${villageKey(row.village)}`)).size}</span></div>
    </div>
    <h3>${t("topVillages")}</h3>
    ${topVillages.length ? topVillages.map(([village, amount]) => `<div class="bar-row"><span>${escapeHtml(village)}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.max(3, amount / max * 100)}%"></div></div><strong>${formatMoney(amount)}</strong></div>`).join("") : `<p class="empty">${t("noEntries")}</p>`}
  </section>`;
}

function eventDialog(event = null) {
  const record = event || {};
  return `<dialog id="event-dialog"><form id="event-form" class="dialog-body">
    <h2>${event ? t("edit") : t("addEvent")}</h2><input type="hidden" name="id" value="${escapeHtml(record.id || "")}">
    <div class="form-grid">
      <div class="field full"><label>${t("eventName")}</label><input name="name" required maxlength="100" value="${escapeHtml(record.name || "")}"></div>
      <div class="field"><label>${t("type")}</label><select name="type">${eventTypes.map(type => `<option value="${type}" ${record.type === type ? "selected" : ""}>${eventTypeLabel(type)}</option>`).join("")}</select></div>
      <div class="field"><label>${t("date")}</label><input name="date" type="date" value="${escapeHtml(record.date || dateToday())}"></div>
      <div class="field"><label>${t("host")}</label><input name="host" maxlength="100" value="${escapeHtml(record.host || "")}"></div>
      <div class="field"><label>${t("place")}</label><input name="place" maxlength="100" value="${escapeHtml(record.place || "")}"></div>
    </div>
    <div class="dialog-actions"><button type="button" class="secondary" data-close-dialog>${t("cancel")}</button><button class="primary">${t("save")}</button></div>
  </form></dialog>`;
}

function eventPage() {
  const events = [...state.data.events].sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  return `${pageHeading(t("events"))}${dashboard()}
    <section class="card">
      <div class="section-title"><h2>${t("myEvents")}</h2><button class="primary" data-action="add-event">＋ ${t("addEvent")}</button></div>
      <div class="event-list">${events.length ? events.map(event => `<article class="event-card">
        <div><h3>${escapeHtml(event.name)}</h3><p class="event-meta">${eventTypeLabel(event.type)} · ${escapeHtml(event.date || "")}${event.host ? ` · ${escapeHtml(event.host)}` : ""}${event.place ? ` · ${escapeHtml(event.place)}` : ""}</p>
          <div class="event-total">${t("totalInEvent")}: ${formatMoney(sum(eventReceived(event.id)))}</div>
          <div class="actions no-print" style="margin-top:8px"><button class="small-button" data-action="select-event" data-id="${event.id}">${t("entry")}</button><button class="small-button" data-action="edit-event" data-id="${event.id}">${t("edit")}</button><button class="danger-button" data-action="delete-event" data-id="${event.id}">${t("delete")}</button></div>
        </div>
      </article>`).join("") : `<div class="empty">${t("noEvents")}</div>`}</div>
    </section>${eventDialog()}`;
}

function selectEvent() {
  return `<div class="field"><label>${t("selectEvent")}</label><select id="active-event" class="select-control">
    <option value="">— ${t("selectEvent")} —</option>${state.data.events.map(event => `<option value="${event.id}" ${event.id === state.activeEventId ? "selected" : ""}>${escapeHtml(event.name)}${event.date ? ` · ${escapeHtml(event.date)}` : ""}</option>`).join("")}
  </select></div>`;
}

function duplicateCheck(name, village, currentId = null) {
  return state.data.received.some(row => row.eventId === state.activeEventId && row.id !== currentId && personKey(row.name) === personKey(name) && villageKey(row.village) === villageKey(village));
}

function previousGiven(name, village) {
  return state.data.given.filter(row => personKey(row.name) === personKey(name) && villageKey(row.village) === villageKey(village));
}

function entryForm(row = null) {
  const nextSerial = row?.serial || Math.max(0, ...eventReceived(state.activeEventId).map(item => Number(item.serial) || 0)) + 1;
  return `<form id="received-form" class="form-grid">
    <input type="hidden" name="id" value="${escapeHtml(row?.id || "")}">
    <div class="field"><label>${t("serial")}</label><input name="serial" type="number" min="1" value="${escapeHtml(nextSerial)}" required></div>
    <div class="field"><label>${t("person")} <small>Person name</small></label><input id="person-name" name="name" required maxlength="120" autocomplete="name" placeholder="${t("namePlaceholder")}" value="${escapeHtml(row?.name || "")}"></div>
    <div class="field"><label>${t("initial")}</label><input name="initial" maxlength="80" value="${escapeHtml(row?.initial || "")}"></div>
    <div class="field"><label>${t("village")} <small>Village</small></label><input id="person-village" name="village" list="village-options" maxlength="100" autocomplete="address-level2" placeholder="${t("villagePlaceholder")}" value="${escapeHtml(row?.village || "")}"></div>
    <div class="field"><label>${t("amount")} <small>Amount</small></label><input name="amount" type="number" inputmode="decimal" min="0.01" step="0.01" required placeholder="${t("amountPlaceholder")}" value="${escapeHtml(row?.amount ?? "")}"></div>
    <div class="field"><label>${t("phone")}</label><input name="phone" type="tel" inputmode="tel" maxlength="20" value="${escapeHtml(row?.phone || "")}"></div>
    <div class="field full"><label>${t("giftNote")}</label><input name="note" maxlength="160" value="${escapeHtml(row?.note || "")}"></div>
    <div id="entry-notes" class="full"></div>
    <div class="full actions"><button class="primary" type="submit">${row ? t("save") : t("saveNext")}</button>${row ? `<button class="secondary" type="button" data-close-dialog>${t("cancel")}</button>` : ""}</div>
  </form>`;
}

function renderEntryList(rows) {
  if (!rows.length) return `<div class="empty">${t("noEntries")}</div>`;
  return rows.sort((a, b) => Number(a.serial) - Number(b.serial)).map(row => `<article class="entry-record">
    <span class="serial-badge">${escapeHtml(row.serial)}</span>
    <div><h3>${escapeHtml([row.name, row.initial].filter(Boolean).join(" "))}</h3><p>${escapeHtml(row.village || "—")}${row.phone ? ` · ${escapeHtml(row.phone)}` : ""}${row.note ? ` · ${escapeHtml(row.note)}` : ""}</p></div>
    <div class="record-amount">${formatMoney(row.amount)}</div>
    <div class="record-actions no-print"><button class="small-button" data-action="edit-received" data-id="${row.id}">${t("edit")}</button><button class="danger-button" data-action="delete-received" data-id="${row.id}">${t("delete")}</button></div>
  </article>`).join("");
}

function entryPage() {
  const event = activeEvent();
  const rows = event ? eventReceived(event.id) : [];
  const selectedName = event ? escapeHtml(event.name) : t("selectEvent");
  return `${pageHeading(t("entry"), event ? `${selectedName} · ${t("total")}: ${formatMoney(sum(rows))} · ${t("count")}: ${rows.length}` : "")}
    <section class="card entry-toolbar">${selectEvent()}<button class="secondary" data-action="export-event">${t("exportCsv")}</button><button class="secondary" data-action="print-event">${t("print")}</button></section>
    ${event ? `<section class="card"><div class="section-title"><h2>${t("addReceived")}</h2><span class="hint">${t("total")}: ${formatMoney(sum(rows))} · ${t("count")}: ${rows.length}</span></div>${entryForm()}</section>
      <section class="card"><div class="section-title"><h2>${t("entries")}</h2></div><div class="record-list">${renderEntryList(rows)}</div></section>
      <dialog id="edit-received-dialog"><div class="dialog-body"><h2>${t("edit")}</h2></div></dialog>` :
      `<section class="card empty"><p>${t("chooseEvent")}</p><button class="primary" data-screen="events">${t("events")}</button></section>`}`;
}

function aggregateBalances() {
  const map = new Map();
  for (const [kind, rows] of [["received", state.data.received], ["given", state.data.given]]) {
    for (const row of rows) {
      const key = `${personKey(row.name)}|${villageKey(row.village)}`;
      if (!map.has(key)) map.set(key, { name: row.name, village: row.village || "", received: 0, given: 0 });
      map.get(key)[kind] += Number(row.amount) || 0;
    }
  }
  return [...map.values()].map(row => ({ ...row, difference: row.received - row.given }))
    .sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference));
}

function givenDialog(row = null) {
  return `<dialog id="given-dialog"><form id="given-form" class="dialog-body">
    <h2>${row ? t("edit") : t("addGiven")}</h2><input type="hidden" name="id" value="${escapeHtml(row?.id || "")}">
    <div class="form-grid">
      <div class="field"><label>${t("person")}</label><input name="name" required maxlength="120" value="${escapeHtml(row?.name || "")}"></div>
      <div class="field"><label>${t("village")}</label><input name="village" list="village-options" maxlength="100" value="${escapeHtml(row?.village || "")}"></div>
      <div class="field"><label>${t("amount")}</label><input name="amount" type="number" inputmode="decimal" min="0.01" step="0.01" required value="${escapeHtml(row?.amount ?? "")}"></div>
      <div class="field"><label>${t("givenDate")}</label><input name="date" type="date" value="${escapeHtml(row?.date || dateToday())}"></div>
      <div class="field full"><label>${t("givenEvent")}</label><input name="event" maxlength="140" value="${escapeHtml(row?.event || "")}"></div>
    </div>
    <div class="dialog-actions"><button type="button" class="secondary" data-close-dialog>${t("cancel")}</button><button class="primary">${t("save")}</button></div>
  </form></dialog>`;
}

function balanceRows(rows, mode, query) {
  const list = rows.filter(row => mode === "return" ? row.difference > 0 : row.difference < 0)
    .filter(row => !query || personKey(`${row.name} ${row.village}`).includes(personKey(query)));
  if (!list.length) return `<div class="empty">${t("noBalance")}</div>`;
  return list.map(row => `<article class="balance-row">
    <div><h3>${escapeHtml(row.name)}</h3><p>${escapeHtml(row.village || "—")} · ${t("received")} ${formatMoney(row.received)} · ${t("given")} ${formatMoney(row.given)}</p></div>
    <strong class="balance-amount ${mode === "return" ? "owed" : "pending"}">${formatMoney(Math.abs(row.difference))}</strong>
  </article>`).join("");
}

function balancePage() {
  const rows = aggregateBalances();
  const query = state.balanceSearch || "";
  const given = [...state.data.given].sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  return `${pageHeading(t("balance"), t("netHint"))}
    <section class="card"><input class="search-box" id="balance-search" value="${escapeHtml(query)}" placeholder="${t("search")}" aria-label="${t("search")}"></section>
    <section class="card"><div class="section-title"><h2>${t("returnOwed")}</h2></div><div class="balance-list">${balanceRows(rows, "return", query)}</div></section>
    <section class="card"><div class="section-title"><h2>${t("receivePending")}</h2></div><div class="balance-list">${balanceRows(rows, "receive", query)}</div></section>
    <section class="card"><div class="section-title"><h2>${t("givenMoi")}</h2><button class="primary" data-action="add-given">＋ ${t("addGiven")}</button></div>
      <div class="record-list">${given.length ? given.map(row => `<article class="entry-record"><span class="serial-badge">↗</span><div><h3>${escapeHtml(row.name)}</h3><p>${escapeHtml(row.village || "—")} · ${escapeHtml(row.date || "")}${row.event ? ` · ${escapeHtml(row.event)}` : ""}</p></div><div class="record-amount">${formatMoney(row.amount)}</div><div class="record-actions no-print"><button class="small-button" data-action="edit-given" data-id="${row.id}">${t("edit")}</button><button class="danger-button" data-action="delete-given" data-id="${row.id}">${t("delete")}</button></div></article>`).join("") : `<div class="empty">${t("noEntries")}</div>`}</div>
    </section>${givenDialog()}`;
}

function villageGroups() {
  const groups = new Map();
  const names = new Map(getVillages().map(village => [villageKey(village), village]));
  for (const row of state.data.received) {
    const village = row.village
      ? names.get(villageKey(row.village)) || String(row.village).trim()
      : (state.language === "ta" ? "ஊர் குறிப்பிடவில்லை" : "Village not specified");
    if (!groups.has(village)) groups.set(village, []);
    groups.get(village).push(row);
  }
  return [...groups].sort((a, b) => a[0].localeCompare(b[0], state.language));
}

function routeDialog() {
  const villages = getVillages();
  return `<dialog id="route-dialog"><form id="route-form" class="dialog-body"><h2>${t("addRoute")}</h2>
    <div class="field"><label>${t("routeName")}</label><input name="name" required maxlength="60" placeholder="${t("route")} 1"></div>
    <p class="hint" style="margin:14px 0 8px">${t("assignVillages")}</p>
    <div class="checks">${villages.length ? villages.map(village => `<label><input type="checkbox" name="villages" value="${escapeHtml(village)}">${escapeHtml(village)}</label>`).join("") : `<span class="muted">${t("noVillages")}</span>`}</div>
    <div class="dialog-actions"><button type="button" class="secondary" data-close-dialog>${t("cancel")}</button><button class="primary">${t("save")}</button></div>
  </form></dialog>`;
}

function villagesPage() {
  const groups = villageGroups();
  const routes = state.data.routes;
  return `${pageHeading(t("villages"))}
    <section class="card"><div class="section-title"><h2>${t("villageGroups")}</h2><button class="secondary" data-action="print-invitations">${t("invitations")}</button></div>
      <div class="village-list">${groups.length ? groups.map(([village, rows]) => `<article class="village-card">
        <div class="section-title"><h3>${escapeHtml(village)}</h3><span class="village-total">${formatMoney(sum(rows))} · ${rows.length}</span></div>
        ${rows.sort((a, b) => Number(a.serial) - Number(b.serial)).map(row => `<div class="route-village"><span>${escapeHtml(row.name)}${row.initial ? ` ${escapeHtml(row.initial)}` : ""}</span><span class="muted">${escapeHtml(state.data.events.find(e => e.id === row.eventId)?.name || "")}</span></div>`).join("")}
      </article>`).join("") : `<div class="empty">${t("noVillages")}</div>`}</div>
    </section>
    <section class="card"><div class="section-title"><div><h2>${t("routes")}</h2><div class="hint">${t("dragHint")}</div></div><button class="primary" data-action="add-route">＋ ${t("addRoute")}</button></div>
      <div class="route-list">${routes.length ? routes.map(route => `<article class="route-card" data-route="${route.id}">
        <div class="section-title"><h3>${escapeHtml(route.name)}</h3><button class="danger-button" data-action="delete-route" data-id="${route.id}">${t("delete")}</button></div>
        ${(route.villages || []).map(village => `<div class="route-village" draggable="true" data-village="${escapeHtml(village)}" data-route-id="${route.id}"><span>☰ &nbsp;${escapeHtml(village)}</span><span class="actions"><button class="small-button" data-action="move-village" data-id="${route.id}" data-village="${escapeHtml(village)}" data-direction="-1" aria-label="Move up">↑</button><button class="small-button" data-action="move-village" data-id="${route.id}" data-village="${escapeHtml(village)}" data-direction="1" aria-label="Move down">↓</button></span></div>`).join("") || `<p class="muted">${t("noVillages")}</p>`}
      </article>`).join("") : `<div class="empty">${t("noVillages")}</div>`}</div>
    </section>${routeDialog()}`;
}

function settingsPage() {
  return `${pageHeading(t("settingsTitle"))}
    <section class="card form-grid">
      <div class="field"><label>${t("language")}</label><select id="language-setting"><option value="ta" ${state.language === "ta" ? "selected" : ""}>${t("tamil")}</option><option value="en" ${state.language === "en" ? "selected" : ""}>${t("english")}</option></select></div>
      <div class="field"><label>${t("currency")}</label><input id="currency-setting" maxlength="5" value="${escapeHtml(state.currency)}"></div>
      <div class="field"><label>${t("theme")}</label><select id="theme-setting"><option value="light" ${state.theme === "light" ? "selected" : ""}>${t("light")}</option><option value="dark" ${state.theme === "dark" ? "selected" : ""}>${t("dark")}</option></select></div>
      <div class="field"><label>${t("pin")}</label><div class="actions"><button class="secondary" data-action="set-pin">${t("setPin")}</button><button class="danger-button" data-action="remove-pin">${t("removePin")}</button></div><small class="hint">${t("pinHelp")}</small></div>
    </section>
    <section class="card"><h2>${t("backup")}</h2><p class="hint">${state.language === "ta" ? "உங்கள் தரவு இந்தச் சாதனத்திலேயே சேமிக்கப்படுகிறது." : "Your data is stored on this device."}</p>
      <div class="actions"><button class="primary" data-action="backup">${t("backup")}</button><label class="secondary">${t("restore")}<input id="restore-file" type="file" accept=".json,application/json" hidden></label></div>
    </section>
    <section class="card"><h2>${t("importCsv")}</h2><p class="hint">${t("importHelp")}</p>
      <div class="actions"><label class="secondary">${t("importCsv")}<input id="import-file" type="file" accept=".csv,text/csv" hidden></label><button class="secondary" data-action="lock-now">${t("lockNow")}</button></div>
    </section>
    <p class="hint">MOI Ledger · ${state.language === "ta" ? "தரவு உங்கள் உலாவியில் மட்டும் இருக்கும்." : "Your data stays in this browser."}</p>`;
}

function render() {
  document.documentElement.lang = state.language;
  document.body.classList.toggle("dark", state.theme === "dark");
  document.querySelector("#quick-language").textContent = state.language === "ta" ? "EN" : "தமிழ்";
  document.querySelectorAll("[data-i18n]").forEach(node => { node.textContent = t(node.dataset.i18n); });
  app.innerHTML = state.screen === "events" ? eventPage()
    : state.screen === "entry" ? entryPage()
    : state.screen === "balance" ? balancePage()
    : state.screen === "villages" ? villagesPage()
    : settingsPage();
  document.querySelectorAll(".bottom-nav [data-screen]").forEach(button => button.classList.toggle("active", button.dataset.screen === state.screen));
}

function toast(message, error = false) {
  const node = document.querySelector("#toast");
  node.textContent = message;
  node.style.background = error ? "#a72f26" : "";
  node.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => node.classList.remove("show"), 2600);
}

function downloadFile(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csvCell(value) { return `"${String(value ?? "").replace(/"/g, '""')}"`; }
function createCsv(headers, rows) {
  return "\uFEFF" + [headers, ...rows].map(row => row.map(csvCell).join(",")).join("\r\n");
}

function exportEvent() {
  const event = activeEvent();
  if (!event) return toast(t("chooseEvent"), true);
  const received = eventReceived(event.id);
  const given = state.data.given.filter(row => row.event === event.name);
  const rows = [
    ...received.map(row => [row.serial, row.name, row.initial, row.village, row.amount, row.note, row.phone, event.name, event.date]),
    ...given.map(row => ["", row.name, "", row.village, -Number(row.amount || 0), row.event, "", event.name, row.date])
  ];
  if (!rows.length) return toast(t("nothingToExport"), true);
  const headers = state.language === "ta" ? ["வரிசை எண்", "பெயர்", "இனிஷியல்", "ஊர்", "தொகை", "குறிப்பு", "தொலைபேசி", "விசேஷம்", "தேதி"] :
    ["Serial", "Name", "Initial", "Village", "Amount", "Note", "Phone", "Event", "Date"];
  downloadFile(`moi-${event.name}.csv`, createCsv(headers, rows), "text/csv;charset=utf-8");
  toast(t("csvExported"));
}

function printReport() {
  const event = activeEvent();
  if (!event) return toast(t("chooseEvent"), true);
  const rows = eventReceived(event.id).sort((a, b) => Number(a.serial) - Number(b.serial));
  const popup = window.open("", "_blank");
  if (!popup) return toast(state.language === "ta" ? "அச்சு சாளரம் தடுக்கப்பட்டது." : "Print window was blocked.", true);
  const tableRows = rows.map(row => `<tr><td>${escapeHtml(row.serial)}</td><td>${escapeHtml(row.name)} ${escapeHtml(row.initial || "")}</td><td>${escapeHtml(row.village)}</td><td>${escapeHtml(row.note)}</td><td>${escapeHtml(state.currency)}${escapeHtml(row.amount)}</td></tr>`).join("");
  popup.document.write(`<!doctype html><html lang="${state.language}"><head><meta charset="utf-8"><title>${escapeHtml(event.name)}</title><style>
  @import url("https://fonts.googleapis.com/css2?family=Noto+Sans+Tamil:wght@400;600&display=swap");
  body{font-family:"Noto Sans Tamil","Nirmala UI",Latha,sans-serif;padding:24px;color:#222}h1{margin-bottom:4px}p{color:#555}
  table{width:100%;border-collapse:collapse;margin-top:20px}th,td{border:1px solid #aaa;padding:8px;text-align:left}th{background:#f3eee8}
  @media print{body{padding:0}}</style></head><body><h1>${escapeHtml(event.name)} — ${t("report")}</h1><p>${escapeHtml(event.date)} · ${escapeHtml(event.host)} · ${escapeHtml(event.place)}</p>
  <p>${t("count")}: ${rows.length} · ${t("total")}: ${formatMoney(sum(rows))}</p><table><thead><tr><th>${t("serial")}</th><th>${t("person")}</th><th>${t("village")}</th><th>${t("giftNote")}</th><th>${t("amount")}</th></tr></thead><tbody>${tableRows}</tbody></table>
  <script>window.onload=()=>window.print()<\/script></body></html>`);
  popup.document.close();
}

function invitationPrint() {
  const grouped = new Map(villageGroups());
  const assigned = new Set();
  const routes = state.data.routes.map(route => {
    const villages = (route.villages || []).filter(v => grouped.has(v));
    villages.forEach(v => assigned.add(v));
    return { ...route, villages };
  });
  const otherVillages = [...grouped.keys()].filter(village => !assigned.has(village));
  const ordered = [...routes, ...(otherVillages.length ? [{ name: state.language === "ta" ? "வழித்தடம் அமைக்காத ஊர்கள்" : "Unassigned villages", villages: otherVillages }] : [])];
  const sections = ordered.map(route => `<section><h2>${escapeHtml(route.name)}</h2>${route.villages.map(village => {
    const people = grouped.get(village) || [];
    return `<h3>${escapeHtml(village)} (${people.length})</h3><ol>${people.map(row => `<li>${escapeHtml(row.name)}${row.initial ? ` ${escapeHtml(row.initial)}` : ""}</li>`).join("")}</ol>`;
  }).join("")}</section>`).join("");
  const popup = window.open("", "_blank");
  if (!popup) return toast(state.language === "ta" ? "அச்சு சாளரம் தடுக்கப்பட்டது." : "Print window was blocked.", true);
  popup.document.write(`<!doctype html><html lang="${state.language}"><head><meta charset="utf-8"><title>${t("invitations")}</title><style>
  @import url("https://fonts.googleapis.com/css2?family=Noto+Sans+Tamil:wght@400;600&display=swap");
  body{font-family:"Noto Sans Tamil","Nirmala UI",Latha,sans-serif;padding:24px;color:#222}section{break-inside:avoid;border-bottom:1px solid #aaa;padding-bottom:8px}
  li{padding:3px 0}@media print{body{padding:0}}</style></head><body><h1>${t("invitations")}</h1>${sections}<script>window.onload=()=>window.print()<\/script></body></html>`);
  popup.document.close();
}

function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"' && quoted && text[i + 1] === '"') { cell += '"'; i++; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { row.push(cell); cell = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += char;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(line => line.some(value => value.trim()));
}

async function importCsvFile(file) {
  if (!state.activeEventId) return toast(t("chooseEvent"), true);
  const rows = parseCsv((await file.text()).replace(/^\uFEFF/, ""));
  if (rows.length < 2) throw new Error(t("nothingToExport"));
  const headers = rows[0].map(value => normalized(value));
  const findColumn = names => headers.findIndex(header => names.some(name => header === normalized(name)));
  const nameColumn = findColumn(["name", "person", "பெயர்"]);
  const villageColumn = findColumn(["village", "ஊர்"]);
  const amountColumn = findColumn(["amount", "தொகை", "ரூபாய்"]);
  if (nameColumn < 0 || villageColumn < 0 || amountColumn < 0) throw new Error(t("importHelp"));
  let serial = Math.max(0, ...eventReceived(state.activeEventId).map(row => Number(row.serial) || 0)) + 1;
  const records = [];
  for (const line of rows.slice(1)) {
    const name = String(line[nameColumn] || "").trim();
    const village = String(line[villageColumn] || "").trim();
    const amount = Number(String(line[amountColumn] || "").replace(/[₹,\s]/g, ""));
    if (!name || !Number.isFinite(amount) || amount <= 0) continue;
    records.push({ eventId: state.activeEventId, serial: serial++, name, initial: "", village, amount, note: "", phone: "", createdAt: timestamp() });
  }
  if (!records.length) throw new Error(t("nothingToExport"));
  await bulkPut("received", records);
  toast(`${records.length} ${t("imported")}`);
  await refresh();
}

async function backupData() {
  const data = {};
  for (const name of STORE_NAMES) data[name] = state.data[name];
  downloadFile("moi-ledger-backup.json", JSON.stringify({ format: "moi-ledger-backup", version: 1, exportedAt: timestamp(), data }, null, 2), "application/json");
  toast(t("backupDone"));
}

async function restoreBackup(file) {
  const parsed = JSON.parse(await file.text());
  const source = parsed?.data || parsed;
  if (!source || !["events", "received", "given", "routes", "settings"].every(name => Array.isArray(source[name]))) {
    throw new Error(state.language === "ta" ? "சரியான மொய் கணக்கு காப்புப்பிரதி இல்லை." : "This is not a valid MOI Ledger backup.");
  }
  if (!window.confirm(state.language === "ta" ? "தற்போதைய பதிவுகள் அனைத்தும் மாற்றப்படும். தொடரவா?" : "All current records will be replaced. Continue?")) return;
  await replaceAll(source);
  state.activeEventId = null;
  await loadData();
  await loadSettings();
  await refresh();
  toast(t("restored"));
}

async function saveSetting(key, value) {
  await put("settings", { key, value });
  state[key] = value;
}

async function loadSettings() {
  const settings = state.data.settings || await getAll("settings");
  for (const key of ["language", "currency", "theme"]) {
    const item = settings.find(setting => setting.key === key);
    if (item) state[key] = item.value;
  }
}

async function deleteRecord(store, id) {
  if (!window.confirm(t("confirmDelete"))) return;
  await remove(store, Number(id));
  await refresh();
  toast(t("deleted"));
}

document.addEventListener("click", async event => {
  const nav = event.target.closest("[data-screen]");
  if (nav && nav.dataset.screen) return setScreen(nav.dataset.screen);
  const close = event.target.closest("[data-close-dialog]");
  if (close) { close.closest("dialog")?.close(); return; }
  const link = event.target.closest("[data-screen-link]");
  if (link) { event.preventDefault(); return setScreen(link.dataset.screenLink); }
  const button = event.target.closest("[data-action]");
  if (!button) return;
  try {
    const { action, id } = button.dataset;
    if (action === "add-event") document.querySelector("#event-dialog").showModal();
    if (action === "edit-event") {
      const eventRecord = state.data.events.find(row => row.id === Number(id));
      const dialog = document.querySelector("#event-dialog");
      dialog.outerHTML = eventDialog(eventRecord);
      document.querySelector("#event-dialog").showModal();
    }
    if (action === "delete-event") {
      if (!window.confirm(t("confirmDelete"))) return;
      const eventId = Number(id);
      await Promise.all(state.data.received.filter(row => row.eventId === eventId).map(row => remove("received", row.id)));
      await remove("events", eventId);
      await refresh();
      toast(t("deleted"));
    }
    if (action === "select-event") { state.activeEventId = Number(id); return setScreen("entry"); }
    if (action === "edit-received") {
      const row = state.data.received.find(item => item.id === Number(id));
      const dialog = document.querySelector("#edit-received-dialog");
      dialog.innerHTML = `<div class="dialog-body"><h2>${t("edit")}</h2>${entryForm(row)}</div>`;
      dialog.showModal();
      document.querySelector("#received-form [name=name]")?.focus();
    }
    if (action === "delete-received") await deleteRecord("received", id);
    if (action === "add-given") document.querySelector("#given-dialog").showModal();
    if (action === "edit-given") {
      const row = state.data.given.find(item => item.id === Number(id));
      const dialog = document.querySelector("#given-dialog");
      dialog.outerHTML = givenDialog(row);
      document.querySelector("#given-dialog").showModal();
    }
    if (action === "delete-given") await deleteRecord("given", id);
    if (action === "add-route") document.querySelector("#route-dialog").showModal();
    if (action === "delete-route") await deleteRecord("routes", id);
    if (action === "move-village") {
      const route = state.data.routes.find(row => row.id === Number(id));
      const list = [...(route?.villages || [])];
      const index = list.indexOf(button.dataset.village);
      const target = index + Number(button.dataset.direction);
      if (target >= 0 && target < list.length) {
        [list[index], list[target]] = [list[target], list[index]];
        await put("routes", { ...route, villages: list });
        await refresh();
      }
    }
    if (action === "export-event") exportEvent();
    if (action === "print-event") printReport();
    if (action === "print-invitations") invitationPrint();
    if (action === "backup") await backupData();
    if (action === "set-pin") {
      const pin = window.prompt(state.language === "ta" ? "புதிய 4 இலக்க PIN உள்ளிடவும்:" : "Enter a new 4-digit PIN:");
      if (pin === null) return;
      if (!/^\d{4}$/.test(pin)) return toast(state.language === "ta" ? "4 இலக்க எண்களை உள்ளிடவும்." : "Enter exactly four digits.", true);
      await put("settings", { key: "pin", value: pin });
      toast(t("saved"));
    }
    if (action === "remove-pin") {
      await remove("settings", "pin");
      document.querySelector("#lock-screen").classList.add("hidden");
      toast(t("saved"));
    }
    if (action === "lock-now") {
      const pin = await get("settings", "pin");
      if (!pin?.value) return toast(state.language === "ta" ? "முதலில் PIN அமைக்கவும்." : "Set a PIN first.", true);
      document.querySelector("#lock-screen").classList.remove("hidden");
      document.querySelector("#unlock-pin").focus();
    }
  } catch (error) {
    console.error(error);
    toast(`${t("error")}: ${error.message || ""}`, true);
  }
});

document.addEventListener("change", async event => {
  try {
    const target = event.target;
    if (target.id === "active-event") {
      state.activeEventId = target.value ? Number(target.value) : null;
      render();
    }
    if (target.id === "language-setting") { await saveSetting("language", target.value); render(); }
    if (target.id === "theme-setting") { await saveSetting("theme", target.value); render(); }
    if (target.id === "currency-setting") {
      const value = target.value.trim() || "₹";
      await saveSetting("currency", value);
      render();
    }
    if (target.id === "restore-file" && target.files[0]) await restoreBackup(target.files[0]);
    if (target.id === "import-file" && target.files[0]) await importCsvFile(target.files[0]);
  } catch (error) {
    console.error(error);
    toast(`${t("error")}: ${error.message || ""}`, true);
  } finally {
    if (event.target.type === "file") event.target.value = "";
  }
});

document.addEventListener("input", event => {
  if (event.target.id === "balance-search") {
    state.balanceSearch = event.target.value;
    const start = event.target.selectionStart;
    render();
    const input = document.querySelector("#balance-search");
    input.focus();
    input.setSelectionRange(start, start);
  }
  if (event.target.form?.getAttribute("id") === "received-form" && (event.target.name === "name" || event.target.name === "village")) {
    const form = event.target.form;
    const name = form.elements.name.value;
    const village = form.elements.village.value;
    const id = form.elements.id.value ? Number(form.elements.id.value) : null;
    const notes = form.querySelector("#entry-notes");
    const isDuplicate = duplicateCheck(name, village, id);
    const earlier = previousGiven(name, village);
    notes.innerHTML = `${isDuplicate ? `<p class="notice">${t("duplicate")}</p>` : ""}${earlier.length ? `<p class="highlight">${t("gaveEarlier")}: ${formatMoney(sum(earlier))}</p>` : ""}`;
  }
});

document.addEventListener("submit", async event => {
  event.preventDefault();
  try {
    const form = event.target;
    const values = Object.fromEntries(new FormData(form).entries());
    if (form.getAttribute("id") === "event-form") {
      if (!values.name.trim()) return toast(t("enterRequired"), true);
      const record = { name: values.name.trim(), type: values.type, date: values.date, host: values.host.trim(), place: values.place.trim(), updatedAt: timestamp() };
      if (values.id) record.id = Number(values.id);
      else record.createdAt = timestamp();
      const id = await put("events", record);
      state.activeEventId = values.id ? Number(values.id) : id;
      await refresh();
      toast(t("saved"));
    } else if (form.getAttribute("id") === "received-form") {
      if (!state.activeEventId) return toast(t("chooseEvent"), true);
      const amount = Number(values.amount);
      if (!values.name.trim() || !Number.isFinite(amount) || amount <= 0) return toast(t("enterRequired"), true);
      const existingId = values.id ? Number(values.id) : null;
      const row = {
        ...(existingId ? { id: existingId } : {}),
        eventId: state.activeEventId, serial: Number(values.serial), name: values.name.trim(), initial: values.initial.trim(),
        village: values.village.trim(), amount, note: values.note.trim(), phone: values.phone.trim(),
        createdAt: existingId ? state.data.received.find(item => item.id === existingId)?.createdAt : timestamp(), updatedAt: timestamp()
      };
      await put("received", row);
      if (form.closest("dialog")) {
        document.querySelector("#edit-received-dialog")?.close();
        await refresh();
        toast(t("saved"));
      } else {
        await refresh(true);
        toast(t("saved"));
      }
    } else if (form.getAttribute("id") === "given-form") {
      const amount = Number(values.amount);
      if (!values.name.trim() || !Number.isFinite(amount) || amount <= 0) return toast(t("enterRequired"), true);
      const row = { ...(values.id ? { id: Number(values.id) } : {}), name: values.name.trim(), village: values.village.trim(), amount, date: values.date, event: values.event.trim(), updatedAt: timestamp() };
      await put("given", row);
      await refresh();
      toast(t("saved"));
    } else if (form.getAttribute("id") === "route-form") {
      const formData = new FormData(form);
      const villages = formData.getAll("villages").map(String);
      const existingRoutes = state.data.routes.map(route => ({ ...route, villages: (route.villages || []).filter(village => !villages.includes(village)) }));
      for (const route of existingRoutes) await put("routes", route);
      await put("routes", { name: values.name.trim(), villages, createdAt: timestamp() });
      await refresh();
      toast(t("saved"));
    }
  } catch (error) {
    console.error(error);
    toast(`${t("error")}: ${error.message || ""}`, true);
  }
});

document.addEventListener("dragstart", event => {
  const item = event.target.closest(".route-village[draggable=true]");
  if (!item) return;
  state.draggedVillage = { village: item.dataset.village, routeId: Number(item.dataset.routeId) };
  item.classList.add("dragging");
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", item.dataset.village);
});
document.addEventListener("dragend", event => event.target.closest(".route-village")?.classList.remove("dragging"));
document.addEventListener("dragover", event => {
  const target = event.target.closest(".route-village[draggable=true]");
  if (target) { event.preventDefault(); target.classList.add("drag-over"); }
});
document.addEventListener("dragleave", event => event.target.closest(".route-village")?.classList.remove("drag-over"));
document.addEventListener("drop", async event => {
  const target = event.target.closest(".route-village[draggable=true]");
  if (!target || !state.draggedVillage) return;
  event.preventDefault();
  target.classList.remove("drag-over");
  const route = state.data.routes.find(row => row.id === state.draggedVillage.routeId);
  if (!route || route.id !== Number(target.dataset.routeId)) return;
  const villages = [...route.villages];
  const from = villages.indexOf(state.draggedVillage.village);
  const to = villages.indexOf(target.dataset.village);
  if (from < 0 || to < 0 || from === to) return;
  villages.splice(to, 0, villages.splice(from, 1)[0]);
  await put("routes", { ...route, villages });
  state.draggedVillage = null;
  await refresh();
});

document.querySelector("#quick-language").addEventListener("click", async () => {
  state.language = state.language === "ta" ? "en" : "ta";
  await saveSetting("language", state.language);
  render();
});
document.querySelector("#unlock-form").addEventListener("submit", async event => {
  event.preventDefault();
  const pin = await get("settings", "pin");
  if (event.target.elements["unlock-pin"].value === pin?.value) {
    document.querySelector("#lock-screen").classList.add("hidden");
    document.querySelector("#unlock-error").textContent = "";
    event.target.reset();
  } else document.querySelector("#unlock-error").textContent = state.language === "ta" ? "PIN தவறு. மீண்டும் முயற்சிக்கவும்." : "Incorrect PIN. Please try again.";
});

window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();
  state.installPrompt = event;
  document.querySelector("#install-button").classList.remove("hidden");
});
document.querySelector("#install-button").addEventListener("click", async () => {
  if (!state.installPrompt) return;
  state.installPrompt.prompt();
  await state.installPrompt.userChoice;
  state.installPrompt = null;
  document.querySelector("#install-button").classList.add("hidden");
});

async function start() {
  try {
    if (!("indexedDB" in window)) throw new Error("IndexedDB is unavailable in this browser");
    await loadData();
    await loadSettings();
    render();
    const pin = await get("settings", "pin");
    if (pin?.value) document.querySelector("#lock-screen").classList.remove("hidden");
    if ("serviceWorker" in navigator && (location.protocol === "https:" || ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname))) {
      navigator.serviceWorker.register("./service-worker.js").catch(error => console.error("Offline support could not be registered", error));
    }
  } catch (error) {
    console.error(error);
    app.innerHTML = `<section class="card"><h1>${t("error")}</h1><p>${escapeHtml(error.message)}</p></section>`;
  }
}

start();
