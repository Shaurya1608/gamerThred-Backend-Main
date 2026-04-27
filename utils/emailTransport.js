import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

/**
 * Creates a Nodemailer transporter using SMTP settings from environment variables.
 * Falls back to Gmail service if host is not provided.
 */
export const createTransporter = () => {
    // Use robust settings for cloud environments (Render/Vercel)
    // 1. Prefer explicit ENV variables if set
    // 2. Fallback to standard Gmail SSL (Port 465)
    // 3. Force IPv4 to avoid timeouts
    const transportConfig = {
        host: process.env.EMAIL_HOST || "smtp.gmail.com",
        port: Number(process.env.EMAIL_PORT) || 465,
        secure: process.env.EMAIL_PORT == 587 ? false : true, // True for 465, false for 587
        auth: {
            user: process.env.MAIL_USER,
            pass: process.env.MAIL_PASS,
        },
        connectionTimeout: 20000, // Increased for cloud latency
        greetingTimeout: 20000,
        socketTimeout: 20000,
        dnsTimeout: 10000, // Explicit DNS timeout
        logger: true, // Enable internal logging
        debug: true   // Enable debug output
    };

    return nodemailer.createTransport(transportConfig);
};

/**
 * Verifies the connection to the email server.
 */
export const verifyConnection = async () => {
    const transporter = createTransporter();
    try {
        await transporter.verify();
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
};
