import { v4 as uuidv4 } from 'uuid';
import { SimulationEngine } from '../simulation/engine';
import { getRandomScenario } from '../simulation/scenarios';
import { AARService } from './aar';
import type {
  IGame, GamePhase, IGameScenario,
  IMatchmakingEntry, IMatchFoundPayload, DifficultyType, SimulationEvent,
  ITeamAction,
} from '../types/index';
import { config } from '../config/index';

export interface ActiveGame {
  gameId: string;
  phase: GamePhase;
  redPlayer: string;
  bluePlayer: string;
  scenario: IGameScenario;
  engine: SimulationEngine;
  startTime: number;
  phaseStartTime: number;
  createdAt: Date;
  redActions:    ITeamAction[];
  blueActions:   ITeamAction[];
  aarBroadcast:  boolean;
}

export interface GameBroadcaster {
  onSimulationEvent:  (gameId: string, event: SimulationEvent) => void;
  onTimerUpdate:      (gameId: string, timeRemaining: number)  => void;
  onPhaseChanged:     (gameId: string, phase: string, result?: unknown) => void;
  onSystemStatus:     (gameId: string, status: Record<string, unknown>) => void;
  onActionProcessed:  (gameId: string, userId: string, actionType: string, success: boolean, message: string) => void;
  onActionsUpdate:    (gameId: string, actions: { attacker: unknown[]; defender: unknown[] }) => void;
}

export class GameManager {
  private activeGames:      Map<string, ActiveGame> = new Map();
  private userGameMap:      Map<string, string>     = new Map();
  private matchmakingQueue: IMatchmakingEntry[]     = [];
  private gameUpdateInterval: NodeJS.Timeout | null = null;
  private aarService = new AARService();

  public broadcaster: GameBroadcaster | null = null;

  public onMatchFound: ((
    gameId: string,
    redEntry: IMatchmakingEntry,
    blueEntry: IMatchmakingEntry,
    payloads: { red: IMatchFoundPayload; blue: IMatchFoundPayload },
  ) => void) | null = null;

  constructor() {
    this.startGameLoop();
  }

  // ─── Matchmaking ──────────────────────────────────────────────────────────

  public enqueue(entry: IMatchmakingEntry): { queued: boolean; gameId?: string } {
    if (this.isUserQueued(entry.userId) || this.userGameMap.has(entry.userId)) {
      return { queued: false };
    }

    const oppositeRole  = entry.role === 'red_team' ? 'blue_team' : 'red_team';
    const opponentIndex = this.matchmakingQueue.findIndex((e) => e.role === oppositeRole);

    if (opponentIndex !== -1) {
      const [opponent] = this.matchmakingQueue.splice(opponentIndex, 1);
      const redEntry   = entry.role === 'red_team' ? entry    : opponent;
      const blueEntry  = entry.role === 'blue_team' ? entry   : opponent;
      const game       = this._createGame(redEntry.userId, blueEntry.userId);
      const scenario   = game.scenario;

      const redPayload: IMatchFoundPayload = {
        gameId: game.gameId, role: 'red_team',
        opponent: { userId: blueEntry.userId, username: blueEntry.username, level: blueEntry.level },
        scenario: scenario.type, difficulty: scenario.difficulty as DifficultyType,
      };
      const bluePayload: IMatchFoundPayload = {
        gameId: game.gameId, role: 'blue_team',
        opponent: { userId: redEntry.userId, username: redEntry.username, level: redEntry.level },
        scenario: scenario.type, difficulty: scenario.difficulty as DifficultyType,
      };

      this.onMatchFound?.(game.gameId, redEntry, blueEntry, { red: redPayload, blue: bluePayload });
      return { queued: true, gameId: game.gameId };
    }

    this.matchmakingQueue.push(entry);
    return { queued: true };
  }

  public dequeue(userId: string): boolean {
    const index = this.matchmakingQueue.findIndex((e) => e.userId === userId);
    if (index === -1) return false;
    this.matchmakingQueue.splice(index, 1);
    return true;
  }

  public isUserQueued(userId: string): boolean {
    return this.matchmakingQueue.some((e) => e.userId === userId);
  }

  public getQueueLength(): number {
    return this.matchmakingQueue.length;
  }

