#!/usr/bin/env node
/**
 * Seed script to populate crafts with test data (Iran locations)
 */
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
require("dotenv").config({ path: "../.env" });

const Craft = require("../models/Craft");
const User = require("../models/User");

// Create fake users first
async function createTestUsers() {
  const testUsers = [
    {
      name: "علی کوزه‌گر",
      phone: "09121234501",
      password: "pass123",
      role: "user",
    },
    {
      name: "فاطمه قالی‌باف",
      phone: "09121234502",
      password: "pass123",
      role: "user",
    },
    {
      name: "محمد مسی‌ساز",
      phone: "09121234503",
      password: "pass123",
      role: "user",
    },
    {
      name: "سارا نقاش",
      phone: "09121234504",
      password: "pass123",
      role: "user",
    },
    {
      name: "حسن بافنده",
      phone: "09121234505",
      password: "pass123",
      role: "user",
    },
    {
      name: "مریم صنایع دستی",
      phone: "09121234506",
      password: "pass123",
      role: "user",
    },
    {
      name: "رضا کاشی‌کار",
      phone: "09121234507",
      password: "pass123",
      role: "user",
    },
    {
      name: "زهرا مینیاتور‌نقاش",
      phone: "09121234508",
      password: "pass123",
      role: "user",
    },
  ];

  // Hash passwords
  for (const user of testUsers) {
    user.password = await bcrypt.hash(user.password, 10);
  }

  const users = await User.insertMany(testUsers);
  console.log(`✅ Created ${users.length} test users`);
  return users;
}

