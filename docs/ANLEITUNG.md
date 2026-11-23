# Anleitung: Haushaltsplan einrichten und benutzen

**Teil 0 wird einmalig erledigt**, danach (Teil A–D) können alle die App benutzen.

---

## Teil 0 – App online stellen mit GitHub Pages (2 Minuten, einmalig)

Mit einem kostenlosen GitHub-Konto funktioniert GitHub Pages nur bei **öffentlichen** Repositories.
Das ist unbedenklich: Im Code stehen keine Geheimnisse, und eure Ausgaben liegen nicht auf GitHub,
sondern nur auf euren Geräten und in eurem iCloud-Ordner.

1. Auf GitHub das Repository **Treneus/haushaltsplan** öffnen → **Settings**
2. Ganz unten bei **Danger Zone** → **Change visibility** → **Change to public** → bestätigen
3. Links im Menü **Pages** öffnen
4. Bei **Source**: **Deploy from a branch** wählen
5. Bei **Branch**: **main** und **/ (root)** wählen → **Save**
6. 1–2 Minuten warten. Oben erscheint dann: *Your site is live at*
   **https://treneus.github.io/haushaltsplan/**

---

## Teil A – App auf dem iPhone installieren (jedes Familienmitglied)

1. **https://treneus.github.io/haushaltsplan/** in **Safari** öffnen
2. Unten auf **Teilen** (Quadrat mit Pfeil nach oben) tippen
3. Nach unten scrollen → **„Zum Home-Bildschirm“** → **Hinzufügen**
4. Ab jetzt die App **immer über das neue Symbol** starten
5. In der App oben rechts auf den **runden Profil-Knopf** → **Nutzername** eintragen → **Speichern**

> Wichtig: Auf dem iPhone sind die Daten in Safari und in der App vom Home-Bildschirm
> getrennt. Wer die App nur in Safari benutzt, riskiert außerdem, dass Safari die Daten nach
> einiger Zeit ohne Nutzung löscht. Deshalb: immer das Symbol benutzen.

---

## Teil B – Gemeinsamen iCloud-Ordner anlegen (eine Person, einmalig)

1. Die App **Dateien** öffnen → **Durchsuchen** → **iCloud Drive**
2. Oben rechts auf **⋯** → **Neuer Ordner** → Name: **Haushaltsplan**
3. Den Ordner **gedrückt halten** → **Teilen** → **Ordner teilen** (bzw. „Personen hinzufügen“)
4. Familienmitglieder einladen (über Nachrichten oder Mail) und bei
   **Freigabeoptionen** „**Änderungen vornehmen**“ erlauben
5. Die anderen nehmen die Einladung an – der Ordner erscheint dann bei ihnen ebenfalls in iCloud Drive

### Das erste Mal synchronisieren (dieselbe Person)

1. In der App oben auf den **Sync-Knopf** (die zwei kreisenden Pfeile) tippen
2. Bei Schritt 1 auf **„Es gibt noch keine Datei“** tippen
3. Bei Schritt 2 auf **Speichern** → **„In Dateien sichern“** → den Ordner **Haushaltsplan** wählen → **Sichern**

Jetzt liegt im Ordner die Datei **haushaltsplan-sync.json**.

---

## Teil C – Synchronisieren (alle, so oft ihr wollt)

1. Oben auf dem Startbildschirm auf den **Sync-Knopf** (die zwei kreisenden Pfeile) tippen
2. **Schritt 1 – Datei auswählen:** im Ordner **Haushaltsplan** die Datei **haushaltsplan-sync.json** antippen.
   Die App zeigt an, wie viele Einträge von den anderen übernommen wurden.
3. **Schritt 2 – Speichern:** **„In Dateien sichern“** → Ordner **Haushaltsplan** → **Sichern** →
   bei der Frage nach der vorhandenen Datei **„Ersetzen“** wählen

Fertig – jetzt sind deine Einträge für die anderen da, und du hast alle Einträge der anderen.

**Wann synchronisieren?** Am besten, nachdem du etwas eingetragen hast, oder einmal am Tag.
Der kleine Punkt am Sync-Knopf hilft:

- 🟢 alles ist in iCloud
- 🟡 es gibt Änderungen, die noch nicht in iCloud sind
- ohne Punkt: noch nie synchronisiert

---

## Teil D – Bedienung

| Was | Wie |
|---|---|
| Kategorie öffnen | Kategorie antippen |
| Kategorie hinzufügen | Auf dem Startbildschirm unter der Liste **„+ Neue Kategorie“** → Name und Symbol wählen |
| Kategorie löschen | Nach links wischen oder **✕** → **„Löschen“** eintippen → bestätigen (löscht auch alle Ausgaben darin – beim nächsten Abgleich auf allen Geräten) |
| Ausgabe hinzufügen | In einer Kategorie **+** → Betrag, Beschreibung, Datum |
| Datum ändern | Ins Datumsfeld tippen oder **Gestern** wählen (Standard: heute) |
| Ausgabe löschen | Nach links wischen oder **✕** – 4 Sekunden lang **Rückgängig** möglich |
| Abgleichen | **Sync-Knopf** oben auf dem Startbildschirm (oder Profil-Knopf → **Jetzt synchronisieren**) |
| Wer macht mit? | Profil-Knopf → **Im Haushalt** (alle Geräte, die schon synchronisiert haben) |

---

## Häufige Fragen

**Kostet das etwas?**
Nein. GitHub Pages ist kostenlos, und die Sync-Datei ist winzig (passt locker in die kostenlosen 5 GB iCloud).

**Warum geht der Abgleich nicht automatisch?**
Safari erlaubt Webseiten aus Sicherheitsgründen nicht, selbstständig Dateien in iCloud zu lesen
oder zu schreiben. Deshalb tippst du beim Öffnen und Speichern kurz selbst.

**Ich habe aus Versehen „Beide behalten“ statt „Ersetzen“ gewählt.**
Nicht schlimm. Dann gibt es eine zweite Datei (z. B. „haushaltsplan-sync 2.json“).
Beim nächsten Mal in Schritt 1 einfach **beide Dateien** auswählen – die App führt alles zusammen.
Danach die überzählige Datei in der Dateien-App löschen.

**Was passiert, wenn zwei Personen gleichzeitig synchronisieren?**
Es kann sein, dass dann die Einträge einer Person kurz fehlen. Sie gehen aber nicht verloren:
Jedes Gerät hat alle eigenen Einträge gespeichert und bringt sie beim nächsten Abgleich wieder mit.

**Was passiert, wenn zwei Personen denselben Eintrag ändern?**
Die neueste Änderung gewinnt.

**Funktioniert die App ohne Internet?**
Ja. Alle Daten liegen auf jedem Gerät. Nur zum Synchronisieren braucht iCloud kurz Internet.

**Ich habe ein neues Handy.**
App installieren (Teil A), Einladung zum Ordner annehmen und synchronisieren (Teil C) – alle Daten sind wieder da.

**„… ist keine Haushaltsplan-Datei“?**
Es wurde eine falsche Datei ausgewählt. Bitte **haushaltsplan-sync.json** im Ordner **Haushaltsplan** wählen.

**Wie sicher ist das?**
Die Daten liegen nur auf euren Geräten und in eurem geteilten iCloud-Ordner.
Zugriff haben nur die Personen, mit denen ihr den Ordner geteilt habt (und Apple als Anbieter von iCloud).
Es gibt keinen weiteren Server.
