// User and Authentication Types
export type UserRole = 'red_team' | 'blue_team' | 'admin';

export interface IUser {
  _id: string;
  username: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  xp: number;
  rank: number; // 0-2, maps to Level 1-3
  level: 1 | 2 | 3; // display-facing level
  wins: number;
  losses: number;
  gamesPlayed: number;
  createdAt: Date;
  lastActive: Date;
  stats: IUserStats;
}

export interface IUserStats {
  correctDefenses: number;
  successfulAttacks: number;
  totalSimulationsCompleted: number;
  averageResponseTime: number;
  vulnerabilitiesIdentified: number;
}

// Game Types
export type GamePhase = 'lobby' | 'briefing' | 'active' | 'aar';

export interface IGame {
  _id: string;
  gameId: string;
  phase: GamePhase;
  redPlayer: string;  // Single user ID — 1v1
  bluePlayer: string; // Single user ID — 1v1
  startTime: Date;
  endTime?: Date;
  scenario: IGameScenario;
  results: IGameResult;
  createdAt: Date;
  updatedAt: Date;
}

export interface IGameScenario {
  type: 'brute_force' | 'sql_injection' | 'xss' | 'phishing' | 'jwt_manipulation' | 'network_anomaly';
  difficulty: 'easy' | 'medium' | 'hard';
  description: string;
  objectives: string[];
  timeLimit: number; // milliseconds
  environment: {
    targetSystem: string;
    vulnerability: string;
    protections: string[];
  };
}

export interface IGameResult {
  redPlayerActions: ITeamAction[];
  bluePlayerActions: ITeamAction[];
  vulnerabilitiesExploited: string[];
  vulnerabilitiesIdentified: string[];
  winner?: 'red_player' | 'blue_player' | 'draw';
  redPlayerXPGain: number;
  bluePlayerXPGain: number;
}

export interface ITeamAction {
  userId: string;
  timestamp: number;
  action: string;
  result: 'success' | 'failed' | 'neutral';
  details: Record<string, unknown>;
}

// ─── Room Types ──────────────────────────────────────────────────────────────

export type ScenarioType =
  | 'random'
  | 'brute_force'
  | 'sql_injection'
  | 'xss'
  | 'phishing'
  | 'jwt_manipulation'
  | 'network_anomaly';

export type DifficultyType = 'easy' | 'medium' | 'hard';

export interface IRoomConfig {
  scenario: ScenarioType;
  difficulty: DifficultyType;
  maxPlayers: number; // always 2 for 1v1
}

export interface IRoomMember {
  userId: string;
  username: string;
  role: UserRole;
  level: 1 | 2 | 3;
  levelName: string;
  isHost: boolean;
  socketId: string;
}

export interface IRoom {
  roomId: string;
  roomCode: string; // short human-readable code e.g. "XK7F"
  hostUserId: string;
  members: IRoomMember[];
  config: IRoomConfig;
  createdAt: number;
}

// ─── Matchmaking Types ───────────────────────────────────────────────────────

export interface IMatchmakingEntry {
  userId: string;
  username: string;
  role: UserRole;
  level: 1 | 2 | 3;
  queuedAt: number;
  socketId: string;
}

// Shared payload emitted as `match_found` to both players (rooms + matchmaking)
export interface IMatchFoundPayload {
  gameId: string;
  role: UserRole;         // this player's role
  opponent: {
    userId: string;
    username: string;
    level: 1 | 2 | 3;
  };
  scenario: IGameScenario['type'];
  difficulty: DifficultyType;
}

// ─── Tactical Briefing Types ─────────────────────────────────────────────────

export interface ITacticalBriefing {
  scenarioType: IGameScenario['type'];
  role: 'red_team' | 'blue_team';
  briefPoints: string[];
  keyStrategies: string[];
  commonMistakes: string[];
  timeToRead: number;
}

// ─── After Action Review Types ───────────────────────────────────────────────

export interface IAfterActionReview {
  gameId: string;
  redPlayerSummary: IPlayerAAR;
  bluePlayerSummary: IPlayerAAR;
  keyInsights: string[];
  improvementAreas: IImprovementArea[];
  createdAt: Date;
}

export interface IPlayerAAR {
  role: 'red_team' | 'blue_team';
  performanceScore: number;
  actions: number;
  successRate: number;
  timing: {
    averageResponseTime: number;
    actionTimeline: { time: number; action: string }[];
  };
  vulnerabilityAnalysis: {
    exploited: string[];
    identified: string[];
    missed: string[];
  };
}

export interface IImprovementArea {
  title: string;
  description: string;
  recommendation: string;
  difficulty: 'easy' | 'medium' | 'hard';
}

// ─── Socket Event Types ──────────────────────────────────────────────────────

export interface GameAction {
  userId: string;
  type: string;
  payload: Record<string, unknown>;
  timestamp: number;
}

export interface SimulationEvent {
  type: 'attack_detected' | 'defense_triggered' | 'vulnerability_exposed' | 'system_state_change';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  affectedSystems: string[];
  timestamp: number;
}