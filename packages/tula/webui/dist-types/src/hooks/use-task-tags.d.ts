import type { KanbanTaskTag } from "@a5c-ai/adapters-comm/kanban";
export declare function useTaskTags(): {
    taskTags: readonly KanbanTaskTag[];
    loading: boolean;
    error: string | null;
};
