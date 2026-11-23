'use strict';

/* =========================================================
   app.js – Oberfläche der Haushaltsplan-App
   Daten: store.js · Abgleich über iCloud Drive: sync.js

   - Startbildschirm mit Kategorien (hinzufügen / löschen)
   - Kategorie antippen → Ausgaben darin (hinzufügen / löschen)
   - Kategorie löschen nur nach Eintippen von "Löschen"
   - Einstellungen: Nutzername, E-Mail, iCloud-Sync, Geräte im Haushalt
   ========================================================= */

// ----- Einstellungen -----
const SWIPE_DELETE_PX = 110; // so weit nach links wischen = löschen
const CONFIRM_WORD = 'löschen';
const USERNAME_RE = /^[A-Za-z0-9ÄÖÜäöüß_.-]{3,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ICONS = ['🍔', '🥤', '🎮', '🚌', '🛒', '🏠', '👕', '🎁', '📚', '⚽', '🐶', '📦'];

let currentScreen = 'home';   // 'home' | 'detail' | 'settings'
let currentSectionId = null;  // welche Kategorie gerade offen ist
let pendingDeleteId = null;   // Kategorie, die gelöscht werden soll

// ----- Elemente -----
const $ = (sel) => document.querySelector(sel);
const phone = $('#phone');
const homeScreen = $('#homeScreen');
const detailScreen = $('#detailScreen');
const settingsScreen = $('#settingsScreen');
const sectionListEl = $('#sectionList');
const expenseListEl = $('#expenseList');
const memberListEl = $('#memberList');
const homeScroll = $('#homeScroll');
const detailScroll = $('#detailScroll');
const fab = $('#fab');
const backdrop = $('#backdrop');
const toast = $('#toast');

const expenseSheet = $('#expenseSheet');
const sectionSheet = $('#sectionSheet');
const confirmSheet = $('#confirmSheet');
const amountIn = $('#amountIn');
const titleIn = $('#titleIn');
const dateIn = $('#dateIn');
const sectionNameIn = $('#sectionNameIn');
const confirmIn = $('#confirmIn');
const confirmBtn = $('#confirmBtn');
const usernameIn = $('#usernameIn');
const emailIn = $('#emailIn');

const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });

// ----- Hilfsfunktionen -----
const sumOf = (list) => list.reduce((sum, e) => sum + e.cents, 0);

function countText(n) {
  if (n === 0) return 'Noch keine Ausgaben';
  return n === 1 ? '1 Ausgabe' : `${n} Ausgaben`;
}

// Datum als "2026-11-17" (lokale Zeit) – so wie es das Datumsfeld braucht
function toDayStr(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toDayStr(d);
}

// Anzeige unter einer Ausgabe: "Heute, 18:02", "Gestern" oder "Mo., 10.11.2026"
function formatDate(e) {
  const d = new Date(e.date);
  const day = toDayStr(d);
  const time = e.timeKnown === false
    ? ''
    : ', ' + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  if (day === daysAgo(0)) return 'Heute' + time;
  if (day === daysAgo(1)) return 'Gestern' + time;
  return d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
}

function timeAgo(ms) {
  if (!ms) return 'noch nie';
  const sec = (Date.now() - ms) / 1000;
  if (sec < 60) return 'gerade eben';
  if (sec < 3600) return `vor ${Math.floor(sec / 60)} Min.`;
  if (sec < 86400) return `vor ${Math.floor(sec / 3600)} Std.`;
  return 'am ' + new Date(ms).toLocaleDateString('de-DE');
}

