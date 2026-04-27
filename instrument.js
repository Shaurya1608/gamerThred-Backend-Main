import * as Sentry from "@sentry/node";
import { nodeProfilingIntegration } from "@sentry/profiling-node";
import dotenv from "dotenv";

// Load env vars first
dotenv.config();

if (process.env.SENTRY_DSN) {
  const dsn = process.env.SENTRY_DSN;
  console.log(`🔌 Attempting Sentry connection with DSN: ${dsn.substring(0, 10)}...${dsn.substring(dsn.length - 5)}`);
  
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    integrations: [
      nodeProfilingIntegration(),
    ],
    // Performance Monitoring
    tracesSampleRate: 1.0, 
    profilesSampleRate: 1.0,
    debug: false, // Disable debug mode after verification
  });
  console.log("🎯 Sentry Instrumentation Initialized (ESM Mode)");
} else {
  console.warn("⚠️ SENTRY_DSN not found in environment.");
}
