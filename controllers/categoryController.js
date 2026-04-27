import { Category } from "../models/Category.js";
import { uploadToCloudinary } from "../utils/uploadUtils.js";
import { logAudit } from "../utils/auditLogger.js";

// Get all active categories
export const getAllCategories = async (req, res) => {
  try {
    const categories = await Category.find({ isActive: true }).sort({ order: 1, name: 1 });
    res.json({ success: true, categories });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to fetch categories" });
  }
};

// Get single category
export const getCategoryById = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ success: false, message: "Category not found" });
    }
    res.json({ success: true, category });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to fetch category" });
  }
};

// Create category (admin/moderator)
export const createCategory = async (req, res) => {
  try {
    const { name, order } = req.body;

    let imageUrl = null;
    if (req.file) {
      const result = await uploadToCloudinary(req.file.buffer, "categories");
      imageUrl = result.url;
    }

    const category = await Category.create({
      name,
      image: imageUrl,
      order: order || 0,
    });

    await logAudit(req, "CATEGORY_CREATED", { categoryId: category._id, name: category.name });
    res.status(201).json({ success: true, category });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: "Category already exists" });
    }
    res.status(500).json({ success: false, message: "Failed to create category" });
  }
};

// Update category (admin/moderator)
export const updateCategory = async (req, res) => {
  try {
    const { name, order, isActive } = req.body;
    const updateData = { name, order, isActive };

    if (req.file) {
      const result = await uploadToCloudinary(req.file.buffer, "categories");
      updateData.image = result.url;
    }

    const category = await Category.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!category) {
      return res.status(404).json({ success: false, message: "Category not found" });
    }

    res.json({ success: true, category });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: "Category name already exists" });
    }
    res.status(500).json({ success: false, message: "Failed to update category" });
  }
};

// Delete category (admin/moderator)
export const deleteCategory = async (req, res) => {
  try {
    const category = await Category.findByIdAndDelete(req.params.id);
    
    if (!category) {
      return res.status(404).json({ success: false, message: "Category not found" });
    }

    await logAudit(req, "CATEGORY_DELETED", { categoryId: req.params.id });
    res.json({ success: true, message: "Category deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to delete category" });
  }
};
