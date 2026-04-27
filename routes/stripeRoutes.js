import express from "express";
import { createCheckoutSession, handleWebhook, checkPaymentStatus } from "../controllers/stripeController.js";
import { isAuthenticated } from "../middleware/isAuthenticated.js";

const router = express.Router();

// Webhook is handled directly in server.js to ensure raw body consumption
// router.post("/webhook", handleWebhook);

// Protected route for creating session
router.post("/create-checkout-session", isAuthenticated, createCheckoutSession);

// Admin/Debug route to check payment status
router.get("/check-payment-status/:sessionId", isAuthenticated, checkPaymentStatus);

export default router;
