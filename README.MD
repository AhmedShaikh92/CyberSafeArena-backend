# CyberSafe Arena — Frontend Integration Guide

This document gives a complete picture of the backend. Every socket event, REST endpoint, data shape, and game flow is documented here exactly as the backend implements it.

---

## Stack & Connection

- **Backend URL**: `http://localhost:5000` (dev) — set via `CORS_ORIGIN` env var
- **REST API base**: `/api`
- **Real-time**: Socket.io (connect to root URL)
- **Auth**: JWT Bearer token — store in memory or `httpOnly` cookie. Send on every REST request as `Authorization: Bearer <token>` and pass to the socket via the `authenticate` event.

---

## Authentication (REST)

### Register
`POST /api/auth/register`

Request:
```json
{
  "username": "string (3–30 chars)",
  "email": "valid email",
  "password": "string"
}
```

> **Role is assigned randomly by the server** (50/50 between `red_team` and `blue_team`). Do not send or prompt for a role — the backend ignores it even if provided.

Response `201`:
```json
{
  "user": {
    "_id": "string",
    "username": "string",
    "email": "string",
    "role": "red_team" | "blue_team",
    "xp": 0,
    "level": 1,
    "rank": 0
  },
  "token": "JWT string"
}
```

Errors: `400` validation, `409` user already exists.

---

### Login
`POST /api/auth/login`

Request:
```json
{ "email": "string", "password": "string" }
```

Response `200`: same shape as register response.

Errors: `401` wrong password, `404` user not found.

---

### Verify Token
`POST /api/auth/verify-token`

Header: `Authorization: Bearer <token>`

Response:
```json
{ "valid": true, "user": { /* user object */ } }
```

---

## User (REST)

All routes require `Authorization: Bearer <token>`.

### Get My Profile
`GET /api/users/profile`

Response:
```json
{
  "_id": "string",
  "username": "string",
  "email": "string",
  "role": "red_team" | "blue_team",
  "xp": 500,
  "rank": 1,
  "level": 2,
  "wins": 5,
  "losses": 2,
  "gamesPlayed": 7,
  "stats": {
    "correctDefenses": 12,
    "successfulAttacks": 8,
    "totalSimulationsCompleted": 7,
    "averageResponseTime": 2500,
    "vulnerabilitiesIdentified": 15
  }
}
```

### Leaderboard
`GET /api/users/leaderboard?role=red_team&limit=50`

Query params: `role` (optional filter), `limit` (default 100).

Response: array of:
```json
{
  "rank": 1,
  "username": "string",
  "xp": 5000,
  "level": 3,
  "levelName": "Elite",
  "wins": 45,
  "losses": 5,
  "winRate": "90.0"
}
```

---

## Progression (REST)

### My Progression
`GET /api/progression/me` *(protected)*

Response:
```json
{
  "user": {
    "xp": 600,
    "level": 2,
    "levelName": "Veteran",
    "wins": 6,
    "losses": 3,
    "gamesPlayed": 9,
    "stats": { /* IUserStats */ }
  },
  "progression": {
    "currentLevel": 2,
    "currentLevelName": "Veteran",
    "xpInCurrentLevel": 100,
    "xpRequiredForLevel": 1000,
    "progressPercentage": 10,
    "xpToNextLevel": 900,
    "totalXP": 600,
    "nextLevelName": "Elite"
  }
}
```

### Any User's Progression
`GET /api/progression/user/:userId`

Same response shape, minus `levelName` on the user object.

### Global Leaderboard (Progression service)
`GET /api/progression/leaderboard/global?limit=50&offset=0`

Response:
```json
{
  "leaderboard": [
    {
      "position": 1,
      "username": "string",
      "xp": 3000,
      "level": 3,
      "levelName": "Elite",
      "wins": 30,
      "losses": 4,
      "winRate": "88.2"
    }
  ],
  "total": 200,
  "limit": 50,
  "offset": 0
}
```

### Level Distribution
`GET /api/progression/stats/level-distribution`

Response:
```json
{
  "levelDistribution": [
    { "level": 1, "levelName": "Rookie", "count": 120 },
    { "level": 2, "levelName": "Veteran", "count": 45 },
    { "level": 3, "levelName": "Elite", "count": 10 }
  ]
}
```

