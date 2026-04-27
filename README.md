# 🎮 GamerThred Server - Node.js + Express Backend

Complete authentication and user management backend with JWT tokens, email verification, OTP, and password reset.

---

## 📋 Overview

**GamerThred Server** is a production-ready Node.js + Express authentication backend featuring:
- ✅ User registration with email verification
- ✅ Secure login with JWT tokens and refresh mechanism
- ✅ Forgot password with OTP verification (6-digit code)
- ✅ Password reset with secure token validation
- ✅ Rate limiting and session management
- ✅ MongoDB for data persistence
- ✅ Redis for caching and rate limiting
- ✅ Email service with Nodemailer (Gmail)
- ✅ Input validation with Yup schemas

---

## 🏗️ Architecture

```
FRONTEND (React)
     ↓ HTTP/CORS
SERVER (Node.js + Express)
├── Routes (/auth)
├── Controllers (Business Logic)
├── Models (MongoDB Schemas)
├── Middleware (Auth, Rate Limit)
└── Services (Email, Validation)
```

---

## 📦 Project Structure

```
server/
├── server.js                    # Main entry point
├── package.json                 # Dependencies
├── .env                         # Environment variables
├── config/
│   ├── db.js                    # MongoDB connection
│   └── redis.js                 # Redis connection
├── models/
│   ├── userModels.js            # User schema
│   └── sessionModel.js          # Session schema
├── controllers/
│   └── userController.js        # Auth logic
├── routes/
│   └── userRoutes.js            # Route definitions
├── middleware/
│   ├── isAuthenticated.js       # JWT validation
│   └── rateLimit.js             # Rate limiting
├── validation/
│   └── userValidate.js          # Yup schemas
└── email/
    ├── verifyMail.js            # Verification email
    ├── sentOtpMail.js           # OTP email
    └── template.hbs             # Email template
```

---

## 🚀 Getting Started

### Prerequisites
- **Node.js** 16+
- **MongoDB** (Atlas recommended)
- **Redis** (Upstash for free tier)
- **Gmail** account with App Password

### Installation

```bash
cd server
npm install
```

### Environment Variables

Create `.env` file:

```env
# Server
PORT=5000
NODE_ENV=development

# Database
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/gamerthred

# Redis (Upstash)
UPSTASH_REDIS_URL=redis://default:password@host:port

# JWT Secrets
ACCESS_TOKEN=your_secret_key_here_minimum_32_chars_long
REFRESH_TOKEN=your_refresh_secret_key_here_minimum_32_chars_long
EMAIL_VERIFY_SECRET=your_email_secret_key_here_minimum_32_chars_long

# Email (Gmail with App Password)
MAIL_USER=your-email@gmail.com
MAIL_PASS=your-16-character-app-password

# Frontend URL (for CORS)
FRONTEND_URL=http://localhost:5173
```

### Run Server

```bash
# Development (with nodemon)
npm run dev

# Production
npm start
```

**Server URL:** `http://localhost:5000`

---

## 📡 API Endpoints

### Registration & Verification

```
POST /auth/register
Body: {
  username: string (3+ chars),
  email: string (valid email),
  password: string (7+ chars)
}
Response: {
  success: true,
  message: "Registration successful. Check email for verification.",
  user: { id, username, email, isVerified }
}
```

```
GET /auth/verify-email?token=xxx
Response: {
  success: true,
  message: "Email verified successfully!"
}
```

### Login & Tokens

```
POST /auth/login
Body: {
  email: string,
  password: string
}
Response: {
  success: true,
  message: "Login successful",
  user: { id, username, email, gtcBalance },
  accessToken: "jwt_token",
  refreshToken: "refresh_jwt_token"
}
```

```
POST /auth/refresh
Body: { refreshToken: string }
Response: {
  accessToken: "new_jwt_token"
}
```

### Forgot Password Flow

```
POST /auth/forgot-password
Body: { email: string }
Response: {
  success: true,
  message: "OTP sent to email"
}
```

```
POST /auth/verify-otp/:email
Body: { otp: string (6 digits) }
Response: {
  success: true,
  resetToken: "token_for_password_reset"
}
```

```
POST /auth/change-password
Body: {
  resetToken: string,
  newPassword: string (8+ chars)
}
Response: {
  success: true,
  message: "Password reset successful",
  user: { id, username, email }
}
```

### Logout

```
POST /auth/logout
Headers: Authorization: Bearer <accessToken>
Response: {
  success: true,
  message: "Logged out successfully"
}
```

---

## 🔐 Authentication Flow

### Registration
1. User submits: username, email, password
2. Server validates input (Yup schema)
3. Check if user exists
4. Hash password with bcryptjs (rounds: 10)
5. Create user in MongoDB
6. Generate verification token (expires: 10 minutes)
7. Send verification email
8. Return user data

### Email Verification
1. User clicks link in email
2. Extract token from URL
3. Verify JWT with EMAIL_VERIFY_SECRET
4. Find user by ID in token
5. Update isVerified = true
6. Return success message

### Login
1. User submits: email, password
2. Check rate limit (5 attempts per 60 seconds)
3. Find user by email
4. Compare password with bcryptjs
5. Generate access token (expires: 15 minutes)
6. Generate refresh token (expires: 7 days)
7. Save refresh token in Redis/DB (Note: Redis is REQUIRED for Season Rewards and Socket.io)
8. Return tokens in HttpOnly cookies

### Refresh Token
1. Client sends refresh token
2. Verify token with REFRESH_TOKEN secret
3. Generate new access token
4. Return new access token

