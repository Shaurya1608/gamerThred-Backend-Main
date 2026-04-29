import dotenv from "dotenv";
dotenv.config();
import { createTransporter } from "../utils/emailTransport.js";

async function test() {
    console.log("Testing email connection...");
    console.log("MAIL_USER:", process.env.MAIL_USER);
    console.log("MAIL_PASS:", process.env.MAIL_PASS ? "****" : "MISSING");
    
    const transporter = createTransporter();
    try {
        await transporter.verify();
        console.log("✅ Connection verified successfully");
        
        const mailOptions = {
            from: `"GamerThred Test" <${process.env.MAIL_USER}>`,
            to: process.env.MAIL_USER, // Send to self
            subject: "GamerThred Email Test",
            text: "This is a test email to verify the SMTP configuration.",
        };
        
        const info = await transporter.sendMail(mailOptions);
        console.log("✅ Test email sent:", info.messageId);
    } catch (error) {
        console.error("❌ Email test failed:", error);
    }
}

test();