  // ─── Game creation ────────────────────────────────────────────────────────

  private _createGame(redUserId: string, blueUserId: string, scenario?: IGameScenario): ActiveGame {
    const gameId           = uuidv4();
    const resolvedScenario = scenario ?? getRandomScenario();
    const engine           = new SimulationEngine(resolvedScenario);

    const game: ActiveGame = {
      gameId,
      phase:     'lobby',
      redPlayer:  redUserId,
      bluePlayer: blueUserId,
      scenario:   resolvedScenario,
      engine,
      startTime:      Date.now(),
      phaseStartTime: Date.now(),
      createdAt: new Date(),
      redActions:    [],
      blueActions:   [],
      aarBroadcast:  false,
    };

    this.activeGames.set(gameId, game);
    this.userGameMap.set(redUserId,  gameId);
    this.userGameMap.set(blueUserId, gameId);
    return game;
  }

  public createRoomGame(redUserId: string, blueUserId: string, scenario: IGameScenario): ActiveGame {
    return this._createGame(redUserId, blueUserId, scenario);
  }

  // ─── Game lifecycle ───────────────────────────────────────────────────────

  public getGame(gameId: string): ActiveGame | undefined {
    return this.activeGames.get(gameId);
  }

  public getUserGame(userId: string): ActiveGame | undefined {
    const gameId = this.userGameMap.get(userId);
    return gameId ? this.activeGames.get(gameId) : undefined;
  }

  public startGame(gameId: string): boolean {
    const game = this.activeGames.get(gameId);
    if (!game || game.phase !== 'lobby' || !game.redPlayer || !game.bluePlayer) return false;
    game.phase          = 'briefing';
    game.phaseStartTime = Date.now();
    return true;
  }

  public leaveGame(userId: string): void {
    this.dequeue(userId);
    const gameId = this.userGameMap.get(userId);
    if (!gameId) return;
    const game = this.activeGames.get(gameId);
    if (!game) return;
    this.userGameMap.delete(userId);
    if (game.redPlayer === userId || game.bluePlayer === userId) {
      this.endGame(gameId);
    }
  }

  public processAction(
    gameId: string,
    userId: string,
    actionType: string,
    payload: Record<string, unknown>,
  ): void {
    const game = this.activeGames.get(gameId);
    if (!game || game.phase !== 'active') return;

    const role: 'red_team' | 'blue_team' =
      game.redPlayer === userId ? 'red_team' : 'blue_team';

    const result = game.engine.processAction(userId, {
      userId,
      type:      actionType,
      payload,
      timestamp: Date.now(),
    }, role);

    // Track action for AAR
    const teamAction: ITeamAction = {
      userId,
      action:    actionType,
      timestamp: Date.now(),
      result:    result.success ? 'success' : 'failed',
      details:   payload,
    };
    if (role === 'red_team') game.redActions.push(teamAction);
    else                     game.blueActions.push(teamAction);

    if (this.broadcaster && result.eventGenerated) {
      this.broadcaster.onSimulationEvent(gameId, result.eventGenerated);
    }
    this.broadcaster?.onActionProcessed(gameId, userId, actionType, result.success, result.message);
    this._broadcastSystemStatus(game);
  }

  public getGameState(gameId: string) {
    const game = this.activeGames.get(gameId);
    if (!game) return null;

    const phaseElapsed = Date.now() - game.phaseStartTime;
    const timeRemaining =
      game.phase === 'active'   ? Math.max(0, config.game.roundDuration   - phaseElapsed) :
      game.phase === 'briefing' ? Math.max(0, config.game.briefingDuration - phaseElapsed) :
                                  Math.max(0, config.game.aarDuration      - phaseElapsed);

    return {
      gameId:         game.gameId,
      phase:          game.phase,
      redPlayer:      game.redPlayer,
      bluePlayer:     game.bluePlayer,
      scenario:       game.scenario,
      simulation:     game.engine.getState(),
      phaseStartTime: game.phaseStartTime,
      timeRemaining,
    };
  }

  public getAllGames() {
    return Array.from(this.activeGames.values()).map((game) => ({
      gameId:    game.gameId,
      phase:     game.phase,
      redPlayer: game.redPlayer,
      bluePlayer: game.bluePlayer,
      scenario: { type: game.scenario.type, difficulty: game.scenario.difficulty },
    }));
  }

