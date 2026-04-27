import { redis } from "../config/redis.js";
import { WeekendMission } from "../models/WeekendMission.js";
import { WeekendMissionRegistration } from "../models/WeekendMissionRegistration.js";
import { Community } from "../models/Community.js";
import { User } from "../models/User.js";
import activityService from "./activityService.js";
import * as notificationController from "../controllers/notificationController.js";
import { addItem } from "../services/inventoryService.js";

class WeekendMissionService {
  /**
   * Register a group for a weekend mission
   */
  async registerGroup(missionId, groupId, userId) {
    const mission = await WeekendMission.findById(missionId);
    // Allow registration if pending OR active (late start)
    if (!mission || !["pending", "active"].includes(mission.status)) {
      throw new Error("Mission not found or ended");
    }

    // Check if already registered
    const existing = await WeekendMissionRegistration.findOne({ missionId, groupId });
    if (existing) return existing;

    const group = await Community.findById(groupId).populate("owner");
    if (!group) throw new Error("Group not found");

    // Check if user is owner/admin
    if (group.owner._id.toString() !== userId.toString() && group.owner.toString() !== userId.toString()) {
      throw new Error("Only group owner can register for weekend missions");
    }

    // Freeze member list - Ensure owner is ALWAYS included
    const members = group.members.map(m => m.toString());
    const ownerId = (group.owner._id || group.owner).toString();
    if (!members.includes(ownerId)) {
        members.push(ownerId);
    }
    
    const lockedMemberIds = members;

    const registration = await WeekendMissionRegistration.create({
      missionId,
      groupId,
      lockedMemberIds,
    });

    // Lock group (using isLocked field if it exists) - ONLY for private squads
    if (group.type === "group") {
        group.isLocked = true;
        await group.save();
    }

    // 📡 Global Pulse Broadcast
    try {
      const user = await User.findById(userId);
      if (user) {
        activityService.broadcastWeekendRegistration(user, group.name, mission.title);
      }
    } catch (err) {
      console.error("Broadcast failed:", err);
    }

    // 🔔 Notify all squad members
    console.log(`📢 Notifying ${lockedMemberIds.length} squad members...`);
    let successCount = 0;
    let failCount = 0;
    
    for (const memberId of lockedMemberIds) {
      try {
        await notificationController.createNotification({
          recipientId: memberId,
          type: "weekend_mission",
          title: "Squad Deployed! 🚀",
          message: `Your squad [${group.name}] has been registered for the "${mission.title}" mission. Time to hunt!`,
          data: { missionId: missionId.toString(), groupId: groupId.toString() }
        });
        successCount++;
        console.log(`✅ Notified member ${memberId}`);
      } catch (nErr) {
        failCount++;
        console.error(`❌ Failed to notify member ${memberId}:`, nErr.message);
      }
    }
    
    console.log(`📊 Notification results: ${successCount} success, ${failCount} failed out of ${lockedMemberIds.length} total`);

    return registration;
  }

  /**
   * Track mission completion for weekend event
   */
  async trackProgress(userId, io) {
    try {
      const now = new Date();
      // 1. Find active mission
      const activeMission = await WeekendMission.findOne({
        status: { $in: ["active", "pending"] },
        startsAt: { $lte: now },
        expiresAt: { $gte: now },
      });

      if (!activeMission) {
        console.log(`[WeekendMissionService] No active mission found for user ${userId} at ${now}`);
        return;
      }

      // 2. Find if user belongs to a registered group's locked members
      const registration = await WeekendMissionRegistration.findOne({
        missionId: activeMission._id,
        lockedMemberIds: userId,
      });

      if (!registration) {
        console.log(`[WeekendMissionService] User ${userId} not registered for mission ${activeMission._id}`);
        return;
      }

      const missionId = activeMission._id;
      const groupId = registration.groupId;

      // 3. Update Redis counters
      const groupTotalKey = `weekend:mission:${missionId}:group:${groupId}:total`;
      const userContribKey = `weekend:mission:${missionId}:group:${groupId}:users`;

      const newTotal = await redis.incr(groupTotalKey);
      const newUserTotal = await redis.hincrby(userContribKey, userId.toString(), 1);

      console.log(`[WeekendMissionService] Progress updated for ${userId} in group ${groupId}. New total: ${newTotal}`);
      
      // 📊 Update Global User Stats
      await User.findByIdAndUpdate(userId, { $inc: { totalMissions: 1 } });

      // 4. Emit live update via socket
      if (io) {
        io.to(`group_${groupId}`).emit("weekend_mission_update", {
          missionId,
          groupId,
          total: newTotal,
          userTotal: newUserTotal,
          userId,
        });
      }

      // 5. Broadcast if target reached
      if (newTotal === activeMission.targetMissions) {
        console.log(`[WeekendMissionService] GOAL REACHED for group ${groupId} in mission ${missionId}`);
        if (io) {
          io.to(`group_${groupId}`).emit("weekend_mission_goal_reached", {
            missionId,
            groupId,
            targetMissions: activeMission.targetMissions
          });
        }
        
        const group = await Community.findById(groupId);
        const groupName = group ? group.name : "Elite Squad";

        activityService.broadcastWeekendGoal(groupName, activeMission.targetMissions);

        // 🔔 Notify all squad members for offline awareness
        for (const memberId of registration.lockedMemberIds) {
          try {
            await notificationController.createNotification({
              recipientId: memberId,
              type: "weekend_mission",
              title: "Mission Success! 🏆",
              message: `Your squad reached the goal of ${activeMission.targetMissions} missions. Claim your Loyalty Credits now!`,
              data: { missionId: missionId.toString() }
            });
          } catch (nErr) {
            console.error(`Failed to notify member ${memberId} of mission success:`, nErr);
          }
        }
      }
    } catch (err) {
      console.error("[WeekendMissionService] trackProgress error:", err);
    }
  }

