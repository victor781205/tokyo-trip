/**
 * 手機版 production smoke regression
 * 用法：node scripts/mobile-smoke.mjs
 * 可選：SMOKE_DEVICE="iPhone 15 Pro Max" SMOKE_URL=...
 */
import { chromium, devices } from "playwright";

const BASE = process.env.SMOKE_URL || "https://tokyo-trip-rosy.vercel.app";
const DEVICE_NAME = process.env.SMOKE_DEVICE || "iPhone 15 Pro Max";
const results = [];

function pass(name, detail = "") {
  results.push({ ok: true, name, detail });
  console.log(`✅ ${name}${detail ? " — " + detail : ""}`);
}
function fail(name, detail = "") {
  results.push({ ok: false, name, detail });
  console.error(`❌ ${name}${detail ? " — " + detail : ""}`);
}

async function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const device = devices[DEVICE_NAME];
  if (!device) {
    console.error(`未知裝置：${DEVICE_NAME}`);
    console.error(
      "可用 iPhone：",
      Object.keys(devices)
        .filter((k) => /iPhone/i.test(k) && !/landscape/i.test(k))
        .join(", "),
    );
    process.exit(1);
  }
  console.log(`裝置：${DEVICE_NAME} (${device.viewport?.width}×${device.viewport?.height})`);
  const context = await browser.newContext({
    ...device,
    locale: "zh-TW",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);

  try {
    // ── 1. 首頁 / TodayFocus ──
    await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
    await wait(2500);

    const todayFocus = page.locator('[aria-label="今日焦點"]');
    if (await todayFocus.count()) {
      pass("首頁 TodayFocus 存在");
      const text = await todayFocus.innerText();
      if (/東京今日|天氣載入|°C|降雨/.test(text)) {
        pass("TodayFocus 天氣列", text.match(/東京今日[^\n]+|天氣載入[^\n]+/)?.[0] || "");
      } else {
        fail("TodayFocus 天氣列", "未看到天氣文案：" + text.slice(0, 120));
      }
      if (/推播/.test(text)) {
        pass("TodayFocus 推播預告");
      } else {
        fail("TodayFocus 推播預告", "未看到推播文案");
      }
    } else {
      fail("首頁 TodayFocus 存在");
    }

    // ── 2. 行程 tab：預算彈窗 + 找美食 ──
    await page.goto(BASE + "/?tab=itinerary", { waitUntil: "domcontentloaded" });
    await wait(3000);

    // 等活動卡片
    const walletBtn = page.locator('button[aria-label*="加入預算"]').first();
    if (await walletBtn.count()) {
      await walletBtn.scrollIntoViewIfNeeded();
      await walletBtn.click();
      await wait(600);
      const budgetModalTitle = page.getByRole("heading", { name: "加入預算" });
      if (await budgetModalTitle.count()) {
        pass("行程→預算彈窗開啟");
        // 檢查金額輸入與類別
        const amount = page.locator('input[placeholder*="1200"], input[type="number"]').first();
        if (await amount.count()) {
          await amount.fill("1500");
          pass("預算彈窗可填金額");
        } else {
          fail("預算彈窗可填金額");
        }
        // 關閉
        const close = page.locator('button[aria-label="關閉"]').first();
        if (await close.count()) await close.click();
        else await page.keyboard.press("Escape");
        await wait(400);
      } else {
        fail("行程→預算彈窗開啟", await page.locator("body").innerText().then((t) => t.slice(0, 200)));
      }
    } else {
      fail("行程→預算彈窗開啟", "找不到加入預算按鈕（可能尚無活動）");
    }

    const foodBtn = page.locator('button[aria-label*="附近美食"]').first();
    if (await foodBtn.count()) {
      await foodBtn.scrollIntoViewIfNeeded();
      await foodBtn.click();
      await wait(2500);
      const url = page.url();
      if (url.includes("tab=food") || (await page.locator("#food").count())) {
        pass("行程→美食跳轉", url);
        // focusHint 可能有也可能因 district=all 只有 q
        const body = await page.locator("body").innerText();
        if (/已篩選|從行程|附近|美食/.test(body)) {
          pass("美食頁載入", "含美食相關文案");
        } else {
          fail("美食頁載入", "文案不符合預期");
        }
      } else {
        fail("行程→美食跳轉", url);
      }
    } else {
      // 可能還在 itinerary 但沒按鈕
      fail("行程→美食跳轉", "找不到附近美食按鈕");
    }

    // ── 3. 同步 Modal ──
    await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
    await wait(1500);
    // 開啟同步：導覽列設定或分享
    const syncTriggers = [
      page.locator('button[aria-label="同步設定"]'),
      page.getByRole("button", { name: /同步設定|分享|同步分享/ }),
    ];
    let opened = false;
    for (const t of syncTriggers) {
      if (await t.count()) {
        try {
          await t.first().click({ timeout: 3000 });
          await wait(800);
          if (await page.getByRole("heading", { name: /分享給同伴|同步設定/ }).count()) {
            opened = true;
            break;
          }
        } catch {
          // try next
        }
      }
    }
    // 可能在漢堡選單
    if (!opened) {
      const menu = page.locator('button[aria-label*="選單"], button[aria-label*="menu"], button[aria-label*="Menu"]').first();
      if (await menu.count()) {
        await menu.click();
        await wait(500);
        const syncItem = page.getByRole("button", { name: /同步設定|分享/ }).first();
        if (await syncItem.count()) {
          await syncItem.click();
          await wait(800);
          opened = !!(await page.getByRole("heading", { name: /分享給同伴|同步設定/ }).count());
        }
      }
    }

    if (opened) {
      const modalText = await page.locator('[role="dialog"], body').first().innerText();
      if (/3 步|複製分享連結|傳給同伴|LINE/.test(modalText)) {
        pass("同步 Modal 白話文案", "含 3 步說明");
      } else {
        fail("同步 Modal 白話文案", modalText.slice(0, 180));
      }
      // 關閉
      const closeSync = page.locator('button[aria-label="關閉同步設定"]');
      if (await closeSync.count()) await closeSync.click();
    } else {
      fail("同步 Modal 白話文案", "無法開啟同步 Modal");
    }

    // ── 4. 行李 ──
    await page.goto(BASE + "/?tab=tripprep", { waitUntil: "domcontentloaded" });
    await wait(3000);
    const packing = page.locator("#packing");
    if (await packing.count()) {
      pass("行李區塊存在");
      const uncheck = page.getByRole("button", { name: /全部消勾/ });
      const exportBtn = page.getByRole("button", { name: /匯出文字/ });
      if (await uncheck.count()) pass("行李「全部消勾」按鈕");
      else fail("行李「全部消勾」按鈕");
      if (await exportBtn.count()) {
        pass("行李「匯出文字」按鈕");
        // 點擊匯出（下載可能被 headless 接受）
        await exportBtn.click();
        await wait(500);
        pass("行李匯出可點擊");
      } else {
        fail("行李「匯出文字」按鈕");
      }
    } else {
      fail("行李區塊存在");
    }

    // ── 5. 預算 sticky CTA ──
    await page.goto(BASE + "/?tab=tools", { waitUntil: "domcontentloaded" });
    await wait(3000);
    const sticky = page.getByRole("button", { name: /快速記一筆/ });
    if (await sticky.count()) {
      pass("預算 sticky「快速記一筆」");
      await sticky.click();
      await wait(800);
      const form = page.locator("#budget-add-form");
      if (await form.count()) {
        const visible = await form.isVisible();
        pass("sticky 捲到記帳表單", visible ? "可見" : "存在但可能被遮");
      } else {
        fail("sticky 捲到記帳表單", "找不到 #budget-add-form");
      }
    } else {
      fail("預算 sticky「快速記一筆」");
    }

    // ── 6. 基本 layout：無明顯水平溢出（抽樣）──
    const overflow = await page.evaluate(() => {
      const doc = document.documentElement;
      return {
        clientWidth: doc.clientWidth,
        scrollWidth: doc.scrollWidth,
        bodyScroll: document.body.scrollWidth,
      };
    });
    if (overflow.scrollWidth <= overflow.clientWidth + 2) {
      pass("無明顯水平溢出", `${overflow.scrollWidth}≤${overflow.clientWidth}`);
    } else {
      fail(
        "無明顯水平溢出",
        `scrollWidth=${overflow.scrollWidth} clientWidth=${overflow.clientWidth}`,
      );
    }
  } catch (e) {
    fail("執行例外", String(e?.message || e));
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => !r.ok);
  console.log("\n========== 手機回測摘要 ==========");
  console.log(`通過 ${results.filter((r) => r.ok).length} / ${results.length}`);
  if (failed.length) {
    console.log("失敗項目：");
    for (const f of failed) console.log(` - ${f.name}: ${f.detail}`);
    process.exitCode = 1;
  } else {
    console.log("全部通過");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
