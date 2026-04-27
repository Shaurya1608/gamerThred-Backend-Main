import jwt from "jsonwebtoken";
import { validateRedirect } from "../utils/security.js";
import { generateReferralCode } from "../utils/referralUtils.js";
import { verifyMail } from "../email/verifyMail.js";
import { Session } from "../models/Session.js";
import { MissionSession } from "../models/MissionSession.js";
import { redis } from "../config/redis.js";
import { User } from "../models/User.js";
import crypto from "crypto";
import { sentOtpMail } from "../email/sentOtpMail.js";
import { logAudit } from "../utils/auditLogger.js";
import { calculateLevelInfo } from "../utils/progressionUtil.js";
import { Transaction } from "../models/Transaction.js";
import { generateCsrfToken, setCsrfCookie } from "../middleware/csrfMiddleware.js";
import { checkLoginAnomaly } from "../utils/anomalyService.js";
import { hashToken } from "../utils/security.js";

// Export these for use in other controllers (like mfaController)
export const generateTokens = (userId, sessionId, familyId) => {
  const accessToken = jwt.sign({ userId, sessionId }, process.env.ACCESS_TOKEN, {
    expiresIn: "15m",
  });

  const refreshToken = jwt.sign({ userId, sessionId, familyId }, process.env.REFRESH_TOKEN, {
    expiresIn: "7d",
  });

  return { accessToken, refreshToken };
};

export const storeRefreshToken = async (userId, sessionId, refreshToken, familyId) => {
  const hashedToken = hashToken(refreshToken);
  const data = JSON.stringify({
    hash: hashedToken,
    familyId: familyId.toString(),
    createdAt: new Date().toISOString()
  });

  await redis.set(
    `refresh_token:${userId}:${sessionId}`,
    data,
    "EX",
    7 * 24 * 60 * 60
  );
};

export const setCookies = (req, res, accessToken, refreshToken) => {
  // 🔐 ENHANCED COOKIE STRATEGY
  const isProduction = process.env.NODE_ENV === "production" || process.env.NODE_ENV === "PROD";
  
  // Detection for local development flow
  const host = req.get("host") || "";
  const isLocalhost = host.includes("localhost") || host.includes("127.0.0.1");
  const isSecureConnection = req.secure || req.header("x-forwarded-proto") === "https";

  const useSecure = isProduction && !isLocalhost && isSecureConnection;

  // 🛡️ ADMIN SESSION ISOLATION (Optional but good for future)
  // Logic remains same for now to support SSO

  const cookieOptions = {
    httpOnly: true,
    secure: useSecure,
    sameSite: useSecure ? "none" : "lax", 
    maxAge: 15 * 60 * 1000, 
    path: "/",
    domain: (useSecure && process.env.COOKIE_DOMAIN) ? process.env.COOKIE_DOMAIN : undefined,
  };

  res.cookie("accessToken", accessToken, cookieOptions);

  res.cookie("refreshToken", refreshToken, {
    ...cookieOptions, // Also use secure attributes for refresh token
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });

  // 🛡️ CSRF Token (Non-HttpOnly so client can read it IF on same domain, but we also pass it in body)
  const csrfToken = generateCsrfToken();
  setCsrfCookie(req, res, csrfToken);
  
  return csrfToken;
};