  public endGame(gameId: string): void {
    const game = this.activeGames.get(gameId);
    if (!game) return;
    this.userGameMap.delete(game.redPlayer);
    this.userGameMap.delete(game.bluePlayer);
    this.activeGames.delete(gameId);
  }

  // ─── Game loop ────────────────────────────────────────────────────────────

  private startGameLoop(): void {
    this.gameUpdateInterval = setInterval(() => {
      for (const [gameId, game] of this.activeGames) {
        if (game.phase === 'active') {
          const tickStart = Date.now();
          game.engine.update(1000);

          const state      = game.engine.getState();
          const lastEvents = state.events.slice(-3);
          for (const event of lastEvents) {
            if (typeof event.timestamp === 'number' && (tickStart - event.timestamp) < 1500) {
              this.broadcaster?.onSimulationEvent(gameId, event);
            }
          }

          const phaseElapsed  = Date.now() - game.phaseStartTime;
          const timeRemaining = Math.max(0, config.game.roundDuration - phaseElapsed);
          this.broadcaster?.onTimerUpdate(gameId, timeRemaining);
          this._broadcastSystemStatus(game);
        }

        // ── Phase transitions ─────────────────────────────────────────────
        // IMPORTANT: only call onPhaseChanged ONCE per transition.
        // For 'aar', build the result first then emit a single event with it.
        const prevPhase = game.phase;
        const transitioned = this._transitionPhase(game);

        if (transitioned) {
          if (game.phase === 'aar' && !game.aarBroadcast) {
            game.aarBroadcast = true;
            const aarResult = this._buildAarResult(game);
            this.broadcaster?.onPhaseChanged(gameId, 'aar', aarResult);
          }
          // briefing→active: _transitionPhase already emits onPhaseChanged internally
        }
      }
    }, 1000);
  }

  private _transitionPhase(game: ActiveGame): boolean {
    const phaseElapsed = Date.now() - game.phaseStartTime;

    switch (game.phase) {
      case 'briefing':
        if (phaseElapsed >= config.game.briefingDuration) {
          game.phase          = 'active';
          game.phaseStartTime = Date.now();
          game.engine         = new SimulationEngine(game.scenario);

          const actions = this._getActionsForScenario(game.scenario);
          this.broadcaster?.onPhaseChanged(game.gameId, 'active');
          this._broadcastActionsUpdate(game.gameId, actions);
          return true;
        }
        break;

      case 'active':
        if (phaseElapsed >= config.game.roundDuration || !game.engine.isActive()) {
          game.phase          = 'aar';
          game.phaseStartTime = Date.now();
          game.engine.end();
          return true;
        }
        break;

      case 'aar':
        if (phaseElapsed >= config.game.aarDuration) {
          this.endGame(game.gameId);
          return true;
        }
        break;
    }
    return false;
  }

  private _broadcastSystemStatus(game: ActiveGame): void {
    if (!this.broadcaster) return;
    const engineState = game.engine.getState();
    const vulnsFound  = engineState.vulnerabilitiesFound.size;
    const totalVulns  = 2;

    const status: Record<string, unknown> = {
      ...engineState.systemState,
      vulnerabilitiesFound:    vulnsFound,
      vulnerabilitiesTotal:    totalVulns,
      securityPosture:         vulnsFound === 0 ? 'compromised' : vulnsFound === totalVulns ? 'hardened' : 'partial',
      progressPercentage:      Math.round((vulnsFound / totalVulns) * 100),
    };

    this.broadcaster.onSystemStatus(game.gameId, status);
  }

  private _broadcastActionsUpdate(gameId: string, actions: { attacker: unknown[]; defender: unknown[] }): void {
    this.broadcaster?.onActionsUpdate(gameId, actions);
  }

