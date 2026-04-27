import dotenv from 'dotenv';
dotenv.config();

console.log('📧 Email Configuration Check:');
console.log('================================');
console.log('MAIL_USER:', process.env.MAIL_USER ? '✅ Set' : '❌ Not set');
console.log('MAIL_PASS:', process.env.MAIL_PASS ? '✅ Set' : '❌ Not set');
console.log('EMAIL_VERIFY_SECRET:', process.env.EMAIL_VERIFY_SECRET ? '✅ Set' : '❌ Not set');
console.log('');

if (!process.env.MAIL_USER || !process.env.MAIL_PASS) {
  console.log('⚠️  EMAIL NOT CONFIGURED!');
  console.log('');
  console.log('To fix this:');
  console.log('1. Open server/.env file');
  console.log('2. Add these variables:');
  console.log('   MAIL_USER=your_email@gmail.com');
  console.log('   MAIL_PASS=your_app_password');
  console.log('');
  console.log('📖 How to get Gmail App Password:');
  console.log('   1. Go to https://myaccount.google.com/security');
  console.log('   2. Enable 2-Step Verification');
  console.log('   3. Search for "App passwords"');
  console.log('   4. Generate a new app password for "Mail"');
  console.log('   5. Copy the 16-character password to MAIL_PASS');
} else {
  console.log('✅ Email configuration looks good!');
  console.log('');
  console.log('Testing email connection...');
  
  // Test email connection
  import('nodemailer').then(async ({ default: nodemailer }) => {
    try {
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.MAIL_USER,
          pass: process.env.MAIL_PASS,
        },
      });
      
      await transporter.verify();
      console.log('✅ Email server connection successful!');
    } catch (error) {
      console.log('❌ Email server connection failed:');
      console.log('Error:', error.message);
      console.log('');
      console.log('Common issues:');
      console.log('- Invalid app password');
      console.log('- 2-Step Verification not enabled');
      console.log('- Less secure app access disabled');
    }
  });
}
