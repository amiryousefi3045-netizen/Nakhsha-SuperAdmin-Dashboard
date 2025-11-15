const mongoose = require("mongoose");
const dotenv = require("dotenv");
const bcrypt = require("bcryptjs");

dotenv.config();

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/nakhsha";

async function main() {
  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  console.log("Connected to MongoDB for seeding");

  const User = require("../models/User");
  const Artisan = require("../models/Artisan");
  const Craft = require("../models/Craft");

  // Clean up a subset of test data to be safe
  await Promise.all([
    User.deleteMany({ email: /@seedtest\.local$/ }),
    Artisan.deleteMany({ name: /کارگاه نمونه/ }),
    Craft.deleteMany({ title: /نمونه-/ }),
  ]);

  // Create test user
  const password = await bcrypt.hash("devpass", 10);
  const user = await User.create({
    name: "کاربر نمونه",
    email: `seed-${Date.now()}@seedtest.local`,
    password,
    role: "artisan",
    phone: "09120000000",
    location: { city: "تهران", province: "تهران", coordinates: [51.41, 35.69] },
    isVerified: true,
  });

  // Create artisan
  const artisan = await Artisan.create({
    userId: user._id,
    name: "کارگاه نمونه",
    bio: "کارگاه نمونه برای تست",
    craftType: "سفال و سرامیک",
    otherCraftTypes: ["سفال و سرامیک"],
    images: [],
    location: {
      city: "یزد",
      neighborhood: "فهادان",
      coordinates: [54.3675, 31.8974],
    },
    contactInfo: { phone: "09120000000" },
    verified: true,
  });

  console.log(
    "Created user and artisan:",
    user._id.toString(),
    artisan._id.toString()
  );

  const craftTypes = [
    "pottery",
    "carpet",
    "metalwork",
    "woodwork",
    "textile",
    "leather",
    "other",
  ];
  const cities = [
    { city: "تهران", coords: [51.41, 35.69] },
    { city: "شیراز", coords: [52.54, 29.61] },
    { city: "اصفهان", coords: [51.67, 32.64] },
    { city: "یزد", coords: [54.36, 31.89] },
    { city: "تبریز", coords: [46.29, 38.08] },
    { city: "مشهد", coords: [59.6, 36.31] },
  ];

  const toCreate = [];
  for (let i = 0; i < 100; i++) {
    const isEducational = i < 20;
    const type = craftTypes[i % craftTypes.length];
    const cityInfo = cities[i % cities.length];

    const craftPersian =
      {
        pottery: "ظروف سفالی",
        carpet: "قالی دستباف",
        metalwork: "فلزکاری سنتی",
        woodwork: "منبت چوبی",
        textile: "نساجی سنتی",
        leather: "چرم دست‌دوز",
        other: "اثر دست‌ساز",
      }[type] || "اثر دست‌ساز";

    // Generate a human-friendly, unique title and description
    const title = isEducational
      ? `${cityInfo.city} — کارگاه آموزشی ${craftPersian} (سطح ${
          i % 3 === 0 ? "پیشرفته" : i % 3 === 1 ? "متوسط" : "مبتدی"
        })`
      : `${craftPersian} دست‌ساز از ${cityInfo.city} — مجموعهٔ شماره ${i + 1}`;

    const baseDesc = isEducational
      ? `${title}. این کارگاه شامل آموزش عملی، ابزار و مواد اولیه است. مناسب برای علاقه‌مندان به ${craftPersian} که می‌خواهند یک تجربهٔ عملی و گواهی پایان دوره دریافت کنند.`
      : `${title}. ساخته شده از مواد باکیفیت، دارای جزئیاتِ دستی و مناسب برای هدیه یا دکوراسیون. تولیدکننده: ${
          artisan.name || "کارگاه محلی"
        } در ${cityInfo.city}.`;

    // Add a few tags with contextual info
    const tags = isEducational
      ? ["آموزشی", craftPersian, cityInfo.city]
      : ["فروش", craftPersian, cityInfo.city];

    toCreate.push({
      title,
      description: baseDesc,
      images: [
        `https://source.unsplash.com/800x600?${encodeURIComponent(
          type
        )}&sig=${i}`,
      ],
      kind: isEducational ? "class" : "artwork",
      craftType: type,
      price: isEducational ? 0 : Math.floor(200000 + Math.random() * 3000000),
      currency: "IRR",
      forSale: !isEducational,
      tags,
      author: user._id,
      artisanId: artisan._id,
      location: {
        city: cityInfo.city,
        neighborhood: "بازار سنتی",
        geometry: { type: "Point", coordinates: cityInfo.coords },
      },
      isPublished: true,
      createdAt: new Date(
        Date.now() - Math.floor(Math.random() * 1000 * 60 * 60 * 24 * 90)
      ),
    });
  }

  const created = await Craft.create(toCreate);
  console.log(
    "Created",
    created.length,
    "crafts. Example IDs:",
    created.slice(0, 5).map((c) => c._id.toString())
  );

  await mongoose.disconnect();
  console.log("Seeding complete. Disconnected.");
}

main().catch((err) => {
  console.error("Seeding failed:", err);
  process.exit(1);
});
