# Technische Dokumentation

Softwaredokumentation der Haushaltsplan-App: Aufbau, Datenmodell, Synchronisation,
Verschlüsselung, Sicherheitsmodell, Entwicklung und Tests.

## Inhalt

1. [Überblick](#überblick)
2. [Architektur](#architektur)
3. [Module](#module)
4. [Datenmodell](#datenmodell)
5. [Synchronisation](#synchronisation)
6. [Verschlüsselung](#verschlüsselung)
7. [Server (Supabase)](#server-supabase)
8. [Sicherheit](#sicherheit)
9. [Offline & Installation (PWA)](#offline--installation-pwa)
10. [Entwicklung](#entwicklung)
11. [Tests](#tests)
12. [Bekannte Grenzen & Ideen](#bekannte-grenzen--ideen)

---

## Überblick

| Eigenschaft | Umsetzung |
|---|---|
| Plattform | Web-App (HTML/CSS/JavaScript), installierbar als PWA auf dem iPhone-Home-Bildschirm |
| Hosting | GitHub Pages (statisch, kostenlos) |
| Abhängigkeiten | keine – kein Framework, keine Bibliotheken, kein Build-Schritt |
| Datenhaltung | **Local-first**: jedes Gerät speichert alle Daten in `localStorage` |
| Abgleich | Supabase (Postgres + REST), alle 3 Minuten und nach Änderungen |
| Konflikte | „Neueste Änderung gewinnt“ pro Eintrag (Last-Writer-Wins) |
| Verschlüsselung | Ende-zu-Ende, AES-256-GCM, Schlüssel aus Haushalts-Passwort (PBKDF2) |
| Anmeldung | anonym (Supabase Anonymous Sign-ins), Haushaltszugang über Code + Passwort |

## Architektur

```
┌──────────────────────────── Handy (Browser) ────────────────────────────┐
│                                                                         │
│   index.html + style.css                                                │
│        │                                                                │
│   app.js  ── Oberfläche: Bildschirme, Listen, Fenster, Animationen      │
│        │                                                                │
│   store.js ── lokale Daten (localStorage), Zusammenführen (merge)       │
│        │                                                                │
│   sync.js  ── Abgleich: holen → zusammenführen → hochladen              │
│        │              │                                                 │
│   crypto.js           cloud.js ── HTTP zu Supabase (fetch)              │
│   (AES-GCM, PBKDF2)        │                                            │
└────────────────────────────┼────────────────────────────────────────────┘
                             │ HTTPS, nur verschlüsselte Inhalte
                ┌────────────▼─────────────┐
                │ Supabase                 │
                │  Auth (anonym)           │
                │  PostgREST + RPC         │
                │  Postgres mit RLS        │
                └──────────────────────────┘
```

Die Skripte werden als klassische `<script>`-Dateien in fester Reihenfolge geladen
(`config.js`, `store.js`, `crypto.js`, `cloud.js`, `sync.js`, `app.js`) und teilen sich
globale Objekte (`store`, `vault`, `cloud`, `sync`). Auf ES-Module wurde bewusst verzichtet,
damit die App auch direkt per Doppelklick ohne Server startet (dann ohne Sync).

## Module

### `js/store.js` – lokaler Datenspeicher
- Hält alle Daten in `store.data` und speichert sie als JSON in `localStorage`
  (Schlüssel `haushaltsplan.daten.v3`).
- Jede Kategorie und jede Ausgabe ist ein **Record** (siehe [Datenmodell](#datenmodell)).
- `put()` setzt automatisch `updatedAt` (streng steigend) und `device`.
- Löschen setzt nur `deleted: true` („Tombstone“), damit Löschungen synchronisiert werden.
- `merge(remote)` übernimmt einen fremden Record, wenn er neuer ist.
- Übernimmt beim ersten Start Daten älterer Testversionen (`importOld`).
- `?geraet=2` in der Adresse trennt die Daten (zum Testen mehrerer „Geräte“ in einem Browser).

### `js/crypto.js` – Verschlüsselung (`vault`)
- `derive(passwort, code)` → AES-Schlüssel + Beitritts-Token
- `encrypt(obj, aad)` / `decrypt(payload, aad)` mit AES-256-GCM
- Details: [Verschlüsselung](#verschlüsselung)

### `js/cloud.js` – Supabase-Anbindung (`cloud`)
- Reine `fetch()`-Aufrufe gegen die Supabase-REST-Schnittstellen, keine Bibliothek.
- Anonyme Anmeldung, Token-Erneuerung, automatisches Neu-Beitreten bei verlorener Anmeldung.
- `createHousehold`, `joinHousehold`, `leaveHousehold`, `pull`, `push`, `heartbeat`, `members`.
- Übersetzt technische Fehlermeldungen in verständliche Texte (`friendlyError`).
- Speichert Sitzung und Haushaltsdaten unter `haushaltsplan.cloud.v1`.

### `js/sync.js` – Abgleich (`sync`)
- Steuert, **wann** synchronisiert wird, und führt den Abgleich aus.
- Status: `off` · `syncing` · `ok` · `offline` · `error` (wird in der Oberfläche angezeigt).

### `js/app.js` – Oberfläche
- Drei Bildschirme (Start, Kategorie, Einstellungen) mit Wisch-Animation.
- Fenster von unten („Sheets“) für alle Eingaben.
- Listeneinträge mit Wischen-zum-Löschen, Ein-/Ausblend-Animationen, zählende Summen.
- Eingaben werden geprüft; Fehler erscheinen rot direkt am Feld.
- Alle Texte aus Nutzereingaben werden mit `textContent` gesetzt (kein HTML-Einschleusen möglich).

### `sw.js` – Service Worker
- „Netz zuerst, sonst Zwischenspeicher“ für alle App-Dateien (3 s Zeitlimit).
- Supabase-Anfragen werden nie zwischengespeichert.

## Datenmodell

### Lokal (`store.data`)

```js
{
  deviceId: "mwkyuu81z1eg3a",            // zufällig, einmal pro Gerät
  profile:  { username, email },
  records:  { [id]: Record },
  sync:     { remoteVer: { [id]: updatedAt }, pullMs, lastSync }
}
```

### Record

| Feld | Kategorie (`type: "section"`) | Ausgabe (`type: "expense"`) |
|---|---|---|
| `id` | `essen`, `freizeit`, `oeffis` (feste IDs) oder zufällig | zufällig |
| Inhalt | `name`, `icon`, `createdAt` | `sectionId`, `title`, `cents`, `date` (ISO), `timeKnown` |
| `updatedAt` | ms-Zeitstempel der letzten Änderung | ← |
| `deleted` | `true` = gelöscht (Tombstone) | ← |
| `device` | Geräte-ID der letzten Änderung | ← |

- Beträge in **Cent als Ganzzahl** (keine Rundungsfehler).
- `timeKnown: false` = nachgetragenes Datum ohne Uhrzeit (intern 12:00 Uhr).
- Die drei Standard-Kategorien haben feste IDs und `updatedAt: 0`, damit neue Geräte
  keine doppelten Kategorien erzeugen und jede echte Änderung gewinnt.

## Synchronisation

**Wann:** alle 3 Minuten · 2 s nach einer Änderung (gebündelt) · beim Öffnen/Fokus der App ·
wenn das Internet zurückkommt · per Knopf.

**Ablauf eines Abgleichs (`sync.syncOnce`):**

1. **Holen:** alle Server-Zeilen mit `server_ms > pullMs − 10 s` (Überlappung gegen
   Lücken), seitenweise à 500. Jede Zeile wird entschlüsselt, geprüft (`store.isValid`)
   und mit `store.merge` übernommen, wenn sie neuer ist. `remoteVer[id]` merkt sich,
   welcher Stand auf dem Server liegt.
2. **Hochladen:** alle lokalen Records mit `updatedAt > remoteVer[id]` werden verschlüsselt
   und per Upsert in Blöcken à 200 hochgeladen.
3. **Geräte:** `heartbeat` aktualisiert den eigenen (verschlüsselten) Namen und
   `last_seen`, danach wird die Geräteliste geholt und entschlüsselt.

**Konfliktlösung:** Last-Writer-Wins pro Record anhand `updatedAt`, bei Gleichstand
entscheidet die Geräte-ID. Der Server erzwingt dasselbe: Ein Trigger verhindert, dass eine
ältere Version eine neuere überschreibt. Da jede Ausgabe ein eigener Record ist,
treten echte Konflikte praktisch nur auf, wenn zwei Personen *denselben* Eintrag ändern.

**Warum `server_ms` statt Geräte-Uhrzeit zum Holen?** Handy-Uhren können falsch gehen.
`server_ms` setzt der Server selbst (Trigger), daher ist „alles seit dem letzten Holen“
zuverlässig.

## Verschlüsselung

```
Passwort + Haushalts-Code
        │  PBKDF2-SHA256, 310.000 Runden, Salt = "haushaltsplan:v1:<CODE>"
        ▼
   512 Bit ──┬── Bit 0–255   → AES-256-GCM-Schlüssel   (bleibt auf dem Gerät)
             └── Bit 256–511 → Beitritts-Token (hex)   (beweist Kenntnis des Passworts)
```

- **Inhalte:** Jeder Record wird komplett (inkl. Betrag, Text, Datum, Kategorie) als JSON
  mit AES-256-GCM verschlüsselt. Format: `v1.<IV base64>.<Chiffretext base64>`,
  zufälliger 96-Bit-IV pro Verschlüsselung.
- **AAD** (zusätzlich authentifizierte Daten): `<CODE>:<record-id>` bzw.
  `<CODE>:member:<geräte-id>`. Damit kann niemand verschlüsselte Einträge unbemerkt
  vertauschen oder in einen anderen Haushalt kopieren.
- **Beitritt:** Der Server speichert nur `SHA-256(Beitritts-Token)`. Beim Beitreten sendet das
  Gerät das Token, der Server vergleicht den Hash. Aus dem Token lässt sich der AES-Schlüssel
  nicht berechnen (getrennte Bits derselben Ableitung).
- **Klartext auf dem Server:** nur IDs, Zeitstempel, Haushalts-Code und Größe der Einträge.
- **Auf dem Gerät** liegen AES-Schlüssel und Token in `localStorage`, damit man das Passwort
  nicht bei jedem Start eingeben muss. Die Daten selbst liegen dort ohnehin im Klartext.
- Verwendet ausschließlich die eingebaute **Web Crypto API** (benötigt https oder localhost).

## Server (Supabase)

Einrichtung: [`supabase/setup.sql`](../supabase/setup.sql) (idempotent, beliebig oft ausführbar).

### Tabellen

| Tabelle | Zweck | Wichtige Spalten |
|---|---|---|
| `households` | ein Haushalt | `id`, `code` (unique), `join_hash`, `failed_joins`, `locked_until` |
| `members` | Geräte im Haushalt | `household_id`, `device_id`, `user_id` (anonymer Nutzer), `payload` (verschl. Name), `last_seen` |
| `records` | alle Einträge | `household_id`, `id`, `updated_at`, `payload` (verschlüsselt), `server_ms` |

### Funktionen (RPC, `security definer`)

| Funktion | Zweck |
|---|---|
| `create_household(code, join_hash, device_id, payload)` | Haushalt anlegen, Ersteller wird Mitglied |
| `join_household(code, join_token, device_id, payload)` | Token prüfen → Mitglied werden. Antwort `ok` / `wrong` / `locked` |
| `heartbeat(household, device_id, payload)` | eigenen Namen + `last_seen` aktualisieren |
| `is_member(household)` | Hilfsfunktion für die Zugriffsregeln |

### Trigger
`records_before_write`: setzt `server_ms` und verwirft Updates mit älterem `updated_at`.

### REST-Aufrufe der App

| Zweck | Aufruf |
|---|---|
| Anmelden (anonym) | `POST /auth/v1/signup` mit `{ "data": {} }` |
| Token erneuern | `POST /auth/v1/token?grant_type=refresh_token` |
| Holen | `GET /rest/v1/records?household_id=eq.…&server_ms=gt.…&order=server_ms.asc,id.asc&limit=500&offset=…` |
| Hochladen | `POST /rest/v1/records` mit `Prefer: resolution=merge-duplicates` |
| Geräte | `GET /rest/v1/members?household_id=eq.…` |
| Verlassen | `DELETE /rest/v1/members?household_id=eq.…&device_id=eq.…` |
| Funktionen | `POST /rest/v1/rpc/<name>` |

Header: `apikey: <publishable key>` und `Authorization: Bearer <Nutzer-JWT>`.
Der Publishable Key wird **nie** als Bearer-Token gesendet.

## Sicherheit

Mehrere unabhängige Schutzschichten:

1. **Ende-zu-Ende-Verschlüsselung** – selbst bei vollständigem Datenbank-Zugriff (z. B.
   durch eine Fehlkonfiguration oder den Anbieter) sind Beträge, Texte und Namen nicht lesbar.
2. **Row Level Security** auf allen Tabellen – ein angemeldetes Gerät sieht nur Zeilen
   der Haushalte, in denen es Mitglied ist. Neue Mitglieder nur über `join_household`.
3. **Minimale Rechte** – die Rolle `anon` hat auf nichts Zugriff; `authenticated` darf
   `records` nur lesen/einfügen/ändern (kein Löschen), `members` nur lesen und den
   *eigenen* Eintrag löschen, `households` nur lesen.
4. **Schutz vor Passwort-Raten** – nach 10 Fehlversuchen 15 Minuten Sperre pro Haushalt,
   zusätzlich 0,5 s Verzögerung pro Fehlversuch. Unbekannte Codes antworten genauso wie
   falsche Passwörter (kein Ausprobieren von Codes).
5. **Eingabeprüfung** in der Datenbank (Format der IDs, Längenbegrenzungen) und in der App
   (`store.isValid` für alles, was vom Server kommt).
6. **Kein HTML aus Nutzereingaben** – Texte werden ausschließlich per `textContent` gesetzt.

**Bewusste Grenzen:**
- Wer **Code und Passwort** kennt, gehört zum Haushalt. Ein Passwort-Wechsel ist (noch) nicht
  vorgesehen; im Zweifel neuen Haushalt erstellen.
- Wer Zugriff auf ein **entsperrtes Handy** hat, sieht die Daten (wie bei jeder App).
- Metadaten (Anzahl Einträge, Änderungszeitpunkte) sind für den Server sichtbar.
- Supabase empfiehlt für anonyme Anmeldungen zusätzlich ein CAPTCHA gegen Missbrauch.
  Für eine Familien-App ist die eingebaute Begrenzung (30 Anmeldungen/Stunde/IP) ausreichend.

## Offline & Installation (PWA)

- `manifest.webmanifest`: Name, Symbole, `display: standalone` (Vollbild ohne Adressleiste).
- iOS-Meta-Tags (`apple-mobile-web-app-capable`, `apple-touch-icon`).
- `sw.js` speichert alle App-Dateien; die App startet auch im Flugmodus.
- Abstände berücksichtigen Notch und Home-Leiste (`env(safe-area-inset-*)`).
- **Neue Version veröffentlichen:** Dateien ändern und hochladen. Durch „Netz zuerst“ sehen
  alle Geräte beim nächsten Start mit Internet automatisch die neue Version. Bei Änderungen an
  der Dateiliste in `sw.js` den `CACHE_NAME` hochzählen.

## Entwicklung

```bash
git clone https://github.com/Treneus/haushaltsplan.git
cd haushaltsplan
./start.sh        # startet python3 -m http.server auf Port 8080 + Chromium im Handy-Format
./start.sh 2      # zweites Testgerät mit getrennten Daten
```

- Kein Build: Datei ändern → Browser neu laden.
- Für Sync-Tests lokal einfach dieselbe `config.js` verwenden wie online.
- **Neue Kategorie-Symbole:** `ICONS` oben in `js/app.js`.
- **Standard-Kategorien:** `DEFAULT_SECTIONS` in `js/store.js` (feste IDs beibehalten!).
- **Sync-Intervall:** `SYNC_EVERY_MS` in `js/sync.js`.
- **Neues Feld in Ausgaben:** in `store.isValid` erlauben, beim Anlegen in `app.js` setzen,
  in `createExpenseRow` anzeigen. Am Server ist nichts zu ändern (Inhalt ist verschlüsselt).
- **Datenbank ändern:** `supabase/setup.sql` anpassen (idempotent halten:
  `if not exists`, `create or replace`, `drop … if exists`).

### Code-Stil
- Kommentare und Oberfläche auf Deutsch, Bezeichner auf Englisch.
- Keine Abhängigkeiten von außen (Sicherheit, Offline-Fähigkeit, Einfachheit).

## Tests

Bei der Entwicklung wurde getestet (Chromium per Playwright, Postgres 16):

| Bereich | Geprüft |
|---|---|
| Datenbank | `setup.sql` mehrfach ausführbar; Fremde sehen/schreiben nichts; falsches Passwort → `wrong`; 10 Fehlversuche → `locked`; ältere Version überschreibt neuere nicht; kein Löschen von Records; nur eigener Mitglieds-Eintrag löschbar; `anon` ohne Zugriff |
| Ende-zu-Ende | Zwei Geräte gegen einen Supabase-Nachbau mit echter Postgres-Datenbank und RLS: Haushalt erstellen, falsches/richtiges Passwort, Ausgaben/Löschungen/Kategorien in beide Richtungen, Gerätenamen, **kein Klartext in der Datenbank**, verlorene Anmeldung → automatisches Neu-Beitreten, Verlassen (lokale Daten bleiben), Neuladen |
| Oberfläche | Hinzufügen, Löschen, Rückgängig, Kategorie löschen nur mit „Löschen“, Datumsauswahl (heute/gestern/frei, keine Zukunft), Fehlermeldungen, Zustand ohne `config.js` |

Nicht automatisch getestet (nur mit echtem Konto/Gerät möglich): echter Supabase-Server,
Safari auf dem iPhone, „Zum Home-Bildschirm“.

## Bekannte Grenzen & Ideen

- Tombstones (gelöschte Einträge) werden nie aufgeräumt – bei Familiengröße unkritisch.
- Kein Passwort-Wechsel für den Haushalt.
- Ausgaben können (noch) nicht bearbeitet werden – nur löschen und neu anlegen.
- Supabase-Free-Plan pausiert nach ~7 Tagen ohne Nutzung.
- Ideen: Monatsübersicht/Diagramme, Ausgaben bearbeiten, Export als CSV, Budget pro Kategorie,
  Dark Mode.
