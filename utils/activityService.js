/**
 * Global Activity Service
 * Manages platform-wide event broadcasting for high engagement.
 */

class ActivityService {
    constructor() {
        this.io = null;
    }

    /**
     * Initialize with Socket.io instance
     * @param {Object} io - Socket.io instance
     */
    init(io) {
        this.io = io;
        console.log("ActivityService initialized with Socket.io");
    }

    /**
     * Broadcast a global activity event
     * @param {Object} data - The event data
     * @param {string} data.type - Event type (win, rank_up, loot_box, level_up)
     * @param {Object} data.user - Simplified user object { _id, username, avatar }
     * @param {string} data.content - Human readable description
     * @param {Object} data.metadata - Optional extra data (gtc won, box name, etc)
     */
    broadcast(data) {
        if (!this.io) {
            console.warn("ActivityService: Attempted to broadcast before initialization");
            return;
        }

        const event = {
            id: Date.now() + Math.random().toString(36).substr(2, 9),
            timestamp: new Date(),
            ...data
        };

        this.io.emit("global_activity", event);
        console.log(`[ACTIVITY] ${data.type}: ${data.user.username} - ${data.content}`);
    }

    /**
     * Helper to broadcast a win
     */
    broadcastWin(user, pot) {
        this.broadcast({
            type: "win",
            user: { _id: user._id, username: user.username, avatar: user.avatar?.url },
            content: `just secured a massive win of ${pot} GTC in the Arena!`,
            metadata: { pot }
        });
    }

    /**
     * Helper to broadcast a level up
     */
    broadcastLevelUp(user, level) {
        this.broadcast({
            type: "level_up",
            user: { _id: user._id, username: user.username, avatar: user.avatar?.url },
            content: `surged to Level ${level}! the grind never stops.`,
            metadata: { level }
        });
    }

    /**
     * Helper to broadcast a reward claim (High value)
     */
    broadcastLoot(user, item) {
       this.broadcast({
            type: "loot",
            user: { _id: user._id, username: user.username, avatar: user.avatar?.url },
            content: `unlocked a rare ${item} from a Mystery Chest!`,
            metadata: { item }
        }); 
    }

    /**
     * Helper to broadcast weekend squad registration
     */
    broadcastWeekendRegistration(user, groupName, missionTitle) {
        this.broadcast({
            type: "weekend_mission",
            user: { _id: user._id, username: user.username, avatar: user.avatar?.url },
            content: `just deployed squad [${groupName}] for ${missionTitle}!`,
            metadata: { groupName, missionTitle }
        });
    }

    /**
     * Helper to broadcast weekend goal achievement
     */
    broadcastWeekendGoal(groupName, goal) {
        this.broadcast({
            type: "weekend_mission",
            user: { _id: "system", username: groupName, avatar: null },
            content: `Squad Milestone: Successfully completed ${goal} missions this weekend!`,
            metadata: { groupName, goal }
        });
    }
}

export default new ActivityService();