### Forgot Password
1. User enters email
2. Find user in MongoDB
3. Generate 6-digit OTP
4. Store OTP in Redis (expires: 10 minutes)
5. Send OTP via email
6. Return success message

### Verify OTP
1. User submits OTP code
2. Verify OTP from Redis
3. Generate reset token (expires: 30 minutes)
4. Return reset token

### Reset Password
1. User submits new password + reset token
2. Verify reset token
3. Hash new password
4. Update user password in MongoDB
5. Invalidate all refresh tokens
6. Return success message

---

## 🛠️ Tech Stack

**Runtime & Framework**
- Node.js 16+
- Express.js 4.x

**Database & Caching**
- MongoDB with Mongoose ODM
- Redis (Upstash) for sessions & OTP

**Authentication & Security**
- JWT tokens (jsonwebtoken)
- bcryptjs for password hashing
- Redis (Required) for bullmq queues, sessions & rate limiting

**Email Service**
- Nodemailer with Gmail
- Handlebars for email templates

**Validation**
- Yup for schema validation
- Input sanitization

**DevTools**
- Nodemon for development
- Dotenv for environment variables

---

## 📋 Input Validation

### User Registration
```javascript
{
  username: Yup.string().min(3).max(30).required(),
  email: Yup.string().email().required(),
  password: Yup.string().min(7).required()
}
```

### Login
```javascript
{
  email: Yup.string().email().required(),
  password: Yup.string().required()
}
```

### Reset Password
```javascript
{
  newPassword: Yup.string().min(8).required(),
  confirmPassword: Yup.string().oneOf([Yup.ref('newPassword')])
}
```

---

## 🔒 Security Features

✅ **Implemented**
- Password hashing with bcrypt (10 rounds)
- JWT-based authentication
- Refresh token rotation
- Rate limiting (5 attempts/60 seconds)
- CORS whitelisting
- HttpOnly cookies for tokens
- Email verification before login
- OTP expiration (10 minutes)
- Reset token expiration (30 minutes)
- Input validation with Yup

📋 **Best Practices**
- Never log passwords
- Use HTTPS in production
- Rotate secrets regularly
- Monitor failed login attempts
- Implement account lockout (after N failures)
- Use strong JWT secrets (32+ characters)
- Keep dependencies updated

---

## 📊 Database Schemas

### User Model
```javascript
{
  _id: ObjectId,
  username: String (unique),
  email: String (unique),
  password: String (hashed),
  isVerified: Boolean,
  gtcBalance: Number (default: 0),
  createdAt: Date,
  updatedAt: Date
}
```

### Session Model (Optional)
```javascript
{
  _id: ObjectId,
  userId: ObjectId,
  refreshToken: String,
  expiresAt: Date,
  createdAt: Date
}
```

---

## 📞 Error Handling

### Common Status Codes

| Code | Meaning | Example |
|------|---------|---------|
| 200 | Success | Login successful |
| 201 | Created | User registered |
| 400 | Bad Request | Invalid email format |
| 401 | Unauthorized | Wrong password |
| 404 | Not Found | User doesn't exist |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Server Error | Database connection failed |

### Error Response Format
```json
{
  "success": false,
  "message": "Error description",
  "error": "error_code"
}
```

---

## 🚀 Deployment

### Heroku Deployment
```bash
heroku create gamerthred-server
heroku config:set MONGO_URI=your_uri
heroku config:set UPSTASH_REDIS_URL=your_url
git push heroku main
```

### Railway Deployment
1. Connect GitHub repo to Railway
2. Add environment variables
3. Set start command: `npm start`
4. Deploy

### Docker Deployment
```dockerfile
FROM node:16-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 5000
CMD ["npm", "start"]
```

---

## 🧪 Testing (Postman/Insomnia)

### Register User
```
POST http://localhost:5000/auth/register
Content-Type: application/json

{
  "username": "testuser",
  "email": "test@gmail.com",
  "password": "securepass123"
}
```

### Login
```
POST http://localhost:5000/auth/login
Content-Type: application/json

{
  "email": "test@gmail.com",
  "password": "securepass123"
}
```

### Forgot Password
```
POST http://localhost:5000/auth/forgot-password
Content-Type: application/json

{
  "email": "test@gmail.com"
}
```

---

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| Port 5000 in use | `npx kill-port 5000` or change PORT |
| MongoDB connection fails | Check MONGO_URI and network access |
| Emails not sending | Enable "Less secure app access" in Gmail |
| Redis connection error | Verify UPSTASH_REDIS_URL format |
| JWT errors | Check secret keys in .env |
| Rate limit issues | Adjust rate limit in middleware |

---

## 📚 Resources

- [Express.js Docs](https://expressjs.com)
- [MongoDB Mongoose](https://mongoosejs.com)
- [JWT Guide](https://jwt.io)
- [Nodemailer](https://nodemailer.com)
- [Redis Documentation](https://redis.io)

---

## 📈 Performance Optimization

- Use connection pooling for MongoDB
- Cache frequently accessed data in Redis
- Implement request pagination
- Use async/await properly
- Monitor response times
- Set appropriate timeouts

---

## 🔄 Future Enhancements

- [ ] Google OAuth integration
- [ ] GitHub OAuth integration
- [ ] Two-factor authentication (2FA)
- [ ] Account lockout after failed attempts
- [ ] Email change confirmation
- [ ] Phone number verification
- [ ] Social login (Facebook, Twitter)
- [ ] API key authentication for third-party apps
- [ ] GraphQL API alternative
- [ ] WebSocket real-time notifications

---

## 📄 License

[Add your license here]

---

**Last Updated:** January 14, 2026  
**Status:** Production Ready  
**Version:** 2.0  
**Maintainer:** Development Team
