import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt';
import type { UserRole } from '../types/index';

// Extend Express Request to include user info
declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        username: string;
        email: string;
        role: UserRole;
      };
    }
  }
}

export function authenticateToken(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    res.status(401).json({ error: 'Access token required' });
    return;
  }

  try {
    const payload = verifyToken(token);
    req.user = {
      userId: payload.userId,
      username: payload.username,
      email: payload.email,
      role: payload.role,
    };
    next();
  } catch (error) {
    res.status(403).json({ error: 'Invalid or expired token' });
  }
}

export function authorize(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    next();
  };
}
