#!/usr/bin/env bash
# Startet die App lokal unter Linux (zum Ausprobieren und Weiterentwickeln).
#
#   ./start.sh       → normales Gerät
#   ./start.sh 2     → zusätzliches "Testgerät 2" mit eigenen Daten
#
# Die App läuft dabei unter http://localhost:8080 (nötig für Verschlüsselung).

cd "$(dirname "$0")"
PORT=8080
URL="http://localhost:$PORT/"
[ -n "$1" ] && URL="$URL?geraet=$1"

# Lokalen Webserver starten, falls er noch nicht läuft
if ! curl -s "http://localhost:$PORT/" >/dev/null 2>&1; then
  python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1 &
  sleep 1
fi

for b in chromium chromium-browser google-chrome google-chrome-stable brave-browser microsoft-edge vivaldi; do
  if command -v "$b" >/dev/null 2>&1; then
    exec "$b" --app="$URL" --window-size=390,844 \
      --user-data-dir="$HOME/.local/share/haushaltsplan-browser" >/dev/null 2>&1
  fi
done
command -v firefox >/dev/null 2>&1 && exec firefox --new-window "$URL"
xdg-open "$URL"
