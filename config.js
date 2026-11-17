/* =========================================================
   config.js – Verbindung zu eurem Supabase-Projekt

   Die beiden Werte findet ihr im Supabase-Dashboard unter
   "Project Settings → API Keys" (siehe docs/ANLEITUNG.md).

   Beide Werte dürfen öffentlich sein: Geschützt werden die Daten
   durch die Zugriffsregeln in der Datenbank und dadurch, dass alles
   mit eurem Haushalts-Passwort verschlüsselt ist.

   Bleiben die Felder leer, funktioniert die App nur auf dem eigenen Gerät.
   ========================================================= */
window.HAUSHALT_CONFIG = {
  supabaseUrl: '',  // z. B. 'https://abcdefghijkl.supabase.co'
  supabaseKey: '',  // "Publishable key" (beginnt mit sb_publishable_) oder der alte "anon"-Key
};
