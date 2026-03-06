import mongoose from 'mongoose';
import type { IGame, IGameResult, ITeamAction } from '../types/index';

const playerActionSchema = new mongoose.Schema<ITeamAction>(
  {
    userId: String,
    timestamp: Number,
    action: String,
    result: {
      type: String,
      enum: ['success', 'failed', 'neutral'],
    },
    details: mongoose.Schema.Types.Mixed,
  },
  { _id: false }
);

const gameResultSchema = new mongoose.Schema<IGameResult>(
  {
    redPlayerActions: [playerActionSchema],
    bluePlayerActions: [playerActionSchema],
    vulnerabilitiesExploited: [String],
    vulnerabilitiesIdentified: [String],
    winner: {
      type: String,
      enum: ['red_player', 'blue_player', 'draw'],
    },
    redPlayerXPGain: Number,
    bluePlayerXPGain: Number,
  },
  { _id: false }
);

const gameSchema = new mongoose.Schema<IGame>(
  {
    gameId: {
      type: String,
      required: true,
      unique: true,
    },
    phase: {
      type: String,
      enum: ['lobby', 'briefing', 'active', 'aar'],
      default: 'lobby',
    },
    // 1v1: single user ID per side
    redPlayer: { type: String, required: true },
    bluePlayer: { type: String, required: true },
    startTime: Date,
    endTime: Date,
    scenario: {
      type: {
        type: String,
        enum: [
          'brute_force',
          'sql_injection',
          'xss',
          'phishing',
          'jwt_manipulation',
          'network_anomaly',
        ],
        required: true,
      },
      difficulty: {
        type: String,
        enum: ['easy', 'medium', 'hard'],
        required: true,
      },
      description: String,
      objectives: [String],
      timeLimit: Number,
      environment: {
        targetSystem: String,
        vulnerability: String,
        protections: [String],
      },
    },
    results: {
      type: gameResultSchema,
      default: () => ({
        redPlayerActions: [],
        bluePlayerActions: [],
        vulnerabilitiesExploited: [],
        vulnerabilitiesIdentified: [],
        redPlayerXPGain: 0,
        bluePlayerXPGain: 0,
      }),
    },
  },
  {
    timestamps: true,
  }
);

gameSchema.index({ gameId: 1 });
gameSchema.index({ phase: 1 });
gameSchema.index({ createdAt: -1 });

export const Game = mongoose.model<IGame>('Game', gameSchema);