function parseAmount(text) {
  const s = text.trim().replace(/[\s€]/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const cents = Math.round(parseFloat(s) * 100);
  return cents > 0 && cents < 1e9 ? cents : null;
}

function firstLetter(name) {
  const n = (name || '').trim();
  return n ? n[0].toUpperCase() : '👤';
}

// Zahl weich hoch-/runterzählen lassen
const shownValue = new WeakMap();
const runningAnim = new WeakMap();
function animateNumber(el, target, instant = false) {
  cancelAnimationFrame(runningAnim.get(el));
  if (instant) {
    shownValue.set(el, target);
    el.textContent = euro.format(target / 100);
    return;
  }
  const from = shownValue.get(el) ?? 0;
  const start = performance.now();
  const duration = 450;
  const step = (now) => {
    const t = Math.min(1, (now - start) / duration);
    const value = from + (target - from) * (1 - Math.pow(1 - t, 3));
    shownValue.set(el, value);
    el.textContent = euro.format(Math.round(value) / 100);
    if (t < 1) runningAnim.set(el, requestAnimationFrame(step));
  };
  runningAnim.set(el, requestAnimationFrame(step));
}

// =========================================================
//  LISTENEINTRÄGE (für Kategorien, Ausgaben und Geräte)
// =========================================================
function createRow(opts) {
  const li = document.createElement('li');
  li.className = 'item';
  li.dataset.id = opts.id;
  li.innerHTML = `
    <div class="row">
      <div class="row-bg">🗑 Löschen</div>
      <div class="row-fg">
        <span class="icon"></span>
        <div class="info">
          <span class="title"></span>
          <span class="meta"></span>
        </div>
        <span class="amount"></span>
        <button class="del" type="button" aria-label="Löschen">✕</button>
      </div>
    </div>`;
  fillRow(li, opts);

  const fg = li.querySelector('.row-fg');
  const del = li.querySelector('.del');
  if (opts.onDelete) {
    del.addEventListener('click', (ev) => {
      ev.stopPropagation();
      opts.onDelete();
    });
    enableSwipe(li, opts.onDelete);
  } else {
    del.remove();
  }

  if (opts.onOpen) {
    li.classList.add('clickable');
    fg.addEventListener('click', (ev) => {
      if (li.dataset.dragged === '1' || ev.target.closest('.del')) return;
      opts.onOpen();
    });
  }
  return li;
}

// textContent statt innerHTML: so kann eingegebener Text keinen Code einschleusen
function fillRow(li, { icon, title, meta, amount }) {
  li.querySelector('.icon').textContent = icon;
  li.querySelector('.title').textContent = title;
  li.querySelector('.meta').textContent = meta;
  li.querySelector('.amount').textContent = amount;
}

function findLi(listEl, id) {
  return listEl.querySelector(`[data-id="${CSS.escape(id)}"]`);
}

function enableSwipe(li, onDelete) {
  const fg = li.querySelector('.row-fg');
  let startX = 0;
  let dx = 0;
  let dragging = false;

  fg.addEventListener('pointerdown', (ev) => {
    if (ev.target.closest('.del') || li.dataset.removing) return;
    dragging = true;
    startX = ev.clientX;
    dx = 0;
    li.dataset.dragged = '0';
    fg.style.transition = 'none';
  });

  fg.addEventListener('pointermove', (ev) => {
    if (!dragging) return;
    dx = Math.min(0, ev.clientX - startX);
    if (dx < -6) {
      li.dataset.dragged = '1';
      if (!fg.hasPointerCapture(ev.pointerId)) fg.setPointerCapture(ev.pointerId);
    }
    fg.style.transform = `translateX(${dx}px)`;
    li.classList.toggle('swiping', dx < -6);
    li.classList.toggle('armed', dx < -SWIPE_DELETE_PX);
  });

  const end = () => {
    if (!dragging) return;
    dragging = false;
    fg.style.transition = '';
    if (dx < -SWIPE_DELETE_PX) onDelete();
    else snapBack(li);
  };
  fg.addEventListener('pointerup', end);
  fg.addEventListener('pointercancel', end);
}

function snapBack(li) {
  li.querySelector('.row-fg').style.transform = '';
  li.classList.remove('swiping', 'armed');
}

function animateIn(li) {
  const h = li.offsetHeight;
  li.style.height = '0px';
  li.style.opacity = '0';
  void li.offsetHeight; // Startzustand übernehmen
  li.style.height = h + 'px';
  li.style.opacity = '1';
  setTimeout(() => { li.style.height = ''; }, 360);
}

function animateOut(li) {
  li.dataset.removing = '1';
  li.classList.add('armed');
  li.querySelector('.row-fg').style.transform = 'translateX(-110%)';
  setTimeout(() => {
    li.style.height = li.offsetHeight + 'px';
    void li.offsetHeight;
    li.style.height = '0px';
    li.style.opacity = '0';
    setTimeout(() => li.remove(), 340);
  }, 160);
}

// =========================================================
//  BILDSCHIRM WECHSELN
// =========================================================
function showScreen(name) {
  currentScreen = name;
  phone.classList.toggle('in-detail', name === 'detail');
  phone.classList.toggle('in-settings', name === 'settings');
  homeScreen.inert = name !== 'home';
  detailScreen.inert = name !== 'detail';
  settingsScreen.inert = name !== 'settings';
  hideToast();
}

function goHome() {
  currentSectionId = null;
  showScreen('home');
  updateHome();
}

// =========================================================
//  STARTBILDSCHIRM
// =========================================================
function sectionRowOpts(s) {
  const list = store.expensesOf(s.id);
  return {
    id: s.id,
    icon: s.icon,
    title: s.name,
    meta: countText(list.length),
    amount: euro.format(sumOf(list) / 100),
    onOpen: () => openSection(s.id),
    onDelete: () => askDeleteSection(s.id),
  };
}

function renderHome() {
  sectionListEl.innerHTML = '';
  store.sections().forEach((s) => sectionListEl.appendChild(createRow(sectionRowOpts(s))));
  updateHome();
}

function updateHome() {
  const sections = store.sections();
  sections.forEach((s) => {
    const li = findLi(sectionListEl, s.id);
    if (li) fillRow(li, sectionRowOpts(s));
  });
  const all = store.allExpenses();
  animateNumber($('#homeTotal'), sumOf(all));
  const k = sections.length;
  $('#homeCount').textContent = `${countText(all.length)} · ${k} ${k === 1 ? 'Kategorie' : 'Kategorien'}`;
  $('#homeEmpty').hidden = k !== 0;
}

function addSection(name, icon) {
  const s = store.put({ id: makeId(), type: 'section', name, icon, createdAt: Date.now() });
  const li = createRow(sectionRowOpts(s));
  sectionListEl.appendChild(li);
  animateIn(li);
  updateHome();
  setTimeout(() => homeScroll.scrollTo({ top: homeScroll.scrollHeight, behavior: 'smooth' }), 50);
}

function askDeleteSection(id) {
  const s = store.get(id);
  const li = findLi(sectionListEl, id);
  if (!s || !li) return;
  snapBack(li);
  pendingDeleteId = id;

  const n = store.expensesOf(id).length;
  $('#confirmTitle').textContent = `„${s.name}“ löschen?`;
  $('#confirmText').textContent = n === 0
    ? 'Die Kategorie ist leer. Das kann nicht rückgängig gemacht werden.'
    : `Dabei werden auch ${n === 1 ? 'die eine Ausgabe' : `alle ${n} Ausgaben`} darin gelöscht – auf allen Geräten. Das kann nicht rückgängig gemacht werden.`;
  openSheet(confirmSheet, confirmIn);
}

function confirmWordOk() {
  return confirmIn.value.trim().toLowerCase() === CONFIRM_WORD;
}

confirmIn.addEventListener('input', () => {
  confirmBtn.disabled = !confirmWordOk();
});

confirmSheet.addEventListener('submit', (ev) => {
  ev.preventDefault();
  if (!confirmWordOk() || !pendingDeleteId) return;

  const id = pendingDeleteId;
  pendingDeleteId = null;
  store.removeSection(id);

  closeSheet();
  const li = findLi(sectionListEl, id);
  setTimeout(() => {
    if (li) animateOut(li);
    updateHome();
  }, 220);
});

// =========================================================
//  DETAILBILDSCHIRM (Ausgaben einer Kategorie)
// =========================================================
function createExpenseRow(e) {
  return createRow({
    id: e.id,
    icon: store.get(e.sectionId)?.icon || '📦',
    title: e.title,
    meta: formatDate(e),
    amount: '−' + euro.format(e.cents / 100),
    onDelete: () => removeExpense(e.id),
  });
}

function renderDetail(instant) {
  const s = store.get(currentSectionId);
  $('#detailIcon').textContent = s.icon;
  $('#detailName').textContent = s.name;
  expenseListEl.innerHTML = '';
  store.expensesOf(currentSectionId).forEach((e) => expenseListEl.appendChild(createExpenseRow(e)));
  updateDetail(instant);
}

function openSection(id) {
  if (!store.isLive(id)) return;
  currentSectionId = id;
  renderDetail(true);
  detailScroll.scrollTop = 0;
  showScreen('detail');
}

function updateDetail(instant = false) {
  if (!currentSectionId) return;
  const list = store.expensesOf(currentSectionId);
  animateNumber($('#detailTotal'), sumOf(list), instant);
  $('#detailCount').textContent = countText(list.length);
  $('#detailEmpty').hidden = list.length !== 0;
}

// Eintrag an der richtigen Stelle (nach Datum sortiert) einfügen
function insertExpenseRow(e) {
  const list = store.expensesOf(e.sectionId);
  const next = list[list.findIndex((x) => x.id === e.id) + 1];
  const li = createExpenseRow(e);
  expenseListEl.insertBefore(li, next ? findLi(expenseListEl, next.id) : null);
  animateIn(li);
  return li;
}

function addExpense(title, cents, date, timeKnown) {
  const e = store.put({
    id: makeId(), type: 'expense', sectionId: currentSectionId,
    title, cents, date, timeKnown,
  });
  const li = insertExpenseRow(e);
  updateDetail();
  // zur neuen Ausgabe scrollen (bei älterem Datum steht sie weiter unten)
  setTimeout(() => li.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 60);
}

function removeExpense(id) {
  const li = findLi(expenseListEl, id);
  if (!li || li.dataset.removing) return;
  store.remove(id);
  animateOut(li);
  updateDetail();
  showToast('Ausgabe gelöscht', () => restoreExpense(id));
}

function restoreExpense(id) {
  const e = store.get(id);
  if (!e || !store.isLive(e.sectionId)) return; // Kategorie gibt es nicht mehr
  store.restore(id);
  if (currentSectionId === e.sectionId) {
    insertExpenseRow(store.get(id));
    updateDetail();
  }
}

// ----- Hinweis-Leiste mit "Rückgängig" -----
let toastTimer = 0;
let undoAction = null;
function showToast(text, onUndo) {
  $('#toastText').textContent = text;
  $('#undoBtn').hidden = !onUndo;
  undoAction = onUndo || null;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, 4000);
}
function hideToast() {
  toast.classList.remove('show');
  undoAction = null;
}
function runUndo() {
  const action = undoAction;
  hideToast();
  if (action) action();
}

