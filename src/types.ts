export type View = "focus" | "policies";

export interface SacredSeat {
  id: string;
  name: string;
  trigger: string;
  behavior: string;
  durationMinutes: number;
  streak: number;
  completionLog: Record<string, number>;
  precedents: Precedent[];
}

export interface Precedent {
  id: string;
  text: string;
  createdAt: string;
}

export interface FocusSession {
  startedAt: number;
  durationSeconds: number;
  remainingSeconds: number;
  active: boolean;
}

export type PolicyStatus = "active" | "stable" | "rolled-back";

export interface PolicyNode {
  id: string;
  title: string;
  rule: string;
  trigger: string;
  parentId: string | null;
  kind: "requirement" | "goal";
  status: PolicyStatus;
  createdAt: string;
}

export interface AppState {
  sacredSeats: SacredSeat[];
  activeSeatId: string;
  policies: PolicyNode[];
}

export type CodexMode = "simplify" | "generate";

export interface CodexSuggestion {
  operation: "replace" | "append";
  summary: string;
  nodes: Array<{
    content: string;
    /** 当前节点服务的下层目标；最终目标为 null。 */
    parentTitle: string | null;
  }>;
}
