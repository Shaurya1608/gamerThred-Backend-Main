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
        port: Number(process.env.EMAIL_PORT) || 465,
        secure: Number(process.env.EMAIL_PORT) === 465 || !process.env.EMAIL_PORT, // Default to true for 465
        auth: {
            user: process.env.MAIL_USER,
            pass: process.env.MAIL_PASS,
        },
        pool: true,
        maxConnections: 5,
        maxMessages: 100,
        tls: {
            rejectUnauthorized: false,
            servername: process.env.EMAIL_HOST || "smtp.gmail.com" // Added servername for better handshake
        },
        connectionTimeout: 30000, 
        greetingTimeout: 30000,
        socketTimeout: 30000,
        dnsTimeout: 20000,
        logger: true, // Enable logging to see more details in Render logs if it fails
        debug: true   
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
