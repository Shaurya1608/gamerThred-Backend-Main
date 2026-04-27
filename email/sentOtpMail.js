import { createTransporter } from "../utils/emailTransport.js";

export const sentOtpMail = async (otp, email) => {
    const transporter = createTransporter();

    const mailOptions = {
        from: `"GamerThred" <${process.env.MAIL_USER}>`,
        to: email,
        subject: "Your OTP for Password Reset",
        text: `Your OTP for password reset is: ${otp}. It is valid for 10 minutes.`,
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log("✅ OTP email sent successfully to:", email);
    } catch (error) {
        console.error("❌ Error sending OTP email:", error);
        throw new Error("Failed to send OTP email");
    }
};
