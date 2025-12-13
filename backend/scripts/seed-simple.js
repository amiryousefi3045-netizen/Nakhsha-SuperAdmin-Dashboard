const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const Artisan = require("../models/Artisan");
const Craft = require("../models/Craft");

async function seedData() {
  try {
    await mongoose.connect("mongodb://localhost:27017/nakhsha_db");
    console.log("📦 Connected to database");

    // Clear existing data
    await Promise.all([
      User.deleteMany({ email: "artisan@test.com" }),
      Artisan.deleteMany({}),
      Craft.deleteMany({}),
    ]);
    console.log("🗑️ Cleared existing test data");

    // Create test user
    const hashedPassword = await bcrypt.hash("test123", 10);
    const user = await User.create({
      name: "استاد حسین",
      email: "artisan@test.com",
      password: hashedPassword,
      role: "artisan",
      phone: "09123456789",
      location: {
        city: "یزد",
        province: "یزد",
        coordinates: [54.3675, 31.8974],
      },
      isVerified: true,
    });
    console.log("👤 Created test user:", user.name);

    // Create test artisan
    const artisan = await Artisan.create({
      userId: user._id,
      name: "کارگاه استاد حسین",
      craftType: "سفال و سرامیک",
      otherCraftTypes: ["سفال و سرامیک"],
      bio: "استاد سفالگری با بیش از ۳۰ سال تجربه",
      stars: 4.5,
      verified: true,
      location: {
        city: "یزد",
        neighborhood: "فهادان",
        coordinates: [54.3675, 31.8974],
      },
      contactInfo: { phone: "09123456789" },
    });
    console.log("🏺 Created test artisan:", artisan.name);

    // Create sample crafts
    const titles = [
      "گلدان سنتی",
      "کوزه سفالی",
      "جاشمعی مسی",
      "تابلو مینیاتور",
      "گلیم کوچک",
      "پیش‌بند دست‌باف",
      "سینی قلم‌زنی",
      "جقه چوبی",
      "لیوان سفالی",
      "گوشواره ملیله",
      "بشقاب سفالی",
      "ظرف سرو",
      "تابلو قلم‌زنی",
      "کیف چرمی",
      "کفش سنتی",
      "شال و روسری",
      "جواهرات نقره",
      "ساعت چوبی",
      "آینه کاری",
      "خاتم کاری",
      "معرق کاری",
      "سوزن دوزی",
      "گلیم فارسی",
      "کاشی کاری",
      "نقش برجسته",
      "تذهیب",
      "نگارگری",
      "خط کوفی",
      "نقره کاری",
      "مس کاری",
    ];

    const craftTypes = [
      "pottery",
      "carpet",
      "metalwork",
      "woodwork",
      "textile",
      "leather",
      "jewelry",
    ];

    const cities = [
      { city: "تهران", coords: [51.41, 35.69] },
      { city: "شیراز", coords: [52.54, 29.61] },
      { city: "اصفهان", coords: [51.67, 32.64] },
      { city: "تبریز", coords: [46.29, 38.08] },
      { city: "یزد", coords: [54.36, 31.89] },
      { city: "مشهد", coords: [59.6, 36.31] },
      { city: "کاشان", coords: [51.43, 33.98] },
      { city: "قم", coords: [50.88, 34.64] },
      { city: "همدان", coords: [48.51, 34.8] },
      { city: "کرمان", coords: [57.08, 30.28] },
    ];

    const sampleCrafts = [];
    for (let i = 0; i < 30; i++) {
      const title = `${titles[i]} ${i + 1}`;
      const type = craftTypes[i % craftTypes.length];
      const cityInfo = cities[i % cities.length];
      const price = Math.floor(200000 + Math.random() * 5000000);

      sampleCrafts.push({
        title,
        description: `محصول ${title} ساخته شده توسط هنرمند محلی ${cityInfo.city}، مناسب برای خرید و هدیه دادن.`,
        artisanId: artisan._id,
        craftType: type,
        kind: "artwork",
        author: user._id,
        price: price,
        forSale: true,
        images: [
          `https://source.unsplash.com/collection/190727/800x600?sig=${i}`,
        ],
        location: {
          city: cityInfo.city,
          neighborhood: "بازار سنتی",
          geometry: { type: "Point", coordinates: cityInfo.coords },
        },
        tags: ["فروش", type, "هنری"],
        culturalStory: `محصولی با پیشینه محلی از ${cityInfo.city}`,
        isPublished: true,
        createdAt: new Date(),
      });
    }

    const crafts = await Craft.create(sampleCrafts);
    console.log(`✅ Created ${crafts.length} sample crafts`);

    // Verify data
    const totalCrafts = await Craft.countDocuments({ isPublished: true });
    console.log(`📊 Total published crafts in database: ${totalCrafts}`);

    mongoose.connection.close();
    console.log("🎉 Seeding completed successfully!");
  } catch (error) {
    console.error("❌ Error seeding data:", error);
    process.exit(1);
  }
}

seedData();
