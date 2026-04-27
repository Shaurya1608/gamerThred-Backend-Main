import { HeroSlide } from "../models/HeroSlide.js";
import { logAudit } from "../utils/auditLogger.js";
import { uploadToCloudinary } from "../utils/uploadUtils.js";
import { invalidateCache } from "../utils/redisUtils.js";
import AppError from "../utils/appError.js";

// @desc    Get all active slides for home page
// @route   GET /api/hero-slides
// @access  Public
export const getActiveSlides = async (req, res) => {
  try {
    const slides = await HeroSlide.find({ isActive: true }).sort({ order: 1 });
    res.status(200).json({ success: true, slides });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get all slides for admin management
// @route   GET /admin/hero-slides
// @access  Admin
export const getAllSlidesAdmin = async (req, res) => {
  try {
    const slides = await HeroSlide.find().sort({ order: 1 });
    res.status(200).json({ success: true, slides });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const createSlide = async (req, res) => {
  try {
    const { titleTop, titleBottom, description, cta, badge, participants, order, isActive, height, width } = req.body;
    
    let imageUrl = req.body.image || "";
    if (req.file) {
      try {
        console.log("📤 Uploading new image to Cloudinary...");
        const result = await uploadToCloudinary(req.file.buffer, "hero-slides");
        imageUrl = result.url;
        console.log("✅ Image uploaded:", result.url);
      } catch (err) {
        console.error("❌ Cloudinary Upload Failed:", err);
        throw new AppError(`Upload failed: ${err.message}`, 400);
      }
    }

    console.log("💾 Creating slide in DB...");
    const slide = await HeroSlide.create({
      titleTop,
      titleBottom,
      description,
      cta,
      badge,
      participants,
      order,
      isActive,
      image: imageUrl,
      height,
      width
    });

    try {
      await logAudit(req, "CREATE_HERO_SLIDE", { slideId: slide._id });
    } catch (err) {
      console.error("⚠️ Audit Log Failed (Non-critical):", err);
    }
    
    try {
      // 💡 Cache Invalidation
      await invalidateCache("hero_slides:/api/hero-slides");
    } catch (err) {
      console.error("⚠️ Cache Invalidation Failed (Non-critical):", err);
    }
    
    console.log("✅ Slide created successfully:", slide._id);
    res.status(201).json({ success: true, slide });
  } catch (error) {
    console.error("❌ createSlide Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update a hero slide
// @route   PUT /admin/hero-slides/:id
// @access  Admin
export const updateSlide = async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log("🔄 Update Request for Slide:", id);
    console.log("📋 Request Body:", Object.keys(req.body));
    console.log("📎 File Attached:", !!req.file);
    
    const updates = { ...req.body };

    // 🖼️ Handle Image Upload
    if (req.file) {
      try {
        console.log("📤 Uploading new image to Cloudinary...");
        console.log("📏 File Size:", (req.file.size / 1024).toFixed(2), "KB");
        const result = await uploadToCloudinary(req.file.buffer, "hero-slides");
        updates.image = result.url;
        console.log("✅ Image uploaded:", result.url);
      } catch (err) {
        console.error("❌ Cloudinary Upload Failed:", err);
        return res.status(400).json({ 
          success: false, 
          message: `Image upload failed: ${err.message}` 
        });
      }
    }

    console.log("💾 Updating slide in DB with:", Object.keys(updates));
    const slide = await HeroSlide.findByIdAndUpdate(id, updates, { 
      new: true,
      runValidators: true 
    });
    
    if (!slide) {
      console.log("❌ Slide not found:", id);
      return res.status(404).json({ success: false, message: "Slide not found" });
    }

    try {
      await logAudit(req, "UPDATE_HERO_SLIDE", { slideId: id });
    } catch (err) {
      console.error("⚠️ Audit Log Failed (Non-critical):", err);
    }

    try {
      // 💡 Cache Invalidation
      await invalidateCache("hero_slides:/api/hero-slides");
    } catch (err) {
      console.error("⚠️ Cache Invalidation Failed (Non-critical):", err);
    }

    console.log("✅ Slide updated successfully:", slide._id);
    res.status(200).json({ success: true, slide });
  } catch (error) {
    console.error("❌ updateSlide Error:", error);
    console.error("Error Stack:", error.stack);
    res.status(500).json({ 
      success: false, 
      message: error.message || "Failed to update slide",
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// @desc    Delete a hero slide
// @route   DELETE /admin/hero-slides/:id
// @access  Admin
export const deleteSlide = async (req, res) => {
  try {
    const { id } = req.params;
    const slide = await HeroSlide.findByIdAndDelete(id);

    if (!slide) {
      return res.status(404).json({ success: false, message: "Slide not found" });
    }

    await logAudit(req, "DELETE_HERO_SLIDE", { slideId: id });

    // 💡 Cache Invalidation
    await invalidateCache("hero_slides:/api/hero-slides");

    res.status(200).json({ success: true, message: "Slide deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
