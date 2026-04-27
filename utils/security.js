import crypto from "crypto";
// server/utils/security.js

/**
 * Validates that a redirect URL is safe and belongs to an allowed domain.
 * Prevents Open Redirect vulnerabilities.
 */
export const validateRedirect = (url) => {
  if (!url) return null;

  try {
    const allowedOrigins = [
      process.env.FRONTEND_URL,
      process.env.ADMIN_URL,
      "https://gamert.vercel.app",
      "https://gamert-admin.vercel.app",
      "http://localhost:5173",
      "http://localhost:5174"
    ].filter(Boolean).map(origin => new URL(origin).origin);

    const targetUrl = new URL(url);
    
    // Check if the origin of the target URL is in our allowed list
    if (allowedOrigins.includes(targetUrl.origin)) {
      return url;
    }

    // Special case for relative paths (if we ever use them)
    if (url.startsWith("/")) {
        return url;
    }

    return null;
  } catch (error) {
    // If URL is invalid or relative, and doesn't start with /, it's unsafe
    if (url.startsWith("/")) return url;
    return null;
  }
};

/**
 * Hashes a token using SHA256 for secure storage.
 */
export const hashToken = (token) => {
    return crypto.createHash("sha256").update(token).digest("hex");
};
