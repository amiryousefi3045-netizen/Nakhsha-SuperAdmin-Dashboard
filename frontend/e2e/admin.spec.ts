import { test, expect } from "@playwright/test";

/**
 * Super Admin dashboard E2E.
 *
 * Covers the two browser-visible outcomes of /admin/login:
 *  1. super_admin → redirected into the dashboard,
 *  2. any other role → refusal card (server guards reject /api/admin/* too).
 *
 * Login uses the dev OTP code the backend echoes (NODE_ENV !== production) and
 * AuthPanel auto-fills it, so the browser flow exercises the entire real path:
 * phone submit → otp/start → devCode render → otp/verify → JWT storage → route.
 */

const SUPER_ADMIN_PHONE = "09120000000";
const REGULAR_USER_PHONE = "09120000001";

async function loginWithOtp(page: import("@playwright/test").Page, phone: string) {
  await page.goto("/admin/login");
  await page.getByLabel("شماره موبایل").fill(phone);
  await page.getByRole("button", { name: "دریافت کد ورود" }).click();

  // AuthPanel renders the dev code box with an auto-use button.
  await expect(page.getByText("کد توسعه")).toBeVisible();
  await page.getByRole("button", { name: "استفاده خودکار" }).click();
}

test("super admin OTP login lands on the dashboard", async ({ page }) => {
  await loginWithOtp(page, SUPER_ADMIN_PHONE);

  await expect(page).toHaveURL(/\/admin$/);
  await expect(
    page.getByRole("heading", { name: "نمای کلی", level: 2 }),
  ).toBeVisible();
});

test("a non-super-admin account is refused with a clear card", async ({ page }) => {
  await loginWithOtp(page, REGULAR_USER_PHONE);

  await expect(page.getByText("دسترسی محدود")).toBeVisible();
  await expect(
    page.getByText(/به پنل سوپر ادمین دسترسی ندارد/),
  ).toBeVisible();

  // The super admin API itself must refuse this session.
  const token = await page.evaluate(() =>
    localStorage.getItem("nakhsha_token"),
  );
  await expect(token).not.toBeNull();

  const denied = await page.request.get("http://127.0.0.1:5000/api/admin/stats", {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(denied.status()).toBe(403);
});