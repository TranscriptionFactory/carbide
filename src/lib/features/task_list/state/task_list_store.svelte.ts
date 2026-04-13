import { SvelteMap } from "svelte/reactivity";
import type { TaskList } from "../types";

export class TaskListStore {
  lists = new SvelteMap<string, TaskList>();
  available = $state<string[]>([]);
  loading = $state(false);
  error = $state<string | null>(null);
}
