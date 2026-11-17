'use strict';

/* =========================================================
   cloud.js – Verbindung zu Supabase
   Nur mit fetch(), ohne zusätzliche Bibliotheken.

   - Anmeldung: anonym (jedes Gerät bekommt automatisch einen
     unsichtbaren Supabase-Nutzer, kein E-Mail/Passwort nötig)
   - Haushalt erstellen / beitreten / verlassen
   - Einträge holen und hochladen (immer verschlüsselt)
   ========================================================= */

const CLOUD_KEY = 'haushaltsplan.cloud.v1' + (DEVICE_NS ? '.' + DEVICE_NS : '');
const HOUSEHOLD_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // ohne 0/O und 1/I
const PAGE_SIZE = 500;
const PUSH_BATCH = 200;

class CloudError extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function makeHouseholdCode() {
  const pick = () => HOUSEHOLD_CODE_CHARS[crypto.getRandomValues(new Uint32Array(1))[0] % HOUSEHOLD_CODE_CHARS.length];
  let c = '';
  for (let i = 0; i < 8; i++) c += pick();
  return c.slice(0, 4) + '-' + c.slice(4);
}

function normalizeHouseholdCode(text) {
  const c = String(text).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  return c.length > 4 ? c.slice(0, 4) + '-' + c.slice(4) : c;
}

// Fehlermeldungen von Supabase verständlich machen
function friendlyError(status, data) {
  const msg = (data && (data.message || data.msg || data.error_description || data.error)) || '';
  const code = data && (data.code || data.error_code);
  if (code === 'anonymous_provider_disabled' || /anonymous sign-ins are disabled/i.test(msg)) {
    return 'In Supabase ist "Allow anonymous sign-ins" noch ausgeschaltet (siehe Anleitung).';
  }
  if (status === 404 && /function|rpc/i.test(msg)) {
    return 'Die Datenbank ist noch nicht eingerichtet (setup.sql ausführen, siehe Anleitung).';
  }
  if (status === 429) return 'Zu viele Anfragen – bitte kurz warten.';
  if (status >= 500 || status === 0) return 'Server nicht erreichbar – ist das Supabase-Projekt pausiert?';
  return msg || `Fehler ${status}`;
}

