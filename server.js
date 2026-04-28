import dotenv from "dotenv"; 
dotenv.config();
import express from "express";
import jwt from "jsonwebtoken";
import * as Sentry from "@sentry/node";
import { nodeProfilingIntegration } from "@sentry/profiling-node";
import logger from "./utils/logger.js";
import cors from "cors";
import cookieParser from "cookie-parser";
import connectDB from "./config/db.js";
import healthRoutes from "./routes/healthRoutes.js";

// ... existing code ...

// Imports moved to correct location
import userRoutes from "./routes/userRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import profileRoutes from "./routes/profileRoutes.js";
import passport from "./config/passport.js";
import missionRoutes from "./routes/missionRoutes.js";
import adminMissionRoutes from "./routes/adminMissionRoutes.js";
import gameRoutes from "./routes/gameRoutes.js";
import rewardRoutes from "./routes/rewardRoutes.js";
import adminRewardRoutes from "./routes/adminRewardRoutes.js";
import cartRoutes from "./routes/cartRoutes.js";
import categoryRoutes from "./routes/categoryRoutes.js";
import seasonRoutes from "./routes/seasonRoutes.js";
import chatRoutes from "./routes/chatRoutes.js";
import adminChatRoutes from "./routes/adminChatRoutes.js";
import heroRoutes from "./routes/heroRoutes.js";
import adminHeroRoutes from "./routes/adminHeroRoutes.js";
import dailyQuestRoutes from "./routes/dailyQuestRoutes.js";
import stripeRoutes from "./routes/stripeRoutes.js";
import adminOrderRoutes from "./routes/adminOrderRoutes.js";
import arenaRoutes from "./routes/arenaRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import adminGameRoutes from "./routes/adminGameRoutes.js";
import friendRoutes from "./routes/friendRoutes.js";
import weekendMissionRoutes from "./routes/weekendMissionRoutes.js";
import subscriptionRoutes from "./routes/subscriptionRoutes.js";
import { handleWebhook } from "./controllers/stripeController.js";
import http from "http";
import { Server } from "socket.io";
import { createClient } from "redis";
import { createAdapter } from "@socket.io/redis-adapter";
import { User } from "./models/User.js";
import { Session } from "./models/Session.js";
import sessionRoutes from "./routes/sessionRoutes.js";
import { Community } from "./models/Community.js";
import { Message } from "./models/Message.js";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";
import hpp from "hpp";
import xssClean from "xss-clean";
import mongoSanitize from "express-mongo-sanitize";
import { rateLimit } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { redis } from "./config/redis.js";
import { setupRewardWorker } from "./utils/rewardQueue.js";
import matchmakingService from "./utils/matchmakingService.js";
import activityService from "./utils/activityService.js";
import globalErrorHandler from "./middleware/errorMiddleware.js";
import { verifyConnection } from "./utils/emailTransport.js";
import { csrfProtection } from "./middleware/csrfMiddleware.js";
import xss from "xss";
// Refreshing environment 

const app = express();

// --- 💳 STRIPE WEBHOOK (PRIORITY LANE) ---
// This must be BEFORE express.json() to get the raw body
app.post("/stripe/webhook", express.raw({ type: "*/*" }), handleWebhook);

const server = http.createServer(app);
const allowedOrigins = [
  process.env.FRONTEND_URL,
  process.env.ADMIN_URL,
  "https://gamert.vercel.app", 
  "https://gamerthred.vercel.app",
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:8081",
  "http://192.168.29.165:8081" // Local Mobile Dev IP
].filter(Boolean);

const io = new Server(server, {
  cors: {
    origin: "*", // Allow all origins for sockets (secured by JWT middleware below)
    methods: ["GET", "POST"],
    credentials: true,
  },
});

activityService.init(io);

// 🔌 REDIS ADAPTER FOR SOCKET.IO (Scalability)
const setupRedisAdapter = async () => {
    try {
        const url = process.env.UPSTASH_REDIS_URL || "redis://localhost:6379";
        const isTls = url.startsWith("rediss://");
        
        const clientOptions = {
            url,
            ...(isTls && {
                socket: {
                    tls: true,
                    rejectUnauthorized: false
                }
            })
        };

        const pubClient = createClient(clientOptions);
        const subClient = pubClient.duplicate();

        await Promise.all([pubClient.connect(), subClient.connect()]);

        io.adapter(createAdapter(pubClient, subClient));
        logger.info("Socket.io Redis adapter connected");
    } catch (err) {
        logger.error("Failed to connect Socket.io Redis adapter:", err);
    }
};

