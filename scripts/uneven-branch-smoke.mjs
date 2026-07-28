import { chromium } from "playwright-core";

const browser = await chromium.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true
});
const page = await browser.newPage({ viewport: { width: 1180, height: 780 } });
const consoleErrors = [];
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});

await page.goto("http://127.0.0.1:1420", { waitUntil: "networkidle" });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle" });
await page.evaluate(() => {
  const key = "dingshi-state-v1";
  const state = JSON.parse(localStorage.getItem(key));
  state.policies.push(
    {
      id: "uneven-short",
      title: "短目标",
      trigger: "",
      rule: "每天晚上 11 点前把手机接上充电器",
      parentId: "goal-1",
      kind: "requirement",
      status: "active",
      createdAt: new Date().toISOString()
    },
    {
      id: "uneven-long",
      title: "长目标",
      trigger: "",
      rule: "每天晚上 11 点 50 分前把手机放到伸手够不到的固定充电位置",
      parentId: "goal-1",
      kind: "requirement",
      status: "active",
      createdAt: new Date().toISOString()
    }
  );
  localStorage.setItem(key, JSON.stringify(state));
});
await page.reload({ waitUntil: "networkidle" });
await page.getByRole("button", { name: /国策树/ }).click();
await page.getByRole("button", { name: "缩小画布" }).click();
await page.getByRole("button", { name: "缩小画布" }).click();
await page.getByRole("button", { name: "缩小画布" }).click();
await page.waitForTimeout(650);

const rootGoal = page
  .locator(".policy-node")
  .filter({ hasText: "在不依赖临时意志力的情况下稳定入睡与起床" });
const directChildren = rootGoal
  .locator("..")
  .locator(":scope > .policy-children > .policy-branch > .policy-node");
const boxes = await directChildren.evaluateAll((cards) =>
  cards.map((card) => {
    const box = card.getBoundingClientRect();
    return { text: card.textContent, top: box.top, bottom: box.bottom };
  })
);
const bottoms = boxes.map((box) => box.bottom);
const bottomDelta = Math.max(...bottoms) - Math.min(...bottoms);

await page.screenshot({ path: "/private/tmp/sacred-seat-uneven-branches.png" });
console.log(JSON.stringify({
  consoleErrors,
  directChildCount: boxes.length,
  bottomDelta,
  aligned: bottomDelta < 1,
  boxes,
  screenshot: "/private/tmp/sacred-seat-uneven-branches.png"
}, null, 2));

await browser.close();
