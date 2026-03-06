import type { ITacticalBriefing, IGameScenario } from '../types/index';

interface BriefingTemplates {
  [key: string]: {
    red_team: Pick<ITacticalBriefing, 'briefPoints' | 'keyStrategies' | 'commonMistakes'>;
    blue_team: Pick<ITacticalBriefing, 'briefPoints' | 'keyStrategies' | 'commonMistakes'>;
  };
}

const briefingTemplates: BriefingTemplates = {
  brute_force: {
    red_team: {
      briefPoints: [
        'Target: Login portal with weak rate limiting',
        'Strategy: Use distributed IPs to bypass basic blocks',
        'Goal: Gain access within 5 minutes',
      ],
      keyStrategies: [
        'Start with common password list (admin/12345)',
        'Distribute requests across proxy network',
        'Monitor for account lockout triggers',
        'Use timing delays to avoid detection',
      ],
      commonMistakes: [
        'Using same IP repeatedly - gets blacklisted',
        'Too fast requests - triggers immediate alerts',
        'Not monitoring for lockout - wastes time',
        'Using obvious credentials first',
      ],
    },
    blue_team: {
      briefPoints: [
        'Defend: Authentication portal against credential guessing',
        'Priority: Identify and stop attack within 2 minutes',
        'Win condition: Attacker blocked before successful login',
      ],
      keyStrategies: [
        'Monitor failed login patterns in real-time',
        'Implement progressive account lockout',
        'Block suspicious IP ranges immediately',
        'Enable CAPTCHA after failed attempts',
      ],
      commonMistakes: [
        'Reacting too slowly - attacker gains access',
        'Being too aggressive - locks out legitimate users',
        'Ignoring geographic anomalies',
        'Not correlating failed logins across systems',
      ],
    },
  },

  sql_injection: {
    red_team: {
      briefPoints: [
        'Target: Product search with unvalidated input',
        'Goal: Extract sensitive data or escalate privileges',
        'Time limit: 5 minutes',
      ],
      keyStrategies: [
        "Test input fields with basic SQL syntax: ' or 1=1--",
        'Use union-based attacks to extract data',
        'Check for error messages revealing schema',
        'Try time-based blind SQL injection if errors hidden',
      ],
      commonMistakes: [
        'Giving up after first attempt fails',
        'Not trying multiple injection points',
        'Not analyzing error messages for clues',
        'Assuming no vulnerabilities exist',
      ],
    },
    blue_team: {
      briefPoints: [
        'Defend: Database queries against injection attacks',
        'Priority: Prevent data extraction within 2 minutes',
        'Win condition: All injection attempts blocked',
      ],
      keyStrategies: [
        'Replace string concatenation with parameterized queries',
        'Implement strict input validation rules',
        'Hide database error messages from users',
        'Set principle of least privilege for DB accounts',
      ],
      commonMistakes: [
        'Only filtering common keywords (bypassed easily)',
        'Trusting client-side validation',
        'Using whitelists that are too strict',
        'Not testing with real injection payloads',
      ],
    },
  },

  xss: {
    red_team: {
      briefPoints: [
        'Target: Comment system rendering user input',
        'Goal: Execute JavaScript in victim browsers',
        'Time limit: 5 minutes',
      ],
      keyStrategies: [
        'Test with simple script tags: <script>alert(1)</script>',
        'Try event handlers: <img src=x onerror=alert(1)>',
        'Use encoded payloads if quotes filtered',
        'Target stored XSS in user profiles (higher impact)',
      ],
      commonMistakes: [
        'Trying only one type of XSS payload',
        'Giving up if <script> is blocked',
        'Not considering stored vs reflected XSS',
        'Ignoring DOM-based injection vectors',
      ],
    },
    blue_team: {
      briefPoints: [
        'Defend: User input rendering against XSS',
        'Priority: Prevent script execution within 2 minutes',
        'Win condition: All payload types blocked',
      ],
      keyStrategies: [
        'HTML-escape all user output: & < > " \'',
        'Implement Content Security Policy headers',
        'Use safe DOM methods (textContent not innerHTML)',
        'Sanitize HTML if needed with libraries like DOMPurify',
      ],
      commonMistakes: [
        'Escaping the wrong characters',
        'CSP too permissive (allows unsafe-inline)',
        'Only fixing stored XSS, ignoring reflected',
        'Not testing with various encoding methods',
      ],
    },
  },

  phishing: {
    red_team: {
      briefPoints: [
        'Target: Company employees via email',
        'Goal: Trick users into revealing credentials',
        'Time limit: 5 minutes',
      ],
      keyStrategies: [
        'Spoof company domain (register similar domain)',
        'Create convincing email with company logos',
        'Add urgency: account verification, security alert',
        'Include link to fake login page',
      ],
      commonMistakes: [
        'Domain too obviously fake (missing letters)',
        'Email content contradicts company style',
        'Not researching targets first',
        'Obvious URL in link hover preview',
      ],
    },
    blue_team: {
      briefPoints: [
        'Defend: Employees from phishing attacks',
        'Priority: Identify and block malicious email within 2 minutes',
        'Win condition: Phishing email blocked before user clicks',
      ],
      keyStrategies: [
        'Verify sender domain matches company domain',
        'Check for DMARC/SPF/DKIM authentication failures',
        'Scan URLs for malicious content',
        'Implement email filtering rules for suspicious patterns',
      ],
      commonMistakes: [
        'Trusting sender name, not email address',
        'Assuming homograph attacks are impossible',
        'Filtering too aggressively (blocks legitimate mail)',
        'Not keeping threat intelligence updated',
      ],
    },
  },

  jwt_manipulation: {
    red_team: {
      briefPoints: [
        'Target: API authentication using JWT tokens',
        'Goal: Escalate privileges or forge admin token',
        'Time limit: 5 minutes',
      ],
      keyStrategies: [
        'Decode JWT to see claims and algorithm',
        'Try "none" algorithm to bypass verification',
        'Modify role claim if signature not verified',
        'Use known/weak secret to forge new token',
      ],
      commonMistakes: [
        'Not checking what algorithm is used',
        'Assuming algorithm verification works',
        'Not trying multiple secret variations',
        'Missing the alg:none edge case',
      ],
    },
    blue_team: {
      briefPoints: [
        'Defend: API tokens against manipulation',
        'Priority: Prevent role escalation within 2 minutes',
        'Win condition: All token manipulation attempts blocked',
      ],
      keyStrategies: [
        'Enforce strong algorithms (HS256 minimum)',
        'Reject "none" algorithm explicitly',
        'Validate all claims on every API call',
        'Implement token expiration and refresh cycles',
      ],
      commonMistakes: [
        'Accepting "none" algorithm',
        'Not validating all claims',
        'Using weak secrets (<32 bytes)',
        'Tokens never expire',
      ],
    },
  },

  network_anomaly: {
    red_team: {
      briefPoints: [
        'Target: Network infrastructure',
        'Goal: Disrupt service availability',
        'Time limit: 5 minutes',
      ],
      keyStrategies: [
        'Scan for open ports and services',
        'Identify weak points in network',
        'Generate traffic spike (DDoS simulation)',
        'Look for unencrypted protocols',
      ],
      commonMistakes: [
        'Scanning too aggressively (gets blocked)',
        'Not understanding traffic impact',
        'Ignoring redundancy in infrastructure',
        'Not timing attack strategically',
      ],
    },
    blue_team: {
      briefPoints: [
        'Defend: Network against anomalies and attacks',
        'Priority: Detect and mitigate within 2 minutes',
        'Win condition: Attack contained with minimal downtime',
      ],
      keyStrategies: [
        'Monitor network traffic baselines',
        'Implement DDoS mitigation (rate limiting, blackholes)',
        'Use IDS to detect scanning activity',
        'Segment network to limit lateral movement',
      ],
      commonMistakes: [
        'No baseline for normal traffic patterns',
        'DDoS mitigation too aggressive (blocks users)',
        'Not detecting scanning early enough',
        'Flat network architecture',
      ],
    },
  },
};

export function generateBriefing(
  scenario: IGameScenario,
  role: 'red_team' | 'blue_team'
): ITacticalBriefing {
  const template = briefingTemplates[scenario.type];

  if (!template) {
    throw new Error(`No briefing template for scenario type: ${scenario.type}`);
  }

  const roleTemplate = template[role];

  return {
    scenarioType: scenario.type,
    role,
    briefPoints: roleTemplate.briefPoints,
    keyStrategies: roleTemplate.keyStrategies,
    commonMistakes: roleTemplate.commonMistakes,
    timeToRead: 30000, // 30 seconds to read briefing
  };
}
