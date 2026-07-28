const ARTICLE_QUOTES = [
  "每一个看似强大的，大尺度的负面稳态，都可以映射到一个弱小的，小尺度的有效干预节点上！",
  "而这个节点，才是“不可逃逸区”的真正边界所在。",
  "一个好的国策，应当为生活中的选项做减法，而不是做加法。",
  "永远不要奢求一蹴而就，要用具体的、傻瓜式的“小确胜”，步步为营地瓦解一个大目标。",
  "先打分散和孤立之敌，后打集中和强大之敌。",
  "越是性价比高，维护成本低的优质国策，越会自然沉淀到国策树的根部。",
  "崩塌是最高效的“调试器”。",
  "玩家们并不会指望第一次就打通关，在“失败—强化—再挑战”的重复中一步步前进，才是 RSIP 的真正精髓所在。",
  "每一个你成功立住的“小国策”，无论它多么鸡毛蒜皮，都能成为系统的一个新的、积极的“边界条件”。",
  "只有它们，才能在“粗粒化”的过程中存活下来，跻身更大尺度的边界条件之列。",
  "自控方法的本质，不过是对自制力缺口的代偿。",
  "人的主观能动性并不是无限的。",
  "如果四两可以拨千斤，那么何妨用八两去拨两千斤。",
  "依靠 CTDP，我们可以做到既容易开始、又容易坚持，长期还不会失效。",
  "那些加入得轻松、维护得毫无负担、无论状态好坏都能存活的定式，才会被保留在树的根部。"
] as const;

export function quoteForDate(date = new Date()): string {
  const key = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
  let hash = 2166136261;

  for (const character of key) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }

  return ARTICLE_QUOTES[(hash >>> 0) % ARTICLE_QUOTES.length];
}