### General Stats
`GET /api/progression/stats/general`

Response:
```json
{
  "totalUsers": 175,
  "averageXP": 420,
  "averageGamesPlayed": 6,
  "averageWinRate": "51.3",
  "totalGamesPlayed": 1050
}
```

---

## Level System

There are exactly **3 levels**. The `level` field (1–3) is what you display to users. `rank` (0–2) is the internal index — you shouldn't need it on the frontend.

| Level | Name    | XP Required |
|-------|---------|-------------|
| 1     | Rookie  | 0           |
| 2     | Veteran | 500         |
| 3     | Elite   | 1500        |

**XP awards per match:**

| Event              | XP  |
|--------------------|-----|
| Win                | 100 |
| Loss               | 30  |
| Performance ≥ 80   | +50 |
| Performance ≥ 60   | +25 |
| Performance ≥ 40   | +10 |

---

## Socket.io — Complete Event Reference

### Connection & Authentication

Connect to the server root. After connecting, immediately authenticate before emitting any other events.

```js
const socket = io('http://localhost:5000');

socket.emit('authenticate', token, (response) => {
  // response: { success: true }
  // or:       { success: false, error: 'Invalid token' }
});
```

Authentication stores user context server-side on the socket. Every subsequent event uses that stored context — you don't need to resend the token.

---

### Matchmaking

The game uses **automatic 1v1 matchmaking**. There is no manual game creation or team selection — the server pairs two players with opposite roles (one `red_team`, one `blue_team`) from the queue.

#### Find a Match
```js
socket.emit('find_match', (response) => {
  // response: { success: true, status: 'queued', queueLength: 3 }
  // or:       { success: true, status: 'matched', gameId: 'uuid' }
  // or:       { success: false, error: 'Already in queue or in a game' }
});
```

`status: 'queued'` means waiting for an opponent. `status: 'matched'` means an opponent was found instantly.

#### Cancel Matchmaking
```js
socket.emit('cancel_matchmaking', (response) => {
  // response: { success: true }
});
```

#### Match Found (server → client)
Emitted to **both** players when paired.

```js
socket.on('match_found', (data) => {
  // data:
  // {
  //   gameId: 'uuid',
  //   yourRole: 'red_team' | 'blue_team',
  //   opponent: {
  //     userId: 'string',
  //     username: 'string',
  //     level: 1 | 2 | 3
  //   }
  // }
});
```

After `match_found`, the server **automatically starts the game** (moves to `briefing` phase) and emits `game_started` immediately. You do not need to call `start_game` manually.

#### Game Started (server → client)
```js
socket.on('game_started', (data) => {
  // data: { gameId: 'uuid', phase: 'briefing' }
});
```

---

### In-Game Events

#### Get Briefing
Call this after `game_started` to get the role-specific pre-game briefing.

```js
socket.emit('get_briefing', gameId, (response) => {
  // response: { briefing: ITacticalBriefing }
});
```

`ITacticalBriefing` shape:
```json
{
  "scenarioType": "brute_force" | "sql_injection" | "xss" | "phishing" | "jwt_manipulation" | "network_anomaly",
  "role": "red_team" | "blue_team",
  "briefPoints": ["string"],
  "keyStrategies": ["string"],
  "commonMistakes": ["string"],
  "timeToRead": 30000
}
```

#### Get Game State
```js
socket.emit('get_game_state', gameId, (response) => {
  // response: { state: GameState }
  // or:       { error: 'Game not found' }
});
```

`GameState` shape:
```json
{
  "gameId": "uuid",
  "phase": "lobby" | "briefing" | "active" | "aar",
  "redPlayer": "userId",
  "bluePlayer": "userId",
  "scenario": { /* IGameScenario */ },
  "simulation": { /* engine state */ },
  "phaseStartTime": 1700000000000,
  "timeRemaining": 240000
}
```

`timeRemaining` is in milliseconds. Use it to render a countdown. It is calculated fresh on each call — poll it or use `phaseStartTime` + known durations to derive it client-side.

**Phase durations (ms):**

| Phase    | Duration |
|----------|----------|
| Briefing | 30,000   |
| Active   | 300,000  |
| AAR      | 60,000   |

