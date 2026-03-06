import { SimulationEngine } from '../simulation/engine';
import type {
  IAfterActionReview,
  IPlayerAAR,
  IImprovementArea,
  ITeamAction,
  IGameScenario,
} from '../types/index';

const EXPECTED_VULNERABILITIES: Record<IGameScenario['type'], string[]> = {
  brute_force:      ['high_login_attempts', 'no_account_lockout'],
  sql_injection:    ['unvalidated_input',   'error_disclosure'],
  xss:              ['unescaped_output',     'missing_csp'],
  phishing:         ['spoofed_sender',       'malicious_link'],
  jwt_manipulation: ['unsigned_token',       'weak_secret'],
  network_anomaly:  ['port_scanning',        'excessive_traffic'],
};

export class AARService {
  public generateAAR(
    gameId:            string,
    scenario:          IGameScenario,
    redPlayerId:       string,
    bluePlayerId:      string,
    redPlayerActions:  ITeamAction[],
    bluePlayerActions: ITeamAction[],
    engine:            SimulationEngine,
  ): IAfterActionReview {
    const redPlayerSummary  = this._generatePlayerAAR('red_team',  redPlayerId,  redPlayerActions,  engine, scenario);
    const bluePlayerSummary = this._generatePlayerAAR('blue_team', bluePlayerId, bluePlayerActions, engine, scenario);

    return {
      gameId,
      redPlayerSummary,
      bluePlayerSummary,
      keyInsights:      this._generateKeyInsights(scenario, redPlayerSummary, bluePlayerSummary, engine.getState().vulnerabilitiesFound),
      improvementAreas: this._generateImprovementAreas(scenario, bluePlayerSummary),
      createdAt: new Date(),
    };
  }

  private _generatePlayerAAR(
    role:     'red_team' | 'blue_team',
    userId:   string,
    actions:  ITeamAction[],
    engine:   SimulationEngine,
    scenario: IGameScenario,
  ): IPlayerAAR {
    const total       = actions.length;
    const successful  = actions.filter((a) => a.result === 'success').length;
    const successRate = total > 0 ? (successful / total) * 100 : 0;

    const actionTimeline = [...actions]
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(0, 10)
      .map((a) => ({ time: a.timestamp, action: a.action }));

    const state      = engine.getState();
    const identified = Array.from(state.vulnerabilitiesFound);
    const exploited  = Array.from(state.vulnerabilitiesExploited);
    const expected   = EXPECTED_VULNERABILITIES[scenario.type] ?? [];
    const missed     = expected.filter((v) => !state.vulnerabilitiesFound.has(v));

    return {
      role,
      performanceScore: engine.getScore(userId, role),  // ← pass both userId and role
      actions:     total,
      successRate: Math.round(successRate * 100) / 100,
      timing: {
        averageResponseTime: total > 0
          ? actions.reduce((sum, a) => sum + a.timestamp, 0) / total
          : 0,
        actionTimeline,
      },
      vulnerabilityAnalysis: { exploited, identified, missed },
    };
  }

  private _generateKeyInsights(
    scenario:   IGameScenario,
    redPlayer:  IPlayerAAR,
    bluePlayer: IPlayerAAR,
    vulnsFound: Set<string>,
  ): string[] {
    const insights: string[] = [];

    if (bluePlayer.performanceScore > redPlayer.performanceScore) {
      insights.push(`Blue Team secured the system (${bluePlayer.performanceScore} pts vs Red's ${redPlayer.performanceScore})`);
    } else if (redPlayer.performanceScore > bluePlayer.performanceScore) {
      insights.push(`Red Team successfully demonstrated the vulnerabilities (${redPlayer.performanceScore} pts)`);
    } else {
      insights.push('Both players demonstrated equally strong tactical performance');
    }

    if (bluePlayer.timing.averageResponseTime < 10000) {
      insights.push('Blue Team responded to threats with impressive speed');
    } else if (bluePlayer.timing.averageResponseTime > 30000) {
      insights.push('Blue Team had slow response times — consider faster threat detection');
    }

    const totalExpected = (EXPECTED_VULNERABILITIES[scenario.type] ?? []).length;
    if (bluePlayer.vulnerabilityAnalysis.identified.length === 0) {
      insights.push('Blue Team missed all vulnerabilities — more security awareness needed');
    } else if (bluePlayer.vulnerabilityAnalysis.identified.length >= totalExpected) {
      insights.push('Perfect vulnerability coverage by Blue Team');
    }

    insights.push(this._getScenarioInsight(scenario, redPlayer, bluePlayer));
    return insights;
  }