  /**
   * Sync Redis data to MongoDB after event ends
   */
  async syncEventResults(missionId) {
    const mission = await WeekendMission.findById(missionId);
    if (!mission) throw new Error("Mission not found");

    const registrations = await WeekendMissionRegistration.find({ missionId });

    for (const reg of registrations) {
      const groupTotalKey = `weekend:mission:${missionId}:group:${reg.groupId}:total`;
      const userContribKey = `weekend:mission:${missionId}:group:${reg.groupId}:users`;

      const total = await redis.get(groupTotalKey);
      const contributions = await redis.hgetall(userContribKey);

      reg.finalTotal = parseInt(total) || 0;
      reg.userContributions = contributions;
      reg.status = reg.finalTotal >= mission.targetMissions ? "completed" : "failed";
      await reg.save();

      // Unlock group
      await Community.findByIdAndUpdate(reg.groupId, { isLocked: false });

      // Clean up Redis
      await redis.del(groupTotalKey, userContribKey);
    }

    mission.status = "ended";
    await mission.save();
  }

  /**
   * Distribute rewards based on user contributions
   */


  async distributeRewards(missionId) {
    const mission = await WeekendMission.findById(missionId);
    if (!mission || mission.status !== "ended") {
      throw new Error("Event must be ended before distributing rewards");
    }

    const { baseGems, perMissionGems, capGems } = mission.rewardConfig;
    const registrations = await WeekendMissionRegistration.find({
      missionId,
      status: "completed",
    });

    for (const reg of registrations) {
      // Identify Top 3 Contributors
      const topContributors = Array.from(reg.userContributions.entries())
        .map(([uId, count]) => ({ userId: uId, count: parseInt(count) }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 3)
        .map(u => u.userId);

      for (const [userId, countStr] of reg.userContributions.entries()) {
        const count = parseInt(countStr);
        if (count > 0) {
          // Rule: base + bonus, capped
          let rewardAmount = baseGems + (count * perMissionGems);
          rewardAmount = Math.min(rewardAmount, capGems);

          const updates = { $inc: { gems: rewardAmount } };
          
          // Bonus for Top 3
          if (topContributors.includes(userId)) {
             updates.$inc.tickets = 5;
          }

          await User.findByIdAndUpdate(userId, updates);

          // Add Boosters for Top 3 (Inventory Item)
          if (topContributors.includes(userId)) {
              try {
                  await addItem(userId, "XP_BOOST_15M", 5, "weekend_mission_top3");
              } catch (invErr) {
                  console.error(`Failed to add boosters for user ${userId}:`, invErr);
              }
          }
        }
      }
    }

    mission.status = "rewarded";
    await mission.save();
  }

  /**
   * Allow an individual user to claim their reward once the group goal is hit
   */
  async claimIndividualReward(missionId, userId) {
    const registration = await WeekendMissionRegistration.findOne({
      missionId,
      lockedMemberIds: userId,
    });

    if (!registration) throw new Error("You are not part of a registered squad for this mission");
    if (registration.claimedMemberIds.includes(userId.toString())) {
      throw new Error("Reward already claimed for this mission");
    }

    const mission = await WeekendMission.findById(missionId);
    if (!mission) throw new Error("Mission not found");

    // Check progress
    const groupTotalKey = `weekend:mission:${missionId}:group:${registration.groupId}:total`;
    const currentTotal = await redis.get(groupTotalKey);
    const total = parseInt(currentTotal) || 0;

    if (total < mission.targetMissions) {
      throw new Error("Squad goal not reached yet");
    }

    // Calculate individual reward
    const userContribKey = `weekend:mission:${missionId}:group:${registration.groupId}:users`;
    const userCount = await redis.hget(userContribKey, userId.toString());
    const count = parseInt(userCount) || 0;

    if (count <= 0) throw new Error("You must contribute at least one mission to claim squad rewards");

    const { baseGems, perMissionGems, capGems } = mission.rewardConfig;
    let rewardAmount = baseGems + (count * perMissionGems);
    rewardAmount = Math.min(rewardAmount, capGems);

    if (rewardAmount <= 0) throw new Error("No rewards to claim");

    // Distribution
    await User.findByIdAndUpdate(userId, {
      $inc: { 
        gems: rewardAmount,
        completedMissions: 1 
      },
    });

    registration.claimedMemberIds.push(userId);
    await registration.save();

    return { rewardAmount, count };
  }
}

export default new WeekendMissionService();
