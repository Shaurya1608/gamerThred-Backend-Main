import { SubscriptionConfig } from "../models/SubscriptionConfig.js";

/**
 * Get all subscription configurations
 * @route GET /api/admin/subscription-configs
 */
export const getSubscriptionConfigs = async (req, res) => {
  try {
    const configs = await SubscriptionConfig.find().sort({ tier: 1 });
    
    res.status(200).json({
      success: true,
      configs
    });
  } catch (error) {
    console.error("Error fetching subscription configs:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch subscription configurations"
    });
  }
};

/**
 * Update a subscription configuration
 * @route PUT /api/admin/subscription-configs/:tier
 */
export const updateSubscriptionConfig = async (req, res) => {
  try {
    const { tier } = req.params;
    const { priceInr, missionLimit, xpMultiplier, benefits, displayName, description, isActive, hasActiveBoost } = req.body;

    // Validate tier
    if (!["premium", "elite"].includes(tier)) {
      return res.status(400).json({
        success: false,
        message: "Invalid tier. Must be 'premium' or 'elite'"
      });
    }

    // Find and update config
    const config = await SubscriptionConfig.findOneAndUpdate(
      { tier },
      {
        priceInr,
        missionLimit,
        xpMultiplier,
        benefits,
        displayName,
        description,
        isActive,
        hasActiveBoost
      },
      { new: true, runValidators: true }
    );

    if (!config) {
      return res.status(404).json({
        success: false,
        message: `Subscription config for ${tier} not found`
      });
    }

    res.status(200).json({
      success: true,
      message: `${tier.toUpperCase()} subscription config updated successfully`,
      config
    });
  } catch (error) {
    console.error("Error updating subscription config:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update subscription configuration"
    });
  }
};

/**
 * Get a single subscription configuration by tier
 * @route GET /api/subscription-configs/:tier
 * @access Public (for frontend to display prices)
 */
export const getSubscriptionConfigByTier = async (req, res) => {
  try {
    const { tier } = req.params;
    
    const config = await SubscriptionConfig.findOne({ tier, isActive: true });
    
    if (!config) {
      return res.status(404).json({
        success: false,
        message: `Subscription config for ${tier} not found`
      });
    }

    res.status(200).json({
      success: true,
      config
    });
  } catch (error) {
    console.error("Error fetching subscription config:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch subscription configuration"
    });
  }
};
