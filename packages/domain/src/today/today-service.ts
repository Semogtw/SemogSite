import type { Priority } from "../shared/types";

export type TodayWorkItem = {
  stageId: string;
  projectId: string;
  projectSlug: string;
  projectName: string;
  projectPriority: Priority;
  title: string;
  progress: number;
  currentPosition: string;
  nextStep: string;
  partiallyBlocked: boolean;
  orderIndex: number;
  updatedAt: string;
  latestEvidence: {
    title: string;
    status: "observed" | "passed" | "failed" | "pending" | "superseded";
    occurredAt: string;
  } | null;
};

export type TodayAttentionItem = {
  id: string;
  projectId: string | null;
  projectName: string | null;
  title: string;
  impact: "high" | "medium" | "low";
  nextAction: string;
};

export type TodayActivityItem = {
  id: string;
  kind: "session" | "sync";
  title: string;
  occurredAt: string;
  projectId: string | null;
};

export interface TodayDataSource {
  listCurrentWork(): Promise<readonly TodayWorkItem[]>;
  listNextWork(): Promise<readonly TodayWorkItem[]>;
  listOwnerAttention(): Promise<readonly TodayAttentionItem[]>;
  listExternalDependencies(): Promise<readonly TodayAttentionItem[]>;
  listRecentActivity(): Promise<readonly TodayActivityItem[]>;
}

export type TodayQueue = {
  executeNow: readonly TodayWorkItem[];
  nextInQueue: readonly TodayWorkItem[];
  needsOwner: readonly TodayAttentionItem[];
  externalDependencies: readonly TodayAttentionItem[];
  recentActivity: readonly TodayActivityItem[];
};

const priorityRank: Record<Priority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function compareWork(left: TodayWorkItem, right: TodayWorkItem): number {
  const priority =
    priorityRank[left.projectPriority] - priorityRank[right.projectPriority];
  if (priority !== 0) return priority;

  if (left.partiallyBlocked !== right.partiallyBlocked) {
    return left.partiallyBlocked ? -1 : 1;
  }

  if (left.orderIndex !== right.orderIndex) {
    return left.orderIndex - right.orderIndex;
  }

  return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
}

export class TodayService {
  constructor(private readonly source: TodayDataSource) {}

  async getQueue(): Promise<TodayQueue> {
    const [current, next, owner, external, activity] = await Promise.all([
      this.source.listCurrentWork(),
      this.source.listNextWork(),
      this.source.listOwnerAttention(),
      this.source.listExternalDependencies(),
      this.source.listRecentActivity(),
    ]);

    return {
      executeNow: [...current].sort(compareWork),
      nextInQueue: [...next].sort(compareWork),
      needsOwner: owner,
      externalDependencies: external,
      recentActivity: [...activity].sort(
        (left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt),
      ),
    };
  }
}
