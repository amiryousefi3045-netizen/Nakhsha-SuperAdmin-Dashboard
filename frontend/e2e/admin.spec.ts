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

test("mobile: hamburger menu opens and navigation works at 375px", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await loginWithOtp(page, SUPER_ADMIN_PHONE);

  await expect(page).toHaveURL(/\/admin$/);
  await expect(
    page.getByRole("heading", { name: "نمای کلی", level: 2 }),
  ).toBeVisible();

  // Desktop sidebar is hidden on mobile; the hamburger button is shown instead.
  const hamburger = page.getByRole("button", { name: "باز کردن منو" });
  await expect(hamburger).toBeVisible();
  await expect(page.getByRole("link", { name: "کاربران" })).toBeHidden();

  // Opening the hamburger reveals the sidebar overlay and its navigation.
  await hamburger.click();
  await expect(page.getByRole("link", { name: "کاربران" })).toBeVisible();
  await page.getByRole("link", { name: "کاربران" }).click();
  await expect(page).toHaveURL(/\/admin\/users/);
  const heading = page.getByRole("heading", { name: "کاربران", level: 2 });
  await expect(heading).toBeVisible();

  // No horizontal layout break at 375px.
  const noHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  );
  expect(noHorizontalOverflow).toBe(true);
});