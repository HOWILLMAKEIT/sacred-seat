import { useMemo, useState } from "react";
import { BarChart3, CalendarDays, Check, ChevronLeft, ChevronRight, Plus, Settings2, Trash2, X } from "lucide-react";
import type { HabitDefinition, HabitTracker } from "./types";
import "./habits.css";

interface HabitViewProps {
  tracker: HabitTracker;
  onChange: (tracker: HabitTracker) => void;
}

const weekdayLabels = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function mondayOf(date: Date) {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const weekday = result.getDay() || 7;
  result.setDate(result.getDate() - weekday + 1);
  return result;
}

function addDays(date: Date, amount: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);
  return result;
}

function formatMonthDay(date: Date) {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

export function HabitView({ tracker, onChange }: HabitViewProps) {
  const currentMonday = useMemo(() => mondayOf(new Date()), []);
  const [weekStart, setWeekStart] = useState(currentMonday);
  const [editor, setEditor] = useState<HabitDefinition | "new" | null>(null);
  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart]);
  const isCurrentWeek = dateKey(weekStart) === dateKey(currentMonday);

  const checkHabits = tracker.habits.filter((habit) => habit.kind === "check");
  const possibleChecks = checkHabits.length * 7;
  const completedChecks = checkHabits.reduce((sum, habit) => (
    sum + days.filter((day) => tracker.values[habit.id]?.[dateKey(day)] === true).length
  ), 0);
  const numericTotal = tracker.habits
    .filter((habit) => habit.kind === "number")
    .reduce((sum, habit) => sum + days.reduce((daySum, day) => (
      daySum + Number(tracker.values[habit.id]?.[dateKey(day)] || 0)
    ), 0), 0);

  const updateValue = (habit: HabitDefinition, day: Date, value: boolean | number) => {
    onChange({
      ...tracker,
      values: {
        ...tracker.values,
        [habit.id]: {
          ...tracker.values[habit.id],
          [dateKey(day)]: value
        }
      }
    });
  };

  const saveHabit = (habit: HabitDefinition) => {
    const exists = tracker.habits.some((item) => item.id === habit.id);
    onChange({
      ...tracker,
      habits: exists
        ? tracker.habits.map((item) => item.id === habit.id ? habit : item)
        : [...tracker.habits, habit]
    });
    setEditor(null);
  };

  const deleteHabit = (id: string) => {
    const { [id]: _removed, ...remainingValues } = tracker.values;
    onChange({
      habits: tracker.habits.filter((habit) => habit.id !== id),
      values: remainingValues
    });
    setEditor(null);
  };

  return (
    <div className="habit-page enter">
      <header className="habit-page-header">
        <div>
          <span className="section-kicker">HABIT LEDGER</span>
          <h1>习惯账本</h1>
          <p>只看眼前这一周，把长期变化留给统计。</p>
        </div>
        <button className="primary-button" onClick={() => setEditor("new")}>
          <Plus size={15} /> 添加习惯
        </button>
      </header>

      <section className="habit-summary-strip">
        <div><span>本周完成</span><strong>{completedChecks}<small> / {possibleChecks || 0}</small></strong></div>
        <div><span>完成率</span><strong>{possibleChecks ? Math.round(completedChecks / possibleChecks * 100) : 0}<small>%</small></strong></div>
        <div><span>数值累计</span><strong>{numericTotal}<small>{tracker.habits.find((habit) => habit.kind === "number")?.unit || ""}</small></strong></div>
      </section>

      <section className="habit-ledger-panel">
        <div className="habit-week-toolbar">
          <div className="habit-week-switcher">
            <button aria-label="上一周" onClick={() => setWeekStart(addDays(weekStart, -7))}><ChevronLeft size={16} /></button>
            <div>
              <strong>{formatMonthDay(days[0])} - {formatMonthDay(days[6])}</strong>
              <span>{isCurrentWeek ? "本周" : `${weekStart.getFullYear()} 年历史记录`}</span>
            </div>
            <button aria-label="下一周" onClick={() => setWeekStart(addDays(weekStart, 7))}><ChevronRight size={16} /></button>
          </div>

          <label className="habit-history-input">
            <CalendarDays size={14} />
            <span>查看历史</span>
            <input
              type="date"
              value={dateKey(weekStart)}
              onChange={(event) => event.target.value && setWeekStart(mondayOf(new Date(`${event.target.value}T12:00:00`)))}
            />
          </label>
        </div>

        <div className="habit-table-wrap">
          <table className="habit-table">
            <thead>
              <tr>
                <th>习惯</th>
                {days.map((day, index) => (
                  <th key={dateKey(day)} className={dateKey(day) === dateKey(new Date()) ? "today" : ""}>
                    <span>{weekdayLabels[index]}</span>
                    <strong>{day.getDate()}</strong>
                  </th>
                ))}
                <th aria-label="设置" />
              </tr>
            </thead>
            <tbody>
              {tracker.habits.map((habit) => (
                <tr key={habit.id}>
                  <th>
                    <span>{habit.name}</span>
                    <small>{habit.kind === "check" ? "完成" : habit.unit || "数值"}</small>
                  </th>
                  {days.map((day) => {
                    const key = dateKey(day);
                    const value = tracker.values[habit.id]?.[key];
                    return (
                      <td key={key} className={key === dateKey(new Date()) ? "today" : ""}>
                        {habit.kind === "check" ? (
                          <button
                            className={`habit-check ${value === true ? "checked" : ""}`}
                            aria-label={`${habit.name} ${key}`}
                            onClick={() => updateValue(habit, day, value !== true)}
                          >
                            {value === true && <Check size={15} />}
                          </button>
                        ) : (
                          <input
                            className="habit-number"
                            type="number"
                            min="0"
                            step="0.5"
                            aria-label={`${habit.name} ${key}`}
                            value={typeof value === "number" ? value : ""}
                            onChange={(event) => updateValue(habit, day, Number(event.target.value))}
                          />
                        )}
                      </td>
                    );
                  })}
                  <td><button className="habit-settings" aria-label={`编辑 ${habit.name}`} onClick={() => setEditor(habit)}><Settings2 size={14} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>

          {tracker.habits.length === 0 && (
            <div className="habit-empty"><BarChart3 size={22} /><strong>还没有习惯</strong><span>添加第一项，开始记录这一周。</span></div>
          )}
        </div>
      </section>

      {editor && (
        <HabitEditor
          habit={editor === "new" ? null : editor}
          onClose={() => setEditor(null)}
          onSave={saveHabit}
          onDelete={editor === "new" ? undefined : () => deleteHabit(editor.id)}
        />
      )}
    </div>
  );
}

function HabitEditor({ habit, onClose, onSave, onDelete }: {
  habit: HabitDefinition | null;
  onClose: () => void;
  onSave: (habit: HabitDefinition) => void;
  onDelete?: () => void;
}) {
  const [name, setName] = useState(habit?.name || "");
  const [kind, setKind] = useState<HabitDefinition["kind"]>(habit?.kind || "check");
  const [unit, setUnit] = useState(habit?.unit || "小时");

  return (
    <div className="habit-editor-backdrop" onMouseDown={onClose}>
      <form className="habit-editor" onMouseDown={(event) => event.stopPropagation()} onSubmit={(event) => {
        event.preventDefault();
        const trimmedName = name.trim();
        if (!trimmedName) return;
        onSave({
          id: habit?.id || `habit-${Date.now()}`,
          name: trimmedName,
          kind,
          unit: kind === "number" ? unit.trim() : "",
          createdAt: habit?.createdAt || new Date().toISOString()
        });
      }}>
        <header><div><span className="section-kicker">自定义记录列</span><h2>{habit ? "编辑习惯" : "添加习惯"}</h2></div><button type="button" onClick={onClose}><X size={17} /></button></header>
        <label><span>习惯名称</span><input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：阅读" /></label>
        <fieldset><legend>记录方式</legend><button type="button" className={kind === "check" ? "active" : ""} onClick={() => setKind("check")}><Check size={15} /> 完成 / 未完成</button><button type="button" className={kind === "number" ? "active" : ""} onClick={() => setKind("number")}><BarChart3 size={15} /> 数值记录</button></fieldset>
        {kind === "number" && <label><span>数值单位</span><input value={unit} onChange={(event) => setUnit(event.target.value)} placeholder="小时、页、公里" /></label>}
        <footer>{onDelete && <button type="button" className="habit-delete" onClick={onDelete}><Trash2 size={14} /> 删除</button>}<span /><button type="button" className="secondary-button" onClick={onClose}>取消</button><button className="primary-button" type="submit">保存</button></footer>
      </form>
    </div>
  );
}
