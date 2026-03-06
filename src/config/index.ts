import dotenv from 'dotenv';
import { SignOptions } from 'jsonwebtoken';

dotenv.config();

export const config = {
  // Server
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',

  // Database
  mongodbUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/cybersafe-arena',

  // JWT
  jwtSecret: process.env.JWT_SECRET || 'your_super_secret_jwt_key_change_in_production',
  jwtExpire: (process.env.JWT_EXPIRE || '7d') as SignOptions['expiresIn'],

  // Game Configuration
  game: {
    roundDuration: parseInt(process.env.GAME_ROUND_DURATION || '30000', 10), // 5 minutes
    briefingDuration: parseInt(process.env.GAME_BRIEFING_DURATION || '30000', 10), // 30 seconds
    aarDuration: parseInt(process.env.GAME_AAR_DURATION || '60000', 10), // 1 minute
    maxPlayersPerGame: parseInt(process.env.MAX_PLAYERS_PER_GAME || '8', 10),
  },

  // XP and Progression
  xp: {
    winBonus: 50,
    lossBonus: 25,
    performanceBonus: {
      excellentSuccess: 20,
      goodSuccess: 10,
      averageSuccess: 5,
    },
    rankThresholds: [0, 100, 300, 700, 1500, 3000], // XP required for each rank
  },

  // Simulation
  simulation: {
    vulnerabilityReveals: 5000, // milliseconds before vulnerabilities become more obvious
    actionProcessingDelay: 500, // Delay to process actions
  },
};

export default config;
