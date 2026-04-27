import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

/**
 * Creates a Nodemailer transporter using SMTP settings from environment variables.
 * Falls back to Gmail service if host is not provided.
 */
export const createTransporter = () => {
    // Use robust settings for cloud environments (Render/Vercel)
    const transportConfig = {
        host: process.env.EMAIL_HOST || "smtp.gmail.com",
        port: Number(process.env.EMAIL_PORT) || 587,
        secure: Number(process.env.EMAIL_PORT) === 465, // Standard: true for 465, false for 587
        auth: {
            user: process.env.MAIL_USER,
            pass: process.env.MAIL_PASS,
        },
        pool: true, // Use pooling for better performance in production
        maxConnections: 5,
        maxMessages: 100,
        tls: {
            // 🛡️ Cloud Compatibility: Prevent handshake failures on certain hosts
            rejectUnauthorized: false
        },
        connectionTimeout: 20000, // Increased for cloud latency
        greetingTimeout: 20000,
        socketTimeout: 20000,
        dnsTimeout: 10000, // Explicit DNS timeout
        logger: false, // Set to false in prod unless debugging
        debug: false   
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
