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
await page.getByRole("button", { name: /国策树/ }).click();

const firstSibling = page
  .locator(".policy-node")
  .filter({ hasText: "30 分钟内不打开娱乐软件" });
const secondSibling = page
  .locator(".policy-node")
  .filter({ hasText: "只允许站着使用手机" });

async function pointerDrag(source, target, { xRatio = 0.5, yOffset = 8 } = {}) {
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  if (!sourceBox || !targetBox) throw new Error("Drag node is not visible");
  await page.mouse.move(
    sourceBox.x + sourceBox.width / 2,
    sourceBox.y + sourceBox.height / 2
  );
  await page.mouse.down();
  await page.mouse.move(
    sourceBox.x + sourceBox.width / 2 + 8,
    sourceBox.y + sourceBox.height / 2 + 8,
    { steps: 4 }
  );
  await page.mouse.move(
    targetBox.x + targetBox.width * xRatio,
    targetBox.y + yOffset,
    { steps: 12 }
  );
  await page.mouse.up();
}

// 同层真实拖拽：把右侧节点插入到左侧节点之前。
await pointerDrag(secondSibling, firstSibling, { xRatio: 0.08, yOffset: 54 });
await page.waitForTimeout(250);
const rootGoal = page
  .locator(".policy-node")
  .filter({ hasText: "在不依赖临时意志力的情况下稳定入睡与起床" });
const orderedSiblingGoals = await rootGoal
  .locator("..")
  .locator(":scope > .policy-children > .policy-branch > .policy-node strong")
  .allTextContents();
const siblingOrderChanged = orderedSiblingGoals[0] === "只允许站着使用手机";

// 让换序和换层用例彼此独立，避免前一个布局变化影响后一个鼠标坐标。
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle" });
await page.getByRole("button", { name: /国策树/ }).click();
await page.getByRole("button", { name: "缩小画布" }).click();
await page.getByRole("button", { name: "缩小画布" }).click();
await page.getByRole("button", { name: "缩小画布" }).click();

await page.locator(".policy-toolbar").getByRole("button", { name: "添加节点" }).click();
await page
  .getByPlaceholder("例如：晚上 10:30 后只允许站着玩手机")
  .fill("用于验证第三层拖拽");
await page.locator(".sheet-footer").getByRole("button", { name: "添加节点" }).click();

const depthTwoNode = page
  .locator(".policy-node")
  .filter({ hasText: "自动将手机切换为黑白模式" });
const testNode = page
  .locator(".policy-node")
  .filter({ hasText: "用于验证第三层拖拽" });

// 第一次真实拖拽：先将测试节点放到第二层节点上方，使其成为第三层。
await pointerDrag(testNode, depthTwoNode);
await page.waitForTimeout(250);
const testNodeTextAfterFirstDrag = await testNode.innerText();
const testNodeReachedDepthThree = testNodeTextAfterFirstDrag.includes("上层目标 · 3");
const policiesAfterFirstDrag = await page.evaluate(() =>
  JSON.parse(localStorage.getItem("dingshi-state-v1")).policies
);

// 第二次真实拖拽：将原第二层节点拖到自己的第三层分支上方。
// 这正是旧实现会因循环保护而拒绝的场景。
await pointerDrag(depthTwoNode, testNode);
await page.waitForTimeout(250);
const originalNodeReachedDepthThree = (await depthTwoNode.innerText()).includes("上层目标 · 3");
const depthTwoNodeTextAfterSecondDrag = await depthTwoNode.innerText();
const policiesAfterSecondDrag = await page.evaluate(() =>
  JSON.parse(localStorage.getItem("dingshi-state-v1")).policies
);

await page.screenshot({ path: "/private/tmp/sacred-seat-depth-drag.png" });
console.log(JSON.stringify({
  consoleErrors,
  siblingOrderChanged,
  orderedSiblingGoals,
  testNodeReachedDepthThree,
  testNodeTextAfterFirstDrag,
  policiesAfterFirstDrag,
  originalNodeReachedDepthThree,
  depthTwoNodeTextAfterSecondDrag,
  policiesAfterSecondDrag,
  screenshot: "/private/tmp/sacred-seat-depth-drag.png"
}, null, 2));

await browser.close();
