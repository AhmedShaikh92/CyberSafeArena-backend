import { Server, Namespace, Socket } from 'socket.io';
import { RoomManager } from '../services/roomManager';
import { GameManager } from '../services/gameManager';
import { verifyToken } from '../utils/jwt';
import type { IRoomConfig, IMatchFoundPayload, IRoomMember } from '../types/index';

export class RoomHandlers {
  private roomManager: RoomManager;
  private gameManager: GameManager;
  private io!: Server;  // set in registerHandlers

  constructor(gameManager: GameManager) {
    this.gameManager = gameManager;
    this.roomManager = new RoomManager(gameManager);
  }

  public registerHandlers(io: Server): void {
    this.io = io;  // store so _notifyMatchFound can access default namespace
    const rooms: Namespace = io.of('/rooms');

    // ── Auth middleware ───────────────────────────────────────────────────────
    rooms.use((socket, next) => {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('Authentication required'));

      try {
        const payload = verifyToken(token);
        socket.data.user = {
          userId:   payload.userId,
          username: payload.username,
          role:     payload.role,
          level:    payload.level ?? 1,
        };
        next();
      } catch {
        next(new Error('Invalid token'));
      }
    });

    // ── Wire up match_found callback ─────────────────────────────────────────
    this.roomManager.onMatchFound = (
      gameId,
      redMember,
      blueMember,
      payloads,
    ) => {
      this._notifyMatchFound(rooms, gameId, redMember, blueMember, payloads);
    };

    // ── Connection ────────────────────────────────────────────────────────────
    rooms.on('connection', (socket: Socket) => {
      const user = socket.data.user;
      console.log(`[Rooms] Connected: ${user.username} (${socket.id})`);

      // ── create_room ─────────────────────────────────────────────────────────
      socket.on('create_room', ({ config }: { config?: Partial<IRoomConfig> }, callback) => {
        const result = this.roomManager.createRoom(
          user.userId,
          user.username,
          user.role,
          user.level,
          socket.id,
          config ?? {},
        );

        if ('error' in result) {
          callback?.({ success: false, error: result.error });
          socket.emit('room_error', { message: result.error });
          return;
        }

        socket.join(`room:${result.roomId}`);

        socket.emit('room_created', {
          roomId:   result.roomId,
          roomCode: result.roomCode,
          members:  this.roomManager.serializeMembers(result),
          config:   result.config,
          isHost:   true,
        });

        callback?.({ success: true, roomId: result.roomId, roomCode: result.roomCode });
      });

      // ── join_room ───────────────────────────────────────────────────────────
      socket.on('join_room', ({ roomCode }: { roomCode: string }, callback) => {
        const result = this.roomManager.joinRoom(
          roomCode,
          user.userId,
          user.username,
          user.role,
          user.level,
          socket.id,
        );

        if ('error' in result) {
          callback?.({ success: false, error: result.error });
          socket.emit('room_error', { message: result.error });
          return;
        }

        socket.join(`room:${result.roomId}`);

        // Tell the joiner they're in
        socket.emit('room_joined', {
          roomId:   result.roomId,
          roomCode: result.roomCode,
          members:  this.roomManager.serializeMembers(result),
          config:   result.config,
          isHost:   false,
        });

        // Tell everyone (including host) the member list updated
        rooms.to(`room:${result.roomId}`).emit('members_update', {
          members: this.roomManager.serializeMembers(result),
        });

        callback?.({ success: true, roomId: result.roomId });
      });

      // ── leave_room ──────────────────────────────────────────────────────────
      socket.on('leave_room', ({ roomId }: { roomId: string }) => {
        this._handleLeave(rooms, socket, user.userId);
      });

      // ── kick_member ─────────────────────────────────────────────────────────
      socket.on('kick_member', ({ roomId, userId }: { roomId: string; userId: string }, callback) => {
        const result = this.roomManager.kickMember(user.userId, userId);

        if ('error' in result) {
          callback?.({ success: false, error: result.error });
          return;
        }

        // Find the kicked player's socket and boot them from the room
        const kickedSocket = rooms.sockets.get(result.kicked.socketId);
        if (kickedSocket) {
          kickedSocket.leave(`room:${roomId}`);
          kickedSocket.emit('room_closed'); // reuse room_closed so their store resets
        }

        // Update remaining members
        rooms.to(`room:${result.room.roomId}`).emit('members_update', {
          members: this.roomManager.serializeMembers(result.room),
        });

        callback?.({ success: true });
      });

      // ── update_room_config ──────────────────────────────────────────────────
      socket.on('update_room_config', ({ roomId, config }: { roomId: string; config: Partial<IRoomConfig> }, callback) => {
        const result = this.roomManager.updateConfig(user.userId, config);

        if ('error' in result) {
          callback?.({ success: false, error: result.error });
          return;
        }

        // Broadcast updated config to all room members
        rooms.to(`room:${result.roomId}`).emit('room_config_updated', { config: result.config });

        callback?.({ success: true });
      });

      // ── start_room ──────────────────────────────────────────────────────────
      socket.on('start_room', ({ roomId }: { roomId: string }, callback) => {
        const error = this.roomManager.startRoom(user.userId);

        if (error) {
          callback?.({ success: false, error: error.error });
          socket.emit('room_error', { message: error.error });
          return;
        }

        callback?.({ success: true });
        // match_found is emitted via onMatchFound callback below
      });

      // ── disconnect ──────────────────────────────────────────────────────────
      socket.on('disconnect', () => {
        console.log(`[Rooms] Disconnected: ${user.username} (${socket.id})`);
        this._handleLeave(rooms, socket, user.userId);
      });
    });
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private _handleLeave(rooms: Namespace, socket: Socket, userId: string): void {
    const result = this.roomManager.leaveRoom(userId);
    if (!result) return;

    socket.rooms.forEach((r) => {
      if (r.startsWith('room:')) socket.leave(r);
    });

    if (result.room === null) {
      // Host left — dissolve the room, notify everyone
      rooms.to(`room:${result.roomId}`).emit('room_closed');
    } else {
      // Non-host left — update member list
      rooms.to(`room:${result.roomId}`).emit('members_update', {
        members: this.roomManager.serializeMembers(result.room),
      });
    }
  }

