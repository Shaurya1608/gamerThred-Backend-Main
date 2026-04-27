import { Game } from "../models/Game.js";

export const getAllGames = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 24; // Default to 24 games per page
    const skip = (page - 1) * limit;

    const [games, total] = await Promise.all([
      Game.find({ isActive: true })
        .sort({ title: 1 })
        .skip(skip)
        .limit(limit),
      Game.countDocuments({ isActive: true })
    ]);

    res.status(200).json({
      success: true,
      games,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit),
        hasMore: total > skip + games.length
      }
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch games",
    });
  }
};

export const getGameById = async (req, res) => {
  try {
    const { gameId } = req.params;

    const game = await Game.findById(gameId);

    if (!game || !game.isActive) {
      return res.status(404).json({
        success: false,
        message: "Game not found",
      });
    }

    res.status(200).json({
      success: true,
      game,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch game",
    });
  }
};
export const getGameByKey = async (req, res) => {
  try {
    const { gameKey } = req.params;

    const game = await Game.findOne({ gameKey, isActive: true });

    if (!game) {
      return res.status(404).json({
        success: false,
        message: "Game not found",
      });
    }

    res.status(200).json({
      success: true,
      game,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch game by key",
    });
  }
};
