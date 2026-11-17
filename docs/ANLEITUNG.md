# Anleitung: Haushaltsplan einrichten und benutzen

Diese Anleitung führt Schritt für Schritt durch die Einrichtung.
**Teil A und B macht ein Erwachsener einmalig**, danach (Teil C–E) können alle die App benutzen.

---

## Teil A – Supabase einrichten (ca. 10 Minuten, einmalig)

Supabase ist ein Online-Dienst, über den sich die Handys abgleichen.
Für eine Familie ist er kostenlos. Er speichert nur verschlüsselte Daten.

### 1. Konto und Projekt anlegen

1. Auf **https://supabase.com** gehen → **Start your project** → mit E-Mail oder GitHub registrieren
2. **New project** anklicken
3. Ausfüllen:
   - **Name:** `haushaltsplan`
   - **Database Password:** auf **Generate a password** klicken (wird nicht weiter gebraucht, aber sicher aufheben)
   - **Region:** **Central EU (Frankfurt)** – dann bleiben die Daten in Deutschland
4. **Create new project** – etwa 1–2 Minuten warten

### 2. Datenbank einrichten

1. Links im Menü **SQL Editor** öffnen
2. **New query** anklicken
3. Den kompletten Inhalt der Datei [`supabase/setup.sql`](../supabase/setup.sql) hineinkopieren
   (auf GitHub die Datei öffnen → oben rechts auf das Kopier-Symbol klicken)
4. Unten rechts auf **Run** klicken → es sollte **„Success. No rows returned“** erscheinen

> Supabase fragt eventuell nach, ob die Abfrage „destruktive Operationen“ enthält –
> das liegt an den `drop policy if exists`-Zeilen. Einfach bestätigen.

### 3. Anonyme Anmeldung einschalten

Die Handys melden sich automatisch und unsichtbar an – ohne E-Mail oder Passwort.
Dafür muss eine Einstellung eingeschaltet werden:

1. Links im Menü **Authentication** → **Sign In / Providers**
2. **Allow anonymous sign-ins** einschalten
3. **Save** klicken

### 4. Adresse und Schlüssel kopieren

1. Links unten **Project Settings** (Zahnrad) → **API Keys**
2. Den **Publishable key** kopieren (beginnt mit `sb_publishable_…`)
3. Unter **Project Settings → Data API** (oder oben auf der Projektseite) die **Project URL** kopieren
   (sieht aus wie `https://abcdefghijkl.supabase.co`)

> ⚠️ Niemals den **Secret key** (`sb_secret_…`) bzw. `service_role`-Key verwenden oder weitergeben!
> Der Publishable key dagegen darf öffentlich sein.

---

## Teil B – Werte in die App eintragen (einmalig)

1. Auf GitHub im Repository die Datei **`config.js`** öffnen
2. Oben rechts auf den **Stift** (Edit) klicken
3. Die beiden Werte zwischen die Anführungszeichen einfügen:

   ```js
   window.HAUSHALT_CONFIG = {
     supabaseUrl: 'https://abcdefghijkl.supabase.co',
     supabaseKey: 'sb_publishable_xxxxxxxxxxxxxxxxxxxx',
   };
   ```

4. **Commit changes…** → **Commit changes** klicken
5. 1–2 Minuten warten, bis GitHub Pages die neue Version veröffentlicht hat

---

## Teil C – App auf dem iPhone installieren (jedes Familienmitglied)

1. **https://treneus.github.io/haushaltsplan/** in **Safari** öffnen
2. Unten auf **Teilen** (Quadrat mit Pfeil nach oben) tippen
3. Nach unten scrollen → **„Zum Home-Bildschirm“** → **Hinzufügen**
4. Ab jetzt die App **immer über das neue Symbol** starten

> Wichtig: Auf dem iPhone sind die Daten in Safari und in der App vom Home-Bildschirm
> getrennt. Wer die App in Safari benutzt, riskiert außerdem, dass Safari die Daten nach
> einiger Zeit ohne Nutzung löscht. Deshalb: immer das Symbol benutzen.

---

## Teil D – Haushalt verbinden

### Die erste Person: Haushalt erstellen