#### Subscribe to Simulation
Call once after the game goes active to receive real-time simulation events.

```js
socket.emit('subscribe_simulation', gameId, (response) => {
  // response:
  // {
  //   state: {
  //     phase: 'active',
  //     events: SimulationEvent[],
  //     vulnerabilities: string[]
  //   }
  // }
});

socket.on('simulation_event', (event) => {
  // event: SimulationEvent
  // {
  //   type: 'attack_detected' | 'defense_triggered' | 'vulnerability_exposed' | 'system_state_change',
  //   severity: 'low' | 'medium' | 'high' | 'critical',
  //   message: 'string',
  //   affectedSystems: ['string'],
  //   timestamp: 1700000000000
  // }
});
```

#### Send a Player Action
```js
socket.emit('player_action', gameId, actionType, payload, (response) => {
  // response: { success: true }
  // or:       { success: false, error: 'Not authenticated' }
});
```

`actionType` is a string defined by the scenario (e.g. `'block_ip'`, `'inject_sql'`). `payload` is a free-form object with action parameters.

#### Action Processed (server → all players)
```js
socket.on('action_processed', (data) => {
  // data: { userId: 'string', actionType: 'string', gameId: 'uuid' }
});
```

#### Phase Changed (server → all players)
```js
socket.on('phase_changed', (data) => {
  // data: { gameId: 'uuid', phase: 'briefing' | 'active' | 'aar' }
});
```

#### Game Update (server → all players)
Periodic full state pushes during active phase.
```js
socket.on('game_update', (state) => {
  // state: GameState (same shape as get_game_state response)
});
```

---

### Player Leaving

#### Leave Game
```js
socket.emit('leave_game');
```

No callback. If a player leaves mid-game, the game ends for both players.

#### Player Left (server → remaining players)
```js
socket.on('player_left', (data) => {
  // data: { userId: 'string', gameId: 'uuid' }
});
```

Disconnecting (socket drop) has the same effect as `leave_game` — the server handles cleanup and dequeues the player from matchmaking if they were waiting.

---

### Utility Events

#### List Active Games
```js
socket.emit('list_games', (response) => {
  // response: { games: ActiveGameSummary[] }
});

// ActiveGameSummary:
// {
//   gameId: 'uuid',
//   phase: 'lobby' | 'briefing' | 'active' | 'aar',
//   redPlayer: 'userId',
//   bluePlayer: 'userId',
//   scenario: { type: string, difficulty: 'easy' | 'medium' | 'hard' }
// }
```

---

## Game Flow (Step by Step)

This is the exact sequence of events the frontend should handle:

```
1. User registers / logs in → receives JWT token
2. User opens app → connect socket → emit 'authenticate' with token
3. User clicks "Find Match" → emit 'find_match'
   → Show "Searching for opponent..." UI
   → If response.status === 'queued': wait for 'match_found' event
   → If response.status === 'matched': 'match_found' fires synchronously
4. 'match_found' fires → store gameId and yourRole
   → Show opponent info (username, level)
5. 'game_started' fires immediately after → phase: 'briefing'
   → emit 'get_briefing' with gameId → render briefing screen
   → Start 30 second countdown (briefingDuration)
6. 'phase_changed' fires with phase: 'active'
   → emit 'subscribe_simulation' with gameId
   → Start 5 minute countdown (roundDuration)
   → Render simulation UI — listen for 'simulation_event' and 'action_processed'
   → User sends actions via 'player_action'
7. 'phase_changed' fires with phase: 'aar'
   → Show After Action Review screen
   → Poll 'get_game_state' or listen to 'game_update' for final scores
   → Start 60 second countdown (aarDuration)
8. Game ends → server cleans up
   → Show "Play Again" → go back to step 3
```

---

## Scenario Types

Six attack scenarios, each with three difficulties:

| Type               | Red Team Goal                       | Blue Team Goal                    |
|--------------------|-------------------------------------|-----------------------------------|
| `brute_force`      | Crack credentials                   | Detect & block login attempts     |
| `sql_injection`    | Inject malicious SQL                | Monitor DB for suspicious queries |
| `xss`              | Inject malicious scripts            | Sanitize outputs, implement CSP   |
| `phishing`         | Send convincing phishing emails     | Filter suspicious emails          |
| `jwt_manipulation` | Forge/manipulate JWT tokens         | Detect invalid tokens             |
| `network_anomaly`  | Exploit network infrastructure      | Monitor traffic, close ports      |

