import {
  AlertTriangle,
  BookOpen,
  Bot,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Clock3,
  Command,
  Focus,
  GitBranch,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import {
  FormEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { organizeWithCodex } from "./codex";
import { quoteForDate } from "./dailyQuotes";
import { openExternalLink } from "./platform";
import { loadState, saveState } from "./storage";
import { findAvailableUpdate, installAvailableUpdate } from "./updater";
import type { Update } from "@tauri-apps/plugin-updater";
import conciseGuide from "../references/简洁复习版.md?raw";
import originalGuide from "../references/知乎原文-如何提高自制力.md?raw";
import type {
  AppState,
  CodexMode,
  CodexSuggestion,
  FocusSession,
  PolicyNode,
  SacredSeat,
  View
} from "./types";

const emptySession: FocusSession = {
  startedAt: 0,
  durationSeconds: 0,
  remainingSeconds: 0,
  active: false
};

type UpdateCheckState = "idle" | "checking" | "current" | "available" | "error";

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatTime(seconds: number): string {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

function localDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatHeaderDate(date = new Date()): string {
  const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
  return `${date.getMonth() + 1}月${date.getDate()}日 · 周${weekdays[date.getDay()]}`;
}

function recordCompletedSeat(seat: SacredSeat): SacredSeat {
  const today = localDateKey();
  const completionLog = seat.completionLog ?? {};
  return {
    ...seat,
    streak: seat.streak + 1,
    completionLog: {
      ...completionLog,
      [today]: (completionLog[today] ?? 0) + 1
    }
  };
}

function updateSeat(
  state: AppState,
  seatId: string,
  updater: (seat: SacredSeat) => SacredSeat
): AppState {
  return {
    ...state,
    sacredSeats: state.sacredSeats.map((seat) =>
      seat.id === seatId ? updater(seat) : seat
    )
  };
}

function createEmptySeat(): SacredSeat {
  return {
    id: makeId("seat"),
    name: "神圣座位 - ",
    trigger: "",
    behavior: "",
    durationMinutes: 60,
    streak: 0,
    completionLog: {},
    precedents: []
  };
}

function policyBranchIds(rootId: string, nodes: PolicyNode[]): Set<string> {
  const branchIds = new Set<string>([rootId]);
  let changed = true;

  while (changed) {
    changed = false;
    nodes.forEach((node) => {
      if (node.parentId && branchIds.has(node.parentId) && !branchIds.has(node.id)) {
        branchIds.add(node.id);
        changed = true;
      }
    });
  }

  return branchIds;
}

function App() {
  const [state, setState] = useState<AppState>(() => loadState());
  const [view, setView] = useState<View>("focus");
  const [session, setSession] = useState<FocusSession>(emptySession);
  const [judgmentOpen, setJudgmentOpen] = useState(false);
  const [seatEditorDraft, setSeatEditorDraft] = useState<SacredSeat | null>(null);
  const [seatManagerOpen, setSeatManagerOpen] = useState(false);
  const [policyEditorOpen, setPolicyEditorOpen] = useState(false);
  const [policyEditorDraft, setPolicyEditorDraft] = useState<PolicyNode | null>(null);
  const [policyEditorParentId, setPolicyEditorParentId] = useState<string | null>(null);
  const [codexOpen, setCodexOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [deletePolicyId, setDeletePolicyId] = useState<string | null>(null);
  const [availableUpdate, setAvailableUpdate] = useState<Update | null>(null);
  const [updateProgress, setUpdateProgress] = useState<number | null>(null);
  const [updateInstalling, setUpdateInstalling] = useState(false);
  const [updateDismissed, setUpdateDismissed] = useState(false);
  const [updateCheckState, setUpdateCheckState] = useState<UpdateCheckState>("idle");
  const [updateError, setUpdateError] = useState<string | null>(null);
  const updateCheckInFlight = useRef(false);
  const lastUpdateCheckAt = useRef(0);
  const dailyQuote = useMemo(() => quoteForDate(), []);
  const activeSeat = state.sacredSeats.find((seat) => seat.id === state.activeSeatId)
    ?? state.sacredSeats[0];

  useEffect(() => saveState(state), [state]);

  const runUpdateCheck = useCallback(async (force = false) => {
    const now = Date.now();
    if (
      updateCheckInFlight.current
      || (!force && now - lastUpdateCheckAt.current < 5 * 60 * 1000)
    ) {
      return;
    }

    updateCheckInFlight.current = true;
    lastUpdateCheckAt.current = now;
    setUpdateCheckState("checking");
    setUpdateError(null);

    try {
      const update = await findAvailableUpdate();
      setAvailableUpdate(update);
      setUpdateCheckState(update ? "available" : "current");
      if (update) setUpdateDismissed(false);
    } catch (error) {
      setUpdateCheckState("error");
      setUpdateError(error instanceof Error ? error.message : String(error));
    } finally {
      updateCheckInFlight.current = false;
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void runUpdateCheck();
    }, 1600);
    const interval = window.setInterval(() => {
      void runUpdateCheck();
    }, 30 * 60 * 1000);
    const handleFocus = () => {
      void runUpdateCheck();
    };
    window.addEventListener("focus", handleFocus);

    return () => {
      window.clearTimeout(timer);
      window.clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
    };
  }, [runUpdateCheck]);

  useEffect(() => {
    if (!session.active) return;

    const syncSession = () => {
      setSession((current) => {
        if (!current.active) return current;

        const endsAt = current.startedAt + current.durationSeconds * 1000;
        const remainingSeconds = Math.max(
          0,
          Math.ceil((endsAt - Date.now()) / 1000)
        );

        if (remainingSeconds === 0) {
          setState((previous) => ({
            ...updateSeat(
              previous,
              previous.activeSeatId,
              recordCompletedSeat
            )
          }));
          return emptySession;
        }

        if (remainingSeconds === current.remainingSeconds) return current;
        return { ...current, remainingSeconds };
      });
    };

    const timer = window.setInterval(syncSession, 1000);
    window.addEventListener("focus", syncSession);
    document.addEventListener("visibilitychange", syncSession);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", syncSession);
      document.removeEventListener("visibilitychange", syncSession);
    };
  }, [session.active]);

  const startFocus = () => {
    const durationSeconds = activeSeat.durationMinutes * 60;
    setSession({
      active: true,
      startedAt: Date.now(),
      durationSeconds,
      remainingSeconds: durationSeconds
    });
  };

  const completeEarly = () => {
    setState((previous) =>
      updateSeat(previous, previous.activeSeatId, recordCompletedSeat)
    );
    setSession(emptySession);
  };

  return (
    <main className="app-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <img src="/sacred-seat-app-icon.png" alt="" />
          </div>
          <div>
            <strong>神圣座位</strong>
            <span>Sacred Seat</span>
          </div>
        </div>

        <nav className="navigation" aria-label="主导航">
          <button
            className={view === "focus" ? "nav-item active" : "nav-item"}
            onClick={() => setView("focus")}
          >
            <Focus size={17} />
            神圣座位
          </button>
          <button
            className={view === "policies" ? "nav-item active" : "nav-item"}
            onClick={() => setView("policies")}
          >
            <GitBranch size={17} />
            国策树
            <span className="nav-count">{state.policies.length}</span>
          </button>
          <button className="nav-item" onClick={() => setGuideOpen(true)}>
            <BookOpen size={17} />
            方法说明
          </button>
        </nav>

        {view === "focus" && (
          <>
            <SeatSwitcher
              seats={state.sacredSeats}
              activeSeatId={state.activeSeatId}
              disabled={session.active}
              onChange={(seatId) =>
                setState((previous) => ({ ...previous, activeSeatId: seatId }))
              }
              onCreate={() => setSeatEditorDraft(createEmptySeat())}
              onManage={() => setSeatManagerOpen(true)}
            />
            <SeatActivity
              seats={state.sacredSeats}
              activeSeat={activeSeat}
              onSelect={(seatId) =>
                !session.active
                  && setState((previous) => ({ ...previous, activeSeatId: seatId }))
              }
            />
          </>
        )}

        <button
          className="sidebar-note daily-quote"
          onClick={() => setGuideOpen(true)}
          aria-label="打开方法说明阅读全文"
        >
          <span>每日原文</span>
          <p>“{dailyQuote}”</p>
          <small>edmond · 点击阅读全文</small>
        </button>

        <div className="sidebar-footer">
          <CircleDot size={14} />
          <span>所有数据仅保存在本机</span>
        </div>
        <button
          className={`sidebar-update ${updateCheckState}`}
          onClick={() => void runUpdateCheck(true)}
          disabled={updateCheckState === "checking"}
          title={updateError ?? "立即检查新版本"}
        >
          <RotateCcw size={13} />
          <span>
            {updateCheckState === "checking" && "正在检查更新"}
            {updateCheckState === "current" && "已是最新版本"}
            {updateCheckState === "available" && "发现新版本"}
            {updateCheckState === "error" && "检查失败 · 点击重试"}
            {updateCheckState === "idle" && "检查更新"}
          </span>
        </button>
      </aside>

      <section className="workspace">
        <header className="titlebar" data-tauri-drag-region>
          <div data-tauri-drag-region>
            <span className="eyebrow" data-tauri-drag-region>
              {view === "focus" ? "CTDP" : "RSIP"}
            </span>
            <h1 data-tauri-drag-region>
              {view === "focus" ? "守住一次承诺" : "改变长期稳态"}
            </h1>
          </div>
          <div className="titlebar-actions" data-tauri-drag-region>
            <span className="date-chip" data-tauri-drag-region>
              {formatHeaderDate()}
            </span>
          </div>
        </header>

        {view === "focus" ? (
          <FocusView
            seat={activeSeat}
            session={session}
            onStart={startFocus}
            onComplete={completeEarly}
            onJudge={() => setJudgmentOpen(true)}
            onEdit={() => setSeatEditorDraft(activeSeat)}
          />
        ) : (
          <PolicyView
            nodes={state.policies}
            onAdd={() => {
              setPolicyEditorDraft(null);
              setPolicyEditorParentId(null);
              setPolicyEditorOpen(true);
            }}
            onAddChild={(parentId) => {
              setPolicyEditorDraft(null);
              setPolicyEditorParentId(parentId);
              setPolicyEditorOpen(true);
            }}
            onEdit={(node) => {
              setPolicyEditorDraft(node);
              setPolicyEditorParentId(node.parentId);
              setPolicyEditorOpen(true);
            }}
            onCodex={() => setCodexOpen(true)}
            onDelete={setDeletePolicyId}
            onStatusChange={(id, status) =>
              setState((previous) => ({
                ...previous,
                policies: previous.policies.map((node) =>
                  node.id === id ? { ...node, status } : node
                )
              }))
            }
          />
        )}
      </section>

      {judgmentOpen && (
        <JudgmentSheet
          onClose={() => setJudgmentOpen(false)}
          onFail={() => {
            setState((previous) =>
              updateSeat(previous, previous.activeSeatId, (seat) => ({
                ...seat,
                streak: 0
              }))
            );
            setSession(emptySession);
            setJudgmentOpen(false);
          }}
          onPrecedent={(text) => {
            setState((previous) =>
              updateSeat(previous, previous.activeSeatId, (seat) => ({
                ...seat,
                precedents: [
                  ...seat.precedents,
                  { id: makeId("precedent"), text, createdAt: new Date().toISOString() }
                ]
              }))
            );
            setSession(emptySession);
            setJudgmentOpen(false);
          }}
        />
      )}

      {seatEditorDraft && (
        <SeatEditor
          seat={seatEditorDraft}
          isNew={!state.sacredSeats.some((seat) => seat.id === seatEditorDraft.id)}
          onClose={() => setSeatEditorDraft(null)}
          onSave={(seat) => {
            setState((previous) => {
              const exists = previous.sacredSeats.some((item) => item.id === seat.id);
              return {
                ...previous,
                sacredSeats: exists
                  ? previous.sacredSeats.map((item) => item.id === seat.id ? seat : item)
                  : [...previous.sacredSeats, seat],
                activeSeatId: seat.id
              };
            });
            setSeatEditorDraft(null);
          }}
        />
      )}

      {seatManagerOpen && (
        <SeatManagerSheet
          seats={state.sacredSeats}
          activeSeatId={state.activeSeatId}
          onClose={() => setSeatManagerOpen(false)}
          onCreate={() => {
            setSeatManagerOpen(false);
            setSeatEditorDraft(createEmptySeat());
          }}
          onEdit={(seat) => {
            setSeatManagerOpen(false);
            setSeatEditorDraft(seat);
          }}
          onDelete={(seatId) => {
            setState((previous) => {
              if (previous.sacredSeats.length === 1) return previous;
              const sacredSeats = previous.sacredSeats.filter((seat) => seat.id !== seatId);
              return {
                ...previous,
                sacredSeats,
                activeSeatId: previous.activeSeatId === seatId
                  ? sacredSeats[0].id
                  : previous.activeSeatId
              };
            });
          }}
        />
      )}

      {policyEditorOpen && (
        <PolicyEditor
          node={policyEditorDraft}
          nodes={state.policies}
          parentId={policyEditorParentId}
          onClose={() => {
            setPolicyEditorOpen(false);
            setPolicyEditorDraft(null);
            setPolicyEditorParentId(null);
          }}
          onSave={(node) => {
            setState((previous) => {
              const exists = previous.policies.some((item) => item.id === node.id);
              return {
                ...previous,
                policies: exists
                  ? previous.policies.map((item) => item.id === node.id ? node : item)
                  : [...previous.policies, node]
              };
            });
            setPolicyEditorOpen(false);
            setPolicyEditorDraft(null);
            setPolicyEditorParentId(null);
          }}
        />
      )}

      {codexOpen && (
        <CodexOrganizer
          nodes={state.policies}
          onClose={() => setCodexOpen(false)}
          onApply={(suggestion) => {
            setState((previous) => ({
              ...previous,
              policies: applyCodexSuggestion(previous.policies, suggestion)
            }));
            setCodexOpen(false);
          }}
        />
      )}

      {deletePolicyId && (
        <DeletePolicySheet
          node={state.policies.find((item) => item.id === deletePolicyId)}
          descendantCount={policyBranchIds(deletePolicyId, state.policies).size - 1}
          onClose={() => setDeletePolicyId(null)}
          onConfirm={() => {
            const branchIds = policyBranchIds(deletePolicyId, state.policies);
            setState((previous) => ({
              ...previous,
              policies: previous.policies.filter((item) => !branchIds.has(item.id))
            }));
            setDeletePolicyId(null);
          }}
        />
      )}

      {guideOpen && (
        <GuideSheet onClose={() => setGuideOpen(false)} />
      )}

      {availableUpdate && !updateDismissed && (
        <UpdateNotice
          version={availableUpdate.version}
          installing={updateInstalling}
          progress={updateProgress}
          onDismiss={() => setUpdateDismissed(true)}
          onInstall={() => {
            setUpdateInstalling(true);
            void installAvailableUpdate(availableUpdate, setUpdateProgress)
              .catch((error) => {
                console.error("更新安装失败", error);
                setUpdateInstalling(false);
                setUpdateProgress(null);
                setUpdateCheckState("error");
                setUpdateError(
                  `更新安装失败：${error instanceof Error ? error.message : String(error)}`
                );
              });
          }}
        />
      )}
    </main>
  );
}

function UpdateNotice({
  version,
  installing,
  progress,
  onDismiss,
  onInstall
}: {
  version: string;
  installing: boolean;
  progress: number | null;
  onDismiss: () => void;
  onInstall: () => void;
}) {
  return (
    <aside className="update-notice" aria-live="polite">
      <div className="update-glyph">
        <RotateCcw size={16} />
      </div>
      <div className="update-copy">
        <span>新版本可用</span>
        <strong>神圣座位 {version}</strong>
        {installing && (
          <div className="update-progress" aria-label="更新下载进度">
            <i style={{ width: `${progress ?? 18}%` }} />
          </div>
        )}
      </div>
      <div className="update-actions">
        {!installing && <button onClick={onDismiss}>稍后</button>}
        <button className="primary" onClick={onInstall} disabled={installing}>
          {installing ? (progress === null ? "正在下载" : `${progress}%`) : "更新并重启"}
        </button>
      </div>
    </aside>
  );
}

function SeatSwitcher({
  seats,
  activeSeatId,
  disabled,
  onChange,
  onCreate,
  onManage
}: {
  seats: SacredSeat[];
  activeSeatId: string;
  disabled: boolean;
  onChange: (seatId: string) => void;
  onCreate: () => void;
  onManage: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLElement>(null);
  const activeSeat = seats.find((seat) => seat.id === activeSeatId) ?? seats[0];

  useEffect(() => {
    const closeOutside = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", closeOutside);
    return () => document.removeEventListener("mousedown", closeOutside);
  }, []);

  return (
    <section className="seat-switcher" ref={rootRef}>
      <span>当前座位</span>
      <button
        className={open ? "seat-picker-trigger open" : "seat-picker-trigger"}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        aria-label="切换神圣座位"
        aria-expanded={open}
      >
        <span className="seat-picker-mark"><Focus size={13} /></span>
        <span className="seat-picker-copy">
          <strong>{activeSeat.name}</strong>
          <small>{activeSeat.durationMinutes} 分钟 · 连续 {activeSeat.streak} 次</small>
        </span>
        <ChevronDown size={14} />
      </button>

      {open && (
        <div className="seat-picker-menu">
          <div className="seat-picker-options">
            {seats.map((seat) => (
              <button
                key={seat.id}
                className={seat.id === activeSeatId ? "selected" : ""}
                onClick={() => {
                  onChange(seat.id);
                  setOpen(false);
                }}
              >
                <span className="picker-check">
                  {seat.id === activeSeatId && <Check size={12} />}
                </span>
                <span>
                  <strong>{seat.name}</strong>
                  <small>
                    {Object.keys(seat.completionLog ?? {}).length} 天 · {seat.durationMinutes} 分钟
                  </small>
                </span>
              </button>
            ))}
          </div>
          <div className="seat-picker-footer">
            <button
              onClick={() => {
                setOpen(false);
                onCreate();
              }}
            >
              <Plus size={13} />
              新建座位
            </button>
            <button
              onClick={() => {
                setOpen(false);
                onManage();
              }}
            >
              <Settings2 size={13} />
              管理
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function SeatActivity({
  seats,
  activeSeat,
  onSelect
}: {
  seats: SacredSeat[];
  activeSeat: SacredSeat;
  onSelect: (seatId: string) => void;
}) {
  const days = useMemo(() => {
    return Array.from({ length: 84 }, (_, index) => {
      const date = new Date();
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - (83 - index));
      const key = localDateKey(date);
      return {
        key,
        label: `${date.getMonth() + 1}月${date.getDate()}日`,
        count: activeSeat.completionLog?.[key] ?? 0
      };
    });
  }, [activeSeat]);

  return (
    <section className="seat-activity">
      <div className="activity-heading">
        <span><CalendarDays size={12} />坚持记录</span>
        <small>过去 12 周</small>
      </div>
      <div className="activity-summary">
        <div>
          <strong>{Object.keys(activeSeat.completionLog ?? {}).length}</strong>
          <span>累计坚持天数</span>
        </div>
        <small>每日完成次数</small>
      </div>
      <div className="heatmap" aria-label={`${activeSeat.name}每日完成次数`}>
        {days.map((day) => {
          const level = day.count === 0 ? 0 : Math.min(4, day.count);
          return (
            <i
              key={day.key}
              className={`heat-cell level-${level}`}
              title={`${day.label}：${day.count} 次`}
            />
          );
        })}
      </div>
      <div className="seat-day-list">
        {seats.map((seat) => (
          <button
            key={seat.id}
            className={seat.id === activeSeat.id ? "active" : ""}
            onClick={() => onSelect(seat.id)}
          >
            <span>
              <i />
              {seat.name}
            </span>
            <strong>{Object.keys(seat.completionLog ?? {}).length}<small>天</small></strong>
          </button>
        ))}
      </div>
    </section>
  );
}

function FocusView({
  seat,
  session,
  onStart,
  onComplete,
  onJudge,
  onEdit
}: {
  seat: SacredSeat;
  session: FocusSession;
  onStart: () => void;
  onComplete: () => void;
  onJudge: () => void;
  onEdit: () => void;
}) {
  const todayCount = seat.completionLog?.[localDateKey()] ?? 0;
  const progress = session.active
    ? ((session.durationSeconds - session.remainingSeconds) / session.durationSeconds) * 100
    : 0;

  return (
    <div className="focus-layout enter">
      <section className="focus-hero panel">
        <div className="panel-topline">
          <div className="status-pill">
            <ShieldCheck size={14} />
            第 {seat.streak + 1} 次承诺
          </div>
          <button className="quiet-button" onClick={onEdit}>
            <Settings2 size={15} />
            编辑
          </button>
        </div>

        <div className="focus-copy">
          <span className="section-kicker">神圣座位</span>
          <h2>{seat.name}</h2>
          <p>{seat.trigger}</p>
        </div>

        <div className="timer-wrap">
          <div
            className={session.active ? "timer-orbit running" : "timer-orbit"}
            style={{ "--progress": `${progress * 3.6}deg` } as React.CSSProperties}
          >
            <div className="timer-face">
              <span>{session.active ? "保持在场" : "准备就绪"}</span>
              <strong>
                {formatTime(
                  session.active ? session.remainingSeconds : seat.durationMinutes * 60
                )}
              </strong>
              <small>{seat.behavior}</small>
            </div>
          </div>
        </div>

        <div className="focus-actions">
          {!session.active ? (
            <button className="primary-button large" onClick={onStart}>
              <Play size={18} fill="currentColor" />
              触发神圣座位
            </button>
          ) : (
            <>
              <button className="danger-button" onClick={onJudge}>
                <Pause size={17} />
                中止并判定
              </button>
              <button className="primary-button" onClick={onComplete}>
                <Check size={17} />
                完成承诺
              </button>
            </>
          )}
        </div>
      </section>

      <aside className="focus-inspector">
        <section className="metric-row">
          <article className="metric-card today-metric">
            <span>今日完成</span>
            <strong>{todayCount}</strong>
            <small>次承诺</small>
          </article>
          <article className="metric-card">
            <span>当前链长</span>
            <strong>{seat.streak}</strong>
            <small>连续完成</small>
          </article>
          <article className="metric-card">
            <span>累计坚持天数</span>
            <strong>{Object.keys(seat.completionLog ?? {}).length}</strong>
            <small>个自然日</small>
          </article>
        </section>

        <section className="precedent-card panel">
          <div className="card-heading">
            <div>
              <span className="section-kicker">判例法</span>
              <h3>永久允许的行为</h3>
            </div>
            <span className="count-badge">{seat.precedents.length}</span>
          </div>
          <div className="precedent-list">
            {seat.precedents.length ? (
              seat.precedents.map((precedent) => (
                <div className="precedent-item" key={precedent.id}>
                  <div className="precedent-dot" />
                  <p>{precedent.text}</p>
                </div>
              ))
            ) : (
              <p className="empty-copy">还没有永久判例。规则边界保持完整。</p>
            )}
          </div>
          <div className="card-footnote">
            <AlertTriangle size={14} />
            判例一旦加入，本链生命周期内不可撤销。
          </div>
        </section>
      </aside>
    </div>
  );
}

function PolicyView({
  nodes,
  onAdd,
  onAddChild,
  onCodex,
  onDelete,
  onEdit,
  onStatusChange
}: {
  nodes: PolicyNode[];
  onAdd: () => void;
  onAddChild: (parentId: string) => void;
  onCodex: () => void;
  onDelete: (id: string) => void;
  onEdit: (node: PolicyNode) => void;
  onStatusChange: (id: string, status: PolicyNode["status"]) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(nodes[0]?.id ?? null);
  const treeSurfaceRef = useRef<HTMLDivElement | null>(null);
  const connectorSvgRef = useRef<SVGSVGElement | null>(null);
  const roots = nodes.filter((node) =>
    !node.parentId || !nodes.some((candidate) => candidate.id === node.parentId)
  );
  const selectedNode = nodes.find((node) => node.id === selectedId) ?? null;
  const selectedParent = selectedNode?.parentId
    ? nodes.find((node) => node.id === selectedNode.parentId)
    : null;
  const selectedChildren = selectedNode
    ? nodes.filter((node) => node.parentId === selectedNode.id)
    : [];

  useEffect(() => {
    if (selectedId && nodes.some((node) => node.id === selectedId)) return;
    setSelectedId(nodes[0]?.id ?? null);
  }, [nodes, selectedId]);

  useLayoutEffect(() => {
    const surface = treeSurfaceRef.current;
    const svg = connectorSvgRef.current;
    if (!surface || !svg) return;

    let frame = 0;
    let startedAt = 0;

    const updateConnectors = () => {
      const surfaceBounds = surface.getBoundingClientRect();
      const cards = new Map(
        Array.from(
          surface.querySelectorAll<HTMLElement>(".policy-node[data-policy-id]")
        ).map((card) => [card.dataset.policyId!, card])
      );
      const paths = new Map(
        Array.from(
          svg.querySelectorAll<SVGPathElement>("[data-edge-child]")
        ).map((path) => [path.dataset.edgeChild!, path])
      );

      svg.setAttribute("viewBox", `0 0 ${surface.offsetWidth} ${surface.offsetHeight}`);

      nodes.forEach((node) => {
        if (!node.parentId) return;
        const upperCard = cards.get(node.parentId);
        const lowerCard = cards.get(node.id);
        const path = paths.get(node.id);
        if (!upperCard || !lowerCard || !path) return;

        const upperBounds = upperCard.getBoundingClientRect();
        const lowerBounds = lowerCard.getBoundingClientRect();
        const startX = (
          upperBounds.left + upperBounds.width / 2 - surfaceBounds.left
        );
        const startY = upperBounds.bottom - surfaceBounds.top;
        const endX = (
          lowerBounds.left + lowerBounds.width / 2 - surfaceBounds.left
        );
        const endY = lowerBounds.top - surfaceBounds.top;
        const middleY = startY + (endY - startY) * 0.52;

        path.setAttribute(
          "d",
          `M ${startX} ${startY} C ${startX} ${middleY}, ${endX} ${middleY}, ${endX} ${endY}`
        );
      });
    };

    const animateConnectors = (time: number) => {
      if (!startedAt) startedAt = time;
      updateConnectors();
      if (time - startedAt < 480) {
        frame = window.requestAnimationFrame(animateConnectors);
      }
    };

    frame = window.requestAnimationFrame(animateConnectors);
    const observer = new ResizeObserver(updateConnectors);
    observer.observe(surface);
    window.addEventListener("resize", updateConnectors);

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", updateConnectors);
    };
  }, [nodes]);

  return (
    <div className="policy-layout enter">
      <section className="policy-toolbar">
        <div className="policy-explainer">
          <span className="section-kicker">国策地图 · {nodes.length} 个节点</span>
          <p>从最终目标向下拆解可执行国策。单击查看，双击编辑，悬停可添加下一层。</p>
        </div>
        <div className="toolbar-actions">
          <button className="secondary-button" onClick={onCodex}>
            <Bot size={17} />
            Codex 辅助
          </button>
          <button className="primary-button" onClick={onAdd}>
            <Plus size={17} />
            添加节点
          </button>
        </div>
      </section>

      <div className="policy-workbench">
        <section className="tree-canvas panel">
          <div className="tree-canvas-toolbar">
            <span className="tree-mode-label"><GitBranch size={13} /> 固定树形视图</span>
          <div className="tree-legend">
            <span><i className="legend-dot stable" />已稳定</span>
            <span><i className="legend-dot active" />执行中</span>
          </div>
        </div>

        <div
          ref={treeSurfaceRef}
          className="tree-zoom-surface"
        >
          <svg
            ref={connectorSvgRef}
            className="policy-connectors"
            aria-hidden="true"
          >
            {nodes
              .filter((node) => node.parentId)
              .map((node) => (
                <path
                  key={`${node.id}-${node.parentId}`}
                  data-edge-child={node.id}
                />
              ))}
          </svg>
          {roots.length ? (
            <div className="policy-forest">
              {roots.map((node) => (
                <PolicyBranch
                  key={node.id}
                  node={node}
                  nodes={nodes}
                  depth={0}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  onAddChild={onAddChild}
                  onEdit={onEdit}
                />
              ))}
            </div>
          ) : (
            <div className="empty-tree">
              <GitBranch size={24} />
              <strong>还没有国策节点</strong>
              <span>先记录一个目标，再逐步添加通向它的小目标。</span>
            </div>
          )}
        </div>
        </section>

        <aside className="policy-detail panel">
          {selectedNode ? (
            <>
              <div className="policy-detail-heading">
                <div>
                  <span className="section-kicker">节点明细</span>
                  <h3>{selectedNode.kind === "goal" ? "最终目标" : "支撑国策"}</h3>
                </div>
                <span className={`policy-status-chip ${selectedNode.status}`}>
                  {selectedNode.status === "stable"
                    ? "已稳定"
                    : selectedNode.status === "rolled-back"
                      ? "已回滚"
                      : "执行中"}
                </span>
              </div>

              <p className="policy-detail-content">{selectedNode.rule || selectedNode.title}</p>

              <dl className="policy-detail-meta">
                <div><dt>服务目标</dt><dd>{selectedParent?.rule || selectedParent?.title || "独立目标"}</dd></div>
                <div><dt>下层节点</dt><dd>{selectedChildren.length} 个</dd></div>
                <div><dt>创建时间</dt><dd>{new Date(selectedNode.createdAt).toLocaleDateString("zh-CN")}</dd></div>
              </dl>

              <div className="policy-status-control" aria-label="节点状态">
                {([
                  ["active", "执行中"],
                  ["stable", "已稳定"],
                  ["rolled-back", "已回滚"]
                ] as const).map(([status, label]) => (
                  <button
                    key={status}
                    className={selectedNode.status === status ? "active" : ""}
                    onClick={() => onStatusChange(selectedNode.id, status)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="policy-detail-actions">
                <button className="primary-button" onClick={() => onEdit(selectedNode)}>
                  <Settings2 size={15} /> 编辑内容
                </button>
                <button className="secondary-button" onClick={() => onAddChild(selectedNode.id)}>
                  <Plus size={14} /> 下一层
                </button>
                <button className="secondary-button danger-text" onClick={() => onDelete(selectedNode.id)}>
                  <Trash2 size={14} /> 删除
                </button>
              </div>
            </>
          ) : (
            <div className="policy-detail-empty">
              <GitBranch size={22} />
              <strong>选择一个节点</strong>
              <span>点击树中的节点查看完整内容。</span>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function PolicyBranch({
  node,
  nodes,
  depth,
  selectedId,
  onSelect,
  onAddChild,
  onEdit
}: {
  node: PolicyNode;
  nodes: PolicyNode[];
  depth: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAddChild: (parentId: string) => void;
  onEdit: (node: PolicyNode) => void;
}) {
  const children = nodes.filter((candidate) => candidate.parentId === node.id);
  const content = node.rule || node.title;

  return (
    <div className="policy-branch">
      <article
        className={[
          "policy-node",
          node.status,
          depth === 0 ? "root-node" : "",
          selectedId === node.id ? "selected" : ""
        ].filter(Boolean).join(" ")}
        data-policy-id={node.id}
      >
        <button
          className="node-content"
          onClick={() => onSelect(node.id)}
          onDoubleClick={() => onEdit(node)}
        >
          <div className="node-meta">
            <span>{depth === 0 ? "最终目标" : `支撑层级 · ${depth}`}</span>
            <i />
          </div>
          <strong>{content}</strong>
          <div className="node-status">
            {node.status === "stable" ? (
              <><Check size={13} /> 已稳定</>
            ) : node.status === "rolled-back" ? (
              <><RotateCcw size={13} /> 已回滚</>
            ) : (
              <><Clock3 size={13} /> 执行中</>
            )}
          </div>
        </button>
        <div className="node-quick-actions">
          <button
            aria-label={`为 ${content} 添加子国策`}
            title="添加下一层国策"
            onClick={() => onAddChild(node.id)}
          >
            <Plus size={13} />
          </button>
          <button
            aria-label={`编辑 ${content}`}
            title="编辑节点"
            onClick={() => onEdit(node)}
          >
            <Settings2 size={12} />
          </button>
        </div>
      </article>

      {children.length > 0 && (
        <div className="policy-children">
          {children.map((child) => (
            <PolicyBranch
              key={child.id}
              node={child}
              nodes={nodes}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
              onAddChild={onAddChild}
              onEdit={onEdit}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Sheet({
  title,
  subtitle,
  children,
  onClose,
  width = "medium"
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  onClose: () => void;
  width?: "medium" | "wide" | "reader";
}) {
  return (
    <div className="sheet-backdrop" onMouseDown={onClose}>
      <section
        className={`sheet ${width}`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="sheet-header">
          <div>
            <span className="section-kicker">{subtitle}</span>
            <h2>{title}</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="关闭">
            <X size={18} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

function GuideSheet({ onClose }: { onClose: () => void }) {
  const [version, setVersion] = useState<"concise" | "original">("concise");
  const source = version === "concise" ? conciseGuide : originalGuide;
  const originalUrl =
    "https://www.zhihu.com/question/19888447/answer/1930799480401293785";

  return (
    <Sheet
      title="CTDP / RSIP 方法手册"
      subtitle="理解 · 复习 · 实践"
      width="reader"
      onClose={onClose}
    >
      <div className="guide-switcher" role="tablist" aria-label="方法手册版本">
        <button
          className={version === "concise" ? "active" : ""}
          role="tab"
          aria-selected={version === "concise"}
          onClick={() => setVersion("concise")}
        >
          3 分钟复习
        </button>
        <button
          className={version === "original" ? "active" : ""}
          role="tab"
          aria-selected={version === "original"}
          onClick={() => setVersion("original")}
        >
          知乎原文
        </button>
      </div>

      <div className="guide-byline">
        <BookOpen size={14} />
        {version === "concise"
          ? "根据原文整理的行动版"
          : "《如何提高自制力？》· edmond"}
      </div>
      <GuideDocument
        source={source}
        sourceUrl={version === "original" ? originalUrl : undefined}
      />
    </Sheet>
  );
}

function resolveGuideAsset(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  return `/${path.replace(/^\.?\//, "")}`;
}

function renderGuideInline(text: string): React.ReactNode[] {
  const cleaned = text.replace(/\*\*\s*\*\*/g, "");
  const tokenPattern =
    /(\[!\[([^\]]*)\]\(([^)]+)\)\]\((https?:\/\/[^)]+)\)|!\[([^\]]*)\]\(([^)]+)\)|\[([^\]]+)\]\((https?:\/\/[^)]+)\)|\*\*(.+?)\*\*)/g;
  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenPattern.exec(cleaned)) !== null) {
    if (match.index > cursor) nodes.push(cleaned.slice(cursor, match.index));

    if (match[2] !== undefined) {
      nodes.push(
        <a
          className="guide-image-link"
          href={match[4]}
          target="_blank"
          rel="noreferrer"
          onClick={openExternalLink}
          key={`${match.index}-image-link`}
        >
          <img
            src={resolveGuideAsset(match[3])}
            alt={match[2] || "原文配图"}
            loading="lazy"
          />
        </a>
      );
    } else if (match[5] !== undefined) {
      nodes.push(
        <img
          className="guide-inline-image"
          src={resolveGuideAsset(match[6])}
          alt={match[5] || "原文配图"}
          loading="lazy"
          key={`${match.index}-image`}
        />
      );
    } else if (match[7] !== undefined) {
      nodes.push(
        <a
          href={match[8]}
          target="_blank"
          rel="noreferrer"
          onClick={openExternalLink}
          key={`${match.index}-link`}
        >
          {match[7]}
        </a>
      );
    } else {
      nodes.push(
        <strong key={`${match.index}-strong`}>
          {renderGuideInline(match[9])}
        </strong>
      );
    }

    cursor = tokenPattern.lastIndex;
  }

  if (cursor < cleaned.length) nodes.push(cleaned.slice(cursor));
  return nodes;
}

function GuideDocument({
  source,
  sourceUrl
}: {
  source: string;
  sourceUrl?: string;
}) {
  const blocks = source
    .replace(/\r/g, "")
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter((block) => Boolean(block) && !(sourceUrl && /^>\s*原文：/.test(block)));

  return (
    <article className="guide-document">
      {sourceUrl && (
        <a
          className="guide-source-link"
          href={sourceUrl}
          target="_blank"
          rel="noreferrer"
          onClick={openExternalLink}
        >
          <span>知乎原文</span>
          <strong>在浏览器中查看作者原始回答</strong>
          <ChevronRight size={16} />
        </a>
      )}

      {blocks.map((block, index) => {
        const heading = block.match(/^(#{1,3})\s+(.+)$/s);
        if (heading) {
          const level = heading[1].length;
          const text = renderGuideInline(heading[2]);
          if (level === 1) return <h2 key={index}>{text}</h2>;
          if (level === 2) return <h3 key={index}>{text}</h3>;
          return <h4 key={index}>{text}</h4>;
        }

        const lines = block.split("\n").map((line) => line.trim());
        if (lines.every((line) => /^[-*]\s+/.test(line))) {
          return (
            <ul key={index}>
              {lines.map((line, lineIndex) => (
                <li key={lineIndex}>{renderGuideInline(line.replace(/^[-*]\s+/, ""))}</li>
              ))}
            </ul>
          );
        }

        if (lines.every((line) => /^\d+\.\s+/.test(line))) {
          return (
            <ol key={index}>
              {lines.map((line, lineIndex) => (
                <li key={lineIndex}>{renderGuideInline(line.replace(/^\d+\.\s+/, ""))}</li>
              ))}
            </ol>
          );
        }

        if (lines.every((line) => /^>\s?/.test(line))) {
          return (
            <blockquote key={index}>
              {lines.map((line, lineIndex) => (
                <p key={lineIndex}>{renderGuideInline(line.replace(/^>\s?/, ""))}</p>
              ))}
            </blockquote>
          );
        }

        const standaloneImage = block.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
        if (standaloneImage) {
          return (
            <figure className="guide-figure" key={index}>
              <img
                src={resolveGuideAsset(standaloneImage[2])}
                alt={standaloneImage[1] || `原文配图 ${index + 1}`}
                loading="lazy"
              />
            </figure>
          );
        }

        const linkedImage = block.match(
          /^\[!\[([^\]]*)\]\(([^)]+)\)\]\((https?:\/\/[^)]+)\)$/
        );
        if (linkedImage) {
          return (
            <figure className="guide-figure guide-author-figure" key={index}>
              <a
                href={linkedImage[3]}
                target="_blank"
                rel="noreferrer"
                onClick={openExternalLink}
              >
                <img
                  src={resolveGuideAsset(linkedImage[2])}
                  alt={linkedImage[1] || "作者头像"}
                  loading="lazy"
                />
              </a>
            </figure>
          );
        }

        if (/^\d{1,2}$/.test(block)) {
          return <div className="guide-section-number" key={index}>{block}</div>;
        }

        return (
          <p key={index}>
            {lines.map((line, lineIndex) => (
              <span key={lineIndex}>
                {renderGuideInline(line)}
                {lineIndex < lines.length - 1 && <br />}
              </span>
            ))}
          </p>
        );
      })}
    </article>
  );
}

function JudgmentSheet({
  onClose,
  onFail,
  onPrecedent
}: {
  onClose: () => void;
  onFail: () => void;
  onPrecedent: (text: string) => void;
}) {
  const [text, setText] = useState("");

  return (
    <Sheet title="这一次应该如何判定？" subtitle="下必为例" onClose={onClose}>
      <p className="sheet-intro">
        不讨论借口，只定义边界。你可以承认本次失败，也可以让相同情况从此永久合法。
      </p>
      <label className="field">
        <span>刚才发生了什么</span>
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="例如：离开座位接了一个工作电话"
          autoFocus
        />
      </label>
      <div className="judgment-options">
        <button className="judgment-option failure" onClick={onFail}>
          <RotateCcw size={21} />
          <span>
            <strong>判定失败</strong>
            <small>当前链条归零，下次从 #1 开始</small>
          </span>
          <ChevronRight size={17} />
        </button>
        <button
          className="judgment-option allow"
          disabled={!text.trim()}
          onClick={() => onPrecedent(text.trim())}
        >
          <ShieldCheck size={21} />
          <span>
            <strong>永久允许</strong>
            <small>以后相同情况必须一律允许</small>
          </span>
          <ChevronRight size={17} />
        </button>
      </div>
    </Sheet>
  );
}

function SeatManagerSheet({
  seats,
  activeSeatId,
  onClose,
  onCreate,
  onEdit,
  onDelete
}: {
  seats: SacredSeat[];
  activeSeatId: string;
  onClose: () => void;
  onCreate: () => void;
  onEdit: (seat: SacredSeat) => void;
  onDelete: (seatId: string) => void;
}) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  return (
    <Sheet title="管理神圣座位" subtitle="CTDP 座位集合" onClose={onClose}>
      <p className="sheet-intro">
        每个座位拥有独立的承诺链、永久判例和坚持记录。
      </p>
      <div className="seat-manager-list">
        {seats.map((seat) => (
          <article key={seat.id}>
            <div>
              <span>{seat.id === activeSeatId ? "当前使用" : "神圣座位"}</span>
              <strong>{seat.name}</strong>
              <small>
                {seat.durationMinutes} 分钟 · {Object.keys(seat.completionLog ?? {}).length} 天
              </small>
            </div>
            <div className="seat-manager-actions">
              <button onClick={() => onEdit(seat)}>编辑</button>
              {confirmingId === seat.id ? (
                <button
                  className="confirm-delete"
                  onClick={() => {
                    onDelete(seat.id);
                    setConfirmingId(null);
                  }}
                >
                  确认删除
                </button>
              ) : (
                <button
                  className="delete"
                  disabled={seats.length === 1}
                  onClick={() => setConfirmingId(seat.id)}
                >
                  删除
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
      <footer className="sheet-footer">
        <button className="primary-button" onClick={onCreate}>
          <Plus size={16} />
          新建神圣座位
        </button>
      </footer>
    </Sheet>
  );
}

function SeatEditor({
  seat,
  isNew,
  onClose,
  onSave
}: {
  seat: SacredSeat;
  isNew: boolean;
  onClose: () => void;
  onSave: (seat: SacredSeat) => void;
}) {
  const [draft, setDraft] = useState(seat);

  return (
    <Sheet
      title={isNew ? "创建神圣座位" : "编辑神圣座位"}
      subtitle="CTDP 设置"
      onClose={onClose}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSave(draft);
        }}
      >
        <div className="form-grid">
          <label className="field">
            <span>名称</span>
            <input
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              placeholder="例如：神圣座位 - 实验室"
              required
            />
          </label>
          <label className="field">
            <span>持续时间</span>
            <div className="input-suffix">
              <input
                type="number"
                min="5"
                max="240"
                value={draft.durationMinutes}
                onChange={(event) =>
                  setDraft({ ...draft, durationMinutes: Number(event.target.value) })
                }
                required
              />
              <em>分钟</em>
            </div>
          </label>
        </div>
        <label className="field">
          <span>触发标志</span>
          <input
            value={draft.trigger}
            onChange={(event) => setDraft({ ...draft, trigger: event.target.value })}
            placeholder="一个具体、清晰、不可含糊的动作"
            required
          />
        </label>
        <label className="field">
          <span>对应行为</span>
          <textarea
            value={draft.behavior}
            onChange={(event) => setDraft({ ...draft, behavior: event.target.value })}
            required
          />
        </label>
        <footer className="sheet-footer">
          <button type="button" className="secondary-button" onClick={onClose}>取消</button>
          <button type="submit" className="primary-button">
            {isNew ? "创建神圣座位" : "保存修改"}
          </button>
        </footer>
      </form>
    </Sheet>
  );
}

function PolicyEditor({
  node,
  nodes,
  parentId,
  onClose,
  onSave
}: {
  node: PolicyNode | null;
  nodes: PolicyNode[];
  parentId: string | null;
  onClose: () => void;
  onSave: (node: PolicyNode) => void;
}) {
  const [content, setContent] = useState(node?.rule || node?.title || "");
  const [selectedParentId, setSelectedParentId] = useState(node?.parentId ?? parentId ?? "");
  const unavailableIds = node ? policyBranchIds(node.id, nodes) : new Set<string>();
  const availableParents = nodes.filter((candidate) => !unavailableIds.has(candidate.id));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const normalizedContent = content.trim();
    onSave({
      id: node?.id ?? makeId("policy"),
      title: normalizedContent,
      trigger: node?.trigger ?? "",
      rule: normalizedContent,
      parentId: selectedParentId || null,
      kind: selectedParentId ? "requirement" : "goal",
      status: node?.status ?? "active",
      createdAt: node?.createdAt ?? new Date().toISOString()
    });
  };

  return (
    <Sheet title={node ? "编辑国策节点" : "添加国策节点"} subtitle="RSIP 国策树" onClose={onClose}>
      <form onSubmit={submit}>
        <label className="field">
          <span>节点内容</span>
          <textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="例如：晚上 10:30 后只允许站着玩手机"
            autoFocus
            required
          />
        </label>
        <label className="field">
          <span>所属目标</span>
          <select
            value={selectedParentId}
            onChange={(event) => setSelectedParentId(event.target.value)}
          >
            <option value="">独立最终目标</option>
            {availableParents.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.rule || candidate.title}
              </option>
            ))}
          </select>
          <small className="field-help">选择后，当前节点会自动排列到该目标的下一层。</small>
        </label>
        <p className="editor-hint">
          {node
            ? "内容和所属目标可以一起修改，树会自动重新排版。"
            : selectedParentId
              ? "保存后会直接成为所选目标的下一层国策。"
              : "不选择所属目标时，将创建一个新的最终目标。"}
        </p>
        <footer className="sheet-footer">
          <button type="button" className="secondary-button" onClick={onClose}>取消</button>
          <button type="submit" className="primary-button">{node ? "保存修改" : "添加节点"}</button>
        </footer>
      </form>
    </Sheet>
  );
}

function DeletePolicySheet({
  node,
  descendantCount,
  onClose,
  onConfirm
}: {
  node?: PolicyNode;
  descendantCount: number;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Sheet title={`删除“${node?.title ?? "该节点"}”？`} subtitle="确认删除" onClose={onClose}>
      <p className="sheet-intro">
        {descendantCount > 0
          ? `该节点关联的 ${descendantCount} 个上层小目标也会一并删除，此操作无法撤销。`
          : "该节点将从国策树中移除，此操作无法撤销。"}
      </p>
      <footer className="sheet-footer">
        <button className="secondary-button" onClick={onClose}>取消</button>
        <button className="danger-button" onClick={onConfirm}>
          <Trash2 size={16} />
          确认删除
        </button>
      </footer>
    </Sheet>
  );
}

function CodexOrganizer({
  nodes,
  onClose,
  onApply
}: {
  nodes: PolicyNode[];
  onClose: () => void;
  onApply: (suggestion: CodexSuggestion) => void;
}) {
  const [mode, setMode] = useState<CodexMode>("simplify");
  const [goal, setGoal] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [suggestion, setSuggestion] = useState<CodexSuggestion | null>(null);

  const run = async () => {
    setLoading(true);
    setError("");
    try {
      setSuggestion(await organizeWithCodex(mode, goal, nodes));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Sheet title="让 Codex 协助构建国策" subtitle="本地 Codex" onClose={onClose} width="wide">
      <p className="sheet-intro">
        选择整理现有节点，或从一个最终目标生成完整参考链。结果写入前仍由你确认。
      </p>
      <div className="codex-mode-switch" role="tablist" aria-label="Codex 工作模式">
        <button
          type="button"
          className={mode === "simplify" ? "active" : ""}
          onClick={() => {
            setMode("simplify");
            setSuggestion(null);
            setError("");
          }}
        >
          <Bot size={17} />
          <span>
            <strong>整理现有树</strong>
            <small>合并、简化与重新组织</small>
          </span>
        </button>
        <button
          type="button"
          className={mode === "generate" ? "active" : ""}
          onClick={() => {
            setMode("generate");
            setSuggestion(null);
            setError("");
          }}
        >
          <GitBranch size={17} />
          <span>
            <strong>生成参考链</strong>
            <small>从小目标走向最终目标</small>
          </span>
        </button>
      </div>
      <label className="field">
        <span>{mode === "generate" ? "底层最终目标" : "补充要求（可选）"}</span>
        <textarea
          value={goal}
          onChange={(event) => setGoal(event.target.value)}
          placeholder={mode === "generate"
            ? "例如：每天 23:30 前稳定入睡"
            : "例如：尽量保留与手机使用有关的节点"}
          autoFocus
        />
      </label>
      <button
        className="codex-run"
        onClick={run}
        disabled={
          loading
          || (mode === "generate" && !goal.trim())
          || (mode === "simplify" && nodes.length === 0)
        }
      >
        {loading ? <span className="spinner" /> : <Sparkles size={18} />}
        {loading
          ? "正在重构国策关系…"
          : mode === "simplify"
            ? `整理当前 ${nodes.length} 个节点`
            : "生成完整参考链"}
      </button>
      {error && <p className="error-message">{error}</p>}
      {suggestion && (
        <div className="suggestion">
          <p>{suggestion.summary}</p>
          <div className="suggestion-chain">
            {suggestion.nodes.map((node, index) => (
              <article key={`${node.content}-${index}`}>
                <span>{node.parentTitle ? `上层步骤 ${index + 1}` : "最终目标"}</span>
                <strong>{node.content}</strong>
                <small>
                  {node.parentTitle
                    ? `服务于：${node.parentTitle}`
                    : "链条终点"}
                </small>
              </article>
            ))}
          </div>
          <footer className="sheet-footer">
            <button className="secondary-button" onClick={() => setSuggestion(null)}>重新生成</button>
            <button className="primary-button" onClick={() => onApply(suggestion)}>
              <Check size={16} />
              确认写入
            </button>
          </footer>
        </div>
      )}
    </Sheet>
  );
}

function applyCodexSuggestion(
  existing: PolicyNode[],
  suggestion: CodexSuggestion
): PolicyNode[] {
  const existingByContent = new Map(
    existing.map((node) => [node.rule || node.title, node])
  );
  const result = suggestion.operation === "replace"
    ? []
    : existing.map((node) => ({ ...node }));
  const titleToId = new Map(result.map((node) => [node.rule || node.title, node.id]));

  suggestion.nodes.forEach((node) => {
    if (titleToId.has(node.content)) return;
    const previousNode = existingByContent.get(node.content);
    const id = previousNode?.id ?? makeId("policy");
    titleToId.set(node.content, id);
    result.push({
      id,
      title: node.content,
      trigger: "",
      rule: node.content,
      parentId: null,
      kind: "requirement",
      status: previousNode?.status ?? "active",
      createdAt: previousNode?.createdAt ?? new Date().toISOString()
    });
  });

  suggestion.nodes.forEach((suggested) => {
    const id = titleToId.get(suggested.content);
    const current = result.find((node) => node.id === id);
    if (current) {
      current.parentId = suggested.parentTitle
        ? (titleToId.get(suggested.parentTitle) ?? null)
        : null;
    }
  });

  return result;
}

export default App;
