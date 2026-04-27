import nodemailer from "nodemailer";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from the server root
dotenv.config({ path: path.join(__dirname, "../.env") });

const testEmail = async () => {
    console.log("Starting email diagnostic test...");
    console.log("MAIL_USER:", process.env.MAIL_USER);
    console.log("MAIL_PASS:", process.env.MAIL_PASS ? "****" : "MISSING");
    
    const transportConfig = {
        host: process.env.EMAIL_HOST || "smtp.gmail.com",
        port: Number(process.env.EMAIL_PORT) || 465,
        secure: process.env.EMAIL_PORT == 587 ? false : true,
        auth: {
            user: process.env.MAIL_USER,
            pass: process.env.MAIL_PASS,
        },
        connectionTimeout: 10000,
        logger: true,
        debug: true
    };

    console.log("Transport Config:", {
        host: transportConfig.host,
        port: transportConfig.port,
        secure: transportConfig.secure,
        user: transportConfig.auth.user
    });

    const transporter = nodemailer.createTransport(transportConfig);

    try {
        console.log("Verifying connection...");
        await transporter.verify();
        console.log("✅ Connection successful! SMTP is working.");

        console.log("Attempting to send test email...");
        const info = await transporter.sendMail({
            from: `"GamerThred Test" <${process.env.MAIL_USER}>`,
            to: process.env.MAIL_USER, // Send to self
            subject: "GamerThred Email Diagnostic",
            text: "This is a test email to verify SMTP configuration.",
            html: "<b>This is a test email to verify SMTP configuration.</b>"
        });

        console.log("✅ Email sent successfully!");
        console.log("Message ID:", info.messageId);
    } catch (error) {
        console.error("❌ Email test failed!");
        console.error("Error Code:", error.code);
        console.error("Error Message:", error.message);
        if (error.response) console.error("SMTP Response:", error.response);
    }
};

testEmail();
