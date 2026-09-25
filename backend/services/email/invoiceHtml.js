/**
 * Invoice builders (Phase 23) — a storefront buyer gets an itemised HTML
 * invoice over email once payment succeeds. HTML is used when the email
 * transport supports it; the plain-text version is what lands in the
 * notification record (and is what a text-only transport would deliver).
 */

function formatIRR(amount) {
  return new Intl.NumberFormat("fa-IR").format(Number(amount) || 0);
}

const PAYMENT_LABELS = {
  unpaid: "در انتظار پرداخت",
  paid: "پرداخت‌شده",
  refunded: "مستردشده",
};

const STATUS_LABELS = {
  pending: "در انتظار پرداخت",
  confirmed: "تأیید شد",
  processing: "در حال پردازش",
  shipped: "ارسال شد",
  delivered: "تحویل شد",
  cancelled: "لغو شد",
  returned: "مرجوع شد",
};

/**
 * Plain-text Persian invoice (kept in the notification record / `message`).
 * @param {import("mongoose").Model} order
 * @returns {string}
 */
function buildInvoiceText(order) {
  const lines = [];
  lines.push(`نخشا | فاکتور سفارش — شماره سفارش: ${order.orderNumber}`);
  lines.push(`نام فروشگاه: ${order.sellerStoreName || "-"}`);
  lines.push("");
  for (const item of order.items || []) {
    lines.push(
      `${item.title} — ${formatIRR(item.price)} تومان × ${item.qty} = ${formatIRR(item.price * item.qty)} تومان`,
    );
  }
  lines.push("");
  if (order.subtotal > 0) lines.push(`جمع کالاها: ${formatIRR(order.subtotal)} تومان`);
  if (order.shippingFee > 0) lines.push(`هزینه ارسال: ${formatIRR(order.shippingFee)} تومان`);
  if (order.discount > 0) lines.push(`تخفیف: ${formatIRR(order.discount)} تومان`);
  lines.push(`مبلغ نهایی: ${formatIRR(order.total)} تومان`);
  lines.push(`وضعیت سفارش: ${STATUS_LABELS[order.status] || order.status}`);
  return lines.join("\n");
}

/**
 * RTL HTML invoice for the buyer receipt email.
 * @param {import("mongoose").Model} order
 * @returns {string}
 */
function buildInvoiceHtml(order) {
  const itemRows = (order.items || [])
    .map(
      (item) => `
      <tr>
        <td style="padding:8px 10px;border-bottom:1px solid #eee">${item.title}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:center">${item.qty}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:left" dir="ltr">${formatIRR(item.price)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:left" dir="ltr">${formatIRR(item.price * item.qty)}</td>
      </tr>`,
    )
    .join("");

  const totals = [
    { label: "جمع کالاها", value: formatIRR(order.subtotal) },
    { label: "هزینه ارسال", value: formatIRR(order.shippingFee) },
    { label: "تخفیف", value: `-${formatIRR(order.discount)}` },
    { label: "مبلغ نهایی", value: formatIRR(order.total), strong: true },
  ]
    .map(
      (row) => `
      <tr>
        <td style="padding:6px 10px;${row.strong ? "font-weight:700" : "color:#555"}">${row.label}</td>
        <td style="padding:6px 10px;text-align:left;${row.strong ? "font-weight:700" : "color:#555"}" dir="ltr">${row.value}</td>
      </tr>`,
    )
    .join("");

  return `<!doctype html>
<html dir="rtl" lang="fa">
  <head>
    <meta charset="utf-8" />
    <title>فاکتور سفارش ${order.orderNumber}</title>
  </head>
  <body style="margin:0;background:#f4f4f4;font-family:Tahoma,'Segoe UI',sans-serif;">
    <div style="max-width:600px;margin:24px auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e5e5;">
      <div style="background:#0f172a;color:#fff;padding:18px 24px;">
        <div style="font-size:18px;font-weight:700;color:#fff">فاکتور سفارش نخشا</div>
        <div style="font-size:13px;color:#cbd5e1;margin-top:4px">شماره سفارش: ${order.orderNumber}</div>
      </div>
      <div style="padding:24px;">
        <div style="font-size:14px;color:#333;margin-bottom:16px">
          فروشگاه: <strong>${order.sellerStoreName || "-"}</strong> — خریدار: ${order.customer.name}
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead>
            <tr style="background:#f8fafc">
              <th style="padding:8px 10px;text-align:right">کالا</th>
              <th style="padding:8px 10px;text-align:center">تعداد</th>
              <th style="padding:8px 10px;text-align:left">قیمت واحد (تومان)</th>
              <th style="padding:8px 10px;text-align:left">جمع (تومان)</th>
            </tr>
          </thead>
          <tbody>${itemRows}</tbody>
        </table>
        <table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:12px">
          <tbody>${totals}</tbody>
        </table>
        <div style="font-size:12px;color:#64748b;margin-top:16px;border-top:1px dashed #ddd;padding-top:12px">
          وضعیت پرداخت: ${PAYMENT_LABELS[order.payment?.status] || order.payment?.status || "-"}
        </div>
      </div>
    </div>
  </body>
</html>`;
}

module.exports = { buildInvoiceText, buildInvoiceHtml, formatIRR };