import { Cart } from "../models/Cart.js";
import { Reward } from "../models/Reward.js";
import { User } from "../models/User.js";
import { RewardOrder } from "../models/RewardOrder.js";

export const getCart = async (req, res) => {
  try {
    let cart = await Cart.findOne({ user: req.user._id }).populate("items.reward");
    if (!cart) {
      cart = await Cart.create({ user: req.user._id, items: [] });
    }
    res.json({ success: true, cart });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to fetch cart" });
  }
};

export const addToCart = async (req, res) => {
  try {
    console.log("Adding to cart, body:", req.body);
    console.log("User:", req.user._id);
    const { rewardId } = req.body;
    
    if (!rewardId) {
      console.log("No rewardId provided");
      return res.status(400).json({ success: false, message: "Reward ID required" });
    }

    let cart = await Cart.findOne({ user: req.user._id });

    if (!cart) {
      console.log("Creating new cart for user");
      cart = await Cart.create({ user: req.user._id, items: [] });
    }

    const itemIndex = cart.items.findIndex((item) => item.reward.toString() === rewardId);

    if (itemIndex > -1) {
      console.log("Incrementing quantity");
      cart.items[itemIndex].quantity += 1;
    } else {
      console.log("Pushing new item");
      cart.items.push({ reward: rewardId, quantity: 1 });
    }

    await cart.save();
    console.log("Cart saved");
    
    // Re-fetch to populate
    cart = await Cart.findOne({ user: req.user._id }).populate("items.reward");
    
    res.json({ success: true, cart, message: "Added to cart" });
  } catch (error) {
    console.error("Add to cart error:", error);
    res.status(500).json({ success: false, message: "Failed to add to cart" });
  }
};

export const removeFromCart = async (req, res) => {
  try {
    const { rewardId } = req.params;
    let cart = await Cart.findOne({ user: req.user._id });

    if (!cart) return res.status(404).json({ success: false, message: "Cart not found" });

    cart.items = cart.items.filter((item) => item.reward.toString() !== rewardId);
    await cart.save();
    
    cart = await Cart.findOne({ user: req.user._id }).populate("items.reward");

    res.json({ success: true, cart, message: "Removed from cart" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to remove item" });
  }
};

export const checkout = async (req, res) => {
  try {
    const cart = await Cart.findOne({ user: req.user._id }).populate("items.reward");
    if (!cart || cart.items.length === 0) {
      return res.status(400).json({ success: false, message: "Cart is empty" });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Calculate total cost and check availability
    let totalCost = 0;
    for (const item of cart.items) {
      if (!item.reward || !item.reward.isActive) {
        return res.status(400).json({ success: false, message: `Item ${item.reward?.title || "Unknown"} is no longer available` });
      }
      if (item.reward.stock < item.quantity) {
        return res.status(400).json({ success: false, message: `Insufficient stock for ${item.reward.title}` });
      }
      totalCost += item.reward.priceGtc * item.quantity;
    }

    if (user.gtc < totalCost) {
      return res.status(400).json({ success: false, message: "Insufficient GTC balance" });
    }

    // Process transaction
    user.gtc -= totalCost;
    await user.save();

    for (const item of cart.items) {
      // 1. Create order
      await RewardOrder.create({
        user: user._id,
        reward: item.reward._id,
        priceGtc: item.reward.priceGtc,
        status: "completed"
      });

      // 2. Reduce stock
      await Reward.findByIdAndUpdate(item.reward._id, {
        $inc: { stock: -item.quantity }
      });
    }

    // Clear cart
    cart.items = [];
    await cart.save();

    res.json({
      success: true,
      message: "Checkout successful",
      newBalance: user.gtc
    });
  } catch (error) {
    console.error("Checkout error:", error);
    res.status(500).json({ success: false, message: "Checkout failed" });
  }
};
