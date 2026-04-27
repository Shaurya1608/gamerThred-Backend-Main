import { RewardOrder } from "../models/RewardOrder.js";
import { User } from "../models/User.js";
import { Reward } from "../models/Reward.js";
import { Cart } from "../models/Cart.js";
import { GemPackage } from "../models/GemPackage.js";
import Transaction from "../models/Transaction.js";
import mongoose from "mongoose";
import { updateLeaderboardScore } from "../utils/redisUtils.js";

export const getRewards = async (req, res) => {
  try {
    const { category, search } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const query = { isActive: true };
    if (category && category !== "All") {
      query.category = category;
    }
    if (search) {
      query.title = { $regex: search, $options: "i" };
    }

    const [rewards, total] = await Promise.all([
      Reward.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Reward.countDocuments(query)
    ]);

    // For backwards compatibility with the "grouped" landing page
    // if the frontend isn't using pagination yet, we can conditionally
    // return the grouped structure if requested, but the default is now paginated.
    if (req.query.grouped === "true") {
      const allActive = await Reward.find({ isActive: true });
      const grouped = { Daily: [], Special: [], Weekly: [] };
      allActive.forEach(r => grouped[r.category]?.push(r));
      return res.json({ success: true, rewards: grouped });
    }

    res.json({
      success: true,
      rewards,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit),
        hasMore: total > skip + rewards.length
      }
    });
  } catch (err) {
    console.error("Fetch rewards error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch rewards" });
  }
};

export const getGemPackages = async (req, res) => {
  try {
    let packages = await GemPackage.find({ isActive: true }).sort({ displayOrder: 1 });
    
    // Auto-seed if vault is empty (BGMI Style)
    if (packages.length === 0) {
      const seedPacks = [
        { name: "Starter Infusion", gemAmount: 60, priceInr: 75, displayOrder: 1 },
        { name: "Tactical Supply", gemAmount: 325, priceInr: 380, description: "300 + 25 Bonus Loyalty Credits", displayOrder: 2 },
        { name: "Premium Crate", gemAmount: 660, priceInr: 750, description: "600 + 60 Bonus Loyalty Credits", displayOrder: 3 },
        { name: "Elite Cache", gemAmount: 1800, priceInr: 1900, description: "1500 + 300 Bonus Loyalty Credits", displayOrder: 4 },
        { name: "Commander Stash", gemAmount: 3850, priceInr: 3800, description: "3000 + 850 Bonus Loyalty Credits", displayOrder: 5 },
        { name: "Legendary Vault", gemAmount: 8100, priceInr: 7500, description: "6000 + 2100 Bonus Loyalty Credits", displayOrder: 6 }
      ];
      packages = await GemPackage.insertMany(seedPacks);
    }

    res.json({ success: true, packages });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to fetch loyalty credit vault" });
  }
};

