export default function Privacy() {
  return (
    <div
      className="max-w-3xl mx-auto p-6"
      dir="rtl"
      style={{ backgroundColor: "#FAFAF7", color: "#2E2E2E" }}
    >
      <h1 className="text-2xl font-bold mb-4" style={{ color: "#1A5F7A" }}>
        حریم خصوصی نخشا
      </h1>
      <section className="mb-4">
        <h2 className="text-lg font-semibold mb-2">حریم اطلاعات</h2>
        <p className="text-sm leading-relaxed">
          این متن نمونه حریم خصوصی است. اطلاعات کاربران چگونه جمع‌آوری، استفاده
          و محافظت می‌شود توضیح داده می‌شود.
        </p>
      </section>
      <section className="mb-4">
        <h2 className="text-lg font-semibold mb-2">کوکی‌ها و ردیابی</h2>
        <p className="text-sm leading-relaxed">
          اطلاعات درباره استفاده از کوکی‌ها و سرویس‌های تحلیلی.
        </p>
      </section>
      <section>
        <h2 className="text-lg font-semibold mb-2">تماس</h2>
        <p className="text-sm leading-relaxed">
          برای سوالات حریم خصوصی با ما تماس بگیرید.
        </p>
      </section>
    </div>
  );
}
