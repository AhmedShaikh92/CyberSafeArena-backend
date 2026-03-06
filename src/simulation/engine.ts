import type { GameAction, SimulationEvent, IGameScenario, ITeamAction } from '../types/index';
import { config } from '../config/index';

export interface SimulationState {
  scenarioType: IGameScenario['type'];
  timeElapsed: number;
  vulnerabilitiesFound: Set<string>;
  vulnerabilitiesExploited: Set<string>;
  teamActions: Map<string, ITeamAction[]>;
  events: SimulationEvent[];
  systemState: Record<string, unknown>;
  active: boolean;
}

export class SimulationEngine {
  private state: SimulationState;
  private scenario: IGameScenario;
  private startTime: number;
  private readonly vulnerabilityConfigs: Record<string, {
    discoveryTime: number;
    revealHint: string;
    exploitCheck: (action: GameAction) => boolean;
  }>;
  private readonly attackExploitConfigs: Record<string, string[]>;

  constructor(scenario: IGameScenario) {
    this.scenario  = scenario;
    this.startTime = Date.now();
    this.state = {
      scenarioType:             scenario.type,
      timeElapsed:              0,
      vulnerabilitiesFound:     new Set(),
      vulnerabilitiesExploited: new Set(),
      teamActions:              new Map(),
      events:                   [],
      systemState:              this.initializeSystemState(),
      active:                   true,
    };
    this.vulnerabilityConfigs  = this.createVulnerabilityConfigs();
    this.attackExploitConfigs  = this.createAttackExploitConfigs();
  }

  // ─── System state init ────────────────────────────────────────────────────

  private initializeSystemState(): Record<string, unknown> {
    const base = { securityScore: 100, threatsDetected: 0, alertsTriggered: 0, systemHealth: 100 };
    switch (this.scenario.type) {
      case 'brute_force':
        return { ...base, failedLogins: 0, loginAttempts: 0, blockedIPs: [], rateLimitEnabled: false };
      case 'sql_injection':
        return { ...base, queryCount: 0, maliciousQueries: 0, dbHealthScore: 100, inputValidationEnabled: false };
      case 'xss':
        return { ...base, unsanitizedInputs: 5, cssPolicyEnabled: false, scriptExecutions: 0 };
      case 'phishing':
        return { ...base, suspiciousEmails: 0, blockedEmails: 0, userCredentialsRisk: 'high' };
      case 'jwt_manipulation':
        return { ...base, invalidTokenAttempts: 0, tokenValidationEnabled: false, roleClaimsVerified: false };
      case 'network_anomaly':
        return { ...base, incomingPackets: 0, anomalousTraffic: 0, ddosProtectionActive: false };
      default:
        return base;
    }
  }

  // ─── Defender vuln configs ────────────────────────────────────────────────

  private createVulnerabilityConfigs(): Record<string, {
    discoveryTime: number;
    revealHint: string;
    exploitCheck: (a: GameAction) => boolean;
  }> {
    const c: Record<string, { discoveryTime: number; revealHint: string; exploitCheck: (a: GameAction) => boolean }> = {};
    const r = config.simulation.vulnerabilityReveals;

    switch (this.scenario.type) {
      case 'brute_force':
        c['high_login_attempts'] = { discoveryTime: r,        revealHint: 'Multiple login failures from single source', exploitCheck: (a) => a.type === 'implement_rate_limiting' || a.type === 'block_ip' };
        c['no_account_lockout']  = { discoveryTime: r + 5000, revealHint: 'No account lockout policy',                  exploitCheck: (a) => a.type === 'enable_account_lockout' };
        break;
      case 'sql_injection':
        c['unvalidated_input'] = { discoveryTime: r,        revealHint: 'Input concatenated directly into SQL',   exploitCheck: (a) => a.type === 'implement_parameterized_queries' || a.type === 'sanitize_input' };
        c['error_disclosure']  = { discoveryTime: r + 5000, revealHint: 'DB error messages leak schema info',     exploitCheck: (a) => a.type === 'implement_error_handling' };
        break;
      case 'xss':
        c['unescaped_output'] = { discoveryTime: r,        revealHint: 'User input rendered without HTML escaping', exploitCheck: (a) => a.type === 'implement_output_encoding' || a.type === 'sanitize_html' };
        c['missing_csp']      = { discoveryTime: r + 5000, revealHint: 'No Content Security Policy headers',        exploitCheck: (a) => a.type === 'implement_csp' };
        break;
      case 'phishing':
        c['spoofed_sender'] = { discoveryTime: r,        revealHint: 'Sender domain does not match company',   exploitCheck: (a) => a.type === 'verify_sender_domain' || a.type === 'check_spf_dmarc' };
        c['malicious_link'] = { discoveryTime: r + 5000, revealHint: 'URL in email points to phishing domain', exploitCheck: (a) => a.type === 'scan_url' || a.type === 'block_domain' };
        break;
      case 'jwt_manipulation':
        c['unsigned_token'] = { discoveryTime: r,        revealHint: 'JWT signature not validated',       exploitCheck: (a) => a.type === 'validate_signature' || a.type === 'verify_token' };
        c['weak_secret']    = { discoveryTime: r + 5000, revealHint: 'JWT uses weak or known secret key', exploitCheck: (a) => a.type === 'rotate_secret_key'  || a.type === 'strengthen_algorithm' };
        break;
      case 'network_anomaly':
        c['port_scanning']     = { discoveryTime: r,        revealHint: 'Unusual port scan activity detected',       exploitCheck: (a) => a.type === 'block_ip' || a.type === 'enable_ids' };
        c['excessive_traffic'] = { discoveryTime: r + 5000, revealHint: 'DDoS attack — spike in incoming traffic',   exploitCheck: (a) => a.type === 'enable_ddos_protection' || a.type === 'implement_rate_limiting' };
        break;
    }
    return c;
  }

