import dotenv from 'dotenv';
import path from 'path';

// Load .env file from backend root or process.cwd()
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config(); // fallback

export const env = {
  PORT: parseInt(process.env.PORT || '5000', 10),
  HOST: process.env.HOST || '0.0.0.0',
  NODE_ENV: process.env.NODE_ENV || 'development',
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/gridpilot',
  JWT_SECRET: process.env.JWT_SECRET || 'gridpilot_dev_jwt_secret_change_in_production_2026',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '24h',
  ENGINE_BASE_URL: process.env.ENGINE_BASE_URL || process.env.ENGINE_URL || 'http://localhost:8000',
  USE_MOCK_ENGINE: process.env.USE_MOCK_ENGINE === 'true' || (process.env.NODE_ENV === 'test' && process.env.USE_MOCK_ENGINE !== 'false'),
  ORCHESTRATOR_TICK_MS: parseInt(process.env.ORCHESTRATOR_TICK_MS || '5000', 10),
  ORCHESTRATOR_AUTO_START: process.env.ORCHESTRATOR_AUTO_START !== 'false',
  FRONTEND_ORIGIN: process.env.FRONTEND_ORIGIN || '*',
  LLM_PROVIDER: process.env.LLM_PROVIDER || 'claude',
  LLM_API_KEY: process.env.LLM_API_KEY || ''
};
