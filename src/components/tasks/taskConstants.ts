import { Archive, Circle, CircleCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { TaskStatus } from "@/domain/tasks";

export const taskColumns: { status: TaskStatus; icon: LucideIcon }[] = [
  { status: "TODO", icon: Circle },
  { status: "DONE", icon: CircleCheck },
  { status: "ARCHIVED", icon: Archive },
];