// =========================================================
//  FENSTER VON UNTEN (Sheets)
// =========================================================
let openSheetEl = null;

function openSheet(sheet, focusEl) {
  hideToast();
  openSheetEl = sheet;
  sheet.inert = false;
  sheet.classList.add('open');
  backdrop.classList.add('show');
  fab.classList.add('hide');
  setTimeout(() => focusEl && focusEl.focus(), 300);
}

function closeSheet() {
  const sheet = openSheetEl;
  if (!sheet) return;
  openSheetEl = null;
  sheet.classList.remove('open');
  sheet.inert = true;
  backdrop.classList.remove('show');
  fab.classList.remove('hide');
  if (document.activeElement) document.activeElement.blur();
  if (sheet === confirmSheet) pendingDeleteId = null;

  setTimeout(() => {
    sheet.reset();
    sheet.querySelectorAll('.field.error').forEach((f) => f.classList.remove('error'));
    confirmBtn.disabled = true;
  }, 400);
}

function flagError(input, message = '') {
  const field = input.closest('.field');
  const err = field.querySelector('.err');
  if (err) err.textContent = message;
  field.classList.remove('error');
  void field.offsetWidth; // Wackel-Animation neu starten
  field.classList.add('error');
  input.addEventListener('input', () => field.classList.remove('error'), { once: true });
}