1. In der App oben rechts auf den **runden Profil-Knopf** tippen
2. Nutzernamen eintragen → **Speichern**
3. Unter **Haushalt** auf **Haushalt erstellen** tippen
4. Ein **Haushalts-Passwort** ausdenken (mindestens 8 Zeichen), zweimal eingeben → **Erstellen**
5. Es erscheint der **Haushalts-Code**, z. B. `K7Q2-M9XA`

> 🔑 **Das Passwort gut aufschreiben!** Es lässt sich nicht zurücksetzen.
> Ohne Passwort kann niemand mehr beitreten und die Daten auf dem Server sind nicht lesbar
> (auf den Handys bleiben sie natürlich erhalten).

### Alle anderen: beitreten

1. App öffnen → Profil-Knopf → Nutzernamen eintragen → **Speichern**
2. Unter **Haushalt** auf **Beitreten** tippen
3. **Haushalts-Code** und **Passwort** eingeben → **Beitreten**
4. Nach wenigen Sekunden erscheinen alle Ausgaben der Familie

Unter **Im Haushalt** sieht man, welche Geräte verbunden sind und wann sie zuletzt aktiv waren.

---

## Teil E – Bedienung

| Was | Wie |
|---|---|
| Kategorie öffnen | Kategorie antippen |
| Kategorie hinzufügen | Auf dem Startbildschirm **+** → Name und Symbol wählen |
| Kategorie löschen | Nach links wischen oder **✕** → **„Löschen“** eintippen → bestätigen (löscht auch alle Ausgaben darin, auf allen Geräten) |
| Ausgabe hinzufügen | In einer Kategorie **+** → Betrag, Beschreibung, Datum |
| Datum ändern | Ins Datumsfeld tippen oder **Gestern** wählen (Standard: heute) |
| Ausgabe löschen | Nach links wischen oder **✕** – 4 Sekunden lang **Rückgängig** möglich |
| Sofort abgleichen | Einstellungen → **Jetzt synchronisieren** (passiert sonst automatisch) |
| Familie einladen | Einstellungen → **Code teilen** |
| Haushalt verlassen | Einstellungen → **Verlassen** → nochmal tippen. Die eigenen Daten bleiben auf dem Gerät |

Der kleine Punkt am Profil-Knopf zeigt den Status:
🟢 synchronisiert · 🟡 gleicht gerade ab · 🔴 Problem (Details in den Einstellungen)

---

## Häufige Fragen

**Kostet das etwas?**
Nein. GitHub Pages und der Supabase-Free-Plan sind kostenlos.

**Was, wenn die App eine Woche lang niemand benutzt?**
Supabase pausiert kostenlose Projekte nach etwa 7 Tagen ohne Nutzung.
Dann im Supabase-Dashboard das Projekt öffnen und **Resume project** klicken – die Daten bleiben erhalten.
In der App steht dann „Server nicht erreichbar – ist das Supabase-Projekt pausiert?“.

**Funktioniert die App ohne Internet?**
Ja. Alle Daten liegen auf jedem Handy. Ausgaben können offline eingetragen werden,
der Abgleich passiert automatisch, sobald wieder Internet da ist.

**Was passiert, wenn zwei Personen gleichzeitig etwas ändern?**
Jede Ausgabe wird einzeln abgeglichen. Ändern zwei Geräte genau denselben Eintrag,
gewinnt die neueste Änderung.

**Ich habe ein neues Handy.**
App installieren (Teil C) und mit Code + Passwort beitreten (Teil D). Alle Daten kommen automatisch.

**In der App steht „Sync nicht eingerichtet“.**
In `config.js` fehlen noch die Supabase-Werte (Teil B).

**Es steht „Allow anonymous sign-ins ist noch ausgeschaltet“.**
Teil A, Schritt 3 erledigen.

**Es steht „Die Datenbank ist noch nicht eingerichtet“.**
Teil A, Schritt 2 erledigen.

**„Zu viele Fehlversuche“?**
Nach 10 falschen Passwörtern ist der Haushalt 15 Minuten gesperrt (Schutz vor Ausprobieren).

**Wie sicher ist das?**
Alle Inhalte werden auf dem Handy mit dem Haushalts-Passwort verschlüsselt (AES-256).
Supabase und alle anderen sehen nur Zeichensalat. Zusätzlich sorgen Zugriffsregeln in der
Datenbank dafür, dass nur Mitglieder des Haushalts überhaupt an die (verschlüsselten) Daten kommen.
Details: [TECHNIK.md](TECHNIK.md#sicherheit).
