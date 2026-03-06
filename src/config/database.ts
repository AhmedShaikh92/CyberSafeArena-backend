import mongoose from 'mongoose';
import { config } from './index';

export async function connectDatabase(): Promise<void> {
  try {
    console.log('[Database] Connecting to MongoDB...');
    await mongoose.connect(config.mongodbUri);
    console.log('[Database] Connected successfully');
  } catch (error) {
    console.error('[Database] Connection failed:', error);
    throw error;
  }
}

export async function disconnectDatabase(): Promise<void> {
  try {
    await mongoose.disconnect();
    console.log('[Database] Disconnected successfully');
  } catch (error) {
    console.error('[Database] Disconnection failed:', error);
    throw error;
  }
}
