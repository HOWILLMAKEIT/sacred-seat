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

const dailyQuote = await page.locator(".daily-quote p").innerText();
await page.screenshot({ path: "/private/tmp/sacred-seat-daily-quote.png" });
await page.getByRole("button", { name: "打开方法说明阅读全文" }).click();
await page.getByText("CTDP / RSIP 方法手册").waitFor();
const conciseVisible = await page.getByText("CTDP / RSIP 三分钟复习").isVisible();
await page.getByRole("tab", { name: "知乎原文" }).click();
const originalVisible = await page.getByText("《如何提高自制力？》· edmond").isVisible();
const sourceLink = await page.locator(".guide-source-link").getAttribute("href");
const articleImages = await page.locator(".guide-document img").count();
await page.locator(".guide-document img").first().waitFor({ state: "visible" });
const firstImageLoaded = await page.locator(".guide-document img").first().evaluate(
  (image) => image.complete && image.naturalWidth > 0
);
await page.screenshot({ path: "/private/tmp/sacred-seat-guide.png" });
const originalText = await page.locator(".guide-document").innerText();
const rawMarkdownLinks = (originalText.match(/\]\(https?:\/\//g) ?? []).length;
await page.getByText(/补充1：很多人对这个模型/).scrollIntoViewIfNeeded();
await page.screenshot({ path: "/private/tmp/sacred-seat-guide-nested-links.png" });
await page.getByRole("button", { name: "关闭" }).click();

await page.evaluate(() => {
  const key = "dingshi-state-v1";
  const state = JSON.parse(localStorage.getItem(key));
  for (let index = 0; index < 16; index += 1) {
    state.policies.push({
      id: `scale-node-${index}`,
      title: `扩展节点 ${index + 1}`,
      trigger: "",
      rule: `用于验证无限扩展能力的第 ${index + 1} 个节点`,
      parentId: index < 8 ? "goal-1" : `scale-node-${index - 8}`,
      kind: "requirement",
      status: "active",
      createdAt: new Date().toISOString()
    });
  }
  localStorage.setItem(key, JSON.stringify(state));
});
await page.reload({ waitUntil: "networkidle" });
await page.getByRole("button", { name: /国策树/ }).click();
await page.getByRole("button", { name: "显示全部节点" }).click();
await page.waitForTimeout(700);

const renderedNodes = await page.locator(".policy-node").count();
const renderedEdges = await page.locator(".policy-connectors path[d]").count();
const zoomLabel = await page.locator(".zoom-value").innerText();
await page.screenshot({ path: "/private/tmp/sacred-seat-20-nodes.png" });

console.log(JSON.stringify({
  consoleErrors,
  dailyQuote,
  conciseVisible,
  originalVisible,
  sourceLink,
  articleImages,
  firstImageLoaded,
  rawMarkdownLinks,
  renderedNodes,
  renderedEdges,
  zoomLabel,
  screenshotGuide: "/private/tmp/sacred-seat-guide.png",
  screenshotNestedLinks: "/private/tmp/sacred-seat-guide-nested-links.png",
  screenshotTree: "/private/tmp/sacred-seat-20-nodes.png"
}, null, 2));

await browser.close();
