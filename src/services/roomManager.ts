import { v4 as uuidv4 } from 'uuid';
import { getRandomScenario, getScenario } from '../simulation/scenarios';
import { GameManager } from './gameManager';
import type {
  IRoom,
  IRoomMember,
  IRoomConfig,
  IMatchFoundPayload,
  UserRole,
  ScenarioType,
  DifficultyType,
} from '../types/index';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateRoomCode(): string {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

const LEVEL_NAMES: Record<1 | 2 | 3, string> = {
  1: 'Rookie',
  2: 'Veteran',
  3: 'Elite',
};

// Valid values mirrored from types — used for runtime sanitization of client input
const VALID_SCENARIO_TYPES = new Set<ScenarioType>([
  'random',
  'brute_force',
  'sql_injection',
  'xss',
  'phishing',
  'jwt_manipulation',
  'network_anomaly',
]);

const VALID_DIFFICULTIES = new Set<DifficultyType>(['easy', 'medium', 'hard']);

/** Sanitize a scenario value from the client — falls back to 'random' if unknown */
function sanitizeScenario(value: unknown): ScenarioType {
  if (typeof value === 'string' && VALID_SCENARIO_TYPES.has(value as ScenarioType)) {
    return value as ScenarioType;
  }
  console.warn(`[RoomManager] Invalid scenario type "${value}" — defaulting to random`);
  return 'random';
}

/** Sanitize a difficulty value from the client — falls back to 'medium' if unknown */
function sanitizeDifficulty(value: unknown): DifficultyType {
  if (typeof value === 'string' && VALID_DIFFICULTIES.has(value as DifficultyType)) {
    return value as DifficultyType;
  }
  console.warn(`[RoomManager] Invalid difficulty "${value}" — defaulting to medium`);
  return 'medium';
}

// ─── RoomManager ─────────────────────────────────────────────────────────────

export class RoomManager {
  private rooms: Map<string, IRoom> = new Map();
  private roomCodes: Map<string, string> = new Map();
  private userRoomMap: Map<string, string> = new Map();

  private gameManager: GameManager;

  public onMatchFound: ((
    gameId: string,
    redMember: IRoomMember,
    blueMember: IRoomMember,
    payload: { red: IMatchFoundPayload; blue: IMatchFoundPayload },
  ) => void) | null = null;

  constructor(gameManager: GameManager) {
    this.gameManager = gameManager;
  }

  // ─── Create ────────────────────────────────────────────────────────────────

  public createRoom(
    hostUserId: string,
    hostUsername: string,
    hostRole: UserRole,
    hostLevel: 1 | 2 | 3,
    hostSocketId: string,
    config: Partial<IRoomConfig> = {},
  ): IRoom | { error: string } {
    if (this.userRoomMap.has(hostUserId)) {
      return { error: 'Already in a room' };
    }

    let roomCode = generateRoomCode();
    let attempts = 0;
    while (this.roomCodes.has(roomCode) && attempts < 10) {
      roomCode = generateRoomCode();
      attempts++;
    }

    const roomId = uuidv4();

    const hostMember: IRoomMember = {
      userId: hostUserId,
      username: hostUsername,
      role: hostRole,
      level: hostLevel,
      levelName: LEVEL_NAMES[hostLevel],
      isHost: true,
      socketId: hostSocketId,
    };

    const room: IRoom = {
      roomId,
      roomCode,
      hostUserId,
      members: [hostMember],
      config: {
        // Sanitize on creation too — client could send anything
        scenario:   sanitizeScenario(config.scenario),
        difficulty: sanitizeDifficulty(config.difficulty),
        maxPlayers: 2,
      },
      createdAt: Date.now(),
    };

    this.rooms.set(roomId, room);
    this.roomCodes.set(roomCode, roomId);
    this.userRoomMap.set(hostUserId, roomId);

    return room;
  }

  // ─── Join ──────────────────────────────────────────────────────────────────

  public joinRoom(
    roomCode: string,
    userId: string,
    username: string,
    role: UserRole,
    level: 1 | 2 | 3,
    socketId: string,
  ): IRoom | { error: string } {
    const roomId = this.roomCodes.get(roomCode);
    if (!roomId) return { error: 'Room not found' };

    const room = this.rooms.get(roomId);
    if (!room) return { error: 'Room not found' };

    if (this.userRoomMap.has(userId)) return { error: 'Already in a room' };

    if (room.members.length >= room.config.maxPlayers) {
      return { error: 'Room is full' };
    }

    const hostRole = room.members[0]?.role;
    const requiredRole: UserRole = hostRole === 'red_team' ? 'blue_team' : 'red_team';

    if (role !== requiredRole) {
      return { error: `This room needs a ${requiredRole.replace('_', ' ')} player` };
    }

    const member: IRoomMember = {
      userId,
      username,
      role,
      level,
      levelName: LEVEL_NAMES[level],
      isHost: false,
      socketId,
    };

    room.members.push(member);
    this.userRoomMap.set(userId, roomId);

    return room;
  }

  // ─── Leave ─────────────────────────────────────────────────────────────────

  public leaveRoom(userId: string): { room: IRoom | null; wasHost: boolean; roomId: string } | null {
    const roomId = this.userRoomMap.get(userId);
    if (!roomId) return null;

    const room = this.rooms.get(roomId);
    if (!room) return null;

    const wasHost = room.hostUserId === userId;

    this.userRoomMap.delete(userId);
    room.members = room.members.filter((m) => m.userId !== userId);

    if (wasHost || room.members.length === 0) {
      for (const m of room.members) {
        this.userRoomMap.delete(m.userId);
      }
      this.rooms.delete(roomId);
      this.roomCodes.delete(room.roomCode);
      return { room: null, wasHost, roomId };
    }

    return { room, wasHost, roomId };
  }

  // ─── Kick ──────────────────────────────────────────────────────────────────

  public kickMember(
    hostUserId: string,
    targetUserId: string,
  ): { room: IRoom; kicked: IRoomMember } | { error: string } {
    const roomId = this.userRoomMap.get(hostUserId);
    if (!roomId) return { error: 'Not in a room' };

    const room = this.rooms.get(roomId);
    if (!room) return { error: 'Room not found' };

    if (room.hostUserId !== hostUserId) return { error: 'Only the host can kick members' };

    const kicked = room.members.find((m) => m.userId === targetUserId);
    if (!kicked) return { error: 'Member not found' };

    room.members = room.members.filter((m) => m.userId !== targetUserId);
    this.userRoomMap.delete(targetUserId);

    return { room, kicked };
  }

  // ─── Update Config ─────────────────────────────────────────────────────────

  public updateConfig(
    hostUserId: string,
    patch: Partial<IRoomConfig>,
  ): IRoom | { error: string } {
    const roomId = this.userRoomMap.get(hostUserId);
    if (!roomId) return { error: 'Not in a room' };

    const room = this.rooms.get(roomId);
    if (!room) return { error: 'Room not found' };

    if (room.hostUserId !== hostUserId) return { error: 'Only the host can update config' };

    // Sanitize before merging — reject unknown scenario/difficulty values
    const safePatch: Partial<IRoomConfig> = { ...patch };
    if (patch.scenario  !== undefined) safePatch.scenario  = sanitizeScenario(patch.scenario);
    if (patch.difficulty !== undefined) safePatch.difficulty = sanitizeDifficulty(patch.difficulty);

    room.config = { ...room.config, ...safePatch, maxPlayers: 2 };
    return room;
  }

  // ─── Start ─────────────────────────────────────────────────────────────────

  public startRoom(hostUserId: string): { error: string } | null {
    const roomId = this.userRoomMap.get(hostUserId);
    if (!roomId) return { error: 'Not in a room' };

    const room = this.rooms.get(roomId);
    if (!room) return { error: 'Room not found' };

    if (room.hostUserId !== hostUserId) return { error: 'Only the host can start the game' };

    if (room.members.length < 2) return { error: 'Need 2 players to start' };

    const redMember  = room.members.find((m) => m.role === 'red_team');
    const blueMember = room.members.find((m) => m.role === 'blue_team');

    if (!redMember || !blueMember) {
      return { error: 'Need one red team and one blue team player' };
    }

    // Re-sanitize at start time — last line of defence before getScenario
    const scenarioType = sanitizeScenario(room.config.scenario);
    const difficulty   = sanitizeDifficulty(room.config.difficulty);

    const rawScenario =
      scenarioType === 'random'
        ? getRandomScenario(difficulty)
        : getScenario(scenarioType as Exclude<ScenarioType, 'random'>, difficulty);

    const scenario = { ...rawScenario, difficulty };

    const game = this.gameManager.createRoomGame(
      redMember.userId,
      blueMember.userId,
      scenario,
    );

    const baseOpponent = (member: IRoomMember) => ({
      userId:   member.userId,
      username: member.username,
      level:    member.level,
    });

    const redPayload: IMatchFoundPayload = {
      gameId:     game.gameId,
      role:       'red_team',
      opponent:   baseOpponent(blueMember),
      scenario:   scenario.type,
      difficulty: scenario.difficulty as DifficultyType,
    };

    const bluePayload: IMatchFoundPayload = {
      gameId:     game.gameId,
      role:       'blue_team',
      opponent:   baseOpponent(redMember),
      scenario:   scenario.type,
      difficulty: scenario.difficulty as DifficultyType,
    };

    // Clean up room
    for (const m of room.members) {
      this.userRoomMap.delete(m.userId);
    }
    this.rooms.delete(roomId);
    this.roomCodes.delete(room.roomCode);

    this.onMatchFound?.(game.gameId, redMember, blueMember, { red: redPayload, blue: bluePayload });

    return null;
  }

  // ─── Getters ───────────────────────────────────────────────────────────────

  public getRoom(roomId: string): IRoom | undefined {
    return this.rooms.get(roomId);
  }

  public getRoomByCode(roomCode: string): IRoom | undefined {
    const roomId = this.roomCodes.get(roomCode);
    return roomId ? this.rooms.get(roomId) : undefined;
  }

  public getUserRoom(userId: string): IRoom | undefined {
    const roomId = this.userRoomMap.get(userId);
    return roomId ? this.rooms.get(roomId) : undefined;
  }

  public serializeMembers(room: IRoom) {
    return room.members.map(({ socketId: _s, ...rest }) => rest);
  }
}