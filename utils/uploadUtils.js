import cloudinary from "../config/cloudinary.js";
import streamifier from "streamifier";

/**
 * Uploads a buffer to Cloudinary and returns the secure URL and public_id
 * @param {Buffer} buffer - File buffer from multer
 * @param {string} folder - Destination folder in Cloudinary
 * @param {Object} options - Additional Cloudinary upload options
 * @returns {Promise<{url: string, publicId: string}>}
 */
export const uploadToCloudinary = (buffer, folder = "general", options = {}) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        ...options,
      },
      (error, result) => {
        if (error) {
          console.error("❌ Cloudinary upload failed:", error);
          return reject(error);
        }
        resolve({
          url: result.secure_url,
          publicId: result.public_id,
        });
      }
    );

    streamifier.createReadStream(buffer).pipe(uploadStream);
  });
};

/**
 * Deletes an asset from Cloudinary
 * @param {string} publicId - The public ID of the asset to delete
 * @returns {Promise<any>}
 */
export const deleteFromCloudinary = async (publicId) => {
  try {
    if (!publicId) return null;
    return await cloudinary.uploader.destroy(publicId);
  } catch (err) {
    console.error("Cloudinary Delete Error:", err);
    return null;
  }
};
