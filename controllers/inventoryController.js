import * as inventoryService from "../services/inventoryService.js";

export const getInventory = async (req, res) => {
  try {
    const items = await inventoryService.getInventory(req.user._id);
    res.json({ success: true, inventory: items });
  } catch (error) {
    console.error("Get Inventory Error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch inventory" });
  }
};

export const useItem = async (req, res) => {
  try {
    const { itemCode } = req.body;
    if (!itemCode) return res.status(400).json({ success: false, message: "Item code required" });

    const result = await inventoryService.useItem(req.user._id, itemCode);
    res.json({ success: true, ...result });

  } catch (error) {
    console.error("Use Item Error:", error);
    res.status(400).json({ success: false, message: error.message });
  }
};
