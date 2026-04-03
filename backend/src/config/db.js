import mongoose from 'mongoose';

export const connectDB = async () => {
  const uri = process.env.MONGO_URL;
  console.log('[DB:connectDB] Connecting to MongoDB...');
  console.log(`[DB:connectDB] URI → ${uri?.replace(/:([^@]+)@/, ':****@')}`); // mask password

  try {
    await mongoose.connect(uri);
    console.log(`[DB:connectDB] ✓ Connected — host: ${mongoose.connection.host}`);
  } catch (err) {
    console.error(`[DB:connectDB] ✗ Connection failed — ${err.message}`);
    console.error(err.stack);
    process.exit(1);
  }
};
