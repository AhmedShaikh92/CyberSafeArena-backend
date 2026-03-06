import { Router, Request, Response } from 'express';
import { User } from '../models/User';
import { hashPassword, comparePassword } from '../utils/password';
import { generateToken } from '../utils/jwt';
import { authenticateToken } from '../middleware/auth';

const router = Router();

interface RegisterBody {
  username: string;
  email: string;
  password: string;
}

interface LoginBody {
  email: string;
  password: string;
}

// Randomly assigns red_team or blue_team with equal probability
function assignRandomRole(): 'red_team' | 'blue_team' {
  return Math.random() < 0.5 ? 'red_team' : 'blue_team';
}

// Register endpoint
router.post('/register', async (req: Request<{}, {}, RegisterBody>, res: Response): Promise<void> => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      res.status(400).json({ error: 'Username, email, and password are required' });
      return;
    }

    if (password.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters long' });
      return;
    }

    const existingUser = await User.findOne({ $or: [{ email }, { username }] });

    if (existingUser) {
      res.status(409).json({ error: 'Email or username already exists' });
      return;
    }

    const passwordHash = await hashPassword(password);
    const role = assignRandomRole();

    const user = new User({ username, email, passwordHash, role });
    await user.save();

    const token = generateToken({
      userId: user._id.toString(),
      username: user.username,
      email: user.email,
      level: user.level,
      role: user.role,
    });

    res.status(201).json({
      message: 'User created successfully',
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('[Auth] Register error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login endpoint
router.post('/login', async (req: Request<{}, {}, LoginBody>, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    const user = await User.findOne({ email });

    if (!user) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const passwordMatch = await comparePassword(password, user.passwordHash);

    if (!passwordMatch) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    user.lastActive = new Date();
    await user.save();

    const token = generateToken({
      userId: user._id.toString(),
      username: user.username,
      email: user.email,
      level: user.level,
      role: user.role,
    });

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        xp: user.xp,
        rank: user.rank,
      },
    });
  } catch (error) {
    console.error('[Auth] Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Verify token endpoint
router.post('/verify', authenticateToken, (req: Request, res: Response): void => {
  res.json({ message: 'Token is valid', user: req.user });
});

// Get current user endpoint
router.get('/me', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await User.findById(req.user?.userId);

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        xp: user.xp,
        rank: user.rank,
        wins: user.wins,
        losses: user.losses,
        gamesPlayed: user.gamesPlayed,
        stats: user.stats,
      },
    });
  } catch (error) {
    console.error('[Auth] Get user error:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

export default router;