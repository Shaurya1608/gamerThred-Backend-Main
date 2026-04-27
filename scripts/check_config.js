import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { ProgressionConfig } from './models/ProgressionConfig.js';

dotenv.config();

const checkConfig = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    const config = await ProgressionConfig.findOne({ key: 'default' });
    if (config) {
      console.log('⚙️ Progression Config:');
      console.log(JSON.stringify(config, null, 2));
    } else {
      console.log('⚠️ No default ProgressionConfig found.');
    }

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
};

checkConfig();
