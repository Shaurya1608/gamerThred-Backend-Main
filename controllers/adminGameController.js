import { Game } from "../models/Game.js";
import { Mission } from "../models/Mission.js";
import { logAudit } from "../utils/auditLogger.js";
import multer from "multer";
import AdmZip from "adm-zip";
import path from "path";
import fs from "fs";
import { fileURLToPath } from 'url';
import { uploadToCloudinary } from "../utils/uploadUtils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure multer for ZIP file uploads
// Configure multer for memory storage (Stateless)
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.fieldname === "gameZip") {
      if (file.mimetype === "application/zip" || file.originalname.endsWith(".zip")) {
        cb(null, true);
      } else {
        cb(new Error("Only ZIP files are allowed for game code"));
      }
    } else if (file.fieldname === "image") {
      if (file.mimetype.startsWith("image/")) {
        cb(null, true);
      } else {
        cb(new Error("Only image files are allowed for thumbnail"));
      }
    } else {
      cb(null, true);
    }
  },
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

export const uploadMiddleware = upload.fields([
  { name: "gameZip", maxCount: 1 },
  { name: "image", maxCount: 1 }
]);

// Upload and extract game
export const uploadGame = async (req, res) => {
  try {
    const integrationType = req.body.integrationType || "local";
    const gameZip = req.files?.gameZip?.[0];
    const imageFile = req.files?.image?.[0];

    if (integrationType === "local" && !gameZip) {
      return res.status(400).json({ success: false, message: "No game code (ZIP) uploaded for local integration" });
    }

    const { title, description, categoryId, categoryName, imageUrl } = req.body;

    if (!title || !categoryId) {
      // No cleanup needed for memory storage
      return res.status(400).json({ success: false, message: "Title and category are required" });
    }

    // Handle Image Upload if file provided
    let finalImageUrl = imageUrl || "https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=1000&auto=format&fit=crop";
    
    if (imageFile) {
      const result = await uploadToCloudinary(imageFile.buffer, "games");
      finalImageUrl = result.url;
    }

    // Generate slug from title
    const gameKey = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

    // Handle ZIP Extraction only if Local
    if (integrationType === "local" && gameZip) {
      // Extract ZIP to frontend/public/games/{gameKey}
      const gamesDir = path.join(__dirname, "../../frontend/public/games", gameKey);
      
      if (!fs.existsSync(gamesDir)) {
        fs.mkdirSync(gamesDir, { recursive: true });
      }

      const zip = new AdmZip(gameZip.buffer);
      zip.extractAllTo(gamesDir, true);

      // ✅ Deep Search for index.html
      const findIndex = (dir) => {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          const fullPath = path.join(dir, file);
          if (file.toLowerCase() === 'index.html') return dir;
          if (fs.statSync(fullPath).isDirectory()) {
            const found = findIndex(fullPath);
            if (found) return found;
          }
        }
        return null;
      };

      const sourceDir = findIndex(gamesDir);

      if (sourceDir && sourceDir !== gamesDir) {
        console.log(`📂 Flattening deep ZIP structure for ${gameKey}. Found index.html in: ${sourceDir}`);
        const items = fs.readdirSync(sourceDir);
        for (const item of items) {
          const src = path.join(sourceDir, item);
          const dest = path.join(gamesDir, item);
          if (fs.existsSync(dest)) {
              if (fs.statSync(dest).isDirectory()) fs.rmSync(dest, { recursive: true, force: true });
              else fs.unlinkSync(dest);
          }
          fs.renameSync(src, dest);
        }
      }

      if (!sourceDir || !fs.existsSync(path.join(gamesDir, "index.html"))) {
        fs.rmSync(gamesDir, { recursive: true, force: true });
        return res.status(400).json({ 
          success: false, 
          message: "ZIP must contain an index.html file. Please check your ZIP structure." 
        });
      }
    }


    const existing = await Game.findOne({ gameKey });

    let game;
    if (existing) {
      console.log(`📝 Updating existing game record for ${gameKey}`);
      game = await Game.findByIdAndUpdate(existing._id, {
        title,
        description: description || "",
        categoryId,
        categoryName: categoryName || "Action",
        image: finalImageUrl,
        integrationType,
        gameUrl: integrationType === "remote" ? (req.body.gameUrl || existing.gameUrl) : gameKey,
        showOnHome: true,
      }, { new: true });
    } else {
      game = await Game.create({
        title,
        description: description || "",
        categoryId,
        categoryName: categoryName || "Action",
        image: finalImageUrl,
        gameUrl: integrationType === "remote" ? req.body.gameUrl : gameKey,
        gameKey,
        integrationType,
        previewUrl: req.body.previewUrl || "",
        missionCost: 0,
        maxAttempts: 999,
        isFeatured: false,
        showOnHome: true,
        homeOrder: 99,
        objectives: [],
        createdBy: req.user?.username || "Admin"
      });
    }

    // 🔗 AUTO-RELINK MISSIONS: If this game was re-uploaded, link any old missions
    try {
        const missionsUpdated = await Mission.updateMany(
            { $or: [ { gameId: { $exists: false } }, { gameId: null }, { gameId: { $in: [null, undefined] } } ], title: { $regex: new RegExp(`^${game.title}$`, 'i') } },
            { $set: { gameId: game._id } }
        );
        if (missionsUpdated.modifiedCount > 0) {
            console.log(`🔗 Re-linked ${missionsUpdated.modifiedCount} missions to the new game record: ${game.title}`);
        }
    } catch (relinkErr) {
        console.error("⚠️ Failed to auto-relink missions:", relinkErr);
    }

    await logAudit(req, existing ? "GAME_UPDATED" : "GAME_CREATED", { gameId: game._id, title: game.title });
    res.json({ 
      success: true, 
      message: existing ? "Game updated successfully" : "Game uploaded successfully", 
      game 
    });

  } catch (error) {
    console.error("❌ Upload error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get all games (admin view)
export const getAllGamesAdmin = async (req, res) => {
  try {
    const games = await Game.find().sort({ createdAt: -1 });
    res.json({ success: true, games });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Update game metadata
export const updateGame = async (req, res) => {
  try {
    const { id, gameId } = req.params;
    const targetId = id || gameId; // Support both parameter names
    const updates = { ...req.body };
    const imageFile = req.files?.image?.[0];
    const gameZip = req.files?.gameZip?.[0];

    // Handle Image Upload
    if (imageFile) {
      const result = await uploadToCloudinary(imageFile.buffer, "games");
      updates.image = result.url;
    }

    // Handle Game Code Update
    if (gameZip) {
      const game = await Game.findById(targetId);
      if (game) {
        const gamesDir = path.join(__dirname, "../../frontend/public/games", game.gameKey);
        if (!fs.existsSync(gamesDir)) fs.mkdirSync(gamesDir, { recursive: true });
        
        const zip = new AdmZip(gameZip.buffer);
        zip.extractAllTo(gamesDir, true);

        // ✅ Deep Search for index.html
        const findIndex = (dir) => {
          const files = fs.readdirSync(dir);
          for (const file of files) {
            const fullPath = path.join(dir, file);
            if (file.toLowerCase() === 'index.html') return dir;
            if (fs.statSync(fullPath).isDirectory()) {
              const found = findIndex(fullPath);
              if (found) return found;
            }
          }
          return null;
        };

        const sourceDir = findIndex(gamesDir);

        if (sourceDir && sourceDir !== gamesDir) {
          console.log(`📂 Flattening deep ZIP structure for ${game.gameKey} during update...`);
          const items = fs.readdirSync(sourceDir);
          for (const item of items) {
            const src = path.join(sourceDir, item);
            const dest = path.join(gamesDir, item);
            if (fs.existsSync(dest)) {
                if (fs.statSync(dest).isDirectory()) fs.rmSync(dest, { recursive: true, force: true });
                else fs.unlinkSync(dest);
            }
            fs.renameSync(src, dest);
          }
        }
      }
    }

    const game = await Game.findByIdAndUpdate(targetId, updates, { new: true });
    
    if (!game) {
      return res.status(404).json({ success: false, message: "Game not found" });
    }

    await logAudit(req, "GAME_UPDATED", { gameId: game._id, title: game.title });
    res.json({ success: true, game });
  } catch (error) {
    console.error("❌ Update error:", error);
    console.error("Error stack:", error.stack);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Delete game (files + database)
export const deleteGame = async (req, res) => {
  try {
    const { id } = req.params;

    const game = await Game.findById(id);
    if (!game) {
      return res.status(404).json({ success: false, message: "Game not found" });
    }

    // Delete game files (Source)
    const publicGamesDir = path.resolve(__dirname, "../../frontend/public/games", game.gameKey.trim());
    if (fs.existsSync(publicGamesDir)) {
      console.log(`🗑️ Deleting public game folder: ${publicGamesDir}`);
      try {
        fs.rmSync(publicGamesDir, { recursive: true, force: true });
      } catch (err) {
        console.error(`❌ Failed to delete public game folder: ${publicGamesDir}`, err);
      }
    }

    // Delete game files (Build/Dist)
    const distGamesDir = path.resolve(__dirname, "../../frontend/dist/games", game.gameKey.trim());
    if (fs.existsSync(distGamesDir)) {
      console.log(`🗑️ Deleting dist game folder: ${distGamesDir}`);
      try {
        fs.rmSync(distGamesDir, { recursive: true, force: true });
      } catch (err) {
        console.error(`❌ Failed to delete dist game folder: ${distGamesDir}`, err);
      }
    }

    // Delete from database
    await Game.findByIdAndDelete(id);

    await logAudit(req, "GAME_DELETED", { gameId: id, title: game.title });
    res.json({ success: true, message: "Game deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
