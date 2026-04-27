import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve('c:/Users/Asus/Desktop/gamet/Gamet-Website/server/.env') });

const UserSchema = new mongoose.Schema({
    email: String,
    username: String
}, { strict: false });

const User = mongoose.model('User', UserSchema);

async function checkUser() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');
        
        const email = 'shengaming303@gmail.com';
        const user = await User.findOne({ email });
        
        if (user) {
            console.log('User found:', JSON.stringify(user, null, 2));
        } else {
            console.log('User NOT found for email:', email);
            const allUsers = await User.find({}).limit(5).select('email');
            console.log('Sample users in DB:', allUsers.map(u => u.email));
        }
    } catch (err) {
        console.error('Error:', err);
    } finally {
        await mongoose.disconnect();
    }
}

checkUser();