  // ─── Attacker exploit configs ─────────────────────────────────────────────
  // Maps atk_* action IDs → which vuln names they can exploit if unpatched.

  private createAttackExploitConfigs(): Record<string, string[]> {
    switch (this.scenario.type) {
      case 'brute_force':
        return {
          atk_credential_stuff: ['high_login_attempts'],
          atk_brute_login:      ['high_login_attempts'],
          atk_bypass_lockout:   ['no_account_lockout'],
          atk_distributed:      ['high_login_attempts', 'no_account_lockout'],
        };
      case 'sql_injection':
        return {
          atk_inject_query:  ['unvalidated_input'],
          atk_bypass_filter: ['unvalidated_input'],
          atk_leak_schema:   ['error_disclosure'],
          atk_blind_inject:  ['unvalidated_input', 'error_disclosure'],
        };
      case 'xss':
        return {
          atk_script_inject: ['unescaped_output'],
          atk_dom_exploit:   ['unescaped_output'],
          atk_bypass_csp:    ['missing_csp'],
          atk_event_handler: ['unescaped_output', 'missing_csp'],
        };
      case 'phishing':
        return {
          atk_spoof_domain: ['spoofed_sender'],
          atk_bypass_auth:  ['spoofed_sender'],
          atk_fake_link:    ['malicious_link'],
          atk_clone_site:   ['malicious_link', 'spoofed_sender'],
        };
      case 'jwt_manipulation':
        return {
          atk_forge_token:  ['unsigned_token'],
          atk_none_algo:    ['unsigned_token'],
          atk_crack_secret: ['weak_secret'],
          atk_claim_inject: ['unsigned_token', 'weak_secret'],
        };
      case 'network_anomaly':
        return {
          atk_port_scan:  ['port_scanning'],
          atk_ddos_wave:  ['excessive_traffic'],
          atk_amplify:    ['excessive_traffic'],
          atk_exfiltrate: ['port_scanning', 'excessive_traffic'],
        };
      default:
        return {};
    }
  }

  // ─── Action processing ────────────────────────────────────────────────────