// 🛡️ RE-AUTHENTICATION ENDPOINT
export const reAuthenticate = async (req, res) => {
  try {
    const { password } = req.body;
    const userId = req.user._id;
    const sessionId = req.sessionId;

    if (!password) {
      return res.status(400).json({ success: false, message: "Password required" });
    }

    const user = await User.findById(userId);
    const isMatch = await user.comparePassword(password);

    if (!isMatch) {
      await logAudit(req, "REAUTH_FAILED", { sessionId, method: "password" });
      return res.status(401).json({ success: false, message: "Incorrect password" });
    }

    // ✅ Set Re-auth flag in Redis (Valid for 5 minutes)
    // 💡 STRINGIFY IDs for consistent key matching
    await redis.set(`reauth:${userId.toString()}:${sessionId.toString()}`, "true", "EX", 5 * 60);

    await logAudit(req, "REAUTH_SUCCESS", { sessionId, method: "password" });

    return res.status(200).json({ success: true, message: "Identity verified" });
  } catch (error) {
    console.error("Re-authentication Error:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// 🛡️ MFA RE-AUTHENTICATION ENDPOINT
export const verifyMfaReauth = async (req, res) => {
  try {
    const { token } = req.body;
    const userId = req.user._id;
    const sessionId = req.sessionId;

    if (!token) {
      return res.status(400).json({ success: false, message: "MFA code is required" });
    }

    const user = await User.findById(userId).select("+mfaSecret");
    if (!user || !user.mfaEnabled || !user.mfaSecret) {
      return res.status(400).json({ success: false, message: "MFA is not enabled for this account" });
    }

    const { default: speakeasy } = await import("speakeasy");
    const verified = speakeasy.totp.verify({
      secret: user.mfaSecret,
      encoding: "base32",
      token,
      window: 2 // 🛡️ Allow 1 min drift
    });

    // 🔬 DEBUG: Verification Log
    console.log(`[ReAuth] MFA verification for ${userId}. Success: ${verified}. Sent: ${token}, Session: ${sessionId}`);

    if (!verified) {
      await logAudit(req, "REAUTH_FAILED", { sessionId, method: "mfa" });
      return res.status(400).json({ success: false, message: "Invalid MFA code" });
    }

    // ✅ Set Re-auth flag in Redis
    const redisKey = `reauth:${userId.toString()}:${sessionId.toString()}`;
    await redis.set(redisKey, "true", "EX", 5 * 60);
    await logAudit(req, "REAUTH_SUCCESS", { sessionId, method: "mfa" });

    return res.status(200).json({ success: true, message: "Identity verified via MFA" });
  } catch (error) {
    console.error("MFA Re-authentication Error:", error);
    return res.status(500).json({ success: false, message: "Internal server error during MFA verification" });
  }
};

export const registerUser = async (req, res) => {
  try {
    const { username, email, password, referralCode } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      if (!existingUser.isVerified) {
        return res.status(400).json({
          success: false,
          code: "USER_UNVERIFIED",
          message: "Email already registered but not verified. Please check your inbox or request a new link.",
        });
      }
      return res.status(400).json({
        success: false,
        message: "User already exists",
      });
    }

    // Check if this is the first user - make them admin
    const totalUsers = await User.countDocuments();
    const isFirstUser =
      process.env.ALLOW_FIRST_ADMIN === "true" && totalUsers === 0;

    // 🤝 Handle Referral Logic
    let referrer = null;
    if (referralCode) {
      referrer = await User.findOne({ referralCode: referralCode.toUpperCase() });
      if (!referrer) {
         console.warn(`Invalid referral code used: ${referralCode}`);
      }
    }

    const user = await User.create({
      username,
      email,
      password,
      authProvider: "local",
      isVerified: false,
      role: isFirstUser ? "admin" : "user",
      referralCode: generateReferralCode(),
      referredBy: referrer ? referrer._id : null,
      permissions: isFirstUser
        ? [
            "manage_users",
            "view_analytics",
            "manage_rewards",
            "manage_missions",
            "moderate_chat",
            "manage_events",
            "view_logs",
            "manage_payments",
          ]
        : [],
      gtc: 150, // 100 Base + 50 Initial Welcome Bonus
      status: "active",
    });

    // 🔐 Email verification token (SHORT LIFE)
    const verificationToken = jwt.sign(
      { userId: user._id },
      process.env.EMAIL_VERIFY_SECRET,
      { expiresIn: "10m" }
    );

    // 🔐 6-Digit OTP for Mobile fallback
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const hashedOtp = crypto.createHash("sha256").update(otp).digest("hex");
    
    user.otp = hashedOtp;
    user.otpExpiry = Date.now() + 10 * 60 * 1000; // 10 mins
    await user.save();

    let emailSent = true;
    try {
      await verifyMail(verificationToken, email, otp);
    } catch (mailError) {
      console.error("Failed to send verification email:", mailError);
      emailSent = false;
    }

    // 📈 If referred, increment referrer's count
    if (referrer) {
      await User.findByIdAndUpdate(referrer._id, { $inc: { referralCount: 1 } });
    }

    return res.status(201).json({
      success: true,
      message: emailSent 
        ? "Registration successful. Please verify your email." 
        : "Account created, but we couldn't send the verification email. Please request a new link from the login page.",
      emailSent,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        isVerified: user.isVerified,
        role: user.role,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {

    console.error("Register error:", error);
    return res.status(500).json({
      success: false,
      message: "Error registering user",
    });
  }

};

export const verification = async (req, res) => {
  try {
    const token = req.query.token;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: "Verification token missing",
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.EMAIL_VERIFY_SECRET);
    } catch (err) {
      return res.status(400).json({
        success: false,
        message:
          err.name === "TokenExpiredError"
            ? "Verification link expired"
            : "Invalid verification token",
      });
    }

    const user = await User.findById(decoded.userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (user.isVerified) {
      return res.status(400).json({
        success: false,
        message: "Email already verified",
      });
    }

    user.isVerified = true;
    await user.save();

    // 🔐 Auto-login after verification
    const newSession = await Session.create({ 
      userId: user._id,
      ip: req.ip || req.headers['x-forwarded-for'] || 'Unknown',
      userAgent: req.headers['user-agent'] || 'Unknown',
      lastActivity: new Date()
    });
    
    const { accessToken, refreshToken } = generateTokens(user._id, newSession._id, newSession._id);
    await storeRefreshToken(user._id, newSession._id, refreshToken, newSession._id);
    const csrfToken = setCookies(req, res, accessToken, refreshToken);

    user.isLoggedIn = true;
    await user.save();

    await logAudit(req, "EMAIL_VERIFIED_LINK_AUTO_LOGIN");

    return res.status(200).json({
      success: true,
      message: "Email verified successfully. Initializing access...",
      onboardingCompleted: user.onboardingCompleted,
      csrfToken,
      accessToken,
      refreshToken
    });
  } catch (error) {
    console.error("Verification error:", error);
    return res.status(500).json({
      success: false,
      message: "Email verification failed",
    });
  }
};

export const verifyEmailOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: "Email and OTP are required",
      });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (user.isVerified) {
      return res.status(400).json({
        success: false,
        message: "Email already verified",
      });
    }

    if (!user.otp || !user.otpExpiry || user.otpExpiry < Date.now()) {
      return res.status(400).json({
        success: false,
        message: "OTP expired or not found. Please request a new one.",
      });
    }

    const hashedOtp = crypto.createHash("sha256").update(otp).digest("hex");
    if (hashedOtp !== user.otp) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP code",
      });
    }

    // ✅ VERIFIED
    user.isVerified = true;
    user.otp = null;
    user.otpExpiry = null;
    await user.save();

    // 🔐 Auto-login after verification
    const newSession = await Session.create({ 
      userId: user._id,
      ip: req.ip || req.headers['x-forwarded-for'] || 'Unknown',
      userAgent: req.headers['user-agent'] || 'Unknown',
      lastActivity: new Date()
    });
    
    const { accessToken, refreshToken } = generateTokens(user._id, newSession._id, newSession._id);
    await storeRefreshToken(user._id, newSession._id, refreshToken, newSession._id);
    const csrfToken = setCookies(req, res, accessToken, refreshToken);

    user.isLoggedIn = true;
    await user.save();

    await logAudit(req, "EMAIL_VERIFIED_OTP_AUTO_LOGIN");

    return res.status(200).json({
      success: true,
      message: "Email verified successfully. Initializing access...",
      onboardingCompleted: user.onboardingCompleted,
      csrfToken,
      accessToken,
      refreshToken,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        onboardingCompleted: user.onboardingCompleted,
      }
    });
  } catch (error) {
    console.error("OTP Verification error:", error);
    return res.status(500).json({
      success: false,
      message: "Email verification failed",
    });
  }
};

