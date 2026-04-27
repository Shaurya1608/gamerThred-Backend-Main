import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

async function inspectItems() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const Item = mongoose.models.Item || mongoose.model('Item', new mongoose.Schema({
            code: String,
            name: String,
            type: String,
            image: String,
            rarity: String
        }));

        const items = await Item.find({}).lean();
        console.log('\n--- Inventory Items ---');
        items.forEach(item => {
            console.log(`[Item] ${item.code}:
  Name: ${item.name}
  Type: ${item.type}
  Rarity: ${item.rarity}
  Image URL: ${item.image || 'MISSING'}`);
        });

        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

inspectItems();
