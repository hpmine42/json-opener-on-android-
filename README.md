# JSON Opener – PWA für Android

Öffnet JSON-Dateien direkt aus dem **Android-Teilen-Menü** – ohne Import, ohne Upload.
Alles bleibt lokal auf dem Gerät.

## Funktionen

- 📤 **Teilen → JSON Opener**: Datei in einer anderen App teilen, JSON Opener wählen, Inhalt wird sofort angezeigt
- 🌳 **Baumansicht** mit Auf-/Zuklappen (virtualisiert – auch große Dateien laufen flüssig)
- 🔍 **Suche** in Schlüsseln und Werten (`Strg+F` / `/`), klappt Treffer automatisch auf
- 📄 **Rohdaten** mit Syntax-Highlighting (formatiert)
- 🧭 **Schema-Ansicht** mit Pfaden und Typen
- 📤/💾/📋 **Teilen, Speichern, Kopieren** der Datei
- 📲 **Installierbar** als App auf dem Startbildschirm (Chrome/Android)
- ⚡ **Offline-fähig** (Service Worker)

## Installation auf dem Pixel

1. Die Seite in **Chrome** auf dem Android-Gerät öffnen.
2. `⋮ → App installieren` (oder „Zum Startbildschirm hinzufügen“).
3. Fertig – das `{ }`-Icon erscheint auf dem Startbildschirm, und die App taucht
   im Teilen-Menü für `.json`-Dateien auf.

> Hinweis: Das Teilen-Menü (Web Share Target) funktioniert in Chrome und
> Chromium-basierten Browsern. Der Datei-Empfang braucht den Service Worker –
> die App sollte nach der Installation einmal geöffnet werden.

## Technik

| Datei | Zweck |
|---|---|
| `index.html` | Oberfläche (Start, Viewer, Info) |
| `styles.css` | Design (dunkles Theme, PWA-Layout) |
| `app.js` | UI-Logik, Virtualisierung, Suche, Aktionen |
| `core.js` | Kernlogik ohne DOM (in Node testbar) |
| `sw.js` | Service Worker: Offline-Cache + Share-Target-Empfang |
| `manifest.webmanifest` | PWA-Manifest mit `share_target` |
| `icons/` | App-Icons (192/512, maskable, apple-touch) |
| `sample.json` | Beispiel-Datei |
| `test/` | Unit-Tests für `core.js` |

### Wie der Datei-Empfang funktioniert

1. Android teilt die Datei als `POST multipart/form-data` an die App-URL
   (`share_target` im Manifest).
2. Der Service Worker fängt den POST ab, liest die Datei und leitet auf
   `./?shared=1` weiter.
3. Die App fragt den Worker nach der letzten geteilten Datei
   (`QUERY_SHARE`) und öffnet sie.

Zusätzlich werden GET-Links (`?json=…`) und geteilter Text/URLs behandelt.

## Entwicklung

```bash
# Tests für die Kernlogik
node test/test.js

# Lokal testen (z. B. mit dem Android-Gerät im selben WLAN)
python3 -m http.server 8000
# → http://<rechner-ip>:8000
```

Für Share-Target-Tests auf dem Gerät: Die Seite muss über **HTTPS** erreichbar
sein (Service Worker). Lokal bieten sich `npx serve` hinter einem HTTPS-Tunnel
(z. B. Cloudflare Tunnel, ngrok) oder der Chrome-Trick `chrome://flags →
Insecure origins treated as secure` an.

## Hinweise

- Die App lädt **keine** Daten hoch – alles passiert lokal im Browser.
- Sehr große Dateien (viele MB) werden beim Öffnen geparst; die Baumansicht
  bleibt dank Virtualisierung trotzdem flüssig.