Difficulty affects attack success rate and detection difficulty:

| Difficulty | Attack Success Rate | Detection Rate |
|------------|--------------------|--------------------|
| `easy`     | 25%                | 85%            |
| `medium`   | 50%                | 60%            |
| `hard`     | 75%                | 35%            |

The scenario is randomly assigned by the server — the frontend receives it in `match_found` → `game_started` → `get_briefing`.

---

## Key Data Types (TypeScript)

```typescript
type UserRole = 'red_team' | 'blue_team' | 'admin';

interface IUser {
  _id: string;
  username: string;
  email: string;
  role: UserRole;
  xp: number;
  rank: number;    // internal 0-2
  level: 1 | 2 | 3; // display this
  wins: number;
  losses: number;
  gamesPlayed: number;
  stats: IUserStats;
}

interface IUserStats {
  correctDefenses: number;
  successfulAttacks: number;
  totalSimulationsCompleted: number;
  averageResponseTime: number;
  vulnerabilitiesIdentified: number;
}

type GamePhase = 'lobby' | 'briefing' | 'active' | 'aar';

interface IGameScenario {
  type: 'brute_force' | 'sql_injection' | 'xss' | 'phishing' | 'jwt_manipulation' | 'network_anomaly';
  difficulty: 'easy' | 'medium' | 'hard';
  description: string;
  objectives: string[];
  timeLimit: number;
  environment: {
    targetSystem: string;
    vulnerability: string;
    protections: string[];
  };
}

interface SimulationEvent {
  type: 'attack_detected' | 'defense_triggered' | 'vulnerability_exposed' | 'system_state_change';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  affectedSystems: string[];
  timestamp: number;
}

interface IMatchmakingEntry {
  userId: string;
  username: string;
  role: UserRole;
  level: 1 | 2 | 3;
  queuedAt: number;
  socketId: string;
}
```

---

## Suggested Pages / Screens

| Screen              | What it needs                                                                 |
|---------------------|-------------------------------------------------------------------------------|
| Register / Login    | Auth forms (no role field — server assigns it randomly), store JWT, show assigned role on success |
| Dashboard / Home    | User profile, XP bar, level name, win/loss, "Find Match" button              |
| Matchmaking Lobby   | Searching spinner, cancel button, queue length from `find_match` response    |
| Match Found Screen  | Opponent name, level, your role, countdown to briefing                        |
| Briefing Screen     | Scenario name, difficulty, objectives, strategies, 30s countdown             |
| Active Game Screen  | Simulation event log, action buttons, system status, countdown timer         |
| AAR Screen          | Win/loss result, XP gained, level-up notification if applicable, stats       |
| Leaderboard         | Table of top players by XP, show level name and win rate                     |
| Profile             | Stats, XP progress bar, level progression (Rookie → Veteran → Elite)        |

---

## Important Notes for Frontend Devs

- **Role is randomly assigned at registration** by the server — users have no choice. Do not show a role picker on the registration form. Display the assigned role (e.g. "You are Red Team") on the dashboard after login. A `red_team` user will always be matched against a `blue_team` user.
- **Do not show `rank`** to users — only display `level` (1, 2, or 3) and `levelName` (Rookie, Veteran, Elite).
- **The game auto-starts** after matchmaking. You don't need a "ready up" or "start" button — just listen for `game_started`.
- **Disconnecting = forfeit.** Handle `player_left` gracefully by ending the game screen and returning the remaining player to the dashboard.
- **`timeRemaining` from `get_game_state`** gives ms left in the current phase. Use this to initialise your countdown timer, then count down client-side rather than polling.
- **Socket rooms are managed server-side.** When `match_found` fires, the server has already joined both sockets to `game:<gameId>` — you don't need to join a room manually.
- **All socket callbacks follow** `{ success: boolean, error?: string }` for commands, or `{ data }` for queries. Always check `success` before proceeding.