export const resendVerification = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (user.isVerified) {
      return res.status(400).json({
        success: false,
        message: "Email already verified",
      });
    }

    // 🔐 Email verification token (SHORT LIFE)
    const verificationToken = jwt.sign(
      { userId: user._id },
      process.env.EMAIL_VERIFY_SECRET,
      { expiresIn: "10m" }
    );

    // 🔐 New 6-Digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const hashedOtp = crypto.createHash("sha256").update(otp).digest("hex");
    
    user.otp = hashedOtp;
    user.otpExpiry = Date.now() + 10 * 60 * 1000; // 10 mins
    await user.save();

    try {
      await verifyMail(verificationToken, email, otp);
    } catch (mailError) {
      console.error("Failed to resend verification email:", mailError);
      return res.status(500).json({
        success: false,
        message: "Failed to send verification email. Please check your email configuration.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "New verification code sent to your email.",
    });
  } catch (error) {
    console.error("Resend verification error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to resend verification link",
    });
  }
};

export const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Check if user is OAuth-only (no password)
    if (user.googleId && !user.password) {
      return res.status(400).json({
        success: false,
        message:
          "This account uses Google sign-in. Please use Google to log in.",
      });
    }

    if (!user.password) {
      return res.status(400).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    if (!user.isVerified) {
      return res.status(401).json({
        success: false,
        message: "Please verify your email first",
      });
    }

    // 🛡️ BAN CHECK
    if (user.status === "banned" || user.isBanned) {
      // Check if temporary ban has expired
      if (user.banExpires && new Date(user.banExpires) < new Date()) {
        user.status = "active";
        user.isBanned = false;
        user.banExpires = null;
        await user.save();
      } else {
        const unbanDate = user.banExpires 
          ? new Date(user.banExpires).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
          : "INDEEFINITE";
        
        return res.status(403).json({
          success: false,
          message: `PROTOCOL TERMINATED: You are banned. Access restored on: ${unbanDate}`,
          userId: user._id
        });
      }
    }

    // 🛡️ MFA CHECK
    if (user.mfaEnabled) {
        // Generate temporary MFA token (valid for 5 mins)
        // This token grants NO access, only permission to verify MFA
        const tempMfaToken = jwt.sign(
            { userId: user._id, role: user.role, partial: true }, 
            process.env.ACCESS_TOKEN, // In production, use a separate MFA_SECRET
            { expiresIn: "5m" }
        );

        return res.status(200).json({
            success: true,
            message: "MFA Verification Required",
            code: "MFA_REQUIRED",
            tempToken: tempMfaToken
        });
    }

    // 🔥 Create new session for this login
    const newSession = await Session.create({ 
      userId: user._id,
      ip: req.ip || req.headers['x-forwarded-for'] || 'Unknown',
      userAgent: req.headers['user-agent'] || 'Unknown',
      lastActivity: new Date()
    });
    
    // Verify session was created successfully
    if (!newSession) {
      throw new Error("Failed to create session");
    }

    const { accessToken, refreshToken } = generateTokens(user._id, newSession._id, newSession._id);
    // Store hash of refresh token for validation
    await storeRefreshToken(user._id, newSession._id, refreshToken, newSession._id);
    const csrfToken = setCookies(req, res, accessToken, refreshToken);

    user.isLoggedIn = true;
    
    // 🕵️ ANOMALY CHECK
    const anomalyResult = checkLoginAnomaly(user, req.ip || req.headers['x-forwarded-for'] || 'Unknown', req.headers['user-agent']);
    
    // Add to history (Cap at 50)
    if (anomalyResult.locationData) {
        user.loginHistory.push(anomalyResult.locationData);
        if (user.loginHistory.length > 50) {
            user.loginHistory.shift(); // Remove oldest
        }
        user.lastLoginIp = anomalyResult.locationData.ip;
    }

    await user.save();

    if (anomalyResult.isSuspicious) {
        console.warn(`🚨 SUSPICIOUS LOGIN: User ${user._id} - ${anomalyResult.reason}`);
        await logAudit(req, "SUSPICIOUS_LOGIN", { 
            reason: anomalyResult.reason,
            location: anomalyResult.locationData
        });
    } else {
        await logAudit(req, "USER_LOGIN", { location: anomalyResult.locationData });
    }

    return res.status(200).json({
      success: true,
      message: "Welcome back, Operator.",
      csrfToken,
      accessToken,
      refreshToken,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        onboardingCompleted: user.onboardingCompleted,
        avatar: user.avatar || "",
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({
      success: false,
      message: "Login failed",
    });
  }
};
export const refreshAccessToken = async (req, res) => {
  try {
    let oldRefreshToken = req.cookies.refreshToken;

    // 📱 Support Refresh Token in body for Mobile Apps (Fallback)
    if (!oldRefreshToken && req.body.refreshToken) {
      oldRefreshToken = req.body.refreshToken;
    }

    if (!oldRefreshToken) {
      return res.status(401).json({ success: false, message: "Refresh token missing" });
    }

    let decoded;
    try {
      decoded = jwt.verify(oldRefreshToken, process.env.REFRESH_TOKEN);
    } catch {
      return res.status(401).json({ success: false, message: "Invalid or expired refresh token" });
    }

    const { userId, sessionId, familyId } = decoded;
    const incomingHash = hashToken(oldRefreshToken);

    const user = await User.findById(userId);
    if (!user) {
      res.clearCookie("accessToken");
      res.clearCookie("refreshToken");
      return res.status(401).json({ success: false, message: "User session invalid.", code: "SESSION_REMOVED" });
    }

    if (user.status === "banned" || user.isBanned) {
        await Session.deleteMany({ userId });
        const keys = await redis.keys(`refresh_token:${userId}:*`);
        const graceKeys = await redis.keys(`refresh_token_grace:${userId}:*`);
        if (keys.length > 0) await redis.del(...keys);
        if (graceKeys.length > 0) await redis.del(...graceKeys);
        
        return res.status(403).json({
            success: false,
            message: "Account is banned. Sessions revoked.",
            code: "USER_BANNED"
        });
    }

    const session = await Session.findById(sessionId);
    if (!session) {
      return res.status(401).json({ success: false, message: "Session expired." });
    }

    // 🛡️ ADVANCED TOKEN REUSE DETECTION
    const mainTokenKey = `refresh_token:${userId}:${sessionId}`;
    const graceTokenKey = `refresh_token_grace:${userId}:${sessionId}`;
    
    const storedDataRaw = await redis.get(mainTokenKey);
    let storedData = storedDataRaw ? JSON.parse(storedDataRaw) : null;
    let isGraceUsed = false;

    if (!storedData || storedData.hash !== incomingHash) {
       // Check Grace Period (One-time use)
       const graceDataRaw = await redis.get(graceTokenKey);
       const graceData = graceDataRaw ? JSON.parse(graceDataRaw) : null;

       if (graceData && graceData.hash === incomingHash) {
          // ✅ GRACE PERIOD HIT
          console.log(`⚠️ Grace period refresh used for User ${userId}, Session ${sessionId}`);
          await logAudit(req, "TOKEN_REFRESH_GRACE", { sessionId, familyId });
          
          // CRITICAL: Grace token is usable only ONCE
          await redis.del(graceTokenKey);
          isGraceUsed = true;
       } else {
          // 🚨 ACTUAL REUSE DETECTED OR INVALID TOKEN
          console.error(`🚨 SECURITY TRIGGER: Refresh token reuse detected for User ${userId}. Revoking family chain.`);
          
          await logAudit(req, "SECURITY_ALERT", { 
            reason: "Token reuse detected", 
            sessionId, 
            familyId,
            suspiciousHash: incomingHash 
          });

          // Revoke ALL sessions for this user (Prevent persistent attack)
          await Session.deleteMany({ userId });
          const userKeys = await redis.keys(`refresh_token:${userId}:*`);
          const userGraceKeys = await redis.keys(`refresh_token_grace:${userId}:*`);
          if (userKeys.length > 0) await redis.del(...userKeys);
          if (userGraceKeys.length > 0) await redis.del(...userGraceKeys);
          
          res.clearCookie("accessToken");
          res.clearCookie("refreshToken");

          return res.status(403).json({
            success: false,
            code: "SECURITY_ALERT",
            message: "Security violation detected. All sessions revoked."
          });
       }
    }

    // 🔄 Rotate tokens
    const { accessToken: newAccessToken, refreshToken: newRefreshToken } = generateTokens(userId, sessionId, familyId);

    // If we're not in a grace period, move current token to grace window before overwriting
    if (!isGraceUsed && storedData) {
        await redis.set(graceTokenKey, JSON.stringify({ hash: storedData.hash, familyId }), "EX", 60);
    }

    await storeRefreshToken(userId, sessionId, newRefreshToken, familyId);

    await Session.findByIdAndUpdate(sessionId, { 
      lastActivity: new Date(),
      ip: req.ip || req.headers['x-forwarded-for'] || session.ip
    });

    const csrfToken = setCookies(req, res, newAccessToken, newRefreshToken);
    await logAudit(req, "TOKEN_REFRESH", { sessionId });

    return res.status(200).json({ success: true, message: "Access token refreshed", csrfToken, accessToken: newAccessToken, refreshToken: newRefreshToken });
  } catch (error) {
    console.error("Refresh token error:", error);
    return res.status(500).json({ success: false, message: "Refresh failed" });
  }
};



export const logoutUser = async (req, res) => {
  try {
    let refreshToken = req.cookies.refreshToken;

    // 📱 Support Refresh Token in body for Mobile Apps (Fallback)
    if (!refreshToken && req.body.refreshToken) {
      refreshToken = req.body.refreshToken;
    }

    // 1️⃣ If no refresh token → already logged out
    if (!refreshToken) {
      res.clearCookie("accessToken");
      res.clearCookie("refreshToken");
      return res.status(200).json({
        success: true,
        message: "Logged out",
      });
    }

    // 2️⃣ Verify refresh token
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN);
    } catch {
      // Token invalid or expired → just clear cookies
      res.clearCookie("accessToken");
      res.clearCookie("refreshToken");
      return res.status(200).json({
        success: true,
        message: "Logged out",
      });
    }

    const userId = decoded.userId;
    const sessionId = decoded.sessionId;

    // 3️⃣ Cleanup SPECIFIC session state
    await redis.del(`refresh_token:${userId}:${sessionId}`);
    await redis.del(`refresh_token_grace:${userId}:${sessionId}`);
    await Session.findByIdAndDelete(sessionId);
    
    // Only set isLoggedIn to false if this was the last session
    const remainingSessions = await Session.countDocuments({ userId });
    if (remainingSessions === 0) {
        await User.findByIdAndUpdate(userId, { isLoggedIn: false });
    }

    // 4️⃣ Clear cookies
    res.clearCookie("accessToken");
    res.clearCookie("refreshToken");
    res.clearCookie("csrfToken");
    res.clearCookie("csrftoken");

    return res.status(200).json({
      success: true,
      message: "User logged out successfully",
    });
  } catch (error) {

    console.error("Logout error:", error);
    return res.status(500).json({
      success: false,
      message: "Logout failed",
    });
  }

};
export const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate({
      path: "lastPlayedGame",
      select: "title image categoryId",
      populate: { path: "categoryId", select: "name" }
    });

    if (!user) {
        return res.status(404).json({ success: false, message: "User not found" });
    }

    // 🏎️ QUICK RESUME SESSION VALIDATION
    // If user has a lastPlayedGame but no active session, clear it (stale banner protection)
    if (user.lastPlayedGame) {
        const activeSession = await MissionSession.findOne({ 
            userId: user._id, 
            status: "active" 
        });
        
        if (!activeSession) {
            console.log(`[QuickResume] Clearing stale lastPlayedGame for user ${user._id}`);
            user.lastPlayedGame = null;
            await User.updateOne({ _id: user._id }, { $unset: { lastPlayedGame: "" } });
        } else {
            // Attach active session info for frontend (time-ago calculation)
            user._doc.activeMissionSession = {
                createdAt: activeSession.createdAt,
                lastAttemptStartedAt: activeSession.lastAttemptStartedAt
            };
        }
    }

    // 🎟️ Daily Ticket Auto-Refill Logic
    const now = new Date();
    const lastTicketReset = new Date(user.dailyTicketLastReset || 0);
    
    // Check if it's a new day
    if (now.getDate() !== lastTicketReset.getDate() || now.getMonth() !== lastTicketReset.getMonth() || now.getFullYear() !== lastTicketReset.getFullYear()) {
        // Refill if below 5
        if (user.tickets < 5) {
            user.tickets = 5;
        }
        user.dailyTicketClaimed = false;
        user.dailyTicketLastReset = now;
        await user.save();
    }

    const levelInfo = await calculateLevelInfo(user.xp || 0);
    const csrfToken = generateCsrfToken();
    setCsrfCookie(req, res, csrfToken);

    return res.status(200).json({
      success: true,
      csrfToken,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        permissions: user.permissions || [],
        avatar: user.avatar || "",
        onboardingCompleted: user.onboardingCompleted,
        dob: user.dob,
        phoneNumber: user.phoneNumber,
        elo: user.elo ?? 0,
        tier: user.tier,
        highestElo: user.highestElo,
        referralCode: user.referralCode,
        referralCount: user.referralCount,
        verifiedReferrals: user.verifiedReferrals,
        gems: user.gems,
        gtc: user.gtc,
        xp: user.xp,
        level: levelInfo.level,
        levelProgress: levelInfo.progress,
        arenaWinStreak: user.arenaWinStreak || 0,
        lastBrokenArenaWinStreak: user.lastBrokenArenaWinStreak || 0,
        arenaWinStreakRestoreUsed: user.arenaWinStreakRestoreUsed || false,
        lastBrokenStreakCount: user.lastBrokenStreakCount || 0,
        streakRestoreUsed: user.streakRestoreUsed || false,
        arenaWins: user.arenaWins || 0,
        arenaLosses: user.arenaLosses || 0,
        rank: await User.countDocuments({ elo: { $gt: user.elo ?? 0 } }) + 1,
        lastPlayedGame: user.lastPlayedGame,
        tickets: user.tickets || 0,
        dailyTicketClaimed: user.dailyTicketClaimed,
        dailyTicketLastReset: user.dailyTicketLastReset,
        subscriptionTier: user.subscriptionTier || "none",
        subscriptionExpiry: user.subscriptionExpiry,
        activeBoost: user.activeBoost,
        mfaEnabled: user.mfaEnabled,
        authProvider: user.authProvider,
      },
    });
  } catch (error) {
    console.error("getMe error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const forgetPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: "Email is required" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // 1️⃣ Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // 2️⃣ Hash OTP
    const hashedOtp = crypto.createHash("sha256").update(otp).digest("hex");

    // 3️⃣ Save hashed OTP + expiry
    user.otp = hashedOtp;
    user.otpExpiry = Date.now() + 10 * 60 * 1000; // 10 mins
    await user.save();

    // 4️⃣ Send plain OTP via email
    console.log(`📨 Attempting to send recovery OTP to: ${email}`);
    await sentOtpMail(otp, email);
    console.log(`✅ Recovery OTP successfully dispatched to: ${email}`);

    return res.status(200).json({
      success: true,
      message: "OTP sent to email",
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Password reset failed",
    });
  }
};

