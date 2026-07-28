import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const outputDirectoryUrl = new URL("../docs/images/", import.meta.url);
const outputDirectory = fileURLToPath(outputDirectoryUrl);
await mkdir(outputDirectory, { recursive: true });

function dateKey(daysAgo) {
  const date = new Date(2026, 6, 28);
  date.setDate(date.getDate() - daysAgo);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function completionLog(seed, activeDays) {
  return Object.fromEntries(
    Array.from({ length: activeDays }, (_, index) => {
      const daysAgo = (index * seed + index * index + seed) % 80;
      return [dateKey(daysAgo), 1 + ((index + seed) % 4)];
    })
  );
}

const demoState = {
  sacredSeats: [
    {
      id: "seat-study",
      name: "神圣座位 - 书房",
      trigger: "戴上降噪耳机，坐到书桌前",
      behavior: "只处理当前学习任务，不打开社交与娱乐应用",
      durationMinutes: 60,
      streak: 12,
      completionLog: completionLog(3, 34),
      precedents: [
        {
          id: "precedent-water",
          text: "可以离开座位接水，但不得携带手机",
          createdAt: "2026-07-24T10:00:00.000Z"
        }
      ]
    },
    {
      id: "seat-lab",
      name: "神圣座位 - 实验室",
      trigger: "连接实验服务器并打开实验记录",
      behavior: "只运行当前实验，先记录结果再切换任务",
      durationMinutes: 90,
      streak: 8,
      completionLog: completionLog(5, 27),
      precedents: []
    },
    {
      id: "seat-reading",
      name: "神圣座位 - 图书馆",
      trigger: "手机静音并放入背包",
      behavior: "完成当日阅读与笔记整理",
      durationMinutes: 45,
      streak: 5,
      completionLog: completionLog(7, 18),
      precedents: []
    }
  ],
  activeSeatId: "seat-study",
  policies: [
    {
      id: "sleep-goal",
      title: "晚上 12 点前不玩手机",
      trigger: "每天晚上",
      rule: "稳定形成不依赖临时意志力的睡前习惯",
      parentId: null,
      kind: "goal",
      status: "stable",
      createdAt: "2026-07-18T08:00:00.000Z"
    },
    {
      id: "fixed-place",
      title: "晚上 11 点 50 分前把手机放到伸手够不到的位置",
      trigger: "每天 23:50",
      rule: "手机固定放在卧室外的充电位置",
      parentId: "sleep-goal",
      kind: "requirement",
      status: "stable",
      createdAt: "2026-07-19T08:00:00.000Z"
    },
    {
      id: "emergency-only",
      title: "晚上 11 点 30 分后手机只用于接打紧急电话",
      trigger: "每天 23:30",
      rule: "关闭娱乐、资讯与社交应用",
      parentId: "sleep-goal",
      kind: "requirement",
      status: "stable",
      createdAt: "2026-07-20T08:00:00.000Z"
    },
    {
      id: "charger",
      title: "晚上 11 点前把手机接上充电器",
      trigger: "每天 23:00",
      rule: "不再把手机带回床边",
      parentId: "fixed-place",
      kind: "requirement",
      status: "active",
      createdAt: "2026-07-21T08:00:00.000Z"
    },
    {
      id: "focus-mode",
      title: "晚上 11 点自动开启勿扰模式和应用限额",
      trigger: "每天 23:00",
      rule: "只保留家人与紧急联系人",
      parentId: "emergency-only",
      kind: "requirement",
      status: "active",
      createdAt: "2026-07-22T08:00:00.000Z"
    },
    {
      id: "grayscale",
      title: "夜间自动将屏幕切换为灰度模式",
      trigger: "每天 22:30",
      rule: "降低继续刷手机的即时吸引力",
      parentId: "focus-mode",
      kind: "requirement",
      status: "active",
      createdAt: "2026-07-23T08:00:00.000Z"
    }
  ]
};

const browser = await chromium.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true
});
const page = await browser.newPage({
  viewport: { width: 1440, height: 960 },
  deviceScaleFactor: 1
});

await page.addInitScript((state) => {
  localStorage.setItem("dingshi-state-v1", JSON.stringify(state));
}, demoState);

await page.goto("http://127.0.0.1:1420", { waitUntil: "networkidle" });
await page.getByText("守住一次承诺").waitFor();
await page.screenshot({
  path: fileURLToPath(new URL("focus-dashboard.png", outputDirectoryUrl)),
  fullPage: true
});

await page.getByLabel("切换神圣座位").click();
await page.locator(".seat-picker-menu").waitFor();
await page.screenshot({
  path: fileURLToPath(new URL("seat-management.png", outputDirectoryUrl)),
  fullPage: true
});
await page.getByLabel("切换神圣座位").click();

await page.getByRole("button", { name: /国策树/ }).click();
await page.getByText("改变长期稳态").waitFor();
await page.getByRole("button", { name: "显示全部节点" }).click();
await page.waitForTimeout(450);
await page.screenshot({
  path: fileURLToPath(new URL("policy-tree.png", outputDirectoryUrl)),
  fullPage: true
});

await page.getByRole("button", { name: "Codex 辅助" }).click();
await page.getByRole("button", { name: /整理现有树/ }).waitFor();
await page.waitForTimeout(320);
await page.screenshot({
  path: fileURLToPath(new URL("codex-organizer.png", outputDirectoryUrl)),
  fullPage: true
});
await page.getByRole("button", { name: "关闭", exact: true }).click();

await page.getByRole("button", { name: "方法说明", exact: true }).click();
await page.getByText("CTDP / RSIP 方法手册").waitFor();
await page.getByRole("tab", { name: "知乎原文" }).click();
await page.locator(".guide-document img").first().waitFor({ state: "visible" });
await page.screenshot({
  path: fileURLToPath(new URL("article-reader.png", outputDirectoryUrl)),
  fullPage: false
});

console.log(`README screenshots saved to ${outputDirectory}`);
await browser.close();
