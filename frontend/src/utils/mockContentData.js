// Frontend types for profile content
export const ContentItem = {
  id: "",
  type: "", // 'post' | 'tour' | 'tutorial'
  title: "",
  thumbnail: "",
  city: "",
  price: null, // optional
  createdAt: "",
};

// Mock data generators
export const generateMockPosts = () => [
  {
    id: "1",
    type: "post",
    title: "صنایع دستی سنتی کرمان - فرش دستباف ابریشم",
    thumbnail:
      "https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=400",
    city: "کرمان",
    price: 2500000,
    createdAt: "2024-12-20T10:30:00Z",
  },
  {
    id: "2",
    type: "post",
    title: "سفالگری اصفهان - کاسه‌های نقاشی شده با طرح اسلیمی",
    thumbnail:
      "https://images.unsplash.com/photo-1594736797933-d0a9b6db5004?w=400",
    city: "اصفهان",
    price: 350000,
    createdAt: "2024-12-18T14:15:00Z",
  },
  {
    id: "3",
    type: "post",
    title: "هنر خاتم‌کاری شیراز - جعبه جواهرات چوبی",
    thumbnail:
      "https://images.unsplash.com/photo-1542887800-faca0261c9e1?w=400",
    city: "شیراز",
    price: 1200000,
    createdAt: "2024-12-15T09:45:00Z",
  },
  {
    id: "4",
    type: "post",
    title: "قالیچه دستباف تبریز - طرح هریس با نخ پشمی",
    thumbnail:
      "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400",
    city: "تبریز",
    price: 4500000,
    createdAt: "2024-12-12T16:20:00Z",
  },
  {
    id: "5",
    type: "post",
    title: "کاشی‌کاری اصفهان - کاشی هفت رنگ با خوشنویسی",
    thumbnail:
      "https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=400",
    city: "اصفهان",
    price: 800000,
    createdAt: "2024-12-10T11:30:00Z",
  },
  {
    id: "6",
    type: "post",
    title: "هنر فلزکاری - قندان مسی قلمزنی شده",
    thumbnail:
      "https://images.unsplash.com/photo-1594736797933-d0a9b6db5004?w=400",
    city: "اصفهان",
    price: 650000,
    createdAt: "2024-12-08T13:45:00Z",
  },
  {
    id: "7",
    type: "post",
    title: "چوبکاری صنعتی - صندوقچه منبت‌کاری شده",
    thumbnail:
      "https://images.unsplash.com/photo-1542887800-faca0261c9e1?w=400",
    city: "شیراز",
    price: 950000,
    createdAt: "2024-12-05T15:10:00Z",
  },
  {
    id: "8",
    type: "post",
    title: "سوزن‌دوزی کرمان - رومیزی سنتی با نخ ابریشم",
    thumbnail:
      "https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=400",
    city: "کرمان",
    price: 420000,
    createdAt: "2024-12-03T08:25:00Z",
  },
  {
    id: "9",
    type: "post",
    title: "گلیم دستباف فارس - طرح قشقایی اصیل",
    thumbnail:
      "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400",
    city: "شیراز",
    price: 1800000,
    createdAt: "2024-12-01T12:40:00Z",
  },
  {
    id: "10",
    type: "post",
    title: "معرق‌کاری تهران - آینه و شمعدان چوبی",
    thumbnail:
      "https://images.unsplash.com/photo-1542887800-faca0261c9e1?w=400",
    city: "تهران",
    price: 1350000,
    createdAt: "2024-11-28T17:55:00Z",
  },
];

export const generateMockTours = () => [
  {
    id: "11",
    type: "tour",
    title: "تور طبیعت‌گردی جنگل‌های شمال - ۳ روزه گیلان",
    thumbnail:
      "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400",
    city: "رامسر",
    price: 2500000,
    createdAt: "2024-12-19T09:00:00Z",
  },
  {
    id: "12",
    type: "tour",
    title: "تور فرهنگی اصفهان - بازدید از بناهای تاریخی",
    thumbnail:
      "https://images.unsplash.com/photo-1539650116574-75c0c6d73c6e?w=400",
    city: "اصفهان",
    price: 1800000,
    createdAt: "2024-12-17T14:30:00Z",
  },
  {
    id: "13",
    type: "tour",
    title: "تور کویری مصر - شب در کویر و ستاره‌شناسی",
    thumbnail:
      "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=400",
    city: "میبد",
    price: 3200000,
    createdAt: "2024-12-15T11:15:00Z",
  },
  {
    id: "14",
    type: "tour",
    title: "تور کوهنوردی البرز - قله دماوند ۲ روزه",
    thumbnail:
      "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400",
    city: "تهران",
    price: 1500000,
    createdAt: "2024-12-13T16:45:00Z",
  },
  {
    id: "15",
    type: "tour",
    title: "تور تاریخی پرسپولیس و نقش رستم",
    thumbnail:
      "https://images.unsplash.com/photo-1539650116574-75c0c6d73c6e?w=400",
    city: "شیراز",
    price: 2100000,
    createdAt: "2024-12-11T13:20:00Z",
  },
  {
    id: "16",
    type: "tour",
    title: "تور باغ‌های کاشان - گلاب‌گیری و بازدید از خانه‌های سنتی",
    thumbnail:
      "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400",
    city: "کاشان",
    price: 1200000,
    createdAt: "2024-12-09T10:30:00Z",
  },
  {
    id: "17",
    type: "tour",
    title: "تور جزیره کیش - غواصی و ورزش‌های آبی",
    thumbnail:
      "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=400",
    city: "کیش",
    price: 3800000,
    createdAt: "2024-12-07T15:10:00Z",
  },
  {
    id: "18",
    type: "tour",
    title: "تور روستای ماسوله - معماری پلکانی گیلان",
    thumbnail:
      "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400",
    city: "فومن",
    price: 1600000,
    createdAt: "2024-12-05T08:45:00Z",
  },
  {
    id: "19",
    type: "tour",
    title: "تور غارهای علیصدر - شگفتی‌های زیرزمینی",
    thumbnail:
      "https://images.unsplash.com/photo-1539650116574-75c0c6d73c6e?w=400",
    city: "همدان",
    price: 1400000,
    createdAt: "2024-12-03T12:25:00Z",
  },
  {
    id: "20",
    type: "tour",
    title: "تور دریاچه ارومیه - پدیده طبیعی منحصربه‌فرد",
    thumbnail:
      "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=400",
    city: "ارومیه",
    price: 2200000,
    createdAt: "2024-12-01T14:50:00Z",
  },
];

