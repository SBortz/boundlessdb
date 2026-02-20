# DCB Event Store - Test UI

Eine einfache Web-UI zum Testen des DCB Event Store.

## Features

- **Event Append**: Events erstellen mit optionalem Consistency Token
- **Event Read**: Query Builder für Conditions, zeigt Token (klickbar zum Kopieren)
- **Live Store View**: Alle Events und Keys mit SSE-basiertem Auto-Refresh
- **Conflict Demo**: Simuliert einen Consistency-Konflikt in Echtzeit

## Installation

```bash
cd event-store-ui
npm install
```

## Starten

**Development (mit Hot-Reload):**
```bash
npm run dev
```

**Production:**
```bash
npm run build
npm start
```

Die UI ist dann unter **http://localhost:3456** erreichbar.

## Konfiguration

Umgebungsvariablen:
- `PORT` - Server Port (default: 3456)
- `DB_PATH` - Pfad zur SQLite-DB (default: `./test-store.db`)
- `SECRET` - Token-Signing Secret (default: `test-secret-for-ui`)

## Verwendung

### 1. Event Append

1. Event Type eingeben (z.B. `CourseCreated`)
2. JSON Data eingeben (z.B. `{"courseId": "123", "name": "Test"}`)
3. Keys für Index hinzufügen (z.B. `course` = `123`)
4. Optional: Token aktivieren für Consistency Check
5. "Append Event" klicken

### 2. Event Read

1. Conditions hinzufügen: Type + Key + Value
2. "Read Events" klicken
3. Token wird angezeigt und kann per Klick kopiert werden
4. Token-Inhalt wird decodiert angezeigt (Base64 → JSON)

### 3. Conflict Demo

1. Query Condition definieren
2. "Simulate Conflict" klicken
3. Während der 3-Sekunden-Wartezeit: "Manual Append" klicken
4. Konflikt wird erkannt und angezeigt

## Token-Transparenz

Tokens werden automatisch decodiert angezeigt:
```json
{
  "v": 1,
  "pos": 42,
  "ts": 1708425600000,
  "q": [{"type": "CourseCreated", "key": "course", "value": "123"}]
}
```

## Architektur

- **Backend**: Express.js mit direktem SQLite-Zugriff
- **Frontend**: Vanilla HTML/CSS/JS
- **Live Updates**: Server-Sent Events (SSE)
- **Database**: Separate `test-store.db` für Tests
