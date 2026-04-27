import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Mission } from './models/Mission.js';
import { Game } from './models/Game.js';
import { invalidateCache } from './utils/redisUtils.js';

dotenv.config();

const gameMissionData = {
    "highway-rush": {
        titles: ["Speed Demon", "Traffic Weaver", "Nitro Boost", "Asphalt King", "Highway Hero", "Turbo Charge", "Drift Master", "Lane Splitter", "Midnight Racer", "Rush Hour Survivor"],
        category: "speed"
    },
    "knife-dodge-game": {
        titles: ["Blade Runner", "Steel Survivor", "Reflex Master", "Knife Juggler", "Shadow Step", "Edge Walker", "Dagger Dodger", "Point Blank", "Sharp Senses", "Unstoppable"],
        category: "agility"
    },
    "cyber-slicer": {
        titles: ["Data Cutter", "Node Breaker", "Glitch Hunter", "System Slicer", "Circuit Breaker", "Neon Blade", "Core Eraser", "Malware Purge", "Packet Slasher", "Grid Runner"],
        category: "action"
    },
    "neon-interceptor": {
        titles: ["Void Pilot", "Spectral Chase", "Light Speed", "Neon Drift", "Quantum Intercept", "Cyber Hunter", "Grid Guardian", "Vector Strike", "Zero Point", "Phase Shifter"],
        category: "action"
    },
    "quantum-void": {
        titles: ["Cosmic Survivor", "Singularity", "Void Walker", "Astro Guard", "Nebula Scout", "Stellar Breach", "Gravity Defier", "Event Horizon", "Black Hole Sun", "Star Dust"],
        category: "survival"
    },
    "star-force": {
        titles: ["Galaxy Defender", "Alien Scourge", "Star Commander", "Nova Strike", "Fleet Vanguard", "Orbital Guard", "Deep Space 9", "Cosmos Warrior", "Alpha Centauri", "Solar Flare"],
        category: "shooter"
    },
    "cyber-vanguard": {
        titles: ["Tactical Protocol", "Vanguard Lead", "Cyber Strike", "Modular Warrior", "Tech Guard", "Neural Link", "Frontier Recon", "Elite Ops", "System Defender", "Armor Breach"],
        category: "action"
    },
    "knights-vow": {
        titles: ["Honor Guard", "Steel Vow", "Shield Bearer", "Duel Master", "Royal Defender", "Legacy Knight", "Brave Heart", "Iron Will", "Dragon Slayer", "Castle Guard"],
        category: "combat"
    }
};

const difficulties = ["easy", "medium", "hard"];

async function seedMissions() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to Database');

        const games = await Game.find({ isActive: true });
        if (games.length === 0) {
            console.error('No active games found.');
            process.exit(1);
        }

        console.log(`Found ${games.length} active games. Generating 100 tailored missions...`);

        const missions = [];
        const now = new Date();
        const nextYear = new Date();
        nextYear.setFullYear(now.getFullYear() + 1);

        for (let i = 0; i < 100; i++) {
            const game = games[Math.floor(Math.random() * games.length)];
            const gameData = gameMissionData[game.gameKey] || { titles: ["Elite Challenge"], category: "general" };
            
            const titlePrefix = gameData.titles[Math.floor(Math.random() * gameData.titles.length)];
            const titleSuffix = i + 1; // Ensure uniqueness
            const title = `${titlePrefix} #${titleSuffix}`;
            
            const difficulty = difficulties[Math.floor(Math.random() * difficulties.length)];
            const category = gameData.category;

            let rewardGtc, entryFeeGtc, minScore, rewardXp;

            if (difficulty === "easy") {
                rewardGtc = Math.floor(Math.random() * 50) + 20;
                entryFeeGtc = Math.floor(Math.random() * 5);
                minScore = Math.floor(Math.random() * 1000) + 500;
                rewardXp = 40;
            } else if (difficulty === "medium") {
                rewardGtc = Math.floor(Math.random() * 200) + 100;
                entryFeeGtc = Math.floor(Math.random() * 20) + 10;
                minScore = Math.floor(Math.random() * 5000) + 2000;
                rewardXp = 100;
            } else { // hard
                rewardGtc = Math.floor(Math.random() * 800) + 400;
                entryFeeGtc = Math.floor(Math.random() * 100) + 50;
                minScore = Math.floor(Math.random() * 20000) + 10000;
                rewardXp = 250;
            }

            missions.push({
                title,
                image: game.image, // Use game image for consistency
                gameId: game._id,
                minScore,
                minTime: 0,
                rewardGtc,
                entryFeeGtc,
                rewardXp,
                maxAttempts: difficulty === "hard" ? 3 : 10,
                startsAt: now,
                expiresAt: nextYear,
                isActive: true,
                isTrending: Math.random() > 0.8,
                missionType: "regular",
                difficulty,
                category
            });
        }

        await Mission.deleteMany({ missionType: "regular" });
        const createdMissions = await Mission.insertMany(missions);
        console.log(`Successfully created ${createdMissions.length} TAILORED missions!`);

        // 🧹 Clear the cache so missions appear immediately
        try {
            await invalidateCache("user_missions:*");
            await invalidateCache("trending_missions:*");
            console.log('Mission cache invalidated successfully.');
        } catch (cacheErr) {
            console.error('Failed to invalidate cache:', cacheErr);
        }

        process.exit(0);
    } catch (err) {
        console.error('Seeding failed:', err);
        process.exit(1);
    }
}

seedMissions();