function buildIconChips() {
  const wrap = $('#iconChips');
  ICONS.forEach((icon, i) => {
    const label = document.createElement('label');
    label.className = 'chip';
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'icon';
    input.value = icon;
    input.defaultChecked = i === 0;
    const span = document.createElement('span');
    span.textContent = icon;
    label.append(input, span);
    wrap.append(label);
  });
}

// ----- Datum im Ausgaben-Fenster -----
function setDate(dayStr) {
  dateIn.value = dayStr;
  updateQuickButtons();
}

function updateQuickButtons() {
  document.querySelectorAll('.quick').forEach((b) => {
    b.classList.toggle('active', dateIn.value === daysAgo(Number(b.dataset.days)));
  });
}

function openExpenseSheet() {
  dateIn.max = daysAgo(0); // keine Ausgaben in der Zukunft
  setDate(daysAgo(0));     // Standard: heute
  openSheet(expenseSheet, amountIn);
}

dateIn.addEventListener('input', updateQuickButtons);
document.querySelectorAll('.quick').forEach((b) => {
  b.addEventListener('click', () => {
    setDate(daysAgo(Number(b.dataset.days)));
    dateIn.closest('.field').classList.remove('error');
  });
});

expenseSheet.addEventListener('submit', (ev) => {
  ev.preventDefault();
  const cents = parseAmount(amountIn.value);
  const title = titleIn.value.trim();
  const day = dateIn.value;
  const today = daysAgo(0);
  let ok = true;
  if (cents === null) { flagError(amountIn); ok = false; }
  if (!title) { flagError(titleIn); ok = false; }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) { flagError(dateIn, 'Bitte ein Datum wählen'); ok = false; }
  else if (day > today) { flagError(dateIn, 'Das Datum darf nicht in der Zukunft liegen'); ok = false; }
  if (!ok || !currentSectionId) return;

  // Heute: mit genauer Uhrzeit. Anderer Tag: nur das Datum (intern 12 Uhr mittags).
  let date;
  let timeKnown;
  if (day === today) {
    date = new Date().toISOString();
    timeKnown = true;
  } else {
    const [y, m, d] = day.split('-').map(Number);
    date = new Date(y, m - 1, d, 12).toISOString();
    timeKnown = false;
  }

  closeSheet();
  setTimeout(() => addExpense(title, cents, date, timeKnown), 180); // erst Fenster zu, dann Eintrag
});

