import mongoose from 'mongoose';
import { env } from './env';
import { logger } from '../utils/logger';

export async function connectDB(uri?: string): Promise<void> {
  const mongoUri = uri || env.MONGODB_URI;
  try {
    mongoose.set('strictQuery', true);
    await mongoose.connect(mongoUri);
    logger.info(`Connected to MongoDB: ${mongoUri.replace(/:([^:@]{4})[^:@]*@/, ':****@')}`);
  } catch (error) {
    logger.error('Failed to connect to MongoDB', error);
    // In test or standalone dev, allow graceful continuation or throw
    if (env.NODE_ENV !== 'test') {
      throw error;
    }
  }
}

export async function disconnectDB(): Promise<void> {
  try {
    await mongoose.disconnect();
    logger.info('Disconnected from MongoDB');
  } catch (error) {
    logger.error('Error disconnecting from MongoDB', error);
  }
}