  public processAction(
    userId: string,
    action: GameAction,
    role: 'red_team' | 'blue_team' = 'blue_team',
  ): { success: boolean; message: string; eventGenerated?: SimulationEvent } {
    if (!this.state.active) return { success: false, message: 'Simulation is not active' };

    if (!this.state.teamActions.has(userId)) this.state.teamActions.set(userId, []);
    const teamActions = this.state.teamActions.get(userId)!;
    const uniqueTs    = Date.now();

    const teamAction: ITeamAction = {
      userId,
      timestamp: Date.now() - this.startTime,
      action:    action.type,
      result:    'neutral',
      details:   action.payload,
    };

    let isCorrect = false;

    if (role === 'blue_team') {
      // Defender: check if action patches a vulnerability
      for (const [vulnName, cfg] of Object.entries(this.vulnerabilityConfigs)) {
        if (cfg.exploitCheck(action)) {
          isCorrect = true;
          this.state.vulnerabilitiesFound.add(vulnName);
          teamAction.result = 'success';
          this._mutateSystemStateOnDefense(action.type);
          this.state.events.push({
            type:            'defense_triggered',
            severity:        'high',
            message:         `[DEFENSE] ${action.type.replace(/_/g, ' ')} — "${vulnName}" patched`,
            affectedSystems: this.scenario.environment.protections,
            timestamp:       uniqueTs,
          });
          break;
        }
      }
      if (!isCorrect) {
        teamAction.result = 'failed';
        (this.state.systemState as any).alertsTriggered = ((this.state.systemState as any).alertsTriggered ?? 0) + 1;
        this.state.events.push({
          type:            'attack_detected',
          severity:        'medium',
          message:         `[DEFENSE] ${action.type.replace(/_/g, ' ')} — no matching vulnerability`,
          affectedSystems: [this.scenario.environment.targetSystem],
          timestamp:       uniqueTs,
        });
      }
    } else {
      // Attacker: try to exploit unpatched vulnerabilities
      const targetVulns = this.attackExploitConfigs[action.type] ?? [];
      let exploited = false;

      for (const vulnName of targetVulns) {
        if (!this.state.vulnerabilitiesFound.has(vulnName)) {
          this.state.vulnerabilitiesExploited.add(vulnName);
          exploited = true;
        }
      }

      this._mutateSystemStateOnAttack(action.type);
      teamAction.result = exploited ? 'success' : 'failed';

      const label = action.type.replace(/^atk_/, '').replace(/_/g, ' ');
      this.state.events.push({
        type:            'attack_detected',
        severity:        exploited ? 'critical' : 'high',
        message:         exploited
          ? `[ATTACK] ${label} — EXPLOIT SUCCESS`
          : `[ATTACK] ${label} — blocked or already patched`,
        affectedSystems: [this.scenario.environment.targetSystem],
        timestamp:       uniqueTs,
      });
    }

    teamActions.push(teamAction);

    return {
      success:  isCorrect || (role === 'red_team' && (this.attackExploitConfigs[action.type] ?? []).some(v => this.state.vulnerabilitiesExploited.has(v))),
      message:  role === 'blue_team'
        ? (isCorrect ? `Patched by ${action.type}` : `No match: ${action.type}`)
        : `Attack: ${action.type}`,
      eventGenerated: {
        type:            (role === 'blue_team' && isCorrect) ? 'defense_triggered' : 'attack_detected',
        severity:        (role === 'blue_team' && isCorrect) ? 'low' : 'high',
        message:         (role === 'blue_team' && isCorrect)
          ? `[DEFENSE] ${action.type.replace(/_/g, ' ')} — threat mitigated`
          : `[ATTACK] ${action.type.replace(/^atk_/, '').replace(/_/g, ' ')}`,
        affectedSystems: [this.scenario.environment.targetSystem],
        timestamp:       uniqueTs,
      },
    };
  }

  // ─── System state mutations ───────────────────────────────────────────────

  private _mutateSystemStateOnAttack(actionType: string): void {
    const s = this.state.systemState as any;
    s.threatsDetected = (s.threatsDetected ?? 0) + 1;
    s.securityScore   = Math.max(0, (s.securityScore ?? 100) - 8);
    s.systemHealth    = Math.max(0, (s.systemHealth  ?? 100) - 5);
    switch (this.scenario.type) {
      case 'brute_force':
        s.loginAttempts = (s.loginAttempts ?? 0) + 1;
        s.failedLogins  = (s.failedLogins  ?? 0) + 1;
        break;
      case 'sql_injection':
        s.maliciousQueries = (s.maliciousQueries ?? 0) + 1;
        s.queryCount       = (s.queryCount       ?? 0) + 1;
        s.dbHealthScore    = Math.max(0, (s.dbHealthScore ?? 100) - 10);
        break;
      case 'xss':
        s.scriptExecutions  = (s.scriptExecutions  ?? 0) + 1;
        s.unsanitizedInputs = Math.min(20, (s.unsanitizedInputs ?? 5) + 2);
        break;
      case 'phishing':
        s.suspiciousEmails = (s.suspiciousEmails ?? 0) + 1;
        break;
      case 'jwt_manipulation':
        s.invalidTokenAttempts = (s.invalidTokenAttempts ?? 0) + 1;
        break;
      case 'network_anomaly':
        s.incomingPackets  = (s.incomingPackets  ?? 0) + 500;
        s.anomalousTraffic = (s.anomalousTraffic ?? 0) + 1;
        break;
    }
  }

