import mongoose from 'mongoose';
import type { IAfterActionReview, IPlayerAAR, IImprovementArea } from '../types/index';

const improvementAreaSchema = new mongoose.Schema<IImprovementArea>(
  {
    title: String,
    description: String,
    recommendation: String,
    difficulty: {
      type: String,
      enum: ['easy', 'medium', 'hard'],
    },
  },
  { _id: false }
);

const playerAARSchema = new mongoose.Schema<IPlayerAAR>(
  {
    role: {
      type: String,
      enum: ['red_team', 'blue_team'],
    },
    performanceScore: Number,
    actions: Number,
    successRate: Number,
    timing: {
      averageResponseTime: Number,
      actionTimeline: [
        {
          time: Number,
          action: String,
          _id: false,
        },
      ],
    },
    vulnerabilityAnalysis: {
      exploited: [String],
      identified: [String],
      missed: [String],
    },
  },
  { _id: false }
);

const aarSchema = new mongoose.Schema<IAfterActionReview>(
  {
    gameId: {
      type: String,
      required: true,
      unique: true,
    },
    redPlayerSummary: playerAARSchema,
    bluePlayerSummary: playerAARSchema,
    keyInsights: [String],
    improvementAreas: [improvementAreaSchema],
  },
  {
    timestamps: true,
  }
);

aarSchema.index({ gameId: 1 });
aarSchema.index({ createdAt: -1 });

export const AfterActionReview = mongoose.model<IAfterActionReview>('AfterActionReview', aarSchema);