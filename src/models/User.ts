import mongoose from 'mongoose';
import type { IUser, IUserStats } from '../types/index';

const userStatsSchema = new mongoose.Schema<IUserStats>(
  {
    correctDefenses: { type: Number, default: 0 },
    successfulAttacks: { type: Number, default: 0 },
    totalSimulationsCompleted: { type: Number, default: 0 },
    averageResponseTime: { type: Number, default: 0 },
    vulnerabilitiesIdentified: { type: Number, default: 0 },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema<IUser>(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 3,
      maxlength: 30,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please provide a valid email'],
    },
    passwordHash: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ['red_team', 'blue_team', 'admin'],
      default: 'blue_team',
    },
    xp: {
      type: Number,
      default: 0,
      min: 0,
    },
    // rank is the internal 0-2 index; level is the display-facing 1-3 value
    rank: {
      type: Number,
      default: 0,
      min: 0,
      max: 2,
    },
    level: {
      type: Number,
      default: 1,
      min: 1,
      max: 3,
    },
    wins: {
      type: Number,
      default: 0,
    },
    losses: {
      type: Number,
      default: 0,
    },
    gamesPlayed: {
      type: Number,
      default: 0,
    },
    stats: {
      type: userStatsSchema,
      default: () => ({}),
    },
    lastActive: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

userSchema.index({ username: 1 });
userSchema.index({ email: 1 });
userSchema.index({ xp: -1 }); // For leaderboards

export const User = mongoose.model<IUser>('User', userSchema);