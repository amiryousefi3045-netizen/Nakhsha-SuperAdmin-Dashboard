import React from "react";

type Props = {
  providerBlocked: boolean;
  onManualPick?: () => void;
};

export default function LocationHelp({ providerBlocked, onManualPick }: Props) {
  if (!providerBlocked) return null;

  return (
    <div className="max-w-md mx-auto bg-yellow-50 border-l-4 border-yellow-400 p-3 rounded shadow text-sm text-right">
      <div className="font-medium text-gray-800 mb-1">
        در دسترس نبودن سرویس موقعیت‌یابی
      </div>
      <div className="text-gray-700 text-[13px] leading-6">
        در Chrome/Chromium ممکن است سرویس شبکه‌ای گوگل مسدود شده باشد. گزینه‌ها:
        <ul className="list-disc mr-4 mt-2">
          <li>GPS را فعال کنید (دکمه «موقعیت من»).</li>
          <li>
            روی نقشه محل خود را دستی انتخاب کنید.
            {onManualPick && (
              <button
                type="button"
                onClick={onManualPick}
                className="mr-3 inline-block bg-yellow-600 text-white text-xs px-2 py-1 rounded"
              >
                انتخاب دستی روی نقشه
              </button>
            )}
          </li>
          <li>مرورگر Firefox یا Safari را امتحان کنید.</li>
        </ul>
      </div>
    </div>
  );
}
