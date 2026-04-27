import { User } from "../models/User.js";

/**
 * Generates a unique username based on a base string.
 * It removes spaces, converts to lowercase, and appends random digits if the username is taken.
 * @param {string} baseName - The base string to use (e.g., displayName or email prefix)
 * @returns {Promise<string>} - A unique username
 */
export const generateUniqueUsername = async (baseName) => {
  // 1. Clean up baseName: lowercase, remove spaces/special chars (ASCII only basically)
  let username = baseName
    .toLowerCase()
    .replace(/\s+/g, "") // Remove spaces
    .replace(/[^a-z0-9]/g, ""); // Remove non-alphanumeric

  // Fallback if cleaning results in empty string
  if (!username) {
    username = "player";
  }

  // 2. Check if it exists
  let existingUser = await User.findOne({ username });
  
  if (!existingUser) {
    return username;
  }

  // 3. If exists, append random suffix until unique
  let isUnique = false;
  let finalUsername = username;
  
  while (!isUnique) {
    const suffix = Math.floor(1000 + Math.random() * 9000); // 4 digit suffix
    finalUsername = `${username}${suffix}`;
    
    const duplicate = await User.findOne({ username: finalUsername });
    if (!duplicate) {
      isUnique = true;
    }
  }

  return finalUsername;
};