export const redeemReward = async (req, res) => {
  const MAX_RETRIES = 3;
  let attempt = 0;

  while (attempt < MAX_RETRIES) {
    const userId = req.user._id; // Define userId here for logging
    console.log(`[Redeem] Attempt ${attempt + 1} for user ${userId.toString().slice(-4)}`);
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const { rewardId, isCart, quantity, shippingDetails } = req.body;
      console.log(`[Redeem] Body: rewardId=${rewardId}, isCart=${isCart}, qty=${quantity}`);

      // 🛡️ VALIDATE REWARD ID (Prevent CastError from crashing with 500)
      if (!isCart && rewardId && !mongoose.Types.ObjectId.isValid(rewardId)) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ success: false, message: "Invalid Reward Protocol ID." });
      }

      const user = await User.findById(userId).session(session);
      if (!user) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({ success: false, message: "User not found" });
      }

      let itemsToRedeem = [];
      let totalDiamonds = 0;
      const redeemQty = quantity || 1;

      if (isCart) {
        console.log("[Redeem] Processing cart redemption");
        const cart = await Cart.findOne({ user: userId }).populate("items.reward").session(session);
        if (!cart || cart.items.length === 0) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({ message: "Cart is empty" });
        }

        for (const item of cart.items) {
          if (!item.reward || !item.reward.isActive) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ message: `Item ${item.reward?.title || "Unknown"} is no longer available` });
          }
          if (item.reward.stock < item.quantity) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ message: `Insufficient stock for ${item.reward.title}` });
          }
          totalDiamonds += (item.reward.priceDiamonds || 0) * item.quantity;
          itemsToRedeem.push({ 
            rewardId: item.reward._id, 
            quantity: item.quantity,
            priceEach: item.reward.priceDiamonds,
            title: item.reward.title
          });
        }
      } else {
        const reward = await Reward.findById(rewardId).session(session);
        if (!reward || !reward.isActive) {
          await session.abortTransaction();
          session.endSession();
          return res.status(404).json({ message: "Reward not available" });
        }
        if (reward.stock < redeemQty) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({ message: `Insufficient stock. Only ${reward.stock} available.` });
        }
        if (!reward.priceDiamonds || reward.priceDiamonds <= 0) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({ message: "This reward is not available for Loyalty Credits yet." });
        }
        totalDiamonds = reward.priceDiamonds * redeemQty;

        // 🔐 TIERED ACCESS CHECK (Skip in dev for easy testing)
        if (process.env.NODE_ENV !== "development") {
            if (reward.category === "Weekly" && user.subscriptionTier === "none") {
              await session.abortTransaction();
              session.endSession();
              return res.status(403).json({ message: "Weekly Rewards require a Premium or Elite Pass" });
            }
            if (reward.category === "Special" && user.subscriptionTier !== "elite") {
              await session.abortTransaction();
              session.endSession();
              return res.status(403).json({ message: "Special Rewards are exclusive to Elite Pass holders" });
            }
        }

        itemsToRedeem.push({ rewardId: reward._id, quantity: redeemQty, priceEach: reward.priceDiamonds, title: reward.title });
      }

      if (user.gems < totalDiamonds) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ message: "Insufficient Loyalty Credits balance" });
      }
      
      // Process Transaction
      user.gems -= totalDiamonds;
      console.log(`[Redeem] Deducting ${totalDiamonds} gems from user. Current balance: ${user.gems + totalDiamonds}`);
      await user.save({ session });
      console.log("[Redeem] User updated");

      // 💳 Track Transaction
      await Transaction.create([{
        userId,
        type: "PURCHASE",
        amount: totalDiamonds,
        currency: "GEMS",
        source: `shop_redeem:${Date.now()}`
      }], { session });
      console.log("[Redeem] Transaction log created");

      for (const item of itemsToRedeem) {
          // 1. Create order
          await RewardOrder.create([{
            user: user._id,
            reward: item.rewardId,
            priceDiamonds: item.priceEach,
            quantity: item.quantity,
            paymentMethod: "Loyalty Credits",
            shippingDetails
          }], { session });

          // 2. Reduce stock (using findOneAndUpdate for better atomic concurrency check)
          const updatedReward = await Reward.findOneAndUpdate(
            { _id: item.rewardId, stock: { $gte: item.quantity } },
            { $inc: { stock: -item.quantity } },
            { session, new: true, runValidators: true }
          );

          if (!updatedReward) {
            throw new Error(`Stock mismatch for ${item.title}`);
          }
      }

      if (isCart) {
          await Cart.findOneAndUpdate({ user: userId }, { items: [] }, { session });
      }

      // COMMIT Everything
      console.log("[Redeem] Committing transaction...");
      await session.commitTransaction();
      session.endSession();
      console.log("[Redeem] Transaction committed successfully");

      const io = req.app.get("io");
      if (io) {
        io.to(`user_${userId}`).emit("wallet_update", { 
          gems: user.gems 
        });
      }

      // 📈 Sync to Redis Leaderboard (Fire-and-forget)
      updateLeaderboardScore(userId.toString(), user.gems || 0, user.xp || 0, user.elo || 1000);

      return res.json({
        success: true,
        message: `Redemption successful`,
      });
    } catch (error) {
      if (session.inTransaction()) {
        await session.abortTransaction();
      }
      session.endSession();

      // Check for VersionError (Optimistic Concurrency Conflict)
      if (error.name === "VersionError" || error.message.includes("Stock mismatch")) {
        attempt++;
        if (attempt >= MAX_RETRIES) {
          console.error("Redeem failed after max retries:", error);
          return res.status(409).json({ message: "High traffic detected. Please try again." });
        }
        console.warn(`Redeem conflict, retry attempt ${attempt}...`);
        continue; // Retry the transaction
      }

      console.error("Redeem error:", error);
      return res.status(500).json({ message: error.message || "Redeem failed" });
    }
  }
};
export const getMyOrders = async (req, res) => {
  try {
    const orders = await RewardOrder.find({ user: req.user._id })
      .populate("reward", "title imageUrl priceDiamonds")
      .sort({ createdAt: -1 });

    res.json({ success: true, orders });
  } catch (error) {
    console.error("Fetch my orders error:", error);
    res.status(500).json({ message: "Failed to fetch orders" });
  }
};

