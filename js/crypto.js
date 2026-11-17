'use strict';

/* =========================================================
   crypto.js – Verschlüsselung mit dem Haushalts-Passwort

   Aus Passwort + Haushalts-Code werden mit PBKDF2 (310.000 Runden)
   zwei Dinge berechnet:
     1. ein AES-256-Schlüssel   → verschlüsselt alle Daten (AES-GCM)
     2. ein Beitritts-Token     → beweist dem Server, dass man das Passwort kennt
   Der Server bekommt nie das Passwort und nie den AES-Schlüssel.
   ========================================================= */

const KDF_ITERATIONS = 310000;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function bytesToB64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function b64ToBytes(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

function bytesToHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

const vault = {
  key: null, // geladener AES-Schlüssel (CryptoKey)

  get available() {
    return !!(window.crypto && crypto.subtle);
  },

  async derive(password, code) {
    const base = await crypto.subtle.importKey(
      'raw', textEncoder.encode(password.normalize('NFC')), 'PBKDF2', false, ['deriveBits'],
    );
    const bits = new Uint8Array(await crypto.subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt: textEncoder.encode('haushaltsplan:v1:' + code), iterations: KDF_ITERATIONS },
      base,
      512,
    ));
    return {
      keyB64: bytesToB64(bits.slice(0, 32)),
      joinToken: bytesToHex(bits.slice(32)),
    };
  },

  async sha256Hex(text) {
    const hash = await crypto.subtle.digest('SHA-256', textEncoder.encode(text));
    return bytesToHex(new Uint8Array(hash));
  },

  async load(keyB64) {
    this.key = await crypto.subtle.importKey('raw', b64ToBytes(keyB64), 'AES-GCM', false, ['encrypt', 'decrypt']);
  },

  unload() {
    this.key = null;
  },

  // aad ("zusätzliche Daten") bindet den Inhalt an seine ID:
  // so kann niemand verschlüsselte Einträge unbemerkt vertauschen.
  async encrypt(obj, aad) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const cipher = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: textEncoder.encode(aad) },
      this.key,
      textEncoder.encode(JSON.stringify(obj)),
    );
    return 'v1.' + bytesToB64(iv) + '.' + bytesToB64(new Uint8Array(cipher));
  },

  async decrypt(payload, aad) {
    const [version, ivB64, cipherB64] = String(payload).split('.');
    if (version !== 'v1') throw new Error('Unbekanntes Format');
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: b64ToBytes(ivB64), additionalData: textEncoder.encode(aad) },
      this.key,
      b64ToBytes(cipherB64),
    );
    return JSON.parse(textDecoder.decode(plain));
  },
};
