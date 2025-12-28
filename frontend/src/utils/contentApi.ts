interface Creator {
  id: string;
  name: string;
  handle: string;
  avatarUrl?: string;
  verified?: boolean;
}

interface ContentItem {
  id: string;
  type: "post" | "tour" | "tutorial";
  title: string;
  thumbnailUrl: string;
  city: string;
  price?: string;
  createdAt: string;
  creator: Creator;
  description: string;
  coverImageUrl?: string;
}

/**
 * Mock function to get content by type and ID
 * Simulates network delay of 300ms and returns mock data
 * Returns null for unknown IDs
 */
export const getContentById = async (
  type: "post" | "tour" | "tutorial",
  id: string
): Promise<ContentItem | null> => {
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 300));

  // Mock data generators
  const cities = [
    "اصفهان",
    "تهران",
    "شیراز",
    "تبریز",
    "مشهد",
    "کرمان",
    "یزد",
    "کاشان",
    "همدان",
    "قم",
  ];

  const creators = [
    { id: "creator1", name: "علی محمدی", handle: "ali_mohammadi" },
    { id: "creator2", name: "فاطمه کریمی", handle: "fateme_karimi" },
    { id: "creator3", name: "حسن رضایی", handle: "hasan_rezaei" },
    { id: "creator4", name: "زهرا احمدی", handle: "zahra_ahmadi" },
    { id: "creator5", name: "محمد جعفری", handle: "mohammad_jafari" },
    { id: "creator6", name: "مریم موسوی", handle: "maryam_mousavi" },
    { id: "creator7", name: "رضا حسینی", handle: "reza_hosseini" },
  ];

  // Generate deterministic content based on ID and type
  const seedNumber = parseInt(id) || id.charCodeAt(0) || 1;
  const randomCreator = creators[seedNumber % creators.length];
  const randomCity = cities[seedNumber % cities.length];

  const titlesByType = {
    post: [
      "صنایع دستی سفالگری سنتی ایرانی",
      "قالیچه دستباف کاشان اصیل",
      "زیورآلات نقره کار اصفهان",
      "فیروزه کوبی سنتی نیشابور",
      "خاتم کاری شیراز",
      "مس پارچه کاری سنتی",
      "گلیم دستباف لری",
      "ظروف مینا کاری",
      "چرم دوزی سنتی",
      "هنر کاشی کاری",
    ],
    tour: [
      "تور فرهنگی بافندگان کاشان",
      "بازدید از کارگاه سفالگری لاله‌جین",
      "تجربه زندگی روستایی در ابیانه",
      "تور صنایع دستی بازار اصفهان",
      "کارگاه قالی بافی در کاشان",
      "گردش در محله تاریخی فهادان یزد",
      "بازدید از کارگاه مس پارچه کاری",
      "تور خانه‌های تاریخی کاشان",
      "کارگاه خاتم کاری شیراز",
      "تجربه حیاط ایرانی در یزد",
    ],
    tutorial: [
      "آموزش سفالگری از صفر تا صد",
      "یادگیری خاتم کاری برای مبتدیان",
      "آموزش قالی بافی سنتی ایرانی",
      "تکنیک‌های فیروزه کوبی",
      "آموزش زرگری و ساخت زیورآلات",
      "آموزش مس پارچه کاری",
      "یادگیری کاشی کاری سنتی",
      "آموزش چرم دوزی",
      "تکنیک‌های گلیم بافی",
      "آموزش مینا کاری اصفهان",
    ],
  };

  const titles = titlesByType[type];
  const selectedTitle = titles[seedNumber % titles.length];

  const descriptions = [
    `این محصول نمونه‌ای از هنر اصیل ایرانی است که با دقت و مهارت بالا ساخته شده است.

در این آثر از تکنیک‌های سنتی و مواد اولیه درجه یک استفاده شده تا کیفیت و زیبایی خاصی به وجود آید. هنرمند با استفاده از تجربه چندین ساله خود، این اثر را با جزئیات فراوان و ظرافت بالا خلق کرده است.

ویژگی‌های کلیدی:
• کیفیت بالا و اصالت محصول
• ساخت دست و استفاده از تکنیک‌های سنتی
• مواد اولیه طبیعی و محیط زیست دوست
• قابلیت سفارشی سازی برای نیازهای خاص
• تضمین کیفیت و ضمانت محصول

این محصول نه تنها جنبه کاربردی دارد بلکه به عنوان یک اثر هنری نیز قابل استفاده است و می‌تواند زیبایی فضای شما را دوچندان کند.`,

    `یکی از بهترین نمونه‌های صنایع دستی ایرانی که ترکیبی از هنر کهن و نیازهای امروزی است.

تاریخچه این صنعت به قرن‌های گذشته بازمی‌گردد و از نسلی به نسل دیگر منتقل شده است. استادکاران این حوزه با حفظ اصالت و استفاده از نوآوری‌های مدرن، آثاری بی‌نظیر خلق می‌کنند.

مزایای خرید این محصول:
- دوام بالا و مقاومت در برابر زمان
- طراحی منحصر به فرد و دست ساز
- حمایت از هنرمندان و صنعتگران محلی
- ارزش سرمایه‌گذاری بالا
- مناسب برای هدیه و یادگاری

با خرید این محصول، شما نه تنها صاحب یک اثر زیبا می‌شوید بلکه از فرهنگ غنی ایران نیز حمایت می‌کنید.`,

    `این اثر با الهام از طبیعت و فرهنگ ایرانی طراحی و ساخته شده است.

هر قطعه به صورت دستی و با توجه به جزئیات ریز تولید می‌شود که باعث منحصر به فرد بودن هر محصول می‌گردد. استفاده از رنگ‌های طبیعی و مواد محلی، علاوه بر زیبایی، پایداری محیط زیست را نیز تضمین می‌کند.

نکات مهم:
• هر قطعه منحصر به فرد و غیر قابل تکرار است
• استفاده از رنگ‌ها و مواد طبیعی
• رعایت اصول محیط زیست در تولید
• حمل و نقل امن و بسته بندی مناسب
• خدمات پس از فروش و نگهداری

ما متعهد هستیم که بهترین کیفیت را به مشتریان عزیز ارائه دهیم و از رضایت شما اطمینان حاصل کنیم.`,
  ];

  const selectedDescription = descriptions[seedNumber % descriptions.length];

  // Generate price based on type (tutorials usually don't have prices)
  let price: string | undefined;
  if (type !== "tutorial" && seedNumber % 4 !== 0) {
    const basePrice = ((seedNumber % 20) + 1) * 50000; // Between 50k to 1M
    price = `${basePrice.toLocaleString("fa-IR")} تومان`;
  }

  // Generate dates (within last 30 days)
  const randomDaysAgo = seedNumber % 30;
  const createdAt = new Date(Date.now() - randomDaysAgo * 24 * 60 * 60 * 1000);

  // Create the content item
  const content: ContentItem = {
    id: id,
    type: type,
    title: selectedTitle,
    thumbnailUrl: `https://picsum.photos/400/300?random=${seedNumber}`,
    coverImageUrl: `https://picsum.photos/800/450?random=${seedNumber + 100}`,
    city: randomCity,
    price: price,
    createdAt: createdAt.toISOString(),
    creator: {
      ...randomCreator,
      avatarUrl: `https://picsum.photos/64/64?random=creator${seedNumber}`,
      verified: seedNumber % 3 === 0, // ~1/3 of creators are verified
    },
    description: selectedDescription,
  };

  // Simulate some IDs not found (for IDs ending with '404' or greater than 1000)
  if (id.includes("404") || (parseInt(id) && parseInt(id) > 1000)) {
    return null;
  }

  return content;
};

export type { ContentItem, Creator };
