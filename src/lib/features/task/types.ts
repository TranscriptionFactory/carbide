export interface Task {
  id: string;
  path: string;
  text: string;
  completed: boolean;
  due_date: string | null;
  line_number: number;
  section: string | null;
}

export interface TaskUpdate {
  path: string;
  line_number: number;
  completed: boolean;
}

export type TaskFilter = {
  completed?: boolean;
};

export type TaskGrouping = 'none' | 'note' | 'section' | 'due_date' | 'status';