  private _buildAarResult(game: ActiveGame) {
    const state     = game.engine.getState();
    const redScore  = game.engine.getScore(game.redPlayer,  'red_team');
    const blueScore = game.engine.getScore(game.bluePlayer, 'blue_team');
    const winner    =
      redScore > blueScore ? 'red_player' :
      blueScore > redScore ? 'blue_player' : 'draw';

    // Generate rich AAR via AARService
    const fullAAR = this.aarService.generateAAR(
      game.gameId,
      game.scenario,
      game.redPlayer,
      game.bluePlayer,
      game.redActions,
      game.blueActions,
      game.engine,
    );

    const redOutcome  = winner === 'red_player'  ? 'win' : winner === 'draw' ? 'draw' : 'loss';
    const blueOutcome = winner === 'blue_player' ? 'win' : winner === 'draw' ? 'draw' : 'loss';
    const redXP       = this._calcXP(redScore,  winner === 'red_player');
    const blueXP      = this._calcXP(blueScore, winner === 'blue_player');

    const timeline = state.events.slice(0, 20).map((e) => ({
      time:     new Date(game.startTime + (e.timestamp ?? 0)).toISOString().substr(14, 5),
      event:    e.message,
      severity: e.severity,
    }));

    return {
      winner,
      redScore,
      blueScore,
      red: {
        outcome:  redOutcome,
        xpGained: redXP,
        playerSummary: {
          summary:         redOutcome === 'win' ? 'Mission objectives completed' : 'Threat overcame defenses',
          actionsCount:    fullAAR.redPlayerSummary.actions,
          correctActions:  Math.round(fullAAR.redPlayerSummary.successRate / 100 * fullAAR.redPlayerSummary.actions),
          avgResponseTime: Math.round(fullAAR.redPlayerSummary.timing.averageResponseTime / 1000),
        },
        performanceScores: {
          attackSuccess: Math.round(fullAAR.redPlayerSummary.successRate),
          speed:         fullAAR.redPlayerSummary.timing.averageResponseTime < 10000 ? 90 : 50,
          coverage:      Math.round((fullAAR.redPlayerSummary.vulnerabilityAnalysis.exploited.length / 2) * 100),
        },
        timeline,
        keyInsights:      fullAAR.keyInsights,
        improvementAreas: fullAAR.improvementAreas.map((a) => a.recommendation),
      },
      blue: {
        outcome:  blueOutcome,
        xpGained: blueXP,
        playerSummary: {
          summary:         blueOutcome === 'win' ? 'Mission objectives completed' : 'Threat overcame defenses',
          actionsCount:    fullAAR.bluePlayerSummary.actions,
          correctActions:  Math.round(fullAAR.bluePlayerSummary.successRate / 100 * fullAAR.bluePlayerSummary.actions),
          avgResponseTime: Math.round(fullAAR.bluePlayerSummary.timing.averageResponseTime / 1000),
        },
        performanceScores: {
          defenseSuccess:              Math.round(fullAAR.bluePlayerSummary.successRate),
          responseSpeed:               fullAAR.bluePlayerSummary.timing.averageResponseTime < 10000 ? 90 : 50,
          vulnerabilitiesPatchedPct:   Math.round((fullAAR.bluePlayerSummary.vulnerabilityAnalysis.identified.length / 2) * 100),
        },
        timeline,
        keyInsights:      fullAAR.keyInsights,
        improvementAreas: fullAAR.improvementAreas.map((a) => a.recommendation),
      },
    };
  }

  private _calcXP(score: number, won: boolean): number {
    const base        = won ? 100 : 30;
    const performance = score >= 80 ? 50 : score >= 60 ? 25 : score >= 40 ? 10 : 0;
    return base + performance;
  }

