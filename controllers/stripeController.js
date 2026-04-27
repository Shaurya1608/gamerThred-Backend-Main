import Stripe from "stripe";
import { Reward } from "../models/Reward.js";
import { RewardOrder } from "../models/RewardOrder.js";
import { GemPackage } from "../models/GemPackage.js";
import { User } from "../models/User.js";
import Transaction from "../models/Transaction.js";
import mongoose from "mongoose";
import dotenv from "dotenv";
import { createNotification } from "./notificationController.js";
import { updateLeaderboardScore } from "../utils/redisUtils.js";

dotenv.config();

const getStripe = () => {
  if (!process.env.STRIPE_SECRET_KEY) {
    console.warn("⚠️ STRIPE_SECRET_KEY is missing. Stripe features will be disabled.");
    return null;
  }
  return new Stripe(process.env.STRIPE_SECRET_KEY);
};

export const createCheckoutSession = async (req, res) => {
  try {
    const stripe = getStripe();
    if (!stripe) {
      return res.status(500).json({ message: "Stripe is not configured" });
    }
    
    const userId = req.user._id;
    const { tier, packageId } = req.body; 

    let lineItems = [];
    let metadata = { userId: userId.toString() };

    if (tier) {
      // Fetch subscription config from database
      const { SubscriptionConfig } = await import("../models/SubscriptionConfig.js");
      const subscriptionConfig = await SubscriptionConfig.findOne({ tier, isActive: true });
      
      if (!subscriptionConfig) {
        return res.status(404).json({ message: `Subscription configuration for ${tier} not found or inactive` });
      }

      const config = {
        name: subscriptionConfig.displayName,
        description: subscriptionConfig.description,
        amount: subscriptionConfig.priceInr * 100, // Convert to paise
        metadataType: tier === "premium" ? "premium_pass" : "elite_pass"
      };

      lineItems = [{
        price_data: {
          currency: "inr",
          product_data: {
            name: config.name,
            description: config.description,
            images: ["https://res.cloudinary.com/dpv06u6ia/image/upload/v1737730000/membership_badge.png"],
          },
          unit_amount: config.amount,
        },
        quantity: 1,
      }];
      metadata.type = config.metadataType;
      metadata.tier = tier;
    } else if (packageId) {
      const pkg = await GemPackage.findById(packageId);
      if (!pkg || !pkg.isActive) return res.status(404).json({ message: "Gem package not available" });

      lineItems = [{
        price_data: {
          currency: "inr",
          product_data: {
            name: pkg.name,
            description: pkg.description || `Purchase ${pkg.gemAmount} Elite Gems`,
            images: ["https://res.cloudinary.com/dpv06u6ia/image/upload/v1737730000/gems_bundle.png"],
          },
          unit_amount: pkg.priceInr * 100, // INR in paise
        },
        quantity: 1,
      }];
      metadata.type = "gem_purchase";
      metadata.gemAmount = pkg.gemAmount.toString();
      metadata.packageId = packageId.toString();
    } else {
      return res.status(400).json({ message: "Invalid request: Provide tier or packageId" });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: lineItems,
      mode: "payment",
      success_url: `${process.env.FRONTEND_URL}/subscription?payment=success`,
      cancel_url: `${process.env.FRONTEND_URL}/subscription?payment=cancel`,
      metadata: metadata,
    });

    res.json({ id: session.id, url: session.url });
  } catch (error) {
    console.error("Stripe session error:", error);
    res.status(500).json({ message: "Failed to create payment session" });
  }
};

