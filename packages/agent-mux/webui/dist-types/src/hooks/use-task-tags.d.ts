import type { KanbanTaskTag } from "@a5c-ai/agent-comm-mux/kanban";
export declare function useTaskTags(): {
    taskTags: readonly KanbanTaskTag[];
    loading: boolean;
    error: string | null;
};
