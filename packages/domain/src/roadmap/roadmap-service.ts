import type { StageState } from "./stage";

export type RoadmapArea =
  | "planning"
  | "implementation"
  | "integration"
  | "validation"
  | "release"
  | "operation";

export type RoadmapItem = {
  id: string;
  projectId: string;
  projectName: string;
  title: string;
  area: RoadmapArea;
  state: StageState;
  progress: number;
  orderIndex: number;
  currentPosition: string;
  nextStep: string | null;
  blocker: string | null;
  updatedAt: string;
};

export type RoadmapFilters = {
  projectIds: readonly string[];
  states: readonly StageState[];
  areas: readonly RoadmapArea[];
  includeCompleted: boolean;
};

export type RoadmapBoard = Record<StageState, readonly RoadmapItem[]>;

export type RoadmapResult = {
  items: readonly RoadmapItem[];
  board: RoadmapBoard;
};

export interface RoadmapDataSource {
  listRoadmapItems(): Promise<readonly RoadmapItem[]>;
}

export class RoadmapService {
  constructor(private readonly source: RoadmapDataSource) {}

  async query(filters: RoadmapFilters): Promise<RoadmapResult> {
    const sourceItems = await this.source.listRoadmapItems();
    const items = sourceItems.filter((item) => {
      if (!filters.includeCompleted && item.state === "completed") return false;
      if (
        filters.projectIds.length > 0 &&
        !filters.projectIds.includes(item.projectId)
      ) {
        return false;
      }
      if (filters.states.length > 0 && !filters.states.includes(item.state)) {
        return false;
      }
      if (filters.areas.length > 0 && !filters.areas.includes(item.area)) {
        return false;
      }
      return true;
    });

    const board: RoadmapBoard = {
      backlog: items.filter((item) => item.state === "backlog"),
      next: items.filter((item) => item.state === "next"),
      in_progress: items.filter((item) => item.state === "in_progress"),
      blocked: items.filter((item) => item.state === "blocked"),
      completed: items.filter((item) => item.state === "completed"),
    };

    return { items, board };
  }
}