sectionSheet.addEventListener('submit', (ev) => {
  ev.preventDefault();
  const name = sectionNameIn.value.trim();
  if (!name) { flagError(sectionNameIn); return; }
  const icon = sectionSheet.querySelector('input[name="icon"]:checked').value;
  closeSheet();
  setTimeout(() => addSection(name, icon), 180);
});

// =========================================================
//  EINSTELLUNGEN
// =========================================================
function updateProfileView() {
  const { username, email } = store.data.profile;
  $('#avatarSmall').textContent = firstLetter(username);
  $('#avatarBig').textContent = firstLetter(username);
  $('#profileName').textContent = username || 'Noch kein Nutzername';
  $('#profileEmail').textContent = email || 'Keine E-Mail hinterlegt';
}

function openSettings() {
  usernameIn.value = store.data.profile.username;
  emailIn.value = store.data.profile.email;
  document.querySelectorAll('#profileForm .field').forEach((f) => f.classList.remove('error'));
  renderSync();
  $('#settingsScroll').scrollTop = 0;
  showScreen('settings');
}

// kurz "Gespeichert ✓" o. Ä. auf einem Knopf anzeigen
function flashButton(btn, text) {
  if (!btn.dataset.label) btn.dataset.label = btn.textContent;
  btn.textContent = text;
  btn.classList.add('saved');
  clearTimeout(btn._timer);
  btn._timer = setTimeout(() => {
    btn.textContent = btn.dataset.label;
    btn.classList.remove('saved');
  }, 1600);
}

