import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../src/config/db';
import { engineClient } from '../src/services/engineClient';

let mongoServer: MongoMemoryServer;

beforeAll(async () => {
  // Ensure engine client is in mock mode during tests
  engineClient.setMockMode(true);

  // Spin up in-memory MongoDB server
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await connectDB(uri);
});

afterAll(async () => {
  await disconnectDB();
  if (mongoServer) {
    await mongoServer.stop();
  }
});

afterEach(async () => {
  // Clear collections after each test to maintain clean state
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});
