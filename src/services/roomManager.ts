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

/** Generates a short uppercase room code like "XK7F" */
function generateRoomCode(): string {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

const LEVEL_NAMES: Record<1 | 2 | 3, string> = {
  1: 'Rookie',
  2: 'Veteran',
  3: 'Elite',
};

// ─── RoomManager ─────────────────────────────────────────────────────────────

export class RoomManager {
  private rooms: Map<string, IRoom> = new Map();           // roomId  -> IRoom
  private roomCodes: Map<string, string> = new Map();      // roomCode -> roomId
  private userRoomMap: Map<string, string> = new Map();    // userId  -> roomId

  private gameManager: GameManager;

  /** Fires when start_room creates a game. Socket layer subscribes to this. */
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
    // User already in a room or game
    if (this.userRoomMap.has(hostUserId)) {
      return { error: 'Already in a room' };
    }

    // Generate a unique room code
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
        scenario: config.scenario ?? 'random',
        difficulty: config.difficulty ?? 'medium',
        maxPlayers: 2, // always 1v1
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

    // Enforce opposite roles — host is one role, joiner must be the other
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

  /**
   * Remove a member from their room.
   * Returns the room if it still exists (so caller can notify remaining members),
   * or null if the room was dissolved (host left).
   */
  public leaveRoom(userId: string): { room: IRoom | null; wasHost: boolean; roomId: string } | null {
    const roomId = this.userRoomMap.get(userId);
    if (!roomId) return null;

    const room = this.rooms.get(roomId);
    if (!room) return null;

    const wasHost = room.hostUserId === userId;

    this.userRoomMap.delete(userId);
    room.members = room.members.filter((m) => m.userId !== userId);

    if (wasHost || room.members.length === 0) {
      // Dissolve room — remove all remaining members too
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

    room.config = { ...room.config, ...patch, maxPlayers: 2 };
    return room;
  }

  // ─── Start ─────────────────────────────────────────────────────────────────

  /**
   * Host triggers start. Exactly 2 members required (one red, one blue).
   * Creates a game via GameManager and fires onMatchFound.
   */
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

    // Resolve scenario
    const scenarioType = room.config.scenario;
    const rawScenario =
      scenarioType === 'random'
        ? getRandomScenario()
        : getScenario(scenarioType as Exclude<ScenarioType, 'random'>, room.config.difficulty);

    // Override difficulty if specified
    const scenario = { ...rawScenario, difficulty: room.config.difficulty };

    // Create the actual game
    const game = this.gameManager.createRoomGame(
      redMember.userId,
      blueMember.userId,
      scenario,
    );

    // Build match_found payloads — each player gets their own perspective
    const baseOpponent = (member: IRoomMember) => ({
      userId: member.userId,
      username: member.username,
      level: member.level,
    });

    const redPayload: IMatchFoundPayload = {
      gameId: game.gameId,
      role: 'red_team',
      opponent: baseOpponent(blueMember),
      scenario: scenario.type,
      difficulty: scenario.difficulty as DifficultyType,
    };

    const bluePayload: IMatchFoundPayload = {
      gameId: game.gameId,
      role: 'blue_team',
      opponent: baseOpponent(redMember),
      scenario: scenario.type,
      difficulty: scenario.difficulty as DifficultyType,
    };

    // Clean up room
    for (const m of room.members) {
      this.userRoomMap.delete(m.userId);
    }
    this.rooms.delete(roomId);
    this.roomCodes.delete(room.roomCode);

    // Notify socket layer
    this.onMatchFound?.(game.gameId, redMember, blueMember, { red: redPayload, blue: bluePayload });

    return null; // null = success
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

  /** Serialize members for socket emission (strip socketId) */
  public serializeMembers(room: IRoom) {
    return room.members.map(({ socketId: _s, ...rest }) => rest);
  }
}