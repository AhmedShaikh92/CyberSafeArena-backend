import { Server, Namespace, Socket } from 'socket.io';
import { GameManager } from '../services/gameManager';
import { ProgressionService } from '../services/progression';
import { generateBriefing } from '../services/briefing';
import { verifyToken } from '../utils/jwt';
import type { IMatchmakingEntry, IMatchFoundPayload } from '../types/index';

const progressionService = new ProgressionService();

export class SocketHandlers {
  private gameManager: GameManager;

  constructor(gameManager: GameManager) {
    this.gameManager = gameManager;
  }

  public registerHandlers(io: Server): void {
    // ── Wire broadcaster BEFORE the game loop can fire callbacks ─────────────
    this.gameManager.broadcaster = {
      onSimulationEvent: (gameId, event) => {
        io.to(`simulation:${gameId}`).emit('simulation_event', event);
        io.to(`simulation:${gameId}`).emit('game_log', {
          id:        `${event.type}-${event.timestamp}-${Math.random().toString(36).slice(2, 7)}`,
          type:      event.type,
          severity:  event.severity,
          message:   event.message,
          timestamp: new Date(event.timestamp).toISOString(),
        });
      },

      onTimerUpdate: (gameId, timeRemaining) => {
        io.to(`game:${gameId}`).emit('timer_update', { timeRemaining });
      },

      onPhaseChanged: (gameId, phase, result?: unknown) => {
        const game = this.gameManager.getGame(gameId);
        if (phase === 'aar' && result && game) {
          const r = result as {
            red:  { outcome: string; xpGained: number };
            blue: { outcome: string; xpGained: number };
          };
          this._getSocketForUser(io, game.redPlayer)?.emit('phase_changed',  { phase: 'aar', result: r.red  });
          this._getSocketForUser(io, game.bluePlayer)?.emit('phase_changed', { phase: 'aar', result: r.blue });
        } else {
          io.to(`game:${gameId}`).emit('phase_changed', { phase });
        }
      },

      onSystemStatus: (gameId, status) => {
        io.to(`game:${gameId}`).emit('system_status', status);
      },

      onActionsUpdate: (gameId, actions) => {
        const game = this.gameManager.getGame(gameId);
        if (!game) return;
        this._getSocketForUser(io, game.redPlayer)?.emit('actions_update',  actions.attacker);
        this._getSocketForUser(io, game.bluePlayer)?.emit('actions_update', actions.defender);
      },

      onActionProcessed: (gameId, _userId, actionType, success, message) => {
        io.to(`simulation:${gameId}`).emit('game_log', {
          id:        `action-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          type:      success ? 'defense_triggered' : 'attack_detected',
          severity:  success ? 'low' : 'medium',
          message:   `[${actionType}] ${message}`,
          timestamp: new Date().toISOString(),
        });
      },
    };

    this._registerMatchmakingNamespace(io);
    this._registerGameNamespace(io);
  }

  // ─── /matchmaking namespace ───────────────────────────────────────────────

  private _registerMatchmakingNamespace(io: Server): void {
    const matchmaking: Namespace = io.of('/matchmaking');

    matchmaking.use((socket: Socket, next: (err?: Error) => void) => {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('Authentication required'));
      try {
        const payload    = verifyToken(token);
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

    this.gameManager.onMatchFound = (
      gameId: string,
      redEntry: IMatchmakingEntry,
      blueEntry: IMatchmakingEntry,
      payloads: { red: IMatchFoundPayload; blue: IMatchFoundPayload },
    ) => {
      this._notifyMatchFound(matchmaking, io, gameId, redEntry, blueEntry, payloads);
    };

    matchmaking.on('connection', (socket: Socket) => {
      const user = socket.data.user;

      socket.on('find_match', (callback: Function) => {
        const entry: IMatchmakingEntry = {
          userId:   user.userId,
          username: user.username,
          role:     user.role,
          level:    user.level,
          queuedAt: Date.now(),
          socketId: socket.id,
        };
        const result = this.gameManager.enqueue(entry);
        if (!result.queued) {
          callback?.({ success: false, error: 'Already in queue or in a game' });
          return;
        }
        const queueLength = this.gameManager.getQueueLength();
        callback?.({
          success:     true,
          status:      result.gameId ? 'matched' : 'queued',
          queueLength,
        });
        // Broadcast updated queue size to all waiting players
        matchmaking.emit('queue_update', { position: queueLength, size: queueLength });
      });

      socket.on('cancel_match', (callback: Function) => {
        callback?.({ success: this.gameManager.dequeue(user.userId) });
      });

      socket.on('disconnect', () => {
        this.gameManager.dequeue(user.userId);
      });
    });
  }

  // ─── Default / namespace (game events) ───────────────────────────────────

  private _registerGameNamespace(io: Server): void {
    io.on('connection', (socket: Socket) => {
      console.log(`[Socket] Connected: ${socket.id}`);

      socket.on('authenticate', (token: string, callback: Function) => {
        try {
          const payload    = verifyToken(token);
          socket.data.user = {
            userId:   payload.userId,
            username: payload.username,
            email:    payload.email,
            role:     payload.role,
            level:    payload.level ?? 1,
          };
          callback({ success: true });
        } catch {
          callback({ success: false, error: 'Invalid token' });
        }
      });

      socket.on('get_briefing', (gameId: string, callback: Function) => {
        const game = this.gameManager.getGame(gameId);
        if (!game) { callback({ error: 'Game not found' }); return; }
        const userId   = (socket.data.user as any)?.userId ?? '';
        const userRole = game.redPlayer === userId ? 'red_team' : 'blue_team';
        callback({ briefing: generateBriefing(game.scenario, userRole) });
      });

      socket.on('get_game_state', (gameId: string, callback: Function) => {
        const state = this.gameManager.getGameState(gameId);
        if (!state) { callback({ error: 'Game not found' }); return; }
        callback({ state });
      });

      socket.on('player_action', (gameId: string, actionType: string, payload: Record<string, unknown>, callback: Function) => {
        const user = socket.data.user as any;
        if (!user) { callback({ success: false, error: 'Not authenticated' }); return; }
        this.gameManager.processAction(gameId, user.userId, actionType, payload);
        callback({ success: true });
      });

      socket.on('subscribe_simulation', (gameId: string, callback: Function) => {
        const game = this.gameManager.getGame(gameId);
        if (!game) { callback({ error: 'Game not found' }); return; }

        // Join BOTH rooms — game: for status/timer, simulation: for logs
        socket.join(`game:${gameId}`);
        socket.join(`simulation:${gameId}`);

        const userId   = (socket.data.user as any)?.userId ?? '';
        const userRole = game.redPlayer === userId ? 'red_team' : 'blue_team';
        const actions  = this.gameManager._getActionsForScenario(game.scenario);

        // Send actions immediately so ActionPanel isn't empty
        socket.emit('actions_update', userRole === 'red_team' ? actions.attacker : actions.defender);

        // Send a system_status snapshot immediately — client shouldn't wait 5s for first update
        const engineState = game.engine.getState();
        const vulnsFound  = engineState.vulnerabilitiesFound.size;
        const totalVulns  = 2;
        socket.emit('system_status', {
          ...engineState.systemState,
          vulnerabilitiesFound:  vulnsFound,
          vulnerabilitiesTotal:  totalVulns,
          securityPosture:       vulnsFound === 0 ? 'compromised' : vulnsFound === totalVulns ? 'hardened' : 'partial',
          progressPercentage:    Math.round((vulnsFound / totalVulns) * 100),
        });

        // Seed recent log events so terminal isn't blank on join
        const recentEvents = engineState.events.slice(-20);
        callback({
          state: {
            phase:           game.phase,
            events:          recentEvents,
            vulnerabilities: Array.from(engineState.vulnerabilitiesFound),
          },
        });
      });

      socket.on('rejoin_game', (gameId: string, callback: Function) => {
        const user = socket.data.user as any;
        if (!user) { callback({ error: 'Not authenticated' }); return; }

        const game = this.gameManager.getGame(gameId);
        if (!game) { callback({ error: 'Game not found or already ended' }); return; }

        const isParticipant = game.redPlayer === user.userId || game.bluePlayer === user.userId;
        if (!isParticipant) { callback({ error: 'Not a participant' }); return; }

        socket.join(`game:${gameId}`);
        if (game.phase === 'active') socket.join(`simulation:${gameId}`);

        const state = this.gameManager.getGameState(gameId);
        callback({ success: true, timeRemaining: state?.timeRemaining, phase: game.phase });
      });

      socket.on('forfeit_game', ({ gameId }: { gameId: string }) => {
        const user = socket.data.user as any;
        if (!user) return;
        const game = this.gameManager.getGame(gameId);
        if (!game) return;

        const isParticipant = game.redPlayer === user.userId || game.bluePlayer === user.userId;
        if (!isParticipant) return;

        const loserId  = user.userId;
        const winnerId = game.redPlayer === loserId ? game.bluePlayer : game.redPlayer;

        // Award XP to both players in DB (fire-and-forget, errors logged not thrown)
        Promise.all([
          progressionService.awardXP(loserId,  0, 'loss').catch((e) => console.error('[Forfeit] awardXP loser:', e)),
          progressionService.awardXP(winnerId, 0, 'win') .catch((e) => console.error('[Forfeit] awardXP winner:', e)),
        ]);

        // Send each player their outcome so the frontend can update local state
        const loserSocket  = this._getSocketForUser(io, loserId);
        const winnerSocket = this._getSocketForUser(io, winnerId);

        loserSocket?.emit('game_forfeited', {
          gameId,
          forfeitedBy: loserId,
          winner:      winnerId,
          yourOutcome: 'loss',
          xpGained:    30,  // loss XP from config
        });
        winnerSocket?.emit('game_forfeited', {
          gameId,
          forfeitedBy: loserId,
          winner:      winnerId,
          yourOutcome: 'win',
          xpGained:    100, // win XP from config
        });

        this.gameManager.endGame(gameId);
      });

      socket.on('leave_game', () => {
        if (socket.data.user) this._handlePlayerLeave(io, socket);
      });

      socket.on('disconnect', () => {
        console.log(`[Socket] Disconnected: ${socket.id}`);
        const user = socket.data.user as any;
        if (user) this.gameManager.dequeue(user.userId);
      });
    });
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private _notifyMatchFound(
    matchmaking: Namespace,
    io: Server,
    gameId: string,
    redEntry: IMatchmakingEntry,
    blueEntry: IMatchmakingEntry,
    payloads: { red: IMatchFoundPayload; blue: IMatchFoundPayload },
  ): void {
    const gameRoom = `game:${gameId}`;

    // Join default-namespace sockets to the game room
    this._getSocketForUser(io, redEntry.userId)?.join(gameRoom);
    this._getSocketForUser(io, blueEntry.userId)?.join(gameRoom);

    // Emit match_found via matchmaking namespace sockets
    matchmaking.sockets.get(redEntry.socketId)?.emit('match_found',  payloads.red);
    matchmaking.sockets.get(blueEntry.socketId)?.emit('match_found', payloads.blue);

    if (this.gameManager.startGame(gameId)) {
      io.to(gameRoom).emit('game_started', { gameId, phase: 'briefing' });
    }
  }

  private _getSocketForUser(io: Server, userId: string): Socket | undefined {
    for (const [, socket] of io.of('/').sockets) {
      if ((socket.data.user as any)?.userId === userId) return socket;
    }
    return undefined;
  }

  private _handlePlayerLeave(io: Server, socket: Socket): void {
    const userId = (socket.data.user as any)?.userId;
    if (!userId) return;
    const game = this.gameManager.getUserGame(userId);
    if (game) io.to(`game:${game.gameId}`).emit('player_left', { userId, gameId: game.gameId });
    this.gameManager.leaveGame(userId);
    socket.rooms.forEach((r) => {
      if (r.startsWith('game:') || r.startsWith('simulation:')) socket.leave(r);
    });
  }
}