export const handleWebhook = async (req, res) => {
  const stripe = getStripe();
  if (!stripe) return res.status(500).send("Stripe is not configured");

  console.info("⚡ [Stripe Webhook] Received request at /stripe/webhook");

  const sig = req.headers["stripe-signature"];
  let event;
  try {
    // With express.raw(), req.body IS the raw Buffer
    const body = req.rawBody || req.body;
    
    if (!body || !Buffer.isBuffer(body)) {
       console.error("❌ [Stripe Webhook] Error: body is missing or not a Buffer. Body type:", typeof body);
       return res.status(400).send("Webhook Error: Raw body missing");
    }
    
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    console.info(`✅ [Stripe Webhook] Verified Event: ${event.type}`);
  } catch (err) {
    console.error(`❌ [Stripe Webhook] Verification Failed: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const { type, userId, tier, gemAmount } = session.metadata;
    console.info(`🔔 Stripe Webhook: Received ${event.type} for Type: ${type}, User: ${userId}`);

    const MAX_RETRIES = 3;
    let attempt = 0;
    let processed = false;

    while (attempt < MAX_RETRIES && !processed) {
      const dbSession = await mongoose.startSession();
      dbSession.startTransaction();

      try {
        // Idempotency check: Has this session already been processed?
        const existingTx = await Transaction.findOne({ source: session.id }).session(dbSession);
        if (existingTx) {
          await dbSession.abortTransaction();
          dbSession.endSession();
          processed = true;
          console.info(`Webhook for session ${session.id} already processed.`);
          break;
        }

        const user = await User.findById(userId).session(dbSession);
        if (!user) {
          console.warn(`⚠️ Stripe Webhook: User ${userId} not found in database.`);
          await dbSession.abortTransaction();
          dbSession.endSession();
          return res.status(200).json({ received: true });
        }

        const io = req.app.get("io");

        if (type === "elite_pass" || type === "premium_pass") {
          const newTier = tier || (type === "elite_pass" ? "elite" : "premium");
          console.info(`🎯 [Stripe Webhook] Activating ${newTier.toUpperCase()} subscription for user ${userId}`);
          
          user.subscriptionTier = newTier;
          user.subscriptionExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
          
          console.info(`✅ [Stripe Webhook] Subscription tier updated: ${user.subscriptionTier}, Expiry: ${user.subscriptionExpiry}`);
          
          // 🏁 Grant Booster immediately on purchase
          try {
              const { checkAndGrantBoost } = await import("./activeBoostController.js");
              // We need to bypass the daily check if possible, or just force it.
              // Actually, since we're setting the tier first, checkAndGrantBoost should work.
              // But checkAndGrantBoost checks todayStr. 
              // If we want it to be INSTANT, we can just set it here directly.
              const now = new Date();
              user.activeBoost = {
                  availableAt: now,
                  expiresAt: null,
                  activatedAt: null,
                  activeUntil: null,
                  isUsed: false,
                  renewCount: 0,
                  lastGrantDate: `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`
              };
          } catch (boostErr) {
              console.error("[Stripe] Boost grant failed:", boostErr);
          }

          await Transaction.create([{
            userId,
            type: "MEMBERSHIP",
            amount: session.amount_total / 100,
            currency: "INR",
            source: session.id
          }], { session: dbSession });

          await user.save({ session: dbSession });
          console.info(`💾 [Stripe Webhook] User data saved successfully for ${userId}`);
          
          await dbSession.commitTransaction();
          console.info(`✅ [Stripe Webhook] Transaction committed successfully for session ${session.id}`);
          dbSession.endSession();

          createNotification({
            recipientId: userId,
            type: "order_update",
            title: "Membership Activated! 💎",
            message: `Your account has been upgraded to ${user.subscriptionTier.toUpperCase()} status.`,
            data: { tier: user.subscriptionTier }
          }).catch(e => console.error(e));

          if (io) io.to(`user_${userId}`).emit("subscription_success", { status: "active", tier: user.subscriptionTier });
          
          await updateLeaderboardScore(userId, user.gems || 0, user.xp || 0, user.elo || 1000);
          
          processed = true;

        } else if (type === "gem_purchase") {
          const amount = parseInt(gemAmount);
          user.gems = (user.gems || 0) + amount;

          await Transaction.create([{
            userId,
            type: "PURCHASE",
            amount: amount,
            currency: "GEMS",
            source: session.id
          }], { session: dbSession });

          await user.save({ session: dbSession });
          await dbSession.commitTransaction();
          dbSession.endSession();

          createNotification({
            recipientId: userId,
            type: "order_update",
            title: "Gems Credited! 📦",
            message: `Your account has been credited with ${amount} Elite Gems. Thank you for your purchase!`,
            data: { gemAmount: amount }
          }).catch(e => console.error(e));

          if (io) io.to(`user_${userId}`).emit("wallet_update", { gems: user.gems });
          
          await updateLeaderboardScore(userId, user.gems || 0, user.xp || 0, user.elo || 1000);
          
          processed = true;
        } else {
          console.warn(`⚠️ Stripe Webhook: Unhandled metadata type: ${type}`);
          await dbSession.abortTransaction();
          dbSession.endSession();
          processed = true;
        }
      } catch (err) {
        console.error(`❌ [Stripe Webhook] Error processing session ${session.id}:`, err);
        console.error(`❌ [Stripe Webhook] Error stack:`, err.stack);
        
        if (dbSession.inTransaction()) {
            await dbSession.abortTransaction();
            console.info(`🔄 [Stripe Webhook] Transaction aborted for session ${session.id}`);
        }
        dbSession.endSession();

        if (err.name === "VersionError" || err.code === 11000) { // Conflict or Duplicate Key
          attempt++;
          console.warn(`⚠️ [Stripe Webhook] Retry attempt ${attempt}/${MAX_RETRIES} for session ${session.id}`);
          if (attempt >= MAX_RETRIES) {
             console.error(`❌ [Stripe Webhook] Processing failed after ${MAX_RETRIES} retries for session ${session.id}:`, err);
             return res.status(500).send("Processing Error");
          }
          continue;
        }
        console.error(`❌ [Stripe Webhook] Fatal error for session ${session.id}:`, err);
        return res.status(500).send("Server Error");
      }
    }
  }

  res.json({ received: true });
};

// New endpoint to check if a payment session was processed
export const checkPaymentStatus = async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    // Check if transaction exists for this session
    const transaction = await Transaction.findOne({ source: sessionId });
    
    if (!transaction) {
      return res.json({
        processed: false,
        message: "No transaction found for this session ID"
      });
    }
    
    // Get user details
    const user = await User.findById(transaction.userId).select('subscriptionTier subscriptionExpiry username');
    
    res.json({
      processed: true,
      transaction: {
        type: transaction.type,
        amount: transaction.amount,
        currency: transaction.currency,
        createdAt: transaction.createdAt
      },
      user: {
        username: user?.username,
        subscriptionTier: user?.subscriptionTier,
        subscriptionExpiry: user?.subscriptionExpiry
      }
    });
  } catch (error) {
    console.error("Error checking payment status:", error);
    res.status(500).json({ message: "Failed to check payment status" });
  }
};