export const cancelOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.user._id;

    const order = await RewardOrder.findById(orderId).populate("reward");
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    // 1. Verify Ownership
    if (order.user.toString() !== userId.toString()) {
      return res.status(403).json({ success: false, message: "Not authorized to cancel this order" });
    }

    // 2. 24-Hour Window Check
    const orderDate = new Date(order.createdAt);
    const now = new Date();
    const hoursDiff = (now - orderDate) / (1000 * 60 * 60);

    if (hoursDiff > 24) {
      return res.status(400).json({ success: false, message: "Cancellation window (24h) has expired" });
    }

    // 3. Logic: Pending (Auto-Cancel) vs Processing (Request-Cancel)
    if (order.deliveryStatus === "Pending") {
      // ✅ CASE 1: NEW ORDER (Autonomous)
      const user = await User.findById(userId);
      const refundAmount = (order.priceDiamonds || 0) * (order.quantity || 1);
      
      user.gems += refundAmount;
      await user.save();

      // 💳 Track Refund Transaction
      await Transaction.create({
        userId,
        type: "ADMIN_ADJUST", // Refund is an adjustment
        amount: refundAmount,
        currency: "GEMS",
        source: `refund_order:${order._id}`
      });

      if (order.reward) {
        order.reward.stock += (order.quantity || 1);
        await order.reward.save();
      }

      order.deliveryStatus = "Cancelled";
      order.refunded = true;
      await order.save();

      const io = req.app.get("io");
      if (io) {
        io.to(`user_${userId}`).emit("wallet_update", { gems: user.gems });
      }

      return res.json({
        success: true,
        message: "Order cancelled and Loyalty Credits refunded automatically.",
        newBalance: user.gems
      });

    } else if (order.deliveryStatus === "Processing") {
      // ✅ CASE 2: PROCESSING (Request-Cancel)
      order.cancellationRequested = true;
      order.cancellationStatus = "Pending";
      await order.save();

      return res.json({
        success: true,
        message: "Cancellation request sent to Admin for review."
      });

    } else {
      // ❌ CASE 3: SHIPPED/DELIVERED/CANCELLED
      return res.status(400).json({ 
        success: false,
        message: `Order already ${order.deliveryStatus.toLowerCase()} and cannot be cancelled.` 
      });
    }

    // 7. Notify Frontend
    const io = req.app.get("io");
    if (io) {
      io.to(`user_${userId}`).emit("wallet_update", { 
        gems: user.gems 
      });
    }

    return res.json({
      success: true,
      message: "Order cancelled successfully. Loyalty Credits refunded.",
      newBalance: user.gems
    });

  } catch (error) {
    console.error("Cancel order error:", error);
    return res.status(500).json({ success: false, message: "Failed to cancel order" });
  }
};
export const getRecentRedemptions = async (req, res) => {
  try {
    const redemptions = await RewardOrder.find()
      .populate("user", "username avatar")
      .populate("reward", "title")
      .sort({ createdAt: -1 })
      .limit(15);

    res.json({ success: true, redemptions });
  } catch (error) {
    console.error("Fetch recent redemptions error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch redemptions" });
  }
};
