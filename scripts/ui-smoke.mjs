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

async function pointerDrag(source, target, { xRatio = 0.5, yRatio = 0.5 } = {}) {
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
    targetBox.y + targetBox.height * yRatio,
    { steps: 14 }
  );
  await page.mouse.up();
  await page.waitForTimeout(500);
}

await page.goto("http://127.0.0.1:1420", { waitUntil: "networkidle" });
await page.getByText("守住一次承诺").waitFor();
await page.screenshot({ path: "/private/tmp/dingshi-focus.png" });

await page.getByRole("button", { name: "触发神圣座位" }).click();
await page.getByRole("button", { name: "中止并判定" }).click();
await page.getByPlaceholder("例如：离开座位接了一个工作电话").fill("离开座位接水");
await page.getByRole("button", { name: /永久允许/ }).waitFor();
await page.getByRole("button", { name: /判定失败/ }).click();

await page.getByLabel("切换神圣座位").click();
await page.locator(".seat-picker-menu").waitFor();
await page.waitForTimeout(220);
await page.screenshot({ path: "/private/tmp/dingshi-seat-picker.png" });
await page.getByRole("button", { name: "新建座位" }).click();
await page.getByPlaceholder("例如：神圣座位 - 实验室").fill("神圣座位 - 实验室");
await page.getByText("触发标志").locator("..").getByRole("textbox").fill("坐到实验室工位");
await page.getByText("对应行为").locator("..").getByRole("textbox").fill("只处理当前实验");
await page.getByRole("button", { name: "创建神圣座位" }).click();
await page.getByLabel("切换神圣座位").click();
const seatOptions = await page.locator(".seat-picker-options > button").count();
await page.locator(".seat-picker-options > button").filter({ hasText: "神圣座位 - 实验室" }).click();
await page.getByLabel("切换神圣座位").click();
await page.getByRole("button", { name: "管理" }).click();
await page.getByText("管理神圣座位").waitFor();

const heatCells = await page.locator(".heat-cell").count();
const labSeat = page.locator(".seat-manager-list article").filter({ hasText: "神圣座位 - 实验室" });
await labSeat.getByRole("button", { name: "删除" }).click();
await labSeat.getByRole("button", { name: "确认删除" }).click();
await page.getByRole("button", { name: "关闭" }).click();
await page.getByLabel("切换神圣座位").click();
const seatOptionsAfterDelete = await page.locator(".seat-picker-options > button").count();
await page.getByLabel("切换神圣座位").click();
await page.screenshot({ path: "/private/tmp/dingshi-multi-seat.png" });

await page.goto("http://127.0.0.1:1420", { waitUntil: "networkidle" });
await page.getByRole("button", { name: /国策树/ }).click();
await page.getByText("改变长期稳态").waitFor();
await page.waitForTimeout(500);
await page.screenshot({ path: "/private/tmp/dingshi-policies.png" });

await page.getByRole("button", { name: "添加节点" }).click();
await page.getByText("添加国策节点").waitFor();
const parentSelectCount = await page.locator(".sheet select").count();
await page.getByPlaceholder("例如：晚上 10:30 后只允许站着玩手机").fill("测试小目标");
await page.locator(".sheet-footer").getByRole("button", { name: "添加节点" }).click();
await page.locator(".policy-toolbar").getByRole("button", { name: "添加节点" }).click();
await page.getByPlaceholder("例如：晚上 10:30 后只允许站着玩手机").fill("测试最终目标");
await page.locator(".sheet-footer").getByRole("button", { name: "添加节点" }).click();

const smallGoal = page.locator(".policy-node").filter({ hasText: "测试小目标" });
const finalGoal = page.locator(".policy-node").filter({ hasText: "测试最终目标" });
await pointerDrag(smallGoal, finalGoal, { yRatio: 0.08 });
const finalGoalBranchText = await finalGoal.locator("..").innerText();
await page.screenshot({ path: "/private/tmp/dingshi-policy-drag.png" });
await page.locator(".policy-toolbar").getByRole("button", { name: "添加节点" }).click();
await page.getByPlaceholder("例如：晚上 10:30 后只允许站着玩手机").fill("测试第三个并列目标");
await page.locator(".sheet-footer").getByRole("button", { name: "添加节点" }).click();
const thirdGoal = page.locator(".policy-node").filter({ hasText: "测试第三个并列目标" });
const firstDefaultGoal = page
  .locator(".policy-node")
  .filter({ hasText: "30 分钟内不打开娱乐软件" });
await pointerDrag(thirdGoal, firstDefaultGoal, { xRatio: 0.08, yRatio: 0.5 });
const defaultFinalGoal = page
  .locator(".policy-node")
  .filter({ hasText: "在不依赖临时意志力的情况下稳定入睡与起床" })
const directUpperGoalCount = await defaultFinalGoal
  .locator("..")
  .locator(":scope > .policy-children > .policy-branch")
  .count();
const orderedUpperGoals = await defaultFinalGoal
  .locator("..")
  .locator(":scope > .policy-children > .policy-branch > .policy-node strong")
  .allTextContents();
await page.getByRole("button", { name: "缩小画布" }).click();
await page.getByRole("button", { name: "缩小画布" }).click();
await page.getByRole("button", { name: "缩小画布" }).click();
const zoomLabel = await page.locator(".zoom-value").innerText();
await page.screenshot({ path: "/private/tmp/dingshi-policy-zoom.png" });
await page.getByRole("button", { name: "Codex 辅助" }).click();
await page.getByRole("button", { name: /整理现有树/ }).waitFor();
await page.screenshot({ path: "/private/tmp/dingshi-codex-simplify.png" });
await page.getByRole("button", { name: /生成参考链/ }).click();
const goalPlaceholderVisible = await page
  .getByPlaceholder("例如：每天 23:30 前稳定入睡")
  .isVisible();
await page.screenshot({ path: "/private/tmp/dingshi-codex-generate.png" });

console.log(JSON.stringify({
  title: await page.title(),
  consoleErrors,
  heatCells,
  seatOptions,
  seatOptionsAfterDelete,
  parentSelectCount,
  dragEstablishedRelationship: finalGoalBranchText.includes("测试小目标"),
  directUpperGoalCount,
  orderedUpperGoals,
  zoomLabel,
  goalPlaceholderVisible,
  focusScreenshot: "/private/tmp/dingshi-focus.png",
  seatPickerScreenshot: "/private/tmp/dingshi-seat-picker.png",
  multiSeatScreenshot: "/private/tmp/dingshi-multi-seat.png",
  policyScreenshot: "/private/tmp/dingshi-policies.png",
  policyDragScreenshot: "/private/tmp/dingshi-policy-drag.png",
  policyZoomScreenshot: "/private/tmp/dingshi-policy-zoom.png",
  codexSimplifyScreenshot: "/private/tmp/dingshi-codex-simplify.png",
  codexGenerateScreenshot: "/private/tmp/dingshi-codex-generate.png"
}, null, 2));

await browser.close();
