import type { IGameScenario } from '../types/index';

export const scenarios: Record<
  IGameScenario['type'],
  Record<IGameScenario['difficulty'], IGameScenario>
> = {
  brute_force: {
    easy: {
      type: 'brute_force',
      difficulty: 'easy',
      description: 'Defend against a basic brute force attack on a login portal',
      objectives: ['Block the attacker IP', 'Implement rate limiting', 'Enable account lockout'],
      timeLimit: 300000,
      environment: {
        targetSystem: 'Web Application Login Portal',
        vulnerability: 'No rate limiting on authentication attempts',
        protections: ['Basic firewall', 'Web server logs'],
      },
    },
    medium: {
      type: 'brute_force',
      difficulty: 'medium',
      description: 'Stop a distributed brute force attack from multiple IPs',
      objectives: [
        'Identify attack pattern',
        'Implement adaptive rate limiting',
        'Deploy CAPTCHA',
      ],
      timeLimit: 300000,
      environment: {
        targetSystem: 'Web Application Login Portal',
        vulnerability: 'Simple credential validation without protection',
        protections: ['WAF capability', 'IDS system', 'Log aggregation'],
      },
    },
    hard: {
      type: 'brute_force',
      difficulty: 'hard',
      description: 'Mitigate a sophisticated distributed attack with credential stuffing',
      objectives: [
        'Detect credential stuffing',
        'Implement behavioral analysis',
        'Enable multi-factor authentication',
      ],
      timeLimit: 300000,
      environment: {
        targetSystem: 'Enterprise Authentication System',
        vulnerability: 'Reused credentials from previous breaches',
        protections: ['Advanced WAF', 'ML-based detection', 'SIEM system'],
      },
    },
  },

  sql_injection: {
    easy: {
      type: 'sql_injection',
      difficulty: 'easy',
      description: 'Identify and patch a basic SQL injection vulnerability',
      objectives: ['Find the vulnerable input field', 'Sanitize the query', 'Validate inputs'],
      timeLimit: 300000,
      environment: {
        targetSystem: 'Product Search Database',
        vulnerability: 'User input directly concatenated into SQL queries',
        protections: ['Database access logs', 'Query execution logs'],
      },
    },
    medium: {
      type: 'sql_injection',
      difficulty: 'medium',
      description: 'Stop a multi-stage SQL injection attack',
      objectives: [
        'Detect the attack pattern',
        'Use parameterized queries',
        'Implement input validation',
      ],
      timeLimit: 300000,
      environment: {
        targetSystem: 'User Management System',
        vulnerability: 'Insufficient input validation and sanitization',
        protections: ['Query monitoring', 'Database firewall', 'Error handling'],
      },
    },
    hard: {
      type: 'sql_injection',
      difficulty: 'hard',
      description: 'Defend against a blind SQL injection with time-based exfiltration',
      objectives: [
        'Identify blind injection techniques',
        'Implement ORM or prepared statements',
        'Deploy database-level protection',
      ],
      timeLimit: 300000,
      environment: {
        targetSystem: 'Analytics Database Backend',
        vulnerability: 'Complex queries with partial user input',
        protections: ['Query complexity analysis', 'Database audit logs', 'WAF rules'],
      },
    },
  },

  xss: {
    easy: {
      type: 'xss',
      difficulty: 'easy',
      description: 'Stop a reflected cross-site scripting attack',
      objectives: [
        'Identify the XSS vector',
        'Implement output encoding',
        'Add Content Security Policy',
      ],
      timeLimit: 300000,
      environment: {
        targetSystem: 'Blog Comment System',
        vulnerability: 'User comments not properly escaped',
        protections: ['Browser dev tools', 'DOM inspection'],
      },
    },
    medium: {
      type: 'xss',
      difficulty: 'medium',
      description: 'Mitigate stored XSS in user profiles',
      objectives: [
        'Sanitize stored data',
        'Implement Content Security Policy',
        'Use HTML escaping libraries',
      ],
      timeLimit: 300000,
      environment: {
        targetSystem: 'Social Media Platform',
        vulnerability: 'Stored user data rendered without sanitization',
        protections: ['CSP headers', 'HTML sanitizer library'],
      },
    },
    hard: {
      type: 'xss',
      difficulty: 'hard',
      description: 'Defend against DOM-based XSS with event handler injection',
      objectives: [
        'Detect DOM manipulation exploits',
        'Implement strict CSP',
        'Use safe DOM methods',
      ],
      timeLimit: 300000,
      environment: {
        targetSystem: 'Rich Text Editor',
        vulnerability: 'Unsafe DOM method usage in frontend JavaScript',
        protections: ['Browser security tools', 'CSP enforcement', 'DOM auditing'],
      },
    },
  },

  phishing: {
    easy: {
      type: 'phishing',
      difficulty: 'easy',
      description: 'Identify obvious phishing attempts in email',
      objectives: [
        'Spot suspicious sender',
        'Identify fake links',
        'Block malicious domains',
      ],
      timeLimit: 300000,
      environment: {
        targetSystem: 'Company Email Gateway',
        vulnerability: 'Employees vulnerable to social engineering',
        protections: ['Email filtering', 'Link scanning', 'User awareness'],
      },
    },
    medium: {
      type: 'phishing',
      difficulty: 'medium',
      description: 'Detect sophisticated spear phishing targeting executives',
      objectives: [
        'Analyze sender reputation',
        'Verify business context',
        'Check email headers',
      ],
      timeLimit: 300000,
      environment: {
        targetSystem: 'Enterprise Email System',
        vulnerability: 'Targeted spear phishing with company research',
        protections: ['Advanced email filtering', 'DMARC/SPF verification', 'User training'],
      },
    },
    hard: {
      type: 'phishing',
      difficulty: 'hard',
      description: 'Stop a business email compromise attack with domain spoofing',
      objectives: [
        'Detect homograph attacks',
        'Implement email authentication',
        'Enable 2FA enforcement',
      ],
      timeLimit: 300000,
      environment: {
        targetSystem: 'Critical Business Email',
        vulnerability: 'Domain spoofing and compromised email account',
        protections: ['Advanced threat protection', 'Email authentication', 'MFA policy'],
      },
    },
  },

  jwt_manipulation: {
    easy: {
      type: 'jwt_manipulation',
      difficulty: 'easy',
      description: 'Identify and stop unsigned JWT token manipulation',
      objectives: [
        'Verify token signature',
        'Validate token claims',
        'Implement proper token verification',
      ],
      timeLimit: 300000,
      environment: {
        targetSystem: 'API Authentication Layer',
        vulnerability: 'JWT tokens not properly validated',
        protections: ['Token inspection tools', 'JWT library with validation'],
      },
    },
    medium: {
      type: 'jwt_manipulation',
      difficulty: 'medium',
      description: 'Stop role escalation through JWT claim manipulation',
      objectives: [
        'Detect forged claims',
        'Implement claim validation',
        'Use strong signature algorithms',
      ],
      timeLimit: 300000,
      environment: {
        targetSystem: 'Microservices API Gateway',
        vulnerability: 'Role claims not validated on backend',
        protections: ['Token inspection', 'Claim validation middleware'],
      },
    },
    hard: {
      type: 'jwt_manipulation',
      difficulty: 'hard',
      description: 'Defend against algorithm confusion attacks on JWTs',
      objectives: [
        'Enforce strong algorithms',
        'Validate algorithm header',
        'Implement key pinning',
      ],
      timeLimit: 300000,
      environment: {
        targetSystem: 'High-Security API',
        vulnerability: 'Algorithm negotiation vulnerability (alg: none)',
        protections: ['Strong algorithm enforcement', 'Key rotation', 'Token blacklist'],
      },
    },
  },

  network_anomaly: {
    easy: {
      type: 'network_anomaly',
      difficulty: 'easy',
      description: 'Detect port scanning activity on your network',
      objectives: [
        'Identify scanning patterns',
        'Block suspicious IPs',
        'Harden open ports',
      ],
      timeLimit: 300000,
      environment: {
        targetSystem: 'Corporate Network',
        vulnerability: 'Unnecessary open ports and no rate limiting',
        protections: ['Network monitoring', 'Firewall logs', 'IDS alerts'],
      },
    },
    medium: {
      type: 'network_anomaly',
      difficulty: 'medium',
      description: 'Stop a DDoS attack on critical services',
      objectives: [
        'Identify attack traffic',
        'Implement traffic shaping',
        'Deploy DDoS mitigation',
      ],
      timeLimit: 300000,
      environment: {
        targetSystem: 'Web Server Infrastructure',
        vulnerability: 'No DDoS protection mechanisms',
        protections: ['Load balancer', 'Traffic analysis tools', 'Cloud DDoS service'],
      },
    },
    hard: {
      type: 'network_anomaly',
      difficulty: 'hard',
      description: 'Respond to a multi-vector attack with exfiltration',
      objectives: [
        'Detect all attack vectors',
        'Block exfiltration channels',
        'Implement segmentation',
      ],
      timeLimit: 300000,
      environment: {
        targetSystem: 'Critical Infrastructure Network',
        vulnerability: 'Lack of network segmentation and monitoring',
        protections: ['Advanced SIEM', 'Network segmentation', 'Data loss prevention'],
      },
    },
  },
};

export function getRandomScenario(difficulty?: IGameScenario['difficulty']): IGameScenario {
  const scenarioTypes = Object.keys(scenarios) as IGameScenario['type'][];
  const randomType = scenarioTypes[Math.floor(Math.random() * scenarioTypes.length)];
  const difficultyLevel = difficulty || (['easy', 'medium', 'hard'] as const)[
    Math.floor(Math.random() * 3)
  ];

  return scenarios[randomType][difficultyLevel];
}

export function getScenario(
  type: IGameScenario['type'],
  difficulty: IGameScenario['difficulty']
): IGameScenario {
  return scenarios[type][difficulty];
}
