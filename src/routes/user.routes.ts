import { Router, Request, Response } from 'express';
import { User } from '../models/User';
import { authenticateToken } from '../middleware/auth';
import { generateToken } from '../utils/jwt';

const router = Router();

// ─── GET /api/users/leaderboard ───────────────────────────────────────────────

router.get('/leaderboard', async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 1000);
    const offset = parseInt(req.query.offset as string) || 0;

    const users = await User.find()
      .select('username xp rank level wins losses gamesPlayed -passwordHash')
      .sort({ xp: -1 })
      .limit(limit)
      .skip(offset);

    const total = await User.countDocuments();

    res.json({ total, limit, offset, users });
  } catch (error) {
    console.error('[User] Leaderboard error:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

// ─── PATCH /api/users/me/role (authenticated) ─────────────────────────────────
// Frontend sends 'attacker' | 'defender' — mapped to 'red_team' | 'blue_team'.
// Returns a fresh JWT so the token stays in sync with the new role immediately.
// MUST be defined before /:userId to avoid 'me' being caught as a userId param.

router.patch('/me/role', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { role: frontendRole } = req.body as { role?: string };

    const roleMap: Record<string, 'red_team' | 'blue_team'> = {
      attacker:  'red_team',
      defender:  'blue_team',
      red_team:  'red_team',
      blue_team: 'blue_team',
    };

    const backendRole = frontendRole ? roleMap[frontendRole] : undefined;

    if (!backendRole) {
      res.status(400).json({ error: 'Invalid role. Must be "attacker" or "defender".' });
      return;
    }

    const user = await User.findById(req.user?.userId);

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    user.role = backendRole;
    await user.save();

    // Fresh token — frontend must replace the stored JWT and reconnect sockets
    const token = generateToken({
      userId:   user._id.toString(),
      username: user.username,
      email:    user.email,
      role:     user.role,
      level:    user.level,
    });

    res.json({
      message:     'Role updated successfully',
      role:        user.role,
      displayRole: backendRole === 'red_team' ? 'attacker' : 'defender',
      token,
    });
  } catch (error) {
    console.error('[User] Update role error:', error);
    res.status(500).json({ error: 'Failed to update role' });
  }
});

// ─── GET /api/users/:userId ───────────────────────────────────────────────────

router.get('/:userId', async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await User.findById(req.params.userId).select('-passwordHash');

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({ user });
  } catch (error) {
    console.error('[User] Get user error:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// ─── PUT /api/users/profile (authenticated) ───────────────────────────────────

router.put('/profile', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { username } = req.body;
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    if (username) {
      const existingUser = await User.findOne({ username, _id: { $ne: userId } });
      if (existingUser) {
        res.status(409).json({ error: 'Username already taken' });
        return;
      }
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { username },
      { new: true }
    ).select('-passwordHash');

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({ user });
  } catch (error) {
    console.error('[User] Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// ─── GET /api/users/:userId/stats ─────────────────────────────────────────────

router.get('/:userId/stats', async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await User.findById(req.params.userId).select(
      'username stats xp rank level wins losses gamesPlayed'
    );

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const winRate = user.gamesPlayed > 0 ? (user.wins / user.gamesPlayed) * 100 : 0;

    res.json({
      username:    user.username,
      xp:          user.xp,
      rank:        user.rank,
      level:       user.level,
      wins:        user.wins,
      losses:      user.losses,
      gamesPlayed: user.gamesPlayed,
      winRate:     winRate.toFixed(2),
      stats:       user.stats,
    });
  } catch (error) {
    console.error('[User] Get stats error:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

export default router;