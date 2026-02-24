import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ShoppingBag, // پست – محصول / صنایع‌دستی
  Compass, // تور – گردشگری
  GraduationCap, // آموزش – کارگاه / دوره
  School, // آموزشگاه – مرکز ثابت
} from "lucide-react";
import ListingTypeCard from "../components/ListingTypeCard";
import type { ListingType } from "../types/listing";

interface CardConfig {
  type: ListingType;
  icon: React.ReactNode;
  title: string;
  description: string;
  iconBg: string;
  iconColor: string;
  accentBar: string;
}

const CARD_CONFIGS: CardConfig[] = [
  {
    type: "post",
    icon: <ShoppingBag strokeWidth={1.8} />,
    title: "پست",
    description:
      "محصول، صنایع‌دستی یا اثر هنری خود را معرفی کنید و مستقیماً به خریداران بفروشید.",
    iconBg: "bg-sky-50",
    iconColor: "text-sky-600",
    accentBar: "bg-gradient-to-l from-sky-400 to-sky-600",
  },
  {
    type: "tour",
    icon: <Compass strokeWidth={1.8} />,
    title: "تور",
    description:
      "یک تجربهٔ گردشگری، بازدید از کارگاه یا سفر فرهنگی را به گردشگران معرفی کنید.",
    iconBg: "bg-emerald-50",
    iconColor: "text-emerald-600",
    accentBar: "bg-gradient-to-l from-emerald-400 to-teal-600",
  },
  {
    type: "training",
    icon: <GraduationCap strokeWidth={1.8} />,
    title: "آموزش",
    description:
      "کارگاه، کلاس یا دورهٔ آموزشی هنر و صنایع‌دستی خود را به علاقه‌مندان معرفی کنید.",
    iconBg: "bg-amber-50",
    iconColor: "text-amber-600",
    accentBar: "bg-gradient-to-l from-amber-400 to-orange-500",
  },
  {
    type: "academy",
    icon: <School strokeWidth={1.8} />,
    title: "آموزشگاه",
    description:
      "یک مرکز آموزش هنر، خلاقیت یا صنایع‌دستی را با اطلاعات تماس و ساعت کاری معرفی کنید.",
    iconBg: "bg-violet-50",
    iconColor: "text-violet-600",
    accentBar: "bg-gradient-to-l from-violet-400 to-purple-600",
  },
];

export default function CreateListingTypePage() {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<ListingType | null>(null);

  const handleSelect = (type: ListingType) => {
    setSelected(type);
    // Short visual feedback before navigation (150 ms)
    setTimeout(() => {
      navigate(`/create/new?type=${type}`);
    }, 150);
  };

  return (
    <div
      dir="rtl"
      className="min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center px-4 py-12"
    >
      {/* ── Header ── */}
      <div className="mb-10 text-center max-w-lg">
        {/* Small brand icon */}
        <div className="mx-auto mb-4 w-14 h-14 rounded-2xl bg-[var(--color-primary)] flex items-center justify-center shadow-lg">
          <svg
            className="w-7 h-7 text-white"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.8}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 4.5v15m7.5-7.5h-15"
            />
          </svg>
        </div>

        <h1 className="text-2xl sm:text-3xl font-extrabold text-[var(--color-text)] mb-2">
          نوع آگهی را انتخاب کنید
        </h1>
        <p className="text-[var(--color-muted)] text-sm sm:text-base leading-relaxed">
          می‌خواهید چه چیزی را در{" "}
          <span className="text-[var(--color-primary)] font-semibold">
            نخشا
          </span>{" "}
          به اشتراک بگذارید؟
        </p>
      </div>

      {/* ── Cards grid ── */}
      <div className="w-full max-w-5xl grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {CARD_CONFIGS.map((card) => (
          <ListingTypeCard
            key={card.type}
            icon={card.icon}
            title={card.title}
            description={card.description}
            iconBg={card.iconBg}
            iconColor={card.iconColor}
            accentBar={card.accentBar}
            selected={selected === card.type}
            onClick={() => handleSelect(card.type)}
          />
        ))}
      </div>

      {/* ── Back link ── */}
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="mt-10 text-sm text-[var(--color-muted)] hover:text-[var(--color-primary)] transition-colors duration-150"
      >
        ← بازگشت
      </button>
    </div>
  );
}