export const verifyOtp = async (req, res) => {
  try {
    const { otp } = req.body;
    const email = req.params.email;

    if (!otp) {
      return res.status(400).json({
        success: false,
        message: "OTP is required",
      });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (!user.otp || !user.otpExpiry) {
      return res.status(400).json({
        success: false,
        message: "No OTP found. Please request a new one.",
      });
    }

    if (user.otpExpiry < Date.now()) {
      return res.status(400).json({
        success: false,
        message: "OTP has expired",
      });
    }

    // ✅ HASH incoming OTP before comparing
    const hashedOtp = crypto.createHash("sha256").update(otp).digest("hex");

    if (hashedOtp !== user.otp) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP",
      });
    }

    // 🔐 Generate reset token
    const resetToken = crypto.randomBytes(32).toString("hex");

    // 🔐 Hash reset token before storing
    const hashedResetToken = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");

    user.resetPasswordToken = hashedResetToken;
    user.resetPasswordExpiry = Date.now() + 10 * 60 * 1000;

    // 🧹 Clear OTP
    user.otp = null;
    user.otpExpiry = null;

    await user.save();

    return res.status(200).json({
      success: true,
      message: "OTP verified successfully",
      resetToken, // 👈 send PLAIN token to frontend
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "OTP verification failed",
    });
  }
};

