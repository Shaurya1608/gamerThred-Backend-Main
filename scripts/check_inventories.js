import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

async function checkInventories() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const UserInventory = mongoose.models.UserInventory || mongoose.model('UserInventory', new mongoose.Schema({
            userId: mongoose.Schema.Types.ObjectId,
            itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item' },
            quantity: Number
        }));

        const Item = mongoose.models.Item || mongoose.model('Item', new mongoose.Schema({
            code: String,
            name: String
        }));

        const inventories = await UserInventory.find({ quantity: { $gt: 0 } }).populate('itemId').lean();
        
        console.log('\n--- Active Inventories ---');
        inventories.forEach(inv => {
            console.log(`User ID: ${inv.userId}`);
            console.log(`  Item: ${inv.itemId?.name} (${inv.itemId?.code})`);
            console.log(`  Quantity: ${inv.quantity}`);
        });

        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

checkInventories();
