import jwt from 'jsonwebtoken';
import { config } from '../config/index';
import type { UserRole } from '../types/index';

export interface TokenPayload {
  userId: string;
  username: string;
  email: string;
  role: UserRole;
  level: 1 | 2 | 3;
  iat?: number;
  exp?: number;
}

export function generateToken(payload: Omit<TokenPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: config.jwtExpire,
  });
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, config.jwtSecret) as TokenPayload;
}

export function decodeToken(token: string): TokenPayload | null {
  try {
    return jwt.decode(token) as TokenPayload | null;
  } catch {
    return null;
  }
}