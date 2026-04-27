import { UserInventory } from "../models/UserInventory.js";
import { InventoryLedger } from "../models/InventoryLedger.js";
import { Item } from "../models/Item.js";
import { UserActiveEffect } from "../models/UserActiveEffect.js";
import { redis } from "../config/redis.js";
import logger from "../utils/logger.js";
import mongoose from "mongoose";

/**
 * Adds an item to user inventory atomically.
 * Scalable for millions of users. 
 * Supports session for multi-document atomicity.
 */
export const addItem = async (userId, itemCode, quantity, reason, referenceId = null, session = null) => {
  const item = await Item.findOne({ code: itemCode }).session(session);
  if (!item) throw new Error(`Item not found: ${itemCode}`);

  const options = session ? { session, upsert: true } : { upsert: true };

  // Atomic Upsert
  await UserInventory.updateOne(
    { userId, itemId: item._id },
    {
      $inc: { quantity },
      $setOnInsert: { createdAt: new Date() },
      $set: { updatedAt: new Date() }
    },
    options
  );

  // Audit Log
  await InventoryLedger.create([{
    userId,
    itemId: item._id,
    change: quantity,
    reason,
    referenceId
  }], session ? { session } : {});

  // Cache Invalidation (Post-commit if session exists, but simple del is fine for eventual consistency)
  await redis.del(`inventory:${userId}`);
  
  return true;
};

/**
 * Consumes an item safely with Redis locking and atomic decrement.
 */
export const useItem = async (userId, itemCode, quantity = 1) => {
  // 1. Redis Lock to prevent duplicate usage (Exploit Protection)
  const lockKey = `lock:inventory:${userId}`;
  const lock = await redis.set(lockKey, "1", "NX", "EX", 5); 
  if (!lock) throw new Error("Please wait before using another item.");

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const item = await Item.findOne({ code: itemCode }).session(session);
    if (!item) throw new Error(`Item not found: ${itemCode}`);

    // 2. Atomic Decrement with Safety Check
    const result = await UserInventory.updateOne(
      { userId, itemId: item._id, quantity: { $gte: quantity } }, 
      { $inc: { quantity: -quantity }, $set: { updatedAt: new Date() } },
      { session }
    );

    if (result.modifiedCount === 0) {
      throw new Error("Insufficient item quantity");
    }

    // 3. Apply Effect based on Item Type
    await applyItemEffect(userId, item, session);

    // 4. Audit Log
    await InventoryLedger.create([{
      userId,
      itemId: item._id,
      change: -quantity,
      reason: "usage"
    }], { session });

    // 5. Commit Transaction
    await session.commitTransaction();
    session.endSession();
    
    // 6. Cache Invalidation
    await redis.del(`inventory:${userId}`);
    await redis.del(lockKey);

    logger.info(`[Inventory] User ${userId} used ${itemCode} x${quantity}`);

    return { success: true, item, message: `Used ${item.name}` };

  } catch (error) {
     await session.abortTransaction();
     session.endSession();
     await redis.del(lockKey);
     logger.error(`[Inventory] usage failed for user ${userId}: ${error.message}`);
     throw error;
  }
};

/**
 * Helper to apply item effects
 */
const applyItemEffect = async (userId, item, session = null) => {
  const options = session ? { session } : {};

  if (item.type === "booster" || item.type === "BOOST") {
    const multiplier = item.metadata instanceof Map ? item.metadata.get("multiplier") : item.metadata?.multiplier || 2;
    const durationMinutes = item.metadata instanceof Map ? item.metadata.get("durationMinutes") : item.metadata?.durationMinutes || 60;
    const usageLimit = item.metadata instanceof Map ? item.metadata.get("usageLimit") : item.metadata?.usageLimit || null; // null means duration-only

    const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000);
    
    let effectType = "gtc_multiplier";
    if (item.metadata?.effectType) {
        effectType = item.metadata.effectType;
    } else if (item.code.toUpperCase().includes("XP")) {
        effectType = "xp_multiplier";
    }

    await UserActiveEffect.create([{
      userId,
      effectType,
      value: multiplier,
      remainingUses: usageLimit,
      sourceItemId: item._id,
      expiresAt
    }], options);

  } else if (item.type === "protection" || item.type === "PROTECTION" || item.code === "RANK_PROTECTION") {
      const durationMinutes = item.metadata instanceof Map ? item.metadata.get("durationMinutes") : item.metadata?.durationMinutes || 5;
      const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000);
      
      await UserActiveEffect.create([{
          userId,
          effectType: "rank_protection",
          value: 1,
          sourceItemId: item._id,
          expiresAt
      }], options);

      // Also update the convenient field on the User model if needed, but the missionController hardening handles the collection now.
  }
};

/**
 * Gets user inventory with Redis Caching.
 * TTL: 120 seconds
 */
export const getInventory = async (userId) => {
  const cacheKey = `inventory:${userId}`;
  
  // 1. Check Cache
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  // 2. Query DB
  const inventory = await UserInventory.find({ userId, quantity: { $gt: 0 } })
    .populate("itemId")
    .lean();

  const formatted = inventory.map(slot => ({
    code: slot.itemId.code,
    name: slot.itemId.name,
    type: slot.itemId.type,
    image: slot.itemId.image,
    quantity: slot.quantity,
    rarity: slot.itemId.rarity,
    metadata: slot.itemId.metadata
  }));

  // 3. Set Cache
  await redis.set(cacheKey, JSON.stringify(formatted), "EX", 120);

  return formatted;
};

