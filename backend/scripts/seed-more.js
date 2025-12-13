const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const Artisan = require("../models/Artisan");
const Craft = require("../models/Craft");

async function seedMoreData() {
  try {
    await mongoose.connect("mongodb://localhost:27017/nakhsha_db");
    console.log("📦 Connected to database");

    // Get existing test user/artisan or create if needed
    let user = await User.findOne({ email: "artisan@test.com" });
    let artisan = await Artisan.findOne();

    if (!user) {
      const hashedPassword = await bcrypt.hash("test123", 10);
      user = await User.create({
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
    }

    if (!artisan) {
      artisan = await Artisan.create({
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
    }

    // Extended craft titles for 100+ items
    const craftTitles = [
      // سفال و سرامیک
      "گلدان سنتی",
      "کوزه سفالی",
      "بشقاب سفالی",
      "لیوان سفالی",
      "ظرف سرو",
      "جاشمعی سفالی",
      "گلدان تزیینی",
      "کاسه سرامیکی",
      "مجسمه سفالی",
      "تبخیری",

      // فلزکاری
      "سینی قلم‌زنی",
      "جاشمعی مسی",
      "آینه قلم‌زن",
      "بشقاب مسی",
      "لوستر مسی",
      "سماور قلم‌زن",
      "تابلو مس کاری",
      "ظرف شیرینی مسی",
      "آباژور مسی",
      "گلدان فلزی",

      // منسوجات
      "گلیم کوچک",
      "پیش‌بند دست‌باف",
      "رومیزی سنتی",
      "کوسن دست‌دوز",
      "شال ترکمنی",
      "جاجیم کردی",
      "زیلو سنتی",
      "روسری ابریشم",
      "کلاه نمدی",
      "کیف سنتی",

      // چوب کاری
      "جقه چوبی",
      "ساعت چوبی",
      "جعبه خاتم",
      "تخته نرد",
      "چهارپایه چوبی",
      "آینه خاتم",
      "قاب تصویر",
      "دعای کوچک",
      "شطرنج چوبی",
      "جاقلمدان",

      // نقاشی و مینیاتور
      "تابلو مینیاتور",
      "تابلو تذهیب",
      "نقاشی روی پارچه",
      "پرتره سنتی",
      "نقش اسلیمی",
      "تابلو خوشنویسی",
      "پشت شیشه نگاری",
      "رقص سماع",
      "صحنه شکار",
      "باغ ایرانی",

      // جواهرسازی
      "گوشواره ملیله",
      "انگشتر عقیق",
      "گردنبند نقره",
      "دستبند ملیله",
      "سنجاق سینه",
      "گل کوب طلا",
      "زنجیر نقره",
      "تسبیح عقیق",
      "پلاک طلا",
      "حلقه ازدواج",

      // چرم دوزی
      "کیف چرمی",
      "کفش سنتی",
      "جلد کتاب",
      "کمربند چرم",
      "کیف دستی",
      "صندل چرمی",
      "کفش گیوه",
      "پوشینه قرآن",
      "کیف لپ‌تاپ",
      "جاکلیدی چرم",

      // سنگ تراشی
      "مجسمه سنگی",
      "سنگ‌نگاره",
      "ظرف سنگی",
      "جاشمعی سنگ",
      "تندیس سنگ",
      "فرش سنگی",
      "کاشی سنگی",
      "سنگ یادبود",
      "شمعدان سنگ",
      "گلدان سنگی",

      // کالاهای مختلف
      "آینه کاری",
      "شیشه گری",
      "نجاری سنتی",
      "بامبو کاری",
      "سوزن دوزی",
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
      { city: "ساری", coords: [53.06, 36.56] },
      { city: "رشت", coords: [49.58, 37.28] },
      { city: "اهواز", coords: [48.67, 31.32] },
      { city: "کرج", coords: [50.99, 35.84] },
      { city: "ارومیه", coords: [45.08, 37.55] },
      { city: "زنجان", coords: [48.48, 36.67] },
      { city: "سنندج", coords: [46.99, 35.31] },
      { city: "یاسوج", coords: [51.59, 30.67] },
      { city: "بندرعباس", coords: [56.28, 27.19] },
      { city: "زاهدان", coords: [60.86, 29.49] },
    ];

    const craftTypes = [
      "pottery",
      "metalwork",
      "textile",
      "woodwork",
      "jewelry",
      "leather",
      "carpet",
      "other",
    ];

    const currentCount = await Craft.countDocuments();
    const targetCount = 100;
    const needToCreate = Math.max(0, targetCount - currentCount);

    if (needToCreate === 0) {
      console.log("✅ Database already has", currentCount, "crafts");
      mongoose.connection.close();
      return;
    }

    console.log(
      `📈 Creating ${needToCreate} more crafts (current: ${currentCount}, target: ${targetCount})`
    );

    const sampleCrafts = [];
    for (let i = 0; i < needToCreate; i++) {
      const titleIndex = (currentCount + i) % craftTitles.length;
      const title = `${craftTitles[titleIndex]} ${currentCount + i + 1}`;
      const type = craftTypes[i % craftTypes.length];
      const cityInfo = cities[i % cities.length];
      const price = Math.floor(100000 + Math.random() * 8000000);

      sampleCrafts.push({
        title,
        description: `محصول ${title} ساخته شده توسط هنرمند محلی ${cityInfo.city}. این اثر با استفاده از تکنیک‌های سنتی و مواد اولیه درجه یک تولید شده است.`,
        artisanId: artisan._id,
        craftType: type,
        kind: "artwork",
        author: user._id,
        price: price,
        forSale: true,
        images: [
          `https://source.unsplash.com/collection/190727/800x600?sig=${
            currentCount + i
          }`,
        ],
        location: {
          city: cityInfo.city,
          neighborhood: ["بازار سنتی", "شهر قدیم", "مرکز شهر", "محله تاریخی"][
            i % 4
          ],
          geometry: { type: "Point", coordinates: cityInfo.coords },
        },
        tags: ["فروش", type, "هنری", "سنتی"],
        culturalStory: `این اثر نمایانگر هنر کهن ${cityInfo.city} بوده و با رعایت اصول سنتی ساخته شده است.`,
        isPublished: true,
        createdAt: new Date(
          Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000
        ), // Random date in last year
      });
    }

    const crafts = await Craft.create(sampleCrafts);
    console.log(`✅ Successfully created ${crafts.length} new crafts`);

    // Final count
    const finalTotal = await Craft.countDocuments({ isPublished: true });
    console.log(`📊 Total published crafts: ${finalTotal}`);

    mongoose.connection.close();
    console.log("🎉 Database seeding completed!");
  } catch (error) {
    console.error("❌ Error seeding data:", error);
    process.exit(1);
  }
}

seedMoreData();