export const changePassword = async (req, res) => {
  try {
    const { newPassword, confirmPassword, resetToken } = req.body;

    if (!newPassword || !confirmPassword || !resetToken) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Passwords do not match",
      });
    }

    // 🔐 Hash incoming reset token (Ensure it's a string)
    const tokenStr = String(resetToken).trim();
    const hashedResetToken = crypto
      .createHash("sha256")
      .update(tokenStr)
      .digest("hex");

    // Robust lookup using new Date() for comparison
    const user = await User.findOne({
      resetPasswordToken: hashedResetToken,
      resetPasswordExpiry: { $gt: new Date() },
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Your reset link has expired or is invalid. Please request a new one.",
        code: "TOKEN_INVALID_OR_EXPIRED"
      });
    }    // ✅ Set new password (plain)
    user.password = newPassword;

    // 🧹 Clear reset token
    user.resetPasswordToken = null;
    user.resetPasswordExpiry = null;

    await user.save(); // bcrypt hashes automatically

    return res.status(200).json({
      success: true,
      message: "Password changed successfully",
    });
  } catch (error) {
    console.error("Change password error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// Google OAuth callback handler (for login/signup)
export const googleCallback = async (req, res) => {
  try {
    const user = req.user;

    if (!user) {
      console.error("❌ [Google OAuth] Login failed: req.user is missing in callback");
      return res.redirect(
        `${
          process.env.FRONTEND_URL || "http://localhost:5173"
        }/auth/login?error=oauth_failed`
      );
    }

    // 🛡️ BAN CHECK
    if (user.status === "banned" || user.isBanned) {
      if (user.banExpires && new Date(user.banExpires) < new Date()) {
        user.status = "active";
        user.isBanned = false;
        user.banExpires = null;
        await user.save();
      } else {
        const unbanDate = user.banExpires 
          ? new Date(user.banExpires).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
          : "INDEFINITE";
          
        return res.redirect(
          `${process.env.FRONTEND_URL || "http://localhost:5173"}/auth/login?error=account_banned&unban=${unbanDate}`
        );
      }
    }

    const newSession = await Session.create({ 
      userId: user._id,
      ip: req.ip || req.headers['x-forwarded-for'] || 'Unknown',
      userAgent: req.headers['user-agent'] || 'Unknown',
      lastActivity: new Date()
    });
    
    // Verify session was created successfully
    if (!newSession) {
      throw new Error("Failed to create session");
    }

    const { accessToken, refreshToken } = generateTokens(user._id, newSession._id, newSession._id);
    await storeRefreshToken(user._id, newSession._id, refreshToken, newSession._id);
    setCookies(req, res, accessToken, refreshToken);

    user.isLoggedIn = true;
    if (user.authProvider !== "google") {
      user.authProvider = "google";
    }
    await user.save();

    await logAudit(req, "OAUTH_LOGIN", { provider: "google" });

    // 🛡️ RE-AUTHENTICATION LOGIC
    let state = {};
    try {
      state = JSON.parse(req.query.state || "{}");
    } catch (e) {
      console.error("Failed to parse OAuth state:", e);
    }

    if (state.reauth) {
      // 🛡️ SECURITY: Verify that the Google account used matches the current session owner
      if (state.userId && user._id.toString() !== state.userId.toString()) {
        console.error(`[ReAuth] Mismatch! Active User: ${state.userId}, Google User: ${user._id}`);
        return res.redirect(`${state.redirect || process.env.FRONTEND_URL}?error=reauth_mismatch`);
      }

      // ✅ Set re-auth flag in Redis for the NEW session we just issued
      await redis.set(`reauth:${user._id.toString()}:${newSession._id.toString()}`, "true", "EX", 5 * 60);
      await logAudit(req, "REAUTH_SUCCESS", { sessionId: newSession._id, method: "google" });
    }

    const finalRedirect = state.redirect || `${process.env.FRONTEND_URL || "http://localhost:5173"}${user.onboardingCompleted ? "/" : "/onboarding"}`;

    if (state.nativeRedirect) {
      // Mobile app bridge: Native apps can't cleanly read Set-Cookie from OAuth redirects, 
      // so we securely hand back the JWTs in the Expo Auth Session deeper link parameters.
      const sep = state.nativeRedirect.includes("?") ? "&" : "?";
      const mobileBridgeUrl = `${state.nativeRedirect}${sep}token=${accessToken}&refreshToken=${refreshToken}&oauth=success`;
      return res.redirect(mobileBridgeUrl);
    }

    res.redirect(
      `${finalRedirect}${finalRedirect.includes("?") ? "&" : "?"}oauth=success`
    );
  } catch (error) {
    console.error("❌ [Google OAuth] Callback Error:", error);
    res.redirect(
      `${
        process.env.FRONTEND_URL || "http://localhost:5173"
      }/auth/login?error=oauth_failed`
    );
  }
};

// Google OAuth callback handler (for account linking)
export const googleLinkCallback = async (req, res) => {
  try {
    const user = req.user;

    if (!user) {
      return res.redirect(
        `${
          process.env.FRONTEND_URL || "http://localhost:5173"
        }/profile?error=link_failed`
      );
    }

    // Check if linking was successful (user should have googleId now)
    if (!user.googleId) {
      return res.redirect(
        `${
          process.env.FRONTEND_URL || "http://localhost:5173"
        }/profile?error=link_failed`
      );
    }

    // User is already logged in, Google account is now linked
    // The linking happened in passport.js strategy (req.user.googleId was set)
    // No need to save again - already saved in strategy, but save for safety
    await user.save();

    await logAudit(req, "OAUTH_LINK", { provider: "google" });

    res.redirect(
      `${process.env.FRONTEND_URL || "http://localhost:5173"}/profile?linked=google`
    );
  } catch (error) {
    console.error("Google link callback error:", error);
    res.redirect(
      `${
        process.env.FRONTEND_URL || "http://localhost:5173"
      }/profile?error=link_failed`
    );
  }
};

// ✅ Check if username is already taken
export const checkUsername = async (req, res) => {
  try {
    const { username } = req.body;
    if (!username) {
      return res.status(400).json({ success: false, message: "Username is required" });
    }

    // Find if username exists, but exclude the current user
    const existingUser = await User.findOne({ 
      username: { $regex: new RegExp(`^${username}$`, "i") },
      _id: { $ne: req.user._id } // Exclude current user
    });
    
    return res.status(200).json({
      success: true,
      available: !existingUser
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Onboarding sync failed." });
  }
};

// 🛡️ CSRF Token Entry Point
export const getCsrfToken = (req, res) => {
  const csrfToken = generateCsrfToken();
  setCsrfCookie(req, res, csrfToken);
  res.json({ success: true, csrfToken });
};

// ✅ Complete user onboarding
export const completeOnboarding = async (req, res) => {
  try {
    const { username, dob, phoneNumber } = req.body;
    const userId = req.user._id;

    if (!username || !dob || !phoneNumber) {
      return res.status(400).json({ success: false, message: "All fields are required" });
    }

    // Double check username uniqueness
    const existingUser = await User.findOne({ 
      username: { $regex: new RegExp(`^${username}$`, "i") },
      _id: { $ne: userId }
    });

    if (existingUser) {
      return res.status(400).json({ success: false, message: "Username already taken" });
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        username,
        dob: new Date(dob),
        phoneNumber,
        onboardingCompleted: true,
        $inc: { gtc: 100 }
      },
      { new: true }
    ).select("-password -otp -otpExpiry -resetPasswordToken -resetPasswordExpiry");

    // Success Audit & Transaction
    await Transaction.create({
      userId,
      type: "ADMIN_ADJUST",
      amount: 100,
      currency: "GTC",
      source: "ONBOARDING_BONUS"
    });

    return res.status(200).json({
      success: true,
      message: "Onboarding completed successfully! 100 GTC Welcome Bonus awarded.",
      user: updatedUser
    });
  } catch (error) {
    console.error("Onboarding error:", error);
    return res.status(500).json({ success: false, message: "Error completing onboarding" });
  }
};
