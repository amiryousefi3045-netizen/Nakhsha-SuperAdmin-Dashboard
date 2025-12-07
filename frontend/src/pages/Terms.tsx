import React from "react";

export default function Terms() {
  return (
    <div
      className="max-w-3xl mx-auto p-6"
      dir="rtl"
      style={{ backgroundColor: "#FAFAF7", color: "#2E2E2E" }}
    >
      <h1 className="text-2xl font-bold mb-4" style={{ color: "#1A5F7A" }}>
        قوانین استفاده نخشا
      </h1>
      <section className="mb-4">
        <h2 className="text-lg font-semibold mb-2">مقدمه</h2>
        <p className="text-sm leading-relaxed">
          این متن نمونه قوانین استفاده است. در این بخش می‌توانید شرایط استفاده
          از سرویس نخشا را قرار دهید.
        </p>
      </section>
      <section className="mb-4">
        <h2 className="text-lg font-semibold mb-2">حساب کاربری</h2>
        <p className="text-sm leading-relaxed">
          توضیحات درباره نحوه استفاده از حساب کاربری، مسئولیت‌ها و محدودیت‌ها.
        </p>
      </section>
      <section>
        <h2 className="text-lg font-semibold mb-2">خاتمه</h2>
        <p className="text-sm leading-relaxed">
          در صورت نیاز به اطلاعات بیشتر، با پشتیبانی تماس بگیرید.
        </p>
      </section>
    </div>
  );
}
