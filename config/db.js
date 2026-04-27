import mongoose from "mongoose";

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 10000, 
      socketTimeoutMS: 45000,
      family: 4, // Force IPv4 to avoid potential DNS/latency issues on some networks
    });
    console.log("✅ MongoDB connected");
  } catch (err) {
    console.error("❌ MongoDB error", err);
    process.exit(1);
  }
};

export default connectDB;