$('#profileForm').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const username = usernameIn.value.trim();
  const email = emailIn.value.trim();
  let ok = true;
  if (!USERNAME_RE.test(username)) {
    flagError(usernameIn, '3–20 Zeichen: Buchstaben, Zahlen, _ . - (keine Leerzeichen)');
    ok = false;
  }
  if (email && !EMAIL_RE.test(email)) {
    flagError(emailIn, 'Bitte eine gültige E-Mail-Adresse eingeben');
    ok = false;
  }
  if (!ok) return;

  store.data.profile.username = username;
  store.data.profile.email = email;
  store.save();
  renderMembers();
  updateProfileView();
  if (document.activeElement) document.activeElement.blur();
  flashButton($('#saveProfileBtn'), 'Gespeichert ✓');
});

// ----- iCloud-Sync: Anzeige -----
function renderSync() {
  const last = sync.lastSync;
  const open = sync.unsyncedCount();
  let dot = 'ok';
  let info = '';

  if (!last) {
    dot = open ? 'syncing' : '';
    info = 'Tippe auf „Jetzt synchronisieren“, um die Daten mit deiner Familie zu teilen.';
  } else {
    info = open === 0
      ? 'Alles ist in iCloud gespeichert.'
      : `${open} ${open === 1 ? 'Änderung ist' : 'Änderungen sind'} noch nicht in iCloud.`;
    if (open) dot = 'syncing';
  }

  $('#syncTitle').textContent = last ? `Zuletzt synchronisiert: ${timeAgo(last)}` : 'Noch nie synchronisiert';
  $('#syncInfo').textContent = info;
  $('#syncDot').className = 'sync-dot ' + dot;
  $('#avatarDot').className = 'avatar-dot ' + dot;
  renderMembers();
}

function renderMembers() {
  const list = sync.devices();
  $('#membersBlock').hidden = list.length === 0;
  memberListEl.innerHTML = '';
  list.forEach((m) => {
    const self = m.deviceId === store.data.deviceId;
    const li = createRow({
      id: m.deviceId,
      icon: firstLetter(m.name),
      title: self ? (store.data.profile.username || m.name) : m.name,
      meta: self ? 'Dieses Gerät' : `Zuletzt synchronisiert ${timeAgo(m.lastSync)}`,
      amount: '',
    });
    if (self) li.classList.add('member-self');
    memberListEl.appendChild(li);
  });
}

// Knopf während einer Aktion sperren und Text ändern
function setBusy(btn, busy, text = '') {
  if (busy) {
    if (!btn.dataset.label) btn.dataset.label = btn.textContent;
    btn.textContent = text;
    btn.disabled = true;
  } else {
    if (btn.dataset.label) btn.textContent = btn.dataset.label;
    btn.disabled = false;
  }
}

// ----- iCloud-Sync: Fenster mit 2 Schritten -----
const syncSheet = $('#syncSheet');
const syncFileIn = $('#syncFileIn');
const step1Result = $('#step1Result');

function setStep2Enabled(enabled) {
  $('#step2').classList.toggle('disabled', !enabled);
  $('#syncSaveBtn').disabled = !enabled;
}

function openSyncSheet() {
  step1Result.hidden = true;
  step1Result.className = 'step-result';
  $('#step1').classList.remove('done');
  setStep2Enabled(false);
  const method = sync.saveMethod();
  $('#step2Hint').textContent = method === 'share'
    ? 'Tippe auf „In Dateien sichern“, wähle denselben iCloud-Ordner und dann „Ersetzen“.'
    : method === 'picker'
      ? 'Wähle denselben Ordner und überschreibe die alte Datei.'
      : 'Die Datei wird heruntergeladen – verschiebe sie danach in den gemeinsamen Ordner.';
  openSheet(syncSheet, null);
}

