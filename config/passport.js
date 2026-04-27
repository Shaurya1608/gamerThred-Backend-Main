import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { User } from "../models/User.js";
import { generateReferralCode } from "../utils/referralUtils.js";
import { generateUniqueUsername } from "../utils/userUtils.js";

// passport.use(
//   new GoogleStrategy(
//     {
//       clientID: process.env.GOOGLE_CLIENT_ID,
//       clientSecret: process.env.GOOGLE_CLIENT_SECRET,
//       callbackURL: `${
//         process.env.BACKEND_URL || "http://localhost:5000"
//       }/auth/google/callback`,
//       passReqToCallback: true,
//     },
//     async (req,accessToken, refreshToken, profile, done) => {
//       try {
//         if (req.user) {
//           req.user.googleId = profile.id;
//           req.user.authProvider = "google";
//           req.user.isVerified = true;
//           await req.user.save();
//           return done(null, req.user);
//         }
//         // Check if user already exists with this Google ID
//         let user = await User.findOne({ googleId: profile.id });

//         if (user) {
//           // User exists, return user
//           return done(null, user);
//         }

//         // Check if user exists with this email (but signed up with email/password)
//         user = await User.findOne({ email: profile.emails[0].value });

//         if (user) {
//           // Link Google account to existing user
//           user.googleId = profile.id;
//           user.isVerified = true; // Google emails are verified
//           await user.save();
//           return done(null, user);
//         }

//         // Check if this is the first user - make them admin
//         const totalUsers = await User.countDocuments();
//         const isFirstUser = totalUsers === 0;

//         // Create new user
//         user = await User.create({
//           username:
//             profile.displayName || profile.emails[0].value.split("@")[0],
//           email: profile.emails[0].value,
//           googleId: profile.id,
//           authProvider: "google",
//           password: null, // OAuth users don't need password
//           isVerified: true, // Google emails are verified
//           role: isFirstUser ? "admin" : "user",
//           permissions: isFirstUser
//             ? [
//                 "manage_users",
//                 "view_analytics",
//                 "manage_rewards",
//                 "manage_missions",
//                 "moderate_chat",
//                 "manage_events",
//                 "view_logs",
//                 "manage_payments",
//               ]
//             : [],
//           status: "active",
//           avatar: {
//             url:
//               profile.photos && profile.photos[0]
//                 ? profile.photos[0].value
//                 : "",
//             publicId: "",
//           },
//         });

//         return done(null, user);
//       } catch (error) {
//         return done(error, null);
//       }
//     }
//   )
// );
// Strategy for regular login/signup
passport.use(
  "google",
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: `${
        process.env.BACKEND_URL || "http://localhost:5000"
      }/auth/google/callback`,
      passReqToCallback: true,
    },
    async (req, accessToken, refreshToken, profile, done) => {
      try {
        // Note: req.user should NOT exist here since login routes don't use isAuthenticated
        // If it does exist, something went wrong - ignore it for login flow

        // 🔍 Existing Google user (already linked)
        let user = await User.findOne({ googleId: profile.id });
        if (user) {
          return done(null, user);
        }

        // 🔍 Existing email user (auto-link Google on login)
        user = await User.findOne({ email: profile.emails[0].value });
        if (user) {
          // Check if this Google account is already linked to another user
          const existingGoogleUser = await User.findOne({ googleId: profile.id });
          if (existingGoogleUser && existingGoogleUser._id.toString() !== user._id.toString()) {
            return done(new Error("This Google account is already linked to another account"), null);
          }

          // Auto-link Google to existing account
          user.googleId = profile.id;
          user.authProvider = "google";
          user.isVerified = true;
          await user.save();
          return done(null, user);
        }

        // 🆕 New user
        const totalUsers = await User.countDocuments();
        const isFirstUser = totalUsers === 0;

        const baseUsername = profile.displayName || profile.emails[0].value.split("@")[0];
        const uniqueUsername = await generateUniqueUsername(baseUsername);

        user = await User.create({
          username: uniqueUsername,
          email: profile.emails[0].value,
          googleId: profile.id,
          authProvider: "google",
          password: null,
          isVerified: true,
          role: isFirstUser ? "admin" : "user",
          referralCode: generateReferralCode(),
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
          status: "active",
          avatar: {
            url: profile.photos?.[0]?.value || "",
            publicId: "",
          },
          gtc: 150, // 100 Base + 50 Initial Welcome Bonus (matches local signup)
        });

        return done(null, user);
      } catch (error) {
        console.error("❌ [Passport Google Strategy] Error:", error);
        return done(error);
      }
    }
  )
);

// Strategy for account linking (different callback URL)
passport.use(
  "google-link",
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: `${
        process.env.BACKEND_URL || "http://localhost:5000"
      }/auth/link/google/callback`,
      passReqToCallback: true,
    },
    async (req, accessToken, refreshToken, profile, done) => {
      try {
        // 🔗 ACCOUNT LINKING - user is already logged in (req.user set by isAuthenticated middleware)
        if (req.user) {
          // Check if current user already has Google linked
          if (req.user.googleId === profile.id) {
            // Already linked to this user - just return success
            return done(null, req.user);
          }

          // Check if this Google account is already linked to another account
          const existingGoogleUser = await User.findOne({ googleId: profile.id });
          if (existingGoogleUser && existingGoogleUser._id.toString() !== req.user._id.toString()) {
            return done(new Error("This Google account is already linked to another account"), null);
          }

          // Link Google to current user
          req.user.googleId = profile.id;
          req.user.authProvider = "google";
          req.user.isVerified = true;
          await req.user.save();
          return done(null, req.user);
        }

        return done(new Error("User not authenticated"), null);
      } catch (error) {
        return done(error, null);
      }
    }
  )
);

// Serialize user for session
passport.serializeUser((user, done) => {
  done(null, user._id);
});

// Deserialize user from session
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

export default passport;
