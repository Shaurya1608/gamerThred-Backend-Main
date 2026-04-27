import mongoose from "mongoose";
import dotenv from "dotenv";
import { Reward } from "../models/Reward.js";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env vars
dotenv.config({ path: path.join(__dirname, "../.env") });

const sampleItems = [
  {
    title: "Razer BlackShark V2 Headset",
    category: "Special",
    price: 14999,
    image: "https://images.unsplash.com/photo-1611186871348-b1ce696e52c9"
  },
  {
    title: "Logitech G Pro X Superlight",
    category: "Special",
    price: 12999,
    image: "https://images.unsplash.com/photo-1629429407759-01cd3d7cfb38"
  },
  {
    title: "SteelSeries QcK Gaming Mousepad",
    category: "Daily",
    price: 1499,
    image: "https://images.unsplash.com/photo-1584270354949-1b4b3b3c42c1"
  },
  {
    title: "Redragon K552 Mechanical Keyboard",
    category: "Weekly",
    price: 3999,
    image: "https://images.unsplash.com/photo-1593642532973-d31b6557fa68"
  },
  {
    title: "Xbox Game Pass Ultimate (1 Month)",
    category: "Weekly",
    price: 699,
    image: "https://images.unsplash.com/photo-1605901309584-818e25960b8f"
  },
  {
    title: "PlayStation Plus Essential (1 Month)",
    category: "Weekly",
    price: 749,
    image: "https://images.unsplash.com/photo-1593305841991-05c297ba4575"
  },
  {
    title: "Steam Wallet Code ₹1000",
    category: "Daily",
    price: 1000,
    image: "https://images.unsplash.com/photo-1556742044-3c52d6e88c62"
  },
  {
    title: "Discord Nitro (1 Month)",
    category: "Daily",
    price: 799,
    image: "https://images.unsplash.com/photo-1614680376593-902f74cf0d41"
  },
  {
    title: "144Hz Gaming Monitor",
    category: "Special",
    price: 17999,
    image: "https://images.unsplash.com/photo-1585790050230-5dd28404ccb9"
  },
  {
    title: "Gaming Chair (Ergonomic)",
    category: "Special",
    price: 15999,
    image: "https://images.unsplash.com/photo-1616627981522-ff7c12d1ff2c"
  },
  {
    title: "RGB Gaming Mouse",
    category: "Daily",
    price: 1299,
    image: "https://images.unsplash.com/photo-1616789916189-3b0c59c0c37e"
  },
  {
    title: "Controller Charging Dock",
    category: "Daily",
    price: 999,
    image: "https://images.unsplash.com/photo-1606312619344-6d0caaed46f2"
  },
  {
    title: "Gaming Desk LED Strip",
    category: "Daily",
    price: 699,
    image: "https://images.unsplash.com/photo-1607082349566-187342175e2f"
  },
  {
    title: "Webcam for Streaming (1080p)",
    category: "Weekly",
    price: 3499,
    image: "https://images.unsplash.com/photo-1593642632823-8f785ba67e45"
  },
  {
    title: "Streaming Microphone",
    category: "Weekly",
    price: 4999,
    image: "https://images.unsplash.com/photo-1589903308904-1010c2294adc"
  },
  {
    title: "Gaming Headphone Stand (RGB)",
    category: "Daily",
    price: 799,
    image: "https://images.unsplash.com/photo-1613145993481-4f2f1b0a78d1"
  },
  {
    title: "PUBG UC Voucher",
    category: "Weekly",
    price: 899,
    image: "https://images.unsplash.com/photo-1542751371-adc38448a05e"
  },
  {
    title: "Free Fire Diamonds",
    category: "Weekly",
    price: 699,
    image: "https://images.unsplash.com/photo-1511512578047-dfb367046420"
  },
  {
    title: "Valorant Points",
    category: "Weekly",
    price: 999,
    image: "https://images.unsplash.com/photo-1601933470928-c7a8cbe9b2c4"
  },
  {
    title: "Netflix Subscription (1 Month)",
    category: "Weekly",
    price: 649,
    image: "https://images.unsplash.com/photo-1574375927938-d5a98e8efe85"
  }
];


const seedRewards = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("✅ Connected to MongoDB");

        // Use slice if sampleItems has more than 50
        const itemsToInsert = sampleItems.slice(0, 50).map(item => ({
            title: item.title,
            description: `Exclusive ${item.title} available for redemption in the Rewards Store. Limited time offer!`,
            priceDiamonds: item.price,
            stock: Math.floor(Math.random() * 100) + 10,
            category: item.category,
            imageUrl: item.image,
            isActive: true
        }));

        await Reward.insertMany(itemsToInsert);
        console.log(`✅ Successfully seeded ${itemsToInsert.length} rewards!`);

        process.exit();
    } catch (error) {
        console.error("❌ Seeding failed:", error);
        process.exit(1);
    }
};

seedRewards();