  private _mutateSystemStateOnDefense(actionType: string): void {
    const s = this.state.systemState as any;
    s.securityScore = Math.min(100, (s.securityScore ?? 100) + 15);
    s.systemHealth  = Math.min(100, (s.systemHealth  ?? 100) + 10);
    switch (this.scenario.type) {
      case 'brute_force':
        if (actionType === 'implement_rate_limiting') s.rateLimitEnabled = true;
        if (actionType === 'block_ip') s.blockedIPs = [...(s.blockedIPs ?? []), `192.168.${Math.floor(Math.random() * 255)}.1`];
        break;
      case 'sql_injection':
        if (actionType === 'implement_parameterized_queries' || actionType === 'sanitize_input') s.inputValidationEnabled = true;
        s.dbHealthScore = Math.min(100, (s.dbHealthScore ?? 100) + 20);
        break;
      case 'xss':
        if (actionType === 'implement_csp') s.cssPolicyEnabled = true;
        s.unsanitizedInputs = Math.max(0, (s.unsanitizedInputs ?? 5) - 3);
        break;
      case 'phishing':
        s.blockedEmails = (s.blockedEmails ?? 0) + 1;
        break;
      case 'jwt_manipulation':
        if (actionType === 'validate_signature' || actionType === 'verify_token') s.tokenValidationEnabled = true;
        if (actionType === 'rotate_secret_key'  || actionType === 'strengthen_algorithm') s.roleClaimsVerified = true;
        break;
      case 'network_anomaly':
        if (actionType === 'enable_ddos_protection') s.ddosProtectionActive = true;
        s.anomalousTraffic = Math.max(0, (s.anomalousTraffic ?? 0) - 1);
        break;
    }
  }

  // ─── Periodic update ──────────────────────────────────────────────────────

  public update(deltaTime: number): void {
    this.state.timeElapsed += deltaTime;
    if (this.state.timeElapsed >= this.scenario.timeLimit) this.state.active = false;
    if (this.state.timeElapsed % 5000 < 1100) this.simulateAttack();
    this.revealVulnerabilities();
  }

  public simulateAttack(attackType?: string): SimulationEvent {
    const s = this.state.systemState as any;
    s.threatsDetected = (s.threatsDetected ?? 0) + 1;
    s.alertsTriggered = (s.alertsTriggered ?? 0) + 1;
    s.securityScore   = Math.max(0, (s.securityScore ?? 100) - 3);
    const event: SimulationEvent = {
      type:            'attack_detected',
      severity:        Math.random() > 0.5 ? 'high' : 'critical',
      message:         `[AUTO] ${attackType || 'Automated threat'} detected on ${this.scenario.environment.targetSystem}`,
      affectedSystems: [this.scenario.environment.targetSystem],
      timestamp:       Date.now(),
    };
    this.state.events.push(event);
    return event;
  }

  public revealVulnerabilities(): string[] {
    const currentTime = Date.now() - this.startTime;
    const revealed: string[] = [];
    for (const [vulnName, cfg] of Object.entries(this.vulnerabilityConfigs)) {
      if (currentTime >= cfg.discoveryTime && !this.state.vulnerabilitiesFound.has(vulnName)) {
        revealed.push(vulnName);
        this.state.events.push({
          type:            'vulnerability_exposed',
          severity:        'high',
          message:         `[VULN] ${cfg.revealHint}`,
          affectedSystems: [this.scenario.environment.targetSystem],
          timestamp:       Date.now(),
        });
      }
    }
    return revealed;
  }

  // ─── Scoring ──────────────────────────────────────────────────────────────

  public getScore(userId: string, role: 'red_team' | 'blue_team'): number {
    const userActions    = this.state.teamActions.get(userId) ?? [];
    const totalCount     = userActions.length;
    const successCount   = userActions.filter((a) => a.result === 'success').length;
    const vulnsFound     = this.state.vulnerabilitiesFound.size;
    const vulnsExploited = this.state.vulnerabilitiesExploited.size;
    const timeFactor     = Math.max(0, 1 - this.state.timeElapsed / this.scenario.timeLimit);

    if (role === 'blue_team') {
      const patchScore    = vulnsFound * 30;
      const blockBonus    = vulnsExploited === 0 ? 20 : 0;
      const accuracyScore = totalCount > 0 ? (successCount / totalCount) * 20 : 0;
      const timeBonus     = timeFactor * 10;
      return Math.min(100, Math.round(patchScore + blockBonus + accuracyScore + timeBonus));
    } else {
      const exploitScore  = vulnsExploited * 35;
      const pressureScore = Math.min(20, totalCount * 3);
      const timeBonus     = (1 - timeFactor) * 10;
      return Math.min(100, Math.round(exploitScore + pressureScore + timeBonus));
    }
  }

  public getState(): SimulationState { return { ...this.state }; }
  public end(): void                 { this.state.active = false; }
  public isActive(): boolean         { return this.state.active; }
}