  private _notifyMatchFound(
    rooms: Namespace,
    gameId: string,
    redMember: IRoomMember,
    blueMember: IRoomMember,
    payloads: { red: IMatchFoundPayload; blue: IMatchFoundPayload },
  ): void {
    const redRoomSocket  = rooms.sockets.get(redMember.socketId);
    const blueRoomSocket = rooms.sockets.get(blueMember.socketId);

    // Leave the private room before transitioning
    redRoomSocket?.rooms.forEach((r)  => { if (r.startsWith('room:')) redRoomSocket.leave(r); });
    blueRoomSocket?.rooms.forEach((r) => { if (r.startsWith('room:')) blueRoomSocket.leave(r); });

    // Join both players' default-namespace sockets to the game room so that
    // timer_update, phase_changed, system_status etc. reach them
    const gameRoom = `game:${gameId}`;
    const redDefaultSocket  = this._getSocketForUser(redMember.userId);
    const blueDefaultSocket = this._getSocketForUser(blueMember.userId);
    redDefaultSocket?.join(gameRoom);
    blueDefaultSocket?.join(gameRoom);

    // Notify both players
    redRoomSocket?.emit('match_found',  payloads.red);
    blueRoomSocket?.emit('match_found', payloads.blue);

    // CRITICAL: transition lobby → briefing and broadcast game_started
    if (this.gameManager.startGame(gameId)) {
      this.io.to(gameRoom).emit('game_started', { gameId, phase: 'briefing' });
    }
  }

  private _getSocketForUser(userId: string) {
    for (const [, socket] of this.io.of('/').sockets) {
      if ((socket.data.user as any)?.userId === userId) return socket;
    }
    return undefined;
  }
}