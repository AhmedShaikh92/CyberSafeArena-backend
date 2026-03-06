import { Router, Request, Response } from 'express';
import { User } from '../models/User';
import { authenticateToken } from '../middleware/auth';
import { ProgressionService } from '../services/progression';

const router = Router();
const progressionService = new ProgressionService();

// Get user progression info
router.get('/user/:userId', async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await User.findById(req.params.userId).select('xp rank level stats wins losses gamesPlayed');

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const level = (user.level ?? progressionService.calculateLevel(user.xp)) as 1 | 2 | 3;
    const progressionInfo = progressionService.getProgressionInfo(user.xp, level);

    res.json({
      user: {
        xp: user.xp,
        level,
        stats: user.stats,
        wins: user.wins,
        losses: user.losses,
        gamesPlayed: user.gamesPlayed,
      },
      progression: progressionInfo,
    });
  } catch (error) {
    console.error('[Progression] Get user progression error:', error);
    res.status(500).json({ error: 'Failed to fetch progression' });
  }
});

// Get current user progression (authenticated)
router.get('/me', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const user = await User.findById(userId).select('xp rank level stats wins losses gamesPlayed');

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const level = (user.level ?? progressionService.calculateLevel(user.xp)) as 1 | 2 | 3;
    const progressionInfo = progressionService.getProgressionInfo(user.xp, level);

    res.json({
      user: {
        xp: user.xp,
        level,
        levelName: progressionService.getLevelName(level),
        stats: user.stats,
        wins: user.wins,
        losses: user.losses,
        gamesPlayed: user.gamesPlayed,
      },
      progression: progressionInfo,
    });
  } catch (error) {
    console.error('[Progression] Get my progression error:', error);
    res.status(500).json({ error: 'Failed to fetch progression' });
  }
});

// Get leaderboard
router.get('/leaderboard/global', async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 500);
    const offset = parseInt(req.query.offset as string) || 0;

    const leaderboard = await progressionService.getLeaderboard(limit, offset);
    const total = await User.countDocuments();

    res.json({
      leaderboard,
      total,
      limit,
      offset,
    });
  } catch (error) {
    console.error('[Progression] Get leaderboard error:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

// Get level distribution
router.get('/stats/level-distribution', async (req: Request, res: Response): Promise<void> => {
  try {
    const distribution = await User.aggregate([
      {
        $group: {
          _id: '$level',
          count: { $sum: 1 },
        },
      },
      {
        $sort: { _id: 1 },
      },
    ]);

    const levelDistribution = distribution.map((item) => ({
      level: item._id as 1 | 2 | 3,
      levelName: progressionService.getLevelName(item._id as 1 | 2 | 3),
      count: item.count,
    }));

    res.json({ levelDistribution });
  } catch (error) {
    console.error('[Progression] Get level distribution error:', error);
    res.status(500).json({ error: 'Failed to fetch level distribution' });
  }
});

// Get general progression stats
router.get('/stats/general', async (req: Request, res: Response): Promise<void> => {
  try {
    const totalUsers = await User.countDocuments();

    const stats = await User.aggregate([
      {
        $group: {
          _id: null,
          avgXP: { $avg: '$xp' },
          avgGames: { $avg: '$gamesPlayed' },
          avgWinRate: { $avg: { $divide: ['$wins', { $max: ['$gamesPlayed', 1] }] } },
          totalGamesPlayed: { $sum: '$gamesPlayed' },
        },
      },
    ]);

    const generalStats = stats[0] || {
      avgXP: 0,
      avgGames: 0,
      avgWinRate: 0,
      totalGamesPlayed: 0,
    };

    res.json({
      totalUsers,
      averageXP: Math.round(generalStats.avgXP),
      averageGamesPlayed: Math.round(generalStats.avgGames),
      averageWinRate: (generalStats.avgWinRate * 100).toFixed(1),
      totalGamesPlayed: generalStats.totalGamesPlayed,
    });
  } catch (error) {
    console.error('[Progression] Get general stats error:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});


router.patch('/me', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { xpGained, outcome } = req.body as {
      xpGained?: number;
      outcome?:  'win' | 'loss' | 'draw';
    };

    const update: Record<string, unknown> = { lastActive: new Date() };

    if (typeof xpGained === 'number' && xpGained > 0) {
      update['$inc'] = { xp: xpGained, gamesPlayed: 1 };
    } else {
      update['$inc'] = { gamesPlayed: 1 };
    }

    if (outcome === 'win')  (update['$inc'] as any).wins   = 1;
    if (outcome === 'loss') (update['$inc'] as any).losses = 1;

    const user = await User.findByIdAndUpdate(userId, update, { new: true })
      .select('xp level rank wins losses gamesPlayed');

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Recalculate level based on new XP
    const newLevel = progressionService.calculateLevel(user.xp) as 1 | 2 | 3;
    if (newLevel !== user.level) {
      await User.findByIdAndUpdate(userId, { level: newLevel, rank: newLevel - 1 });
      user.level = newLevel;
    }

    res.json({
      xp:          user.xp,
      level:       user.level,
      wins:        user.wins,
      losses:      user.losses,
      gamesPlayed: user.gamesPlayed,
    });
  } catch (error) {
    console.error('[Progression] Save progression error:', error);
    res.status(500).json({ error: 'Failed to save progression' });
  }
});

export default router;