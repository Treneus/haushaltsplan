# Technische Dokumentation

Softwaredokumentation der Haushaltsplan-App: Aufbau, Datenmodell, Synchronisation über
iCloud Drive, Dateiformat, Sicherheit, Entwicklung und Tests.

## Inhalt

1. [Überblick](#überblick)
2. [Architektur](#architektur)
3. [Module](#module)
4. [Datenmodell](#datenmodell)
5. [Synchronisation über iCloud Drive](#synchronisation-über-icloud-drive)
6. [Dateiformat der Sync-Datei](#dateiformat-der-sync-datei)
7. [Sicherheit & Datenschutz](#sicherheit--datenschutz)
8. [Offline & Installation (PWA)](#offline--installation-pwa)
9. [Entwicklung](#entwicklung)
10. [Tests](#tests)
11. [Bekannte Grenzen & Ideen](#bekannte-grenzen--ideen)
12. [Versionsgeschichte](#versionsgeschichte)

---

## Überblick

| Eigenschaft | Umsetzung |
|---|---|
| Plattform | Web-App (HTML/CSS/JavaScript), installierbar als PWA auf dem iPhone-Home-Bildschirm |
| Hosting | GitHub Pages (statisch, kostenlos) |
| Abhängigkeiten | keine – kein Framework, keine Bibliotheken, kein Build-Schritt |
| Datenhaltung | **Local-first**: jedes Gerät speichert alle Daten in `localStorage` |
| Abgleich | eine gemeinsame JSON-Datei in einem geteilten iCloud-Drive-Ordner, manuell in 2 Schritten |
| Konflikte | „Neueste Änderung gewinnt“ pro Eintrag (Last-Writer-Wins) |
| Server | keiner – nur GitHub Pages für die App-Dateien |

## Architektur

```
┌──────────────────── iPhone (Safari / Home-Bildschirm-App) ────────────────────┐
│                                                                                │
│  index.html + style.css                                                        │
│       │                                                                        │
│  app.js ── Oberfläche: Bildschirme, Listen, Fenster, Animationen               │
│       │                                                                        │
│  store.js ── lokale Daten (localStorage), Zusammenführen (merge)               │
│       │                                                                        │
│  sync.js ── Sync-Datei lesen (Dateiauswahl) / schreiben (Teilen-Menü)          │
│       │                                                                        │
└───────┼────────────────────────────────────────────────────────────────────────┘
        │  <input type="file">           navigator.share({ files })
        ▼                                  → „In Dateien sichern“
┌──────────────────────────── iCloud Drive ─────────────────────────────┐
│  Geteilter Ordner „Haushaltsplan“ / haushaltsplan-sync.json           │
│  (iCloud gleicht den Ordner zwischen den Apple-Accounts der Familie ab)│
└────────────────────────────────────────────────────────────────────────┘
```

Die Skripte werden als klassische `<script>`-Dateien in fester Reihenfolge geladen
(`store.js`, `sync.js`, `app.js`) und teilen sich globale Objekte (`store`, `sync`).
Auf ES-Module wurde bewusst verzichtet, damit die App auch per Doppelklick ohne Server startet.

### Warum iCloud und warum zwei Schritte?

Safari (auch als Home-Bildschirm-App) erlaubt Webseiten **keinen dauerhaften Zugriff auf Ordner**
(die File System Access API gibt es dort nicht). Eine Web-App kann aber:

- eine Datei lesen, die der Nutzer **auswählt** (`<input type="file">`), und
- eine Datei über das **Teilen-Menü** weitergeben (`navigator.share` mit Dateien),
  wo „In Dateien sichern“ sie in einen iCloud-Ordner speichert.

Daraus ergibt sich der Abgleich in zwei Schritten. iCloud selbst übernimmt das Verteilen der
Datei auf die Geräte der Familie. Ein eigener Server ist nicht nötig.

## Module

### `js/store.js` – lokaler Datenspeicher
- Hält alle Daten in `store.data` und speichert sie als JSON in `localStorage`
  (Schlüssel `haushaltsplan.daten.v3`).
- Jede Kategorie und jede Ausgabe ist ein **Record** (siehe [Datenmodell](#datenmodell)).
- `put()` setzt automatisch `updatedAt` (streng steigend) und `device`.
- Löschen setzt nur `deleted: true` („Tombstone“), damit Löschungen synchronisiert werden.
- `isValid(rec)` prüft alles, was von außen kommt; `merge(rec)` übernimmt neuere Stände.
- Übernimmt beim ersten Start Daten älterer Testversionen (`importOld`).
- `?geraet=2` in der Adresse trennt die Daten (zum Testen mehrerer „Geräte“ in einem Browser).

### `js/sync.js` – Abgleich (`sync`)
- `importFiles(files)` – liest eine oder mehrere Sync-Dateien, prüft Format und Version,
  führt alle Records und die Geräteliste zusammen. Gibt eine Zusammenfassung zurück.
- `exportFile()` – baut die Sync-Datei aus allen lokalen Records und speichert sie über
  `saveMethod()`:
  - `share` (iPhone/iPad): `navigator.share({ files })` → „In Dateien sichern“
  - `picker` (Chrome am Computer): `showSaveFilePicker()`
  - `download` (sonst): normaler Download
- `unsyncedCount()` – Anzahl eigener Änderungen seit dem letzten Speichern (für den Statuspunkt).
- `devices()` – Geräte, die schon einmal in die Datei gespeichert haben.

### `js/app.js` – Oberfläche
- Drei Bildschirme (Start, Kategorie, Einstellungen) mit Wisch-Animation.
- Fenster von unten („Sheets“) für alle Eingaben, inkl. Sync-Fenster mit 2 Schritten.
- Listeneinträge mit Wischen-zum-Löschen, Ein-/Ausblend-Animationen, zählende Summen.
- Eingaben werden geprüft; Fehler erscheinen rot direkt am Feld.
- Alle Texte aus Nutzereingaben und Dateien werden mit `textContent` gesetzt (kein HTML-Einschleusen).

### `sw.js` – Service Worker
- „Netz zuerst, sonst Zwischenspeicher“ für alle App-Dateien (3 s Zeitlimit).

## Datenmodell

### Lokal (`store.data`)

```js
{
  deviceId: "mwkyuu81z1eg3a",              // zufällig, einmal pro Gerät
  profile:  { username, email },
  records:  { [id]: Record },
  sync: {
    lastSync:   1763800000000,             // letzter vollständiger Abgleich (ms)
    exportedAt: 1763800000000,             // wann zuletzt in die Sync-Datei gespeichert
    devices:    { [deviceId]: { name, lastSync } }
  }
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

## Synchronisation über iCloud Drive

**Ablauf (Sync-Fenster in den Einstellungen):**

1. **Datei öffnen** – Nutzer wählt `haushaltsplan-sync.json` (oder mehrere Dateien).
   Jeder gültige Record wird mit `store.merge` übernommen, wenn er neuer ist.
   Beim allerersten Mal: „Es gibt noch keine Datei“ überspringt diesen Schritt.
2. **Speichern** – Die App erzeugt eine neue Datei mit **allen** lokalen Records
   (inkl. der eben übernommenen) und gibt sie ans Teilen-Menü; der Nutzer wählt
   „In Dateien sichern“ → denselben Ordner → „Ersetzen“.

Schritt 2 ist erst nach Schritt 1 möglich. So wird nie eine Datei gespeichert, ohne vorher
die Änderungen der anderen übernommen zu haben.

**Konfliktlösung:** Last-Writer-Wins pro Record anhand `updatedAt`, bei Gleichstand
entscheidet die Geräte-ID. Da jede Ausgabe ein eigener Record ist, treten echte Konflikte
praktisch nur auf, wenn zwei Personen *denselben* Eintrag ändern.

**Gleichzeitiges Synchronisieren:** Lesen A und B dieselbe Datei und speichern beide,
fehlen in der Datei kurzzeitig die Änderungen des zuerst Speichernden. Da jedes Gerät
**alle eigenen Records behält** und bei jedem Speichern komplett in die Datei schreibt,
kommen sie beim nächsten Abgleich dieses Geräts automatisch zurück (eventual consistency).

**„Beide behalten“ statt „Ersetzen“:** Die Dateiauswahl erlaubt mehrere Dateien
(`multiple`), alle werden zusammengeführt. Doppelte Dateien schaden daher nicht.

**Statuspunkt:** `unsyncedCount()` zählt eigene Records mit `updatedAt > exportedAt`.
🟢 = 0 offene Änderungen, 🟡 = offene Änderungen, kein Punkt = noch nie synchronisiert.

## Dateiformat der Sync-Datei

`haushaltsplan-sync.json`:

```json
{
  "format": "haushaltsplan-sync",
  "version": 1,
  "savedAt": 1763800000000,
  "savedBy": "mwkyuu81z1eg3a",
  "devices": {
    "mwkyuu81z1eg3a": { "name": "Oskar", "lastSync": 1763800000000 }
  },
  "records": [
    { "id": "essen", "type": "section", "name": "Essen/Trinken", "icon": "🍔",
      "createdAt": 1, "updatedAt": 0, "deleted": false, "device": "" },
    { "id": "mwl0a1b2c3", "type": "expense", "sectionId": "essen", "title": "Pizza",
      "cents": 1250, "date": "2026-11-22T18:02:00.000Z", "timeKnown": true,
      "updatedAt": 1763834520000, "deleted": false, "device": "mwkyuu81z1eg3a" }
  ]
}
```

- Dateien mit anderem `format` werden abgelehnt („keine Haushaltsplan-Datei“).
- Dateien mit höherer `version` werden abgelehnt („neuere App-Version – bitte App neu laden“).
- Ungültige einzelne Records werden übersprungen (`store.isValid`).
- Größe: etwa 200 Byte pro Ausgabe – 10.000 Ausgaben ≈ 2 MB.

## Sicherheit & Datenschutz

- **Kein eigener Server:** Die Daten liegen nur auf den Geräten und im geteilten iCloud-Ordner.
  GitHub Pages liefert nur die App-Dateien aus und sieht keine Ausgaben.
- **Zugriff** auf die Sync-Datei haben nur Personen, mit denen der Ordner geteilt ist
  (sowie Apple als iCloud-Anbieter). Die Datei selbst ist nicht zusätzlich verschlüsselt.
- **Eingaben aus Dateien werden geprüft** (`format`, `version`, `store.isValid`, Gerätenamen
  auf 40 Zeichen gekürzt) und nur per `textContent` angezeigt – eine manipulierte Datei kann
  keinen Code ausführen.
- **Wer Zugriff auf ein entsperrtes Handy hat**, sieht die Daten (wie bei jeder App).

## Offline & Installation (PWA)

- `manifest.webmanifest`: Name, Symbole, `display: standalone` (Vollbild ohne Adressleiste).
- iOS-Meta-Tags (`apple-mobile-web-app-capable`, `apple-touch-icon`).
- `sw.js` speichert alle App-Dateien; die App startet auch im Flugmodus.
- Abstände berücksichtigen Notch und Home-Leiste (`env(safe-area-inset-*)`).
- **Wichtig auf dem iPhone:** Home-Bildschirm-App und Safari haben **getrennte Speicher**.
  Safari kann Daten von Webseiten nach längerer Nichtnutzung löschen – Home-Bildschirm-Apps
  sind davon ausgenommen.
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
- Sync am Computer testen: in beiden Fenstern synchronisieren und dieselbe Datei
  (z. B. in `~/Haushaltsplan-Sync/`) öffnen bzw. überschreiben.
- **Neue Kategorie-Symbole:** `ICONS` oben in `js/app.js`.
- **Standard-Kategorien:** `DEFAULT_SECTIONS` in `js/store.js` (feste IDs beibehalten!).
- **Neues Feld in Ausgaben:** in `store.isValid` erlauben, beim Anlegen in `app.js` setzen,
  in `createExpenseRow` anzeigen. Ältere App-Versionen ignorieren unbekannte Felder.
- **Dateiformat inkompatibel ändern:** `SYNC_VERSION` in `js/sync.js` erhöhen.

### Code-Stil
- Kommentare und Oberfläche auf Deutsch, Bezeichner auf Englisch.
- Keine Abhängigkeiten von außen (Sicherheit, Offline-Fähigkeit, Einfachheit).

## Tests

Bei der Entwicklung getestet (Chromium per Playwright, Teilen-Menü des iPhones simuliert):

| Bereich | Geprüft |
|---|---|
| Sync | Erstes Gerät legt Datei an; zweites Gerät übernimmt Einträge und ergänzt eigene; Löschungen kommen beim anderen an; beide Geräte haben am Ende dieselbe Summe; Geräteliste mit Namen; falsche Datei wird abgelehnt und Speichern bleibt gesperrt |
| Oberfläche | Hinzufügen, Löschen, Rückgängig, Kategorie löschen nur mit „Löschen“, Datumsauswahl (heute/gestern/frei, keine Zukunft), Fehlermeldungen, Statuspunkt |

Nicht automatisch testbar: echtes iPhone (Dateien-App, Teilen-Menü, iCloud-Freigabe).

## Bekannte Grenzen & Ideen

- Abgleich nur manuell (Safari-Beschränkung).
- Tombstones (gelöschte Einträge) werden nie aufgeräumt – bei Familiengröße unkritisch.
- Ausgaben können (noch) nicht bearbeitet werden – nur löschen und neu anlegen.
- Die Sync-Datei ist nicht zusätzlich verschlüsselt (Schutz über die iCloud-Freigabe).
- Ideen: Erinnerung zum Synchronisieren, Monatsübersicht/Diagramme, Ausgaben bearbeiten,
  CSV-Export, Budget pro Kategorie, Dark Mode.

## Versionsgeschichte

| Stand | Änderung |
|---|---|
| 22.11.2026 | Sync auf **iCloud Drive** umgestellt (Sync-Datei, 2 Schritte); Supabase entfernt |
| 17.11.2026 | Web-App mit verschlüsseltem Supabase-Sync, Datumsauswahl, PWA |