  private _getScenarioInsight(
    scenario:  IGameScenario,
    redPlayer: IPlayerAAR,
    bluePlayer: IPlayerAAR,
  ): string {
    switch (scenario.type) {
      case 'brute_force':
        return bluePlayer.vulnerabilityAnalysis.identified.length > 0
          ? 'Blue Team successfully identified brute force patterns'
          : 'No rate limiting or account lockout was implemented';
      case 'sql_injection':
        return bluePlayer.vulnerabilityAnalysis.identified.length > 0
          ? 'Parameterized queries would have prevented this attack'
          : 'SQL injection remains a critical threat';
      case 'xss':
        return bluePlayer.vulnerabilityAnalysis.identified.length > 0
          ? 'Output encoding and CSP successfully mitigated XSS'
          : 'HTML escaping is essential for user input rendering';
      case 'phishing':
        return redPlayer.performanceScore > 0
          ? 'Phishing attempt successfully delivered'
          : 'Email authentication and user awareness prevented breach';
      case 'jwt_manipulation':
        return bluePlayer.vulnerabilityAnalysis.identified.length > 0
          ? 'Proper token validation prevented privilege escalation'
          : 'JWT secrets and algorithm validation are critical';
      case 'network_anomaly':
        return bluePlayer.vulnerabilityAnalysis.identified.length > 0
          ? 'Network segmentation and monitoring detected the attack'
          : 'DDoS protection requires layered defense strategy';
      default:
        return 'Scenario completed';
    }
  }

  private _generateImprovementAreas(
    scenario:   IGameScenario,
    bluePlayer: IPlayerAAR,
  ): IImprovementArea[] {
    const improvements: IImprovementArea[] = [];

    if (bluePlayer.timing.averageResponseTime > 15000) {
      improvements.push({
        title:          'Improve Response Time',
        description:    'Faster threat detection and response can prevent damage',
        recommendation: 'Implement automated alerting and response scripts to reduce manual response time',
        difficulty:     'medium',
      });
    }

    if (bluePlayer.vulnerabilityAnalysis.identified.length < 2) {
      improvements.push({
        title:          'Enhance Vulnerability Detection',
        description:    'Multiple vulnerabilities went undetected during the simulation',
        recommendation: 'Review security controls and implement comprehensive monitoring for all attack vectors',
        difficulty:     'hard',
      });
    }

    improvements.push(this._getScenarioImprovement(scenario));
    return improvements;
  }

  private _getScenarioImprovement(scenario: IGameScenario): IImprovementArea {
    switch (scenario.type) {
      case 'brute_force':
        return {
          title:          'Advanced Rate Limiting',
          description:    'Basic rate limiting can be bypassed with distributed attacks',
          recommendation: 'Implement adaptive rate limiting across IP, account, and geographic dimensions',
          difficulty:     'hard',
        };
      case 'sql_injection':
        return {
          title:          'Use ORM or Prepared Statements',
          description:    'String concatenation makes SQL injection trivial',
          recommendation: 'Always use parameterized queries or an ORM that handles query building safely',
          difficulty:     'easy',
        };
      case 'xss':
        return {
          title:          'Content Security Policy',
          description:    'CSP headers provide an additional layer of XSS protection',
          recommendation: 'Implement strict CSP headers that restrict script sources and inline execution',
          difficulty:     'medium',
        };
      case 'phishing':
        return {
          title:          'Email Authentication (SPF / DKIM / DMARC)',
          description:    'Missing email authentication allows domain spoofing',
          recommendation: 'Implement SPF, DKIM, and DMARC and train users to recognise phishing indicators',
          difficulty:     'medium',
        };
      case 'jwt_manipulation':
        return {
          title:          'Token Rotation & Short Expiry',
          description:    'Long-lived tokens increase the window for manipulation',
          recommendation: 'Use short-lived access tokens with refresh token rotation',
          difficulty:     'medium',
        };
      case 'network_anomaly':
        return {
          title:          'Network Segmentation',
          description:    'Flat networks allow lateral movement after initial breach',
          recommendation: 'Segment the network into zones with controlled access and enhanced monitoring at boundaries',
          difficulty:     'hard',
        };
      default:
        return {
          title:          'Security Hardening',
          description:    'General security improvement recommendations',
          recommendation: 'Review all identified vulnerabilities and implement targeted fixes',
          difficulty:     'medium',
        };
    }
  }
}