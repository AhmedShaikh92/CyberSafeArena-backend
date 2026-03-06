import { User } from '../models/User';

// ─── Level Thresholds ───────────────────────────────────────────────────────
// Level 1 (Rookie)  :    0 XP
// Level 2 (Veteran) :  500 XP
// Level 3 (Elite)   : 1500 XP
const LEVEL_THRESHOLDS = [0, 500, 1500] as const;
const LEVEL_NAMES = ['Rookie', 'Veteran', 'Elite'] as const;

// XP awards
const XP = {
  WIN: 100,
  LOSS: 30,
  PERFORMANCE_BONUS: {
    EXCELLENT: 50, // score >= 80
    GOOD: 25,      // score >= 60
    AVERAGE: 10,   // score >= 40
  },
} as const;

export interface XPGain {
  baseXP: number;
  performanceBonus: number;
  totalXP: number;
  newLevel: 1 | 2 | 3;
  levelUp: boolean;
}

export class ProgressionService {
  // ─── Award XP after a match ──────────────────────────────────────────────
  public async awardXP(userId: string, performanceScore: number, result: 'win' | 'loss'): Promise<XPGain> {
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');

    const baseXP = result === 'win' ? XP.WIN : XP.LOSS;

    let performanceBonus = 0;
    if (performanceScore >= 80) {
      performanceBonus = XP.PERFORMANCE_BONUS.EXCELLENT;
    } else if (performanceScore >= 60) {
      performanceBonus = XP.PERFORMANCE_BONUS.GOOD;
    } else if (performanceScore >= 40) {
      performanceBonus = XP.PERFORMANCE_BONUS.AVERAGE;
    }

    const totalXP = baseXP + performanceBonus;

    const previousLevel = user.level as 1 | 2 | 3;

    user.xp += totalXP;
    const newRank = this.calculateRank(user.xp);
    user.rank = newRank;
    user.level = (newRank + 1) as 1 | 2 | 3;

    if (result === 'win') {
      user.wins += 1;
    } else {
      user.losses += 1;
    }
    user.gamesPlayed += 1;

    await user.save();

    return {
      baseXP,
      performanceBonus,
      totalXP,
      newLevel: user.level,
      levelUp: user.level > previousLevel,
    };
  }

  // ─── Update per-match stats ──────────────────────────────────────────────
  public async updateStats(
    userId: string,
    correctDefenses?: number,
    successfulAttacks?: number,
    vulnerabilitiesIdentified?: number
  ): Promise<void> {
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');

    if (correctDefenses !== undefined) user.stats.correctDefenses += correctDefenses;
    if (successfulAttacks !== undefined) user.stats.successfulAttacks += successfulAttacks;
    if (vulnerabilitiesIdentified !== undefined) user.stats.vulnerabilitiesIdentified += vulnerabilitiesIdentified;

    user.stats.totalSimulationsCompleted += 1;

    await user.save();
  }

  // ─── Internal helpers ────────────────────────────────────────────────────

  /** Returns rank index 0-2 based on XP */
  public calculateRank(xp: number): number {
    for (let rank = LEVEL_THRESHOLDS.length - 1; rank >= 0; rank--) {
      if (xp >= LEVEL_THRESHOLDS[rank]) return rank;
    }
    return 0;
  }

  /** Returns display level 1-3 based on XP */
  public calculateLevel(xp: number): 1 | 2 | 3 {
    return (this.calculateRank(xp) + 1) as 1 | 2 | 3;
  }

  /** XP needed to reach the next level, or 0 if already at max */
  public getXPToNextLevel(currentXP: number): number {
    const rank = this.calculateRank(currentXP);
    if (rank >= LEVEL_THRESHOLDS.length - 1) return 0;
    return Math.max(0, LEVEL_THRESHOLDS[rank + 1] - currentXP);
  }

  public getLevelName(level: 1 | 2 | 3): string {
    return LEVEL_NAMES[level - 1];
  }

  // ─── Leaderboard ─────────────────────────────────────────────────────────
  public async getLeaderboard(limit: number = 100, offset: number = 0) {
    const users = await User.find()
      .select('username xp rank level wins losses gamesPlayed -passwordHash')
      .sort({ xp: -1 })
      .limit(limit)
      .skip(offset)
      .lean();

    return users.map((user, index) => ({
      position: offset + index + 1,
      username: user.username,
      xp: user.xp,
      level: user.level ?? this.calculateLevel(user.xp),
      levelName: this.getLevelName((user.level as 1 | 2 | 3) ?? this.calculateLevel(user.xp)),
      wins: user.wins,
      losses: user.losses,
      winRate: user.gamesPlayed > 0 ? ((user.wins / user.gamesPlayed) * 100).toFixed(1) : '0',
    }));
  }

  // ─── Progression summary for UI ──────────────────────────────────────────
  public getProgressionInfo(xp: number, level: 1 | 2 | 3) {
    const rank = level - 1;
    const currentThreshold = LEVEL_THRESHOLDS[rank];
    const isMaxLevel = level === 3;
    const nextThreshold = isMaxLevel ? LEVEL_THRESHOLDS[rank] : LEVEL_THRESHOLDS[rank + 1];

    const xpInCurrentLevel = xp - currentThreshold;
    const xpRequiredForLevel = isMaxLevel ? 0 : nextThreshold - currentThreshold;
    const progressPercentage = isMaxLevel
      ? 100
      : Math.min(100, Math.round((xpInCurrentLevel / xpRequiredForLevel) * 100));

    return {
      currentLevel: level,
      currentLevelName: this.getLevelName(level),
      xpInCurrentLevel,
      xpRequiredForLevel,
      progressPercentage,
      xpToNextLevel: this.getXPToNextLevel(xp),
      totalXP: xp,
      nextLevelName: isMaxLevel ? 'Max Level' : this.getLevelName((level + 1) as 1 | 2 | 3),
    };
  }
}