const sampleCrafts = (users) => [
  {
    title: "کوزه سفالی دست‌ساز",
    description: "کوزه سفالی سنتی از اصفهان، ساخت دست‌باز با نقش‌های سنتی",
    author: users[0]._id,
    artisanId: "64f1a1b1c1d1e1f1a1a1a1a1",
    kind: "artwork",
    price: 850000,
    forSale: true,
    isPublished: true,
    images: [
      "https://images.unsplash.com/photo-1578500494198-246f612d03b3?w=400&h=300&fit=crop",
    ],
    tags: ["سفال", "لعاب", "اصفهان"],
    location: {
      geometry: {
        type: "Point",
        coordinates: [51.67, 32.64],
      },
      city: "اصفهان",
      neighborhood: "جلفا",
    },
  },
  {
    title: "فرش دست‌بافت ایرانی",
    description: "فرش‌های سنتی قالی‌باف شیرازی، نقش و نگار قدیمی",
    author: users[1]._id,
    kind: "artwork",
    price: 5000000,
    forSale: true,
    isPublished: true,
    images: [
      "https://images.unsplash.com/photo-1565193566173-7cde5f220888?w=400&h=300&fit=crop",
    ],
    tags: ["قالی", "فرش", "شیراز"],
    location: {
      geometry: {
        type: "Point",
        coordinates: [52.54, 29.61],
      },
      city: "شیراز",
      neighborhood: "بازار سنتی",
    },
  },
  {
    title: "مشغولات مسی سنتی",
    description: "ظروف و تزیینات مسی دستساخت، کارگری تبریزی با نقوش اسلامی",
    author: users[2]._id,
    kind: "artwork",
    price: 1200000,
    forSale: true,
    isPublished: true,
    images: [
      "https://images.unsplash.com/photo-1578749556568-bc2c40e68b61?w=400&h=300&fit=crop",
    ],
    tags: ["مس", "تبریز", "فلزکاری"],
    location: {
      geometry: {
        type: "Point",
        coordinates: [46.29, 38.08],
      },
      city: "تبریز",
      neighborhood: "بازار",
    },
  },
  {
    title: "خط‌خطی دستی ایرانی",
    description: "نقاشی‌های خط‌خطی سنتی ایرانی، کار هنرمندان تهران",
    author: users[3]._id,
    kind: "artwork",
    price: 450000,
    forSale: true,
    isPublished: true,
    images: [
      "https://images.unsplash.com/photo-1460661326187-efb1327a0fc7?w=400&h=300&fit=crop",
    ],
    tags: ["نقاشی", "خط", "تهران"],
    location: {
      geometry: {
        type: "Point",
        coordinates: [51.41, 35.73],
      },
      city: "تهران",
      neighborhood: "میدان تجریش",
    },
  },
  {
    title: "منسوجات سنتی گیلان",
    description: "بافتنی‌های دستی گیلانی، الیاف طبیعی و رنگهای سنتی",
    author: users[4]._id,
    kind: "artwork",
    price: 650000,
    forSale: true,
    isPublished: true,
    images: [
      "https://images.unsplash.com/photo-1556228578-8c89e6adf883?w=400&h=300&fit=crop",
    ],
    tags: ["نساجی", "گیلان", "بافتنی"],
    location: {
      geometry: {
        type: "Point",
        coordinates: [49.58, 37.28],
      },
      city: "رشت",
      neighborhood: "بازار",
    },
  },
  {
    title: "صنایع دستی هفتسین",
    description: "ظروف و تزیینات زیبا برای هفتسین نوروزی",
    author: users[5]._id,
    kind: "artwork",
    price: 320000,
    forSale: true,
    isPublished: true,
    images: [
      "https://images.unsplash.com/photo-1578749556568-bc2c40e68b61?w=400&h=300&fit=crop",
    ],
    tags: ["نوروز", "تزیین", "کادو"],
    location: {
      geometry: {
        type: "Point",
        coordinates: [51.33, 35.75],
      },
      city: "تهران",
      neighborhood: "تجریش",
    },
  },
  {
    title: "کاشی‌کاری هنری",
    description: "کاشی‌های رنگی سنتی، طرح‌های اسلامی تاریخی",
    author: users[6]._id,
    kind: "artwork",
    price: 890000,
    forSale: true,
    isPublished: true,
    images: [
      "https://images.unsplash.com/photo-1578749556568-bc2c40e68b61?w=400&h=300&fit=crop",
    ],
    tags: ["کاشی", "کاشی‌کاری", "اصفهان"],
    location: {
      geometry: {
        type: "Point",
        coordinates: [51.67, 32.64],
      },
      city: "اصفهان",
      neighborhood: "سی‌و‌سه‌پل",
    },
  },
  {
    title: "آینه‌کاری و مینیاتور",
    description: "نقاشی‌های مینیاتوری و آینه‌کاری اصفهانی",
    author: users[7]._id,
    kind: "artwork",
    price: 1500000,
    forSale: true,
    isPublished: true,
    images: [
      "https://images.unsplash.com/photo-1579783902614-e3fb5141b0cb?w=400&h=300&fit=crop",
    ],
    tags: ["مینیاتور", "آینه", "هنر"],
    location: {
      geometry: {
        type: "Point",
        coordinates: [51.67, 32.65],
      },
      city: "اصفهان",
      neighborhood: "ایرانشهر",
    },
  },
];

async function seed() {
  try {
    const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/nakhsha";
    console.log(`Connecting to MongoDB: ${uri}`);
    await mongoose.connect(uri);
    console.log("✅ MongoDB connected");

    // Create test users
    const users = await createTestUsers();

    // Clear existing crafts
    const deleted = await Craft.deleteMany({});
    console.log(`🗑️  Deleted ${deleted.deletedCount} old crafts`);

    // Insert sample crafts
    const crafts = sampleCrafts(users);
    const result = await Craft.insertMany(crafts);
    console.log(`✅ Added ${result.length} sample crafts`);

    // Verify count
    const count = await Craft.countDocuments();
    console.log(`📊 Total crafts in DB: ${count}`);

    console.log("\n✅ Seeding complete!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Seed error:", error.message);
    process.exit(1);
  }
}

seed();