  public _getActionsForScenario(scenario: IGameScenario) {
    const attackerActions: Record<IGameScenario['type'], unknown[]> = {
      brute_force:     [
        { id: 'atk_credential_stuff', label: 'Cred Stuffing', icon: '🔑', description: 'Use leaked credential DB', color: '#ff2244', cooldown: 12 },
        { id: 'atk_distributed',      label: 'Distribute',    icon: '🌐', description: 'Spread across proxies',    color: '#ff4400', cooldown: 8  },
        { id: 'atk_brute_login',      label: 'Brute Login',   icon: '💥', description: 'Hammer login portal',      color: '#ff6600', cooldown: 6  },
        { id: 'atk_bypass_lockout',   label: 'Bypass Lockout',icon: '🔓', description: 'Circumvent lockout policy', color: '#ff2266', cooldown: 20 },
      ],
      sql_injection:   [
        { id: 'atk_inject_query',  label: 'Inject Query',  icon: '💉', description: 'Exploit SQL endpoint',        color: '#ff2244', cooldown: 15 },
        { id: 'atk_bypass_filter', label: 'Bypass Filter', icon: '🔍', description: 'Try encoded payloads',        color: '#ff4400', cooldown: 10 },
        { id: 'atk_leak_schema',   label: 'Leak Schema',   icon: '📄', description: 'Force verbose DB errors',     color: '#ff6600', cooldown: 12 },
        { id: 'atk_blind_inject',  label: 'Blind Inject',  icon: '👁', description: 'Time-based blind extraction', color: '#ff2266', cooldown: 20 },
      ],
      xss:             [
        { id: 'atk_script_inject', label: 'Script Inject', icon: '📜', description: 'Inject XSS payload',         color: '#ff2244', cooldown: 10 },
        { id: 'atk_bypass_csp',    label: 'Bypass CSP',    icon: '🛡', description: 'Circumvent CSP headers',     color: '#ff4400', cooldown: 15 },
        { id: 'atk_dom_exploit',   label: 'DOM Exploit',   icon: '🌐', description: 'DOM-based XSS vector',       color: '#ff6600', cooldown: 12 },
        { id: 'atk_event_handler', label: 'Event Handler', icon: '⚡', description: 'Inject via event attrs',     color: '#ff2266', cooldown: 8  },
      ],
      phishing:        [
        { id: 'atk_spoof_domain', label: 'Spoof Domain', icon: '📧', description: 'Send spoofed email',         color: '#ff2244', cooldown: 10 },
        { id: 'atk_bypass_auth',  label: 'Bypass Auth',  icon: '🔓', description: 'Bypass email auth checks',   color: '#ff4400', cooldown: 15 },
        { id: 'atk_fake_link',    label: 'Fake Link',    icon: '🔗', description: 'Embed malicious URL',        color: '#ff6600', cooldown: 8  },
        { id: 'atk_clone_site',   label: 'Clone Site',   icon: '🪞', description: 'Clone login portal',         color: '#ff2266', cooldown: 20 },
      ],
      jwt_manipulation:[
        { id: 'atk_forge_token',  label: 'Forge Token',  icon: '🎫', description: 'Forge JWT signature',        color: '#ff2244', cooldown: 15 },
        { id: 'atk_none_algo',    label: 'None Algo',    icon: '🔑', description: 'Use alg:none bypass',        color: '#ff4400', cooldown: 10 },
        { id: 'atk_crack_secret', label: 'Crack Secret', icon: '💥', description: 'Brute-force JWT secret',     color: '#ff6600', cooldown: 20 },
        { id: 'atk_claim_inject', label: 'Claim Inject', icon: '👤', description: 'Inject admin role claim',    color: '#ff2266', cooldown: 12 },
      ],
      network_anomaly: [
        { id: 'atk_port_scan',   label: 'Port Scan',  icon: '📡', description: 'Enumerate open ports',       color: '#ff2244', cooldown: 8  },
        { id: 'atk_ddos_wave',   label: 'DDoS Wave',  icon: '🌊', description: 'Flood target with traffic',  color: '#ff4400', cooldown: 25 },
        { id: 'atk_amplify',     label: 'Amplify',    icon: '📶', description: 'Amplify attack volume',      color: '#ff6600', cooldown: 20 },
        { id: 'atk_exfiltrate',  label: 'Exfiltrate', icon: '📤', description: 'Extract network data',       color: '#ff2266', cooldown: 15 },
      ],
    };

    const defenderActions: Record<IGameScenario['type'], unknown[]> = {
      brute_force:     [
        { id: 'implement_rate_limiting', label: 'Rate Limit',     icon: '⏱', description: 'Limit login attempts/min',   color: '#00d4ff', cooldown: 8  },
        { id: 'block_ip',               label: 'Block IP',        icon: '🚫', description: 'Blacklist attacker IP',      color: '#0080ff', cooldown: 5  },
        { id: 'enable_account_lockout', label: 'Account Lockout', icon: '🔒', description: 'Lock after failed attempts', color: '#00aaff', cooldown: 12 },
        { id: 'deploy_captcha',         label: 'Deploy CAPTCHA',  icon: '🤖', description: 'Block automated attempts',   color: '#00ccaa', cooldown: 10 },
      ],
      sql_injection:   [
        { id: 'implement_parameterized_queries', label: 'Param Queries', icon: '🔧', description: 'Use prepared statements',   color: '#00d4ff', cooldown: 15 },
        { id: 'sanitize_input',                  label: 'Sanitize Input', icon: '🧹', description: 'Strip malicious chars',    color: '#0080ff', cooldown: 8  },
        { id: 'implement_error_handling',        label: 'Hide Errors',   icon: '🙈', description: 'Suppress DB error msgs',   color: '#00aaff', cooldown: 10 },
        { id: 'db_firewall',                     label: 'DB Firewall',   icon: '🛡', description: 'Block suspicious queries', color: '#00ccaa', cooldown: 12 },
      ],
      xss:             [
        { id: 'implement_output_encoding', label: 'Encode Output', icon: '🔧', description: 'HTML-escape all output',       color: '#00d4ff', cooldown: 10 },
        { id: 'implement_csp',             label: 'Add CSP',       icon: '🛡', description: 'Content Security Policy',      color: '#0080ff', cooldown: 12 },
        { id: 'sanitize_html',             label: 'Sanitize HTML', icon: '🧹', description: 'Strip script tags',            color: '#00aaff', cooldown: 8  },
        { id: 'safe_dom_methods',          label: 'Safe DOM',      icon: '🌐', description: 'Use textContent not innerHTML', color: '#00ccaa', cooldown: 10 },
      ],
      phishing:        [
        { id: 'verify_sender_domain', label: 'Verify Sender', icon: '✉️', description: 'Check domain authenticity',  color: '#00d4ff', cooldown: 5  },
        { id: 'check_spf_dmarc',      label: 'Check DMARC',   icon: '🔍', description: 'Verify SPF/DKIM/DMARC',     color: '#0080ff', cooldown: 8  },
        { id: 'scan_url',             label: 'Scan URLs',     icon: '🔗', description: 'Check links for malware',   color: '#00aaff', cooldown: 6  },
        { id: 'block_domain',         label: 'Block Domain',  icon: '🚫', description: 'Blacklist phishing domain', color: '#00ccaa', cooldown: 10 },
      ],
      jwt_manipulation:[
        { id: 'validate_signature',   label: 'Verify Sig',    icon: '✅', description: 'Validate JWT signature', color: '#00d4ff', cooldown: 8  },
        { id: 'verify_token',         label: 'Verify Token',  icon: '🎫', description: 'Full token verification', color: '#0080ff', cooldown: 6  },
        { id: 'rotate_secret_key',    label: 'Rotate Secret', icon: '🔄', description: 'Rotate signing secret',   color: '#00aaff', cooldown: 15 },
        { id: 'strengthen_algorithm', label: 'Strong Algo',   icon: '💪', description: 'Enforce HS256 minimum',   color: '#00ccaa', cooldown: 10 },
      ],
      network_anomaly: [
        { id: 'block_ip',                label: 'Block IP',     icon: '🚫', description: 'Blacklist attacker IPs',    color: '#00d4ff', cooldown: 5  },
        { id: 'enable_ids',              label: 'Enable IDS',   icon: '👁', description: 'Intrusion detection',      color: '#0080ff', cooldown: 12 },
        { id: 'enable_ddos_protection',  label: 'DDoS Shield',  icon: '🛡', description: 'Activate DDoS mitigation', color: '#00aaff', cooldown: 15 },
        { id: 'implement_rate_limiting', label: 'Rate Limit',   icon: '⏱', description: 'Throttle suspicious traffic', color: '#00ccaa', cooldown: 8 },
      ],
    };

    return {
      attacker: attackerActions[scenario.type] ?? [],
      defender: defenderActions[scenario.type] ?? [],
    };
  }

  public shutdown(): void {
    if (this.gameUpdateInterval) clearInterval(this.gameUpdateInterval);
    this.activeGames.clear();
    this.userGameMap.clear();
    this.matchmakingQueue = [];
  }
}