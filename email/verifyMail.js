import { createTransporter } from "../utils/emailTransport.js";

export const verifyMail = async (token, email, otp) => {
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
  const verifyLink = `${frontendUrl}/auth/verify-email?token=${token}`;

  try {
    const htmlToSend = `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
    <title>Verify your email</title>
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
                <h2 style="color:#ffffff; margin-top:0;">Verify Your Intel</h2>
                <p style="font-size:15px; line-height:1.6;">
                  Welcome to <strong>GamerThred</strong>. You're one step away from joining the arena. 
                  Please verify your email address to activate your account.
                </p>

                <!-- Button -->
                <div style="text-align:center; margin:32px 0;">
                  <a href="${verifyLink}"
                    style="display:inline-block; padding:16px 36px; background:#6366f1; color:#ffffff; text-decoration:none; font-weight:bold; border-radius:999px; box-shadow:0 0 20px rgba(99,102,241,0.5);">
                    🔐 Initialize Verification
                  </a>
                </div>

                <p style="font-size:14px; text-align:center; color:#9ca3af; margin-top:24px;">
                  Using our Mobile App? Use the code below:
                </p>
                <div style="text-align:center; margin:16px 0;">
                  <div style="display:inline-block; padding:12px 24px; background:#1e293b; border:1px solid #334155; border-radius:8px; color:#22d3ee; font-size:28px; font-weight:bold; letter-spacing:6px;">
                    ${otp}
                  </div>
                </div>

                <p style="font-size:13px; color:#9ca3af; margin-top:32px;">
                  This link and code will expire in <strong>10 minutes</strong>.
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

    const transporter = createTransporter();

    await transporter.sendMail({
      from: `"GamerThred" <${process.env.MAIL_USER}>`,
      to: email,
      subject: "Verify your email for GamerThred",
      html: htmlToSend,
    });

    console.log("✅ Verification email sent to:", email);
  } catch (error) {
    console.error("❌ Error sending verification email:", error);
    throw error; // Throwing so the controller can handle it
  }
};