// io.adapter setup moved to startServer for reliability

const PORT = process.env.PORT || 3000;
app.set("trust proxy", 1);

// 🛡️ SECURITY MIDDLEWARE
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.warn(`CORS Warning: Origin ${origin} is not allowed. Allowed:`, allowedOrigins);
        callback(new Error(`Not allowed by CORS: ${origin}`));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-auth-token', 'x-csrf-token', 'x-client-type'],
    exposedHeaders: ['set-cookie']
  })
);
app.use(helmet()); // Basic security headers
app.use(compression()); // Compress responses
app.use(mongoSanitize()); // Prevent NoSQL Injection
app.use(xssClean()); // Prevent XSS
app.use(hpp()); // Prevent HTTP Parameter Pollution

if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
} else {
  // Use Winston for morgan logs in production
  app.use(morgan("combined", { stream: { write: (message) => logger.info(message.trim()) } }));
}

// Global Rate Limiter (Persistent via Redis)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: "Too many requests from this IP, please try again after 15 minutes",
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    sendCommand: (...args) => redis.call(...args),
  }),
});
app.use("/api", limiter);

// CORS moved to top

app.use(cookieParser());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(csrfProtection);

// 🏥 HEALTH CHECK
app.use("/api/health", healthRoutes);

// Initialize Passport
app.use(passport.initialize());

app.use("/auth", userRoutes);
app.use("/auth", sessionRoutes); // Session management endpoints under /auth
app.use("/auth/daily-quests", dailyQuestRoutes);
app.use("/stripe", stripeRoutes);
app.use("/admin", adminRoutes);

