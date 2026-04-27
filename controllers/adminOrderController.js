import { RewardOrder } from "../models/RewardOrder.js";
import { User } from "../models/User.js";
import { Reward } from "../models/Reward.js";

/**
 * Fetch all reward orders with user and reward details
 */
export const getAllOrders = async (req, res) => {
  try {
    const orders = await RewardOrder.find()
      .populate("user", "username email avatar")
      .populate("reward", "title imageUrl priceDiamonds priceGtc priceInr")
      .sort({ createdAt: -1 });

    res.json({ success: true, orders });
  } catch (error) {
    console.error("Fetch orders error:", error);
    res.status(500).json({ message: "Failed to fetch orders" });
  }
};

/**
 * Update delivery status of an order
 */
export const updateOrderStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { deliveryStatus } = req.body;

    const order = await RewardOrder.findById(orderId).populate("reward");
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // If Admin cancels or rejects, and it's not already refunded
    if (["Cancelled", "Rejected"].includes(deliveryStatus) && !order.refunded) {
      const user = await User.findById(order.user);
      if (user) {
        const refundAmount = (order.priceDiamonds || 0) * (order.quantity || 1);
        user.gems += refundAmount;
        await user.save();

        if (order.reward) {
          order.reward.stock += (order.quantity || 1);
          await order.reward.save();
        }

        order.refunded = true;

        const io = req.app.get("io");
        if (io) {
          io.to(`user_${order.user}`).emit("wallet_update", { gems: user.gems });
        }
      }
    }

    order.deliveryStatus = deliveryStatus;
    await order.save();

    res.json({ success: true, order });
  } catch (error) {
    console.error("Update order error:", error);
    res.status(500).json({ message: "Failed to update order" });
  }
};

/**
 * Handle user cancellation request (for Processing orders)
 */
export const handleCancellationRequest = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { action } = req.body; // "Approve" or "Reject"

    const order = await RewardOrder.findById(orderId).populate("reward");
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (action === "Approve") {
      // 1. Refund Diamonds
      const user = await User.findById(order.user);
      if (user && !order.refunded) {
        const refundAmount = (order.priceDiamonds || 0) * (order.quantity || 1);
        user.gems += refundAmount;
        await user.save();

        if (order.reward) {
          order.reward.stock += (order.quantity || 1);
          await order.reward.save();
        }

        order.refunded = true;
        
        const io = req.app.get("io");
        if (io) {
          io.to(`user_${order.user}`).emit("wallet_update", { gems: user.gems });
        }
      }

      order.deliveryStatus = "Cancelled";
      order.cancellationStatus = "Approved";
      order.cancellationRequested = false;
    } else {
      // Reject request
      order.cancellationStatus = "Rejected";
      order.cancellationRequested = false;
    }

    await order.save();
    res.json({ success: true, message: `Cancellation request ${action}d` });

  } catch (error) {
    console.error("Handle cancel request error:", error);
  }
};

/**
 * Delete an order permanently
 */
export const deleteOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await RewardOrder.findByIdAndDelete(orderId);
    
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    res.json({ success: true, message: "Order manifest purged permanently" });
  } catch (error) {
    console.error("Delete order error:", error);
    res.status(500).json({ message: "Failed to delete order" });
  }
};
