import { Reward } from "../models/Reward.js";
import { uploadToCloudinary } from "../utils/uploadUtils.js";
import { logAudit } from "../utils/auditLogger.js";

export const createReward = async (req, res) => {
  try {
    const { title, priceDiamonds, stock, category } = req.body;

    if (!req.file) {
      return res.status(400).json({ message: "Image required" });
    }

    const result = await uploadToCloudinary(req.file.buffer, "rewards");

    const reward = await Reward.create({
      title,
      priceDiamonds: Number(priceDiamonds) || 0,
      stock: Number(stock),
      category,
      imageUrl: result.url,
    });

    res.json({ success: true, reward });
  } catch (err) {
    console.error("Create reward error:", err);
    res.status(500).json({ message: "Reward creation failed" });
  }
};


export const getAllRewardsAdmin = async (req, res) => {
  const rewards = await Reward.find().sort({ createdAt: -1 });
  res.json({ success: true, rewards });
};

export const toggleReward = async (req, res) => {
  const reward = await Reward.findById(req.params.id);
  reward.isActive = !reward.isActive;
  await reward.save();
  res.json({ success: true });
};

export const deleteReward = async (req, res) => {
  await Reward.findByIdAndDelete(req.params.id);
  res.json({ success: true });
};

export const updateReward = async (req, res) => {
  try {
    const { title, priceDiamonds, stock, category } = req.body;
    const reward = await Reward.findById(req.params.id);

    if (!reward) {
      return res.status(404).json({ message: "Reward not found" });
    }

    if (req.file) {
      // ... image upload logic ...
      const result = await uploadToCloudinary(req.file.buffer, "rewards");
      reward.imageUrl = result.url;
    }

    reward.title = title || reward.title;
    reward.priceDiamonds = priceDiamonds !== undefined ? Number(priceDiamonds) : reward.priceDiamonds;
    reward.stock = stock ? Number(stock) : reward.stock;
    reward.category = category || reward.category;

    await reward.save();

    res.json({ success: true, reward });
  } catch (err) {
    console.error("Update reward error:", err);
    res.status(500).json({ message: "Reward update failed" });
  }
};
