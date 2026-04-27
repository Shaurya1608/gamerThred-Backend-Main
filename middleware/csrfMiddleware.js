import crypto from "crypto";

export const csrfProtection = (req, res, next) => {
  // Skip CSRF check for safe methods
  const safeMethods = ["GET", "HEAD", "OPTIONS"];
  if (safeMethods.includes(req.method)) {
    return next();
  }

  // Skip CSRF check for mobile clients (they are not vulnerable to browser-based CSRF)
  const isMobile = req.headers["x-client-type"] === "mobile" || !req.headers["origin"];
  if (isMobile) {
    return next();
  }

  // Skip CSRF check for Stripe webhooks (they use signature verification)
  if (req.originalUrl === "/stripe/webhook") {
    return next();
  }

  const csrfHeader = req.headers["x-csrf-token"];
  // Check both naming conventions (camelCase and all-lowercase) for robustness
  const csrfCookie = req.cookies["csrftoken"] || req.cookies["csrfToken"];

  if (!csrfHeader || !csrfCookie || csrfHeader !== csrfCookie) {
    if (process.env.NODE_ENV !== "production") {
        console.warn(`[CSRF] Validation failed. Header: ${csrfHeader ? "Present" : "Missing"}, Cookie: ${csrfCookie ? "Present" : "Missing"}`);
    }
    return res.status(403).json({
      success: false,
      message: "CSRF Token validation failed. Security protocol violation detected.",
      code: "CSRF_ERROR"
    });
  }

  next();
};

export const generateCsrfToken = () => {
  return crypto.randomBytes(32).toString("hex");
};

export const setCsrfCookie = (req, res, token) => {
  const isProduction = process.env.NODE_ENV === "production" || process.env.NODE_ENV === "PROD";
  const host = req.get("host") || "";
  const isLocalhost = host.includes("localhost") || host.includes("127.0.0.1");
  const isSecureConnection = req.secure || req.header("x-forwarded-proto") === "https";

  const useSecure = isProduction && !isLocalhost && isSecureConnection;

  res.cookie("csrftoken", token, {
    httpOnly: false, // Must be readable by client script for validation header
    secure: useSecure,
    sameSite: useSecure ? "none" : "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: "/",
    domain: (useSecure && process.env.COOKIE_DOMAIN) ? process.env.COOKIE_DOMAIN : undefined,
  });
};