app.use("/profile", profileRoutes);
app.use("/api/missions", missionRoutes);
app.use("/admin-missions", adminMissionRoutes);
app.use("/admin-rewards", adminRewardRoutes);
app.use("/api/admin-orders", adminOrderRoutes);
app.use("/api/rewards", rewardRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/season", seasonRoutes);
app.use("/api/chat", chatRoutes);
app.use("/admin/chat", adminChatRoutes);
app.use("/admin/hero-slides", adminHeroRoutes);
app.use("/api/hero-slides", heroRoutes);
app.use("/api/arena", arenaRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/admin/games", adminGameRoutes);
app.use("/api/friends", friendRoutes);
app.use("/api/weekend-missions", weekendMissionRoutes);
app.use("/api/subscription-configs", subscriptionRoutes);
import systemRoutes from "./routes/systemRoutes.js";
import ticketRoutes from "./routes/ticketRoutes.js";

app.use("/api/system", systemRoutes);
app.use("/api/tickets", ticketRoutes);
app.use("/games", gameRoutes);
// ⚠️ DEPRECATED: Local static serving (Moving to Cloudfront/S3 for stateless scaling)
app.use("/uploads", express.static("uploads"));

const broadcastCommunitiesStats = () => {
  const stats = {};
  for (const [roomId, room] of io.sockets.adapter.rooms) {
    // Basic filter to only include rooms that look like Mongo IDs (optional)
    if (roomId.length === 24) { 
      stats[roomId] = room.size;
    }
  }
  io.emit("communities_update", stats);
};

// Rate limiting map
const socketCooldowns = new Map();

// Socket.io Authentication Middleware
io.use(async (socket, next) => {
  try {
    const cookieString = socket.handshake.headers.cookie;
    let token;
    
    if (cookieString) {
      // 🔍 ROBUST COOKIE PARSING (Handles = in values)
      const cookies = cookieString.split(';').reduce((acc, cookie) => {
        const parts = cookie.trim().split('=');
        const name = parts[0];
        const value = parts.slice(1).join('=');
        if (name && value) acc[name] = value;
        return acc;
      }, {});
      token = cookies.accessToken;
    }

    // 🛡️ MOBILE/WEB TOKEN FALLBACK (Handshake Auth)
    if (!token && socket.handshake.auth?.token) {
        token = socket.handshake.auth.token.replace('Bearer ', '');
    }

    if (!token) {
      console.warn(`[Socket Auth] Unauthorized: No token found for socket ${socket.id}`);
      return next(new Error("Authentication error: No token found"));
    }

    let decoded;
    try {
        decoded = jwt.verify(token, process.env.ACCESS_TOKEN);
    } catch (jwtErr) {
        console.error(`[Socket Auth] JWT Verification Failed: ${jwtErr.message}`);
        return next(new Error("Authentication error: Invalid or expired token"));
    }
    
    const userId = decoded.userId;
    const sessionId = decoded.sessionId;

    // 🛡️ Multi-session check
    const [user, session] = await Promise.all([
      User.findById(userId).select("-password"),
      sessionId ? Session.findById(sessionId) : Session.findOne({ userId })
    ]);

    if (!user || user.isBanned) {
      console.warn(`[Socket Auth] User ${userId} restricted or not found`);
      return next(new Error("Authentication error: User restricted"));
    }
    
    if (!session) {
      console.warn(`[Socket Auth] Session ${sessionId} not found for user ${userId}`);
      return next(new Error("Authentication error: Session expired or invalid"));
    }

    socket.user = user;
    socket.sessionId = sessionId; 
    next();
  } catch (err) {
    console.error("[Socket Auth] Internal System Error:", err.message);
    next(new Error("Authentication error: Internal Error"));
  }
});

// Socket.io logic
io.on("connection", async (socket) => {
  const currentUser = socket.user;
  console.log("Authenticated user connected:", currentUser.username, socket.id);

  // 🏠 AUTO-JOIN PRIVATE ROOM (For multi-device tracking)
  socket.join(`user_${String(currentUser._id)}`);

  // 🟢 SET ONLINE
  try {
      await User.findByIdAndUpdate(currentUser._id, { isOnline: true });
      socket.broadcast.emit("user_status_change", { userId: currentUser._id, isOnline: true });
  } catch (err) {
      console.error("Failed to set user online:", err);
  }

  socket.on("join_room", async (data) => {
    try {
      const { roomId } = typeof data === "string" ? { roomId: data } : data;
      const userId = currentUser._id;


      socket.join(roomId);
      console.log(`User ${socket.id} joined room: ${roomId}`);
      
      // Broadcast updated count to the room
      const room = io.sockets.adapter.rooms.get(roomId);
      const onlineCount = room ? room.size : 0;
      io.to(roomId).emit("room_stats", { roomId, onlineCount });
      
      // Global update
      broadcastCommunitiesStats();
    } catch (err) {
      console.error("Join room error:", err);
    }
  });

  socket.on("join_user_room", (userId) => {
    if (userId) {
      const roomName = `user_${String(userId)}`;
      socket.join(roomName);
      
      // Verification log
      const room = io.sockets.adapter.rooms.get(roomName);
      console.log(`Room ${roomName} now has ${room ? room.size : 0} members`);
    }
  });

  socket.on("send_message", async (data) => {
    try {
      // 🛡️ PER-SOCKET RATE LIMIT (500ms)
      const now = Date.now();
      const lastMsg = socketCooldowns.get(socket.id) || 0;
      if (now - lastMsg < 500) {
        return socket.emit("error", { message: "Slow down! Protocol cooling down." });
      }
      socketCooldowns.set(socket.id, now);

      const { content, senderId, communityId } = data;
      
      if (!content || !senderId || !communityId) return;

      // 🛡️ AUTH CHECK (Match socket user with senderId)
      if (String(currentUser._id) !== String(senderId)) {
        return socket.emit("error", { message: "Security Violation: Identity Mismatch" });
      }

      // Check if user is chat banned
      if (currentUser.chatBan) {
          return socket.emit("error", { message: "You are restricted from sending messages." });
      }

      const community = await Community.findById(communityId);
      if (!community) return socket.emit("error", { message: "Community not found." });

      if (community.privacy === "private" && !community.members.includes(senderId)) {
          return socket.emit("error", { message: "Access Denied: You are not a member of this group." });
      }

      if (community.bannedUsers?.includes(senderId)) {
          return socket.emit("error", { message: "You are banned from this community." });
      }

      // 🛡️ CHAT LOCK CHECK
      if (community.isLocked && String(community.owner) !== String(senderId)) {
          return socket.emit("error", { 
              message: "Protocol Locked: Only squad commanders can transmit currently.",
              code: "CHAT_LOCKED"
          });
      }

      // 🛡️ PROFESSIONAL SANITIZATION (Prevents XSS bypasses)
      const cleanContent = xss(content).trim().substring(0, 500);
      if (!cleanContent) return;

      const newMessage = await Message.create({
        content: cleanContent,
        sender: senderId,
        community: communityId,
      });

      const populatedMessage = await Message.findById(newMessage._id).populate("sender", "username avatar role");

      io.to(communityId).emit("receive_message", populatedMessage);
    } catch (error) {
      console.error("Socket error:", error);
    }
  });

  // ✍️ TYPING INDICATORS
  socket.on("typing_start", (data) => {
    socket.to(data.roomId).emit("user_typing", { 
        userId: currentUser._id, 
        username: currentUser.username,
        roomId: data.roomId 
    });
  });

  socket.on("typing_stop", (data) => {
    socket.to(data.roomId).emit("user_stopped_typing", { 
        userId: currentUser._id,
        roomId: data.roomId 
    });
  });

  // ⚔️ ARENA LIVE SCORE RELAY
  socket.on("arena_score_push", (data) => {
    const { challengeId, score } = data;
    if (!challengeId) return;

    // Relay the score to everyone in the challenge room except the sender
    socket.to(`arena_${challengeId}`).emit("arena_opponent_score", {
        userId: currentUser._id,
        score
    });
  });

  socket.on("disconnecting", () => {
    socketCooldowns.delete(socket.id);
    // Before actual disconnect, find all rooms this socket was in
    for (const roomId of socket.rooms) {
      if (roomId !== socket.id) { // socket.id is also a room
        const room = io.sockets.adapter.rooms.get(roomId);
        if (room) {
          // Send count assuming they will leave (size - 1)
          io.to(roomId).emit("room_stats", { roomId, onlineCount: room.size - 1 });
        }
      }
    }
    // Global update will happen with the new sizes after they leave fully
    setTimeout(broadcastCommunitiesStats, 100);
  });

  socket.on("disconnect", async () => {
    console.log("User disconnected:", socket.id);
    
    // 🔴 SET OFFLINE (Check for other connections first)
    try {
        const room = io.sockets.adapter.rooms.get(`user_${currentUser._id}`);
        // If room is empty or undefined, user has no other connections
        if (!room || room.size === 0) {
            await User.findByIdAndUpdate(currentUser._id, { isOnline: false });
            socket.broadcast.emit("user_status_change", { userId: currentUser._id, isOnline: false });
        }
    } catch (err) {
        console.error("Failed to set user offline:", err);
    }
  });
});

// 🎯 SENTRY ERROR HANDLER (Must be before custom error handler)
if (process.env.SENTRY_DSN) {
  logger.info("Sentry DSN is configured. Error reporting enabled.");
  Sentry.setupExpressErrorHandler(app);
} else {
  logger.warn("Sentry DSN is not configured. Error reporting disabled.");
}

// ❌ GLOBAL ERROR HANDLER
app.use(globalErrorHandler);

import { seedMysteryBoxes } from "./utils/seedMysteryBoxes.js";

const startServer = async () => {
  try {
    // 1. Core Database Connection (Must succeed)
    await connectDB();
    
    // 2. Background Services (Attempt, but don't crash the entire server)
    try {
        await setupRedisAdapter();
        setupRewardWorker(io);
        matchmakingService.init(io);
        await seedMysteryBoxes();
    } catch (svcError) {
        logger.error("Non-critical background service failure:", svcError);
    }

    server.listen(PORT, async () => {
      const emailCheck = await verifyConnection();
      if (emailCheck.success) {
        console.log("✅ Email system: Connection successful");
      } else {
        console.warn("⚠️ Email system: Connection failed -", emailCheck.error);
      }
      console.log(`🚀 ${process.env.NODE_ENV === 'production' ? 'Production' : 'Development'} Server Ready on port ${PORT}`);
    });
  } catch (error) {
    console.error("CRITICAL: Failed to start server:", error);
    process.exit(1);
  }
};

startServer();

// Deployment Sync: v1.0.1 - Triggering build pipeline
// final auto deploy test
// sanity check