export const generateMockTutorials = () => [
  {
    id: "21",
    type: "tutorial",
    title: "آموزش بافت فرش دستی - از مقدماتی تا پیشرفته",
    thumbnail:
      "https://images.unsplash.com/photo-1588776814546-dab15c79cd1d?w=400",
    city: "تبریز",
    price: null,
    createdAt: "2024-12-18T10:00:00Z",
  },
  {
    id: "22",
    type: "tutorial",
    title: "سفالگری سنتی ایران - تکنیک‌های کاسه‌سازی",
    thumbnail:
      "https://images.unsplash.com/photo-1594736797933-d0a9b6db5004?w=400",
    city: "لالجین",
    price: null,
    createdAt: "2024-12-16T14:30:00Z",
  },
  {
    id: "23",
    type: "tutorial",
    title: "هنر قالی‌بافی - الگوهای سنتی آذربایجان",
    thumbnail:
      "https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=400",
    city: "تبریز",
    price: null,
    createdAt: "2024-12-14T09:15:00Z",
  },
  {
    id: "24",
    type: "tutorial",
    title: "خاتم‌کاری شیراز - هنر چوب و فلز",
    thumbnail:
      "https://images.unsplash.com/photo-1542887800-faca0261c9e1?w=400",
    city: "شیراز",
    price: null,
    createdAt: "2024-12-12T16:45:00Z",
  },
  {
    id: "25",
    type: "tutorial",
    title: "کاشی‌کاری - نقاشی روی کاشی هفت رنگ",
    thumbnail:
      "https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=400",
    city: "اصفهان",
    price: null,
    createdAt: "2024-12-10T11:20:00Z",
  },
  {
    id: "26",
    type: "tutorial",
    title: "قلمزنی مس - هنر سنتی فلزکاری",
    thumbnail:
      "https://images.unsplash.com/photo-1594736797933-d0a9b6db5004?w=400",
    city: "اصفهان",
    price: null,
    createdAt: "2024-12-08T13:30:00Z",
  },
  {
    id: "27",
    type: "tutorial",
    title: "سوزن‌دوزی کرمان - طرح‌های سنتی پارچه",
    thumbnail:
      "https://images.unsplash.com/photo-1588776814546-dab15c79cd1d?w=400",
    city: "کرمان",
    price: null,
    createdAt: "2024-12-06T15:40:00Z",
  },
  {
    id: "28",
    type: "tutorial",
    title: "معرق‌کاری - هنر چوب‌کاری هندسی",
    thumbnail:
      "https://images.unsplash.com/photo-1542887800-faca0261c9e1?w=400",
    city: "تهران",
    price: null,
    createdAt: "2024-12-04T08:50:00Z",
  },
  {
    id: "29",
    type: "tutorial",
    title: "گلیم‌بافی - طرح‌های قومی و محلی",
    thumbnail:
      "https://images.unsplash.com/photo-1588776814546-dab15c79cd1d?w=400",
    city: "فارس",
    price: null,
    createdAt: "2024-12-02T12:15:00Z",
  },
  {
    id: "30",
    type: "tutorial",
    title: "منبت‌کاری چوب - تکنیک‌های حکاکی",
    thumbnail:
      "https://images.unsplash.com/photo-1542887800-faca0261c9e1?w=400",
    city: "شیراز",
    price: null,
    createdAt: "2024-11-30T17:25:00Z",
  },
  {
    id: "31",
    type: "tutorial",
    title: "نقره‌کاری - جواهرسازی سنتی ایرانی",
    thumbnail:
      "https://images.unsplash.com/photo-1594736797933-d0a9b6db5004?w=400",
    city: "اصفهان",
    price: null,
    createdAt: "2024-11-28T10:30:00Z",
  },
  {
    id: "32",
    type: "tutorial",
    title: "رنگرزی طبیعی - رنگ‌های گیاهی برای پارچه",
    thumbnail:
      "https://images.unsplash.com/photo-1588776814546-dab15c79cd1d?w=400",
    city: "یزد",
    price: null,
    createdAt: "2024-11-26T14:45:00Z",
  },
];
