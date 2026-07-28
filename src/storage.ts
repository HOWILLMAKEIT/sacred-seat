import type { AppState, PolicyNode, SacredSeat } from "./types";

const STORAGE_KEY = "dingshi-state-v1";

export const defaultState: AppState = {
  sacredSeats: [
    {
      id: "seat-1",
      name: "神圣座位 - 书房",
      trigger: "戴上降噪耳机，坐到书桌前",
      behavior: "只处理当前学习任务，不打开社交与娱乐应用",
      durationMinutes: 60,
      streak: 7,
      completionLog: {},
      precedents: [
        {
          id: "precedent-1",
          text: "可以离开座位接水，但不得携带手机",
          createdAt: "2026-07-24T10:00:00.000Z"
        }
      ]
    }
  ],
  activeSeatId: "seat-1",
  policies: [
    {
      id: "policy-1",
      title: "先发制人",
      trigger: "每天起床后",
      rule: "30 分钟内不打开娱乐软件",
      parentId: "goal-1",
      kind: "requirement",
      status: "stable",
      createdAt: "2026-07-21T08:00:00.000Z"
    },
    {
      id: "policy-2",
      title: "夜幕降临",
      trigger: "每天 23:00",
      rule: "自动将手机切换为黑白模式",
      parentId: "policy-3",
      kind: "requirement",
      status: "stable",
      createdAt: "2026-07-22T08:00:00.000Z"
    },
    {
      id: "policy-3",
      title: "预备仪式",
      trigger: "23:00 后使用手机时",
      rule: "只允许站着使用手机",
      parentId: "goal-1",
      kind: "requirement",
      status: "active",
      createdAt: "2026-07-26T08:00:00.000Z"
    },
    {
      id: "goal-1",
      title: "稳定作息",
      trigger: "每日",
      rule: "在不依赖临时意志力的情况下稳定入睡与起床",
      parentId: null,
      kind: "goal",
      status: "active",
      createdAt: "2026-07-20T08:00:00.000Z"
    }
  ]
};

type PersistedSeat = Omit<SacredSeat, "completionLog"> & {
  completionLog?: Record<string, number>;
  completionDates?: string[];
};

type PersistedState = {
  sacredSeat?: PersistedSeat;
  sacredSeats?: PersistedSeat[];
  activeSeatId?: string;
  policies?: PolicyNode[];
};

function normalizeSeat(seat: PersistedSeat): SacredSeat {
  const completionLog = seat.completionLog ?? Object.fromEntries(
    (seat.completionDates ?? []).map((date) => [date, 1])
  );
  return {
    ...seat,
    completionLog
  };
}

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState;

    const stored = JSON.parse(raw) as PersistedState;
    const sacredSeats = stored.sacredSeats?.map(normalizeSeat)
      ?? (stored.sacredSeat ? [normalizeSeat(stored.sacredSeat)] : defaultState.sacredSeats);
    const activeSeatId = sacredSeats.some((seat) => seat.id === stored.activeSeatId)
      ? stored.activeSeatId!
      : sacredSeats[0].id;

    return {
      sacredSeats,
      activeSeatId,
      policies: stored.policies ?? defaultState.policies
    };
  } catch {
    return defaultState;
  }
}

export function saveState(state: AppState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
