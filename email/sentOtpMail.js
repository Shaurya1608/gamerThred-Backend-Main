import { createTransporter } from "../utils/emailTransport.js";

export const sentOtpMail = async (otp, email) => {
    const transporter = createTransporter();

    const htmlContent = `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
    <title>Your Security Code</title>
  </head>
  <body style="margin:0; padding:0; background:#0f172a; font-family: Arial, sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center" style="padding:40px 16px;">
          <table width="100%" style="max-width:600px; background:#020617; border-radius:14px; overflow:hidden; box-shadow:0 0 40px rgba(99,102,241,0.25);">
            <!-- Header -->
            <tr>
              <td style="background:linear-gradient(135deg,#6366f1,#22d3ee); padding:24px; text-align:center;">
                <h1 style="margin:0; color:#ffffff; letter-spacing:1px;">🎮 GamerThred</h1>
              </td>
            </tr>

            <!-- Content -->
            <tr>
              <td style="padding:32px; color:#e5e7eb;">
                <h2 style="color:#ffffff; margin-top:0;">Reset Your Password</h2>
                <p style="font-size:15px; line-height:1.6;">
                  We received a request to reset your GamerThred account password. 
                  Use the following secure code to proceed:
                </p>

                <!-- OTP Code -->
                <div style="text-align:center; margin:32px 0;">
                  <div style="display:inline-block; padding:16px 32px; background:#1e293b; border:1px solid #334155; border-radius:12px; color:#22d3ee; font-size:32px; font-weight:bold; letter-spacing:8px;">
                    ${otp}
                  </div>
                  <p style="font-size:13px; margin-top:16px; color:#9ca3af;">
                    This code will expire in <strong>10 minutes</strong>.
                  </p>
                </div>

                <p style="font-size:13px; color:#9ca3af;">
                  If you didn't request this, you can safely ignore this email. Your password will remain unchanged.
                </p>
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="background:#020617; padding:16px; text-align:center; color:#6b7280; font-size:12px;">
                © ${new Date().getFullYear()} GamerThred · Play. Compete. Rise.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`;

    const mailOptions = {
        from: `"GamerThred" <${process.env.MAIL_USER}>`,
        to: email,
        subject: "🔒 Your GamerThred Recovery Code",
        html: htmlContent,
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log("✅ OTP email sent successfully to:", email);
    } catch (error) {
        console.error("❌ Error sending OTP email:", error);
        throw new Error("Failed to send OTP email");
    }
};
