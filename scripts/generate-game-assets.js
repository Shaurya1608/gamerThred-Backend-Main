/**
 * 🛠️ Gamet Asset Generation Script (Themed Edition)
 * Clones the Cyber Vanguard template and injects dynamic titles + category-specific color themes.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Relative to the server directory
const TEMPLATE_DIR = path.join(__dirname, '../frontend/public/games/cyber-vanguard');
const GAMES_DIR = path.join(__dirname, '../frontend/public/games');

const CATEGORY_THEMES = {
    "Action": { cyan: "#00f7ff", magenta: "#ff00ea" },
    "Adventure": { cyan: "#10b981", magenta: "#fbbf24" },
    "RPG": { cyan: "#f59e0b", magenta: "#dc2626" },
    "Strategy": { cyan: "#84cc16", magenta: "#14b8a6" },
    "Shooter": { cyan: "#f97316", magenta: "#ef4444" },
    "Sports": { cyan: "#0ea5e9", magenta: "#ffffff" },
    "Racing": { cyan: "#facc15", magenta: "#334155" },
    "Puzzle": { cyan: "#8b5cf6", magenta: "#ec4899" }
};

const GAME_SLUGS = {
    "Action": [
        { title: "Void Runner", slug: "void-runner" },
        { title: "Neon Strike", slug: "neon-strike" },
        { title: "Shadow Blade", slug: "shadow-blade" },
        { title: "Titan Slayer", slug: "titan-slayer" },
        { title: "Cyber Punked", slug: "cyber-punked" }
    ],
    "Adventure": [
        { title: "Mystic Forest", slug: "mystic-forest" },
        { title: "Lost Temple", slug: "lost-temple" },
        { title: "Desert Odyssey", slug: "desert-odyssey" },
        { title: "Arctic Quest", slug: "arctic-quest" },
        { title: "Sky Islands", slug: "sky-islands" }
    ],
    "RPG": [
        { title: "Dragon Born", slug: "dragon-born" },
        { title: "Mage Quest", slug: "mage-quest" },
        { title: "Rogue Legacy", slug: "rogue-legacy" },
        { title: "Knight's Vow", slug: "knights-vow" },
        { title: "Sorcerer's Path", slug: "sorcerers-path" }
    ],
    "Strategy": [
        { title: "Core Defense", slug: "core-defense" },
        { title: "Galaxy War", slug: "galaxy-war" },
        { title: "Kingdom Rise", slug: "kingdom-rise" },
        { title: "Battle Tactics", slug: "battle-tactics" },
        { title: "Resource Wars", slug: "resource-wars" }
    ],
    "Shooter": [
        { title: "Sniper Elite", slug: "sniper-elite" },
        { title: "Mech Wars", slug: "mech-wars" },
        { title: "Frontier Ops", slug: "frontier-ops" },
        { title: "Space Marine", slug: "space-marine" },
        { title: "Delta Strike", slug: "delta-strike" }
    ],
    "Sports": [
        { title: "Pro Kicks", slug: "pro-kicks" },
        { title: "Slam Dunk", slug: "slam-dunk" },
        { title: "Tennis Star", slug: "tennis-star" },
        { title: "Goal Getter", slug: "goal-getter" },
        { title: "Home Run", slug: "home-run" }
    ],
    "Racing": [
        { title: "Speed Demon", slug: "speed-demon" },
        { title: "Drift King", slug: "drift-king" },
        { title: "Neon Racer", slug: "neon-racer" },
        { title: "Track Master", slug: "track-master" },
        { title: "Offroad Fury", slug: "offroad-fury" }
    ],
    "Puzzle": [
        { title: "Brain Maze", slug: "brain-maze" },
        { title: "Logic Grid", slug: "logic-grid" },
        { title: "Cube Solver", slug: "cube-solver" },
        { title: "Pattern Match", slug: "pattern-match" },
        { title: "Memory Flux", slug: "memory-flux" }
    ]
};

const copyDir = (src, dest) => {
    fs.mkdirSync(dest, { recursive: true });
    let entries = fs.readdirSync(src, { withFileTypes: true });

    for (let entry of entries) {
        let srcPath = path.join(src, entry.name);
        let destPath = path.join(dest, entry.name);

        entry.isDirectory() ? copyDir(srcPath, destPath) : fs.copyFileSync(srcPath, destPath);
    }
};

const generateAssets = () => {
    console.log("🚀 Starting Themed Game Asset Generation...");

    if (!fs.existsSync(TEMPLATE_DIR)) {
        console.error(`❌ Template directory not found at: ${TEMPLATE_DIR}`);
        return;
    }

    let count = 0;
    for (let category in GAME_SLUGS) {
        const theme = CATEGORY_THEMES[category] || { cyan: "#00f7ff", magenta: "#ff00ea" };
        
        for (let game of GAME_SLUGS[category]) {
            const destPath = path.join(GAMES_DIR, game.slug);
            
            // 1. Clone Template
            copyDir(TEMPLATE_DIR, destPath);

            // 2. Inject Title in index.html
            const indexPath = path.join(destPath, 'index.html');
            let indexContent = fs.readFileSync(indexPath, 'utf8');
            indexContent = indexContent.replace(/<title>.*<\/title>/, `<title>${game.title} | GAMET PRO</title>`);
            indexContent = indexContent.replace(/class="glitch-title".*?>cyber vanguard<\/div>/i, `class="glitch-title" data-text="${game.title.toUpperCase()}">${game.title.toUpperCase()}</div>`);
            fs.writeFileSync(indexPath, indexContent);

            // 3. Inject Theme in style.css
            const cssPath = path.join(destPath, 'style.css');
            let cssContent = fs.readFileSync(cssPath, 'utf8');
            cssContent = cssContent.replace(/--cyan:.*?;/, `--cyan: ${theme.cyan};`);
            cssContent = cssContent.replace(/--magenta:.*?;/, `--magenta: ${theme.magenta};`);
            fs.writeFileSync(cssPath, cssContent);

            console.log(`✅ Generated: ${game.slug} (${category} Theme Applied)`);
            count++;
        }
    }

    console.log(`\n✨ Successfully generated ${count} unique themed games!`);
};

generateAssets();