function showStep1Result(text, ok) {
  step1Result.textContent = text;
  step1Result.className = 'step-result ' + (ok ? 'ok' : 'bad');
  step1Result.hidden = false;
  $('#step1').classList.toggle('done', ok);
  setStep2Enabled(ok);
}

$('#syncPickBtn').addEventListener('click', () => {
  syncFileIn.value = '';
  syncFileIn.click();
});

syncFileIn.addEventListener('change', async () => {
  const files = Array.from(syncFileIn.files || []);
  if (!files.length) return;
  const result = await sync.importFiles(files);
  if (!result.filesOk) {
    showStep1Result(result.errors[0] || 'Datei konnte nicht gelesen werden', false);
    return;
  }
  const n = result.added + result.updated;
  let text = n === 0
    ? '✓ Datei gelesen – nichts Neues von den anderen.'
    : `✓ ${n} ${n === 1 ? 'Eintrag' : 'Einträge'} von den anderen übernommen.`;
  if (result.errors.length) text += ` (${result.errors.length} Datei(en) übersprungen)`;
  showStep1Result(text, true);
});

$('#syncFirstBtn').addEventListener('click', () => {
  showStep1Result('Okay – im nächsten Schritt wird die Sync-Datei neu angelegt.', true);
});

$('#syncSaveBtn').addEventListener('click', async (ev) => {
  const btn = ev.currentTarget;
  setBusy(btn, true, 'Bitte warten …');
  try {
    const result = await sync.exportFile();
    if (result === 'saved') {
      closeSheet();
      showToast('Synchronisiert ✓');
    }
  } catch (err) {
    showToast('Speichern ging nicht: ' + (err.message || err));
  } finally {
    setBusy(btn, false);
    if (openSheetEl === syncSheet) setStep2Enabled(true);
  }
});

// Wenn fremde Einträge übernommen wurden: Anzeige neu aufbauen
sync.onRemoteChange = () => {
  renderHome();
  if (currentScreen === 'detail') {
    if (store.isLive(currentSectionId)) renderDetail(false);
    else goHome(); // Kategorie wurde auf einem anderen Gerät gelöscht
  }
};
sync.onUpdate = renderSync;
store.onChange = renderSync; // Zähler "noch nicht in iCloud" aktuell halten

// =========================================================
//  KNÖPFE & TASTEN
// =========================================================
// Runder +-Knopf: nur noch in einer Kategorie (neue Ausgabe)
fab.addEventListener('click', () => {
  if (currentScreen === 'detail') openExpenseSheet();
});
// Langer Knopf unter der Liste auf der Übersicht: neue Kategorie
$('#addSectionBtn').addEventListener('click', () => openSheet(sectionSheet, sectionNameIn));
$('#settingsBtn').addEventListener('click', openSettings);
backdrop.addEventListener('click', closeSheet);
document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', closeSheet));
document.querySelectorAll('[data-back]').forEach((b) => b.addEventListener('click', goHome));
$('#undoBtn').addEventListener('click', runUndo);

$('#syncOpenBtn').addEventListener('click', openSyncSheet);
$('#homeSyncBtn').addEventListener('click', openSyncSheet);

document.addEventListener('keydown', (ev) => {
  if (ev.key !== 'Escape') return;
  if (openSheetEl) closeSheet();
  else if (currentScreen !== 'home') goHome();
});

// "vor 2 Min." aktuell halten
setInterval(() => { if (currentScreen === 'settings') renderSync(); }, 30000);

// =========================================================
//  START
// =========================================================
store.load();
if (DEVICE_NS) {
  document.title = `Haushaltsplan – Testgerät ${DEVICE_NS}`;
  $('#homeScreen .label').textContent = `Ausgaben gesamt · Testgerät ${DEVICE_NS}`;
}
buildIconChips();
renderHome();
updateProfileView();
renderSync();

// Offline-Fähigkeit (nur über https oder localhost möglich)
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => { /* egal */ });
}