const cloud = {
  cfg: window.HAUSHALT_CONFIG || {},
  state: {},           // { session, household: { id, code, keyB64, joinToken } }
  sessionPromise: null,
  needsRejoin: false,

  get configured() {
    return !!(this.cfg.supabaseUrl && this.cfg.supabaseKey);
  },

  get household() {
    return this.state.household || null;
  },

  load() {
    try { this.state = JSON.parse(localStorage.getItem(CLOUD_KEY)) || {}; } catch { this.state = {}; }
  },

  save() {
    try { localStorage.setItem(CLOUD_KEY, JSON.stringify(this.state)); } catch { /* egal */ }
  },

  // ----- HTTP -----
  async http(path, { method = 'GET', body, headers = {}, auth = true } = {}) {
    const h = { apikey: this.cfg.supabaseKey, 'Content-Type': 'application/json', ...headers };
    if (auth) {
      await this.ensureSession();
      h.Authorization = 'Bearer ' + this.state.session.access_token;
    }
    let res;
    try {
      res = await fetch(this.cfg.supabaseUrl.replace(/\/+$/, '') + path, {
        method,
        headers: h,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new CloudError('Keine Internetverbindung', 0, 'offline');
    }
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { message: text }; }
    if (!res.ok) {
      const code = data && (data.code || data.error_code);
      if (auth && res.status === 401) this.state.session = null; // Anmeldung ungültig → neu anmelden
      throw new CloudError(friendlyError(res.status, data), res.status, code);
    }
    return data;
  },

  rpc(name, args) {
    return this.http('/rest/v1/rpc/' + name, { method: 'POST', body: args });
  },

  // ----- Anmeldung (anonym) -----
  ensureSession() {
    if (!this.sessionPromise) {
      this.sessionPromise = this.refreshOrSignIn().finally(() => { this.sessionPromise = null; });
    }
    return this.sessionPromise;
  },

  async refreshOrSignIn() {
    const s = this.state.session;
    if (s && s.expires_at * 1000 > Date.now() + 60000) return;
    if (s && s.refresh_token) {
      try {
        this.setSession(await this.http('/auth/v1/token?grant_type=refresh_token', {
          method: 'POST', body: { refresh_token: s.refresh_token }, auth: false,
        }));
        return;
      } catch (err) {
        if (err.code === 'offline') throw err;
        // Token ungültig → unten neu anmelden
      }
    }
    this.setSession(await this.http('/auth/v1/signup', { method: 'POST', body: { data: {} }, auth: false }));
    if (this.household) this.needsRejoin = true; // neuer Nutzer → Mitgliedschaft erneuern
  },

  setSession(d) {
    if (!d || !d.access_token) throw new CloudError('Anmeldung fehlgeschlagen', 0, 'auth');
    this.state.session = {
      access_token: d.access_token,
      refresh_token: d.refresh_token,
      expires_at: d.expires_at || Math.floor(Date.now() / 1000) + (d.expires_in || 3600),
    };
    this.save();
  },

  // ----- Haushalt -----
  memberAad(code, deviceId) {
    return `${code}:member:${deviceId}`;
  },

  recordAad(id) {
    return `${this.household.code}:${id}`;
  },

  async memberPayload(code) {
    return vault.encrypt({ name: store.data.profile.username || 'Ohne Namen' }, this.memberAad(code, store.data.deviceId));
  },

  async createHousehold(password) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const code = makeHouseholdCode();
      const { keyB64, joinToken } = await vault.derive(password, code);
      await vault.load(keyB64);
      try {
        const id = await this.rpc('create_household', {
          p_code: code,
          p_join_hash: await vault.sha256Hex(joinToken),
          p_device_id: store.data.deviceId,
          p_payload: await this.memberPayload(code),
        });
        this.state.household = { id, code, keyB64, joinToken };
        this.save();
        store.resetSyncState();
        return code;
      } catch (err) {
        vault.unload();
        if (err.code === '23505') continue; // Code gab es schon → neuer Code
        throw err;
      }
    }
    throw new CloudError('Bitte noch einmal versuchen', 0, 'retry');
  },

  // Rückgabe: 'ok' | 'wrong' | 'locked'
  async joinHousehold(codeInput, password) {
    const code = normalizeHouseholdCode(codeInput);
    const { keyB64, joinToken } = await vault.derive(password, code);
    await vault.load(keyB64);
    let result;
    try {
      result = await this.rpc('join_household', {
        p_code: code,
        p_join_token: joinToken,
        p_device_id: store.data.deviceId,
        p_payload: await this.memberPayload(code),
      });
    } catch (err) {
      vault.unload();
      throw err;
    }
    if (!result || result.status !== 'ok') {
      vault.unload();
      return result ? result.status : 'wrong';
    }
    this.state.household = { id: result.household_id, code, keyB64, joinToken };
    this.save();
    store.resetSyncState();
    return 'ok';
  },

  // nach Verlust der Anmeldung (z. B. Safari hat Daten gelöscht) automatisch wieder beitreten
  async rejoin() {
    const hh = this.household;
    const result = await this.rpc('join_household', {
      p_code: hh.code,
      p_join_token: hh.joinToken,
      p_device_id: store.data.deviceId,
      p_payload: await this.memberPayload(hh.code),
    });
    this.needsRejoin = false;
    if (!result || result.status !== 'ok') {
      throw new CloudError('Wieder-Beitritt fehlgeschlagen – Haushalt verlassen und neu beitreten', 0, 'rejoin');
    }
  },

  async leaveHousehold() {
    const hh = this.household;
    if (!hh) return;
    try {
      await this.http(
        `/rest/v1/members?household_id=eq.${hh.id}&device_id=eq.${encodeURIComponent(store.data.deviceId)}`,
        { method: 'DELETE' },
      );
    } catch (err) {
      if (err.code !== 'offline') throw err; // offline: trotzdem lokal verlassen
    }
    this.state.household = null;
    this.save();
    vault.unload();
    store.resetSyncState();
  },

  // ----- Daten -----
  async pull(sinceMs) {
    const rows = [];
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const batch = await this.http(
        `/rest/v1/records?select=id,updated_at,payload,server_ms&household_id=eq.${this.household.id}`
        + `&server_ms=gt.${sinceMs}&order=server_ms.asc,id.asc&limit=${PAGE_SIZE}&offset=${offset}`,
      );
      rows.push(...batch);
      if (batch.length < PAGE_SIZE) return rows;
    }
  },

  async push(rows) {
    for (let i = 0; i < rows.length; i += PUSH_BATCH) {
      await this.http('/rest/v1/records', {
        method: 'POST',
        body: rows.slice(i, i + PUSH_BATCH),
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      });
    }
  },

  async heartbeat() {
    const hh = this.household;
    return this.rpc('heartbeat', {
      p_household: hh.id,
      p_device_id: store.data.deviceId,
      p_payload: await this.memberPayload(hh.code),
    });
  },

  members() {
    return this.http(`/rest/v1/members?select=device_id,payload,last_seen&household_id=eq.${this.household.id}`);
  },
};
