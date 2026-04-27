import speakeasy from "speakeasy";
import qrcode from "qrcode";
import { User } from "../models/User.js";
import { redis } from "../config/redis.js";
import { logAudit } from "../utils/auditLogger.js";
import jwt from "jsonwebtoken";
import { Session } from "../models/Session.js";
import { generateTokens, storeRefreshToken, setCookies } from "./userController.js";

// POST /auth/mfa/setup
export const setupMfa = async (req, res) => {
  try {
    const userId = req.user._id;
    const user = await User.findById(userId);

    // Generate secret
    const secret = speakeasy.generateSecret({
      length: 20,
      name: `GamerThred (${user.email})`
    });

    // Generate QR Code
    const qrImage = await qrcode.toDataURL(secret.otpauth_url);

    // Store temp secret in Redis (expires in 10 mins)
    // We don't save to DB until they verify it works
    const redisKey = `mfa_temp_secret:${userId.toString()}`;
    await redis.set(redisKey, secret.base32, "EX", 600);

    return res.status(200).json({
      success: true,
      secret: secret.base32,
      qrCode: qrImage
    });
  } catch (error) {
    console.error("MFA Setup Error:", error);
    return res.status(500).json({ success: false, message: "MFA setup failed" });
  }
};

// POST /auth/mfa/verify-setup
export const verifyMfaSetup = async (req, res) => {
  try {
    const { token } = req.body;
    const userId = req.user._id;

    const redisKey = `mfa_temp_secret:${userId.toString()}`;
    const tempSecret = await redis.get(redisKey);

    if (!tempSecret) {
      return res.status(400).json({ success: false, message: "Setup session expired. Please refresh and try again." });
    }

    const verified = speakeasy.totp.verify({
      secret: tempSecret,
      encoding: "base32",
      token,
      window: 2 // 🛡️ Normal window (1 min drift)
    });

    if (!verified) {
      return res.status(400).json({ success: false, message: "Invalid code. Please ensure your phone time is synced to internet time." });
    }

    // Save to User DB
    await User.findByIdAndUpdate(userId, {
      mfaEnabled: true,
      mfaSecret: tempSecret
    });

    await redis.del(`mfa_temp_secret:${userId}`);
    await logAudit(req, "MFA_ENABLED");

    return res.status(200).json({ success: true, message: "MFA Enabled Successfully" });
  } catch (error) {
    console.error("MFA Verify Error:", error);
    return res.status(500).json({ success: false, message: "Verification failed" });
  }
};

// POST /auth/mfa/verify-login
// Called after partial login (when user has mfaEnabled = true)
export const verifyMfaLogin = async (req, res) => {
    try {
        const { token, tempToken } = req.body;

        if (!token || !tempToken) {
            return res.status(400).json({ success: false, message: "Token and OTP required" });
        }

        // Verify the temporary login token
        let decoded;
        try {
            decoded = jwt.verify(tempToken, process.env.ACCESS_TOKEN);
            if (!decoded.partial) {
                return res.status(400).json({ success: false, message: "Invalid session flow" });
            }
        } catch (err) {
            return res.status(401).json({ success: false, message: "Login session expired. Please try again." });
        }

        const user = await User.findById(decoded.userId).select("+mfaSecret");
        if (!user || !user.mfaEnabled || !user.mfaSecret) {
             return res.status(400).json({ success: false, message: "MFA not configured" });
        }

        const verified = speakeasy.totp.verify({
            secret: user.mfaSecret,
            encoding: "base32",
            token
        });

        if (!verified) {
            // Log failed attempt
            await logAudit(req, "MFA_LOGIN_FAILED", { userId: user._id });
            return res.status(400).json({ success: false, message: "Invalid code" });
        }

        // ✅ AUTO-LOGIN LOGIC (Duplicated securely)
        const newSession = await Session.create({ 
            userId: user._id,
            ip: req.ip || req.headers['x-forwarded-for'] || 'Unknown',
            userAgent: req.headers['user-agent'] || 'Unknown',
            lastActivity: new Date()
        });
      
        if (!newSession) throw new Error("Failed to create session");
  
        const { accessToken, refreshToken } = generateTokens(user._id, newSession._id, newSession._id);
        await storeRefreshToken(user._id, newSession._id, refreshToken, newSession._id);
        const csrfToken = setCookies(req, res, accessToken, refreshToken);
  
        user.isLoggedIn = true;
        await user.save();
  
        await logAudit(req, "MFA_LOGIN_SUCCESS");
  
        return res.status(200).json({
            success: true,
            message: "Welcome back, Operator.",
            code: "MFA_SUCCESS",
            csrfToken,
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
        console.error("MFA Login Verify Error:", error);
        return res.status(500).json({ success: false, message: "Server error" });
    }
}

// POST /auth/mfa/disable
export const disableMfa = async (req, res) => {
  try {
    const { password, token } = req.body;
    const userId = req.user._id;

    const user = await User.findById(userId).select("+password +mfaSecret");
    
    if (token) {
        // Verify via MFA Token
        const verified = speakeasy.totp.verify({
            secret: user.mfaSecret,
            encoding: "base32",
            token
        });

        if (!verified) {
            return res.status(401).json({ success: false, message: "Invalid MFA code" });
        }
    } else if (password) {
        // Verify via Password
        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: "Incorrect password" });
        }
    } else {
        return res.status(400).json({ success: false, message: "Password or MFA code required" });
    }

    user.mfaEnabled = false;
    user.mfaSecret = null;
    await user.save();

    await logAudit(req, "MFA_DISABLED");

    return res.status(200).json({ success: true, message: "MFA Disabled" });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Failed to disable MFA" });
  }
};
