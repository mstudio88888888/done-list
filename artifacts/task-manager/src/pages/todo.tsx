import React, { useState, useMemo } from 'react';
import {
  useListTasks,
  getListTasksQueryKey,
  useDeleteTask,
  useCreateTask,
  useUpdateTask,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Check, Pencil, Trash2, Circle, GripVertical, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

type TaskColor = 'pink' | 'grey' | 'red';
type ColorFilter = TaskColor | 'all';

const COLOR_OPTIONS: { value: TaskColor; label: string }[] = [
  { value: 'pink', label: 'Peach' },
  { value: 'grey', label: 'Grey' },
  { value: 'red', label: 'Red' },
];

const COLOR_STYLES: Record<TaskColor, { hex: string; dotBg: string; checkBg: string }> = {
  pink: { hex: '#e8845a', dotBg: '#ffb997', checkBg: '#fff4ef' },
  grey: { hex: '#6b7280', dotBg: '#9ca3af', checkBg: '#f3f4f6' },
  red: { hex: '#ef4444', dotBg: '#f87171', checkBg: '#fee2e2' },
};

type Task = {
  id: number;
  title: string;
  completed: boolean;
  completedAt?: string | null;
  color?: string | null;
  type: string;
  createdAt: string;
};

const TODO_QUERY_KEY = () => getListTasksQueryKey({ type: 'todo' } as any);

function ColorDots({
  value,
  onChange,
}: {
  value: TaskColor | null;
  onChange: (color: TaskColor | null) => void;
}) {
  return (
    <div className="flex items-center gap-2" aria-label="Choose task colour">
      {COLOR_OPTIONS.map(({ value: color, label }) => (
        <button
          key={color}
          type="button"
          onClick={() => onChange(value === color ? null : color)}
          aria-label={label}
          aria-pressed={value === color}
          style={{ backgroundColor: COLOR_STYLES[color].dotBg }}
          className={`h-5 w-5 rounded-full transition-all ${
            value === color
              ? 'scale-110 ring-2 ring-foreground/60 ring-offset-2 ring-offset-background'
              : 'opacity-60 hover:opacity-100'
          }`}
        />
      ))}
    </div>
  );
}

function ColorTabs({
  value,
  onChange,
}: {
  value: ColorFilter;
  onChange: (filter: ColorFilter) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Filter todos by colour"
      className="flex flex-wrap items-center gap-1 rounded-xl border border-border/60 bg-card/40 p-1"
    >
      <button
        type="button"
        role="tab"
        aria-selected={value === 'all'}
        aria-label="Show all todos"
        onClick={() => onChange('all')}
        className={`flex items-center justify-center rounded-lg p-2 transition-all ${
          value === 'all' ? 'bg-foreground shadow-sm' : 'hover:bg-muted/70'
        }`}
      >
        <span
          aria-hidden="true"
          className="h-3 w-3 rounded-full border-2"
          style={{ borderColor: value === 'all' ? 'hsl(var(--background))' : 'hsl(var(--muted-foreground) / 0.6)' }}
        />
      </button>
      {COLOR_OPTIONS.map(({ value: color, label }) => {
        const selected = value === color;
        return (
          <button
            key={color}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-label={`Filter by ${label}`}
            onClick={() => onChange(selected ? 'all' : color)}
            style={selected ? { backgroundColor: COLOR_STYLES[color].dotBg, color: COLOR_STYLES[color].hex } : undefined}
            className={`flex items-center justify-center rounded-lg p-2 transition-all ${
              selected ? 'shadow-sm' : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground'
            }`}
          >
            <span
              aria-hidden="true"
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: COLOR_STYLES[color].dotBg }}
            />
          </button>
        );
      })}
    </div>
  );
}

function TaskColorDot({ color }: { color?: string | null }) {
  const styles = color && color in COLOR_STYLES ? COLOR_STYLES[color as TaskColor] : null;
  return (
    <span
      aria-label={styles ? `${color} task` : 'Uncoloured task'}
      title={styles ? `${color} task` : 'Uncoloured task'}
      className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
      style={{ backgroundColor: styles?.dotBg ?? '#d1d5db' }}
    />
  );
}

function loadTodoOrder(key: string): number[] | null {
  try {
    const stored = window.localStorage.getItem(key);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

function saveTodoOrder(key: string, ids: number[]) {
  try {
    window.localStorage.setItem(key, JSON.stringify(ids));
  } catch {
    // Local ordering is a convenience and should not block task actions.
  }
}

function applyTodoOrder(tasks: Task[], savedIds: number[] | null) {
  if (!savedIds) return tasks;
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const ordered: Task[] = [];
  for (const id of savedIds) {
    const task = byId.get(id);
    if (task) {
      ordered.push(task);
      byId.delete(id);
    }
  }
  for (const task of byId.values()) ordered.push(task);
  return ordered;
}

function SortableTodoItem({ task, children }: { task: Task; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
        zIndex: isDragging ? 50 : undefined,
      }}
      className="flex items-start gap-2"
    >
      <button
        {...attributes}
        {...listeners}
        type="button"
        aria-label={`Drag to reorder ${task.title}`}
        className="mt-3 flex-shrink-0 p-0.5 text-muted-foreground/20 hover:text-muted-foreground/50 touch-none cursor-grab active:cursor-grabbing transition-colors"
        style={{ touchAction: 'none' }}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function SortableTodoSection({
  tasks,
  orderKey,
  children,
}: {
  tasks: Task[];
  orderKey: string;
  children: (task: Task) => React.ReactNode;
}) {
  const [orderedTasks, setOrderedTasks] = useState(() => applyTodoOrder(tasks, loadTodoOrder(orderKey)));
  const incomingIds = useMemo(() => tasks.map((task) => task.id).sort().join(','), [tasks]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { delay: 500, tolerance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 500, tolerance: 5 } }),
  );

  React.useEffect(() => {
    setOrderedTasks(applyTodoOrder(tasks, loadTodoOrder(orderKey)));
  }, [incomingIds, orderKey, tasks]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setOrderedTasks((current) => {
      const oldIndex = current.findIndex((task) => task.id === Number(active.id));
      const newIndex = current.findIndex((task) => task.id === Number(over.id));
      if (oldIndex < 0 || newIndex < 0) return current;

      const next = [...current];
      const [moved] = next.splice(oldIndex, 1);
      next.splice(newIndex, 0, moved);
      saveTodoOrder(orderKey, next.map((task) => task.id));
      return next;
    });
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={orderedTasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
        <div className="divide-y divide-border/30">
          {orderedTasks.map((task) => (
            <SortableTodoItem key={task.id} task={task}>
              {children(task)}
            </SortableTodoItem>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

// ── Add form ───────────────────────────────────────────────────────────────

function AddForm() {
  const [title, setTitle] = useState('');
  const [color, setColor] = useState<TaskColor | null>(null);
  const queryClient = useQueryClient();
  const createTask = useCreateTask();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    createTask.mutate(
      { data: { title: title.trim(), completed: false, color: color ?? undefined, type: 'todo' } as any },
      {
        onSuccess: () => {
          setTitle('');
          setColor(null);
          toast.success('Added');
          queryClient.invalidateQueries({ queryKey: TODO_QUERY_KEY() });
        },
      },
    );
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="flex items-center gap-3">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What do you need to do?"
          className="flex-1 bg-transparent border-none outline-none text-base text-foreground placeholder:text-muted-foreground/30 focus:ring-0 p-0"
          autoComplete="off"
        />
        <button
          type="submit"
          disabled={!title.trim() || createTask.isPending}
          className="flex-shrink-0 w-8 h-8 rounded-full bg-foreground flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed hover:bg-foreground/80 transition-colors"
          aria-label="Add task"
        >
          <Check className="w-4 h-4 text-background" strokeWidth={3} />
        </button>
      </div>
      <div className="mt-3">
        <ColorDots value={color} onChange={setColor} />
      </div>
    </form>
  );
}

// ── Active task row ────────────────────────────────────────────────────────

function ActiveTaskItem({ task }: { task: Task }) {
  const queryClient = useQueryClient();
  const deleteTask = useDeleteTask();
  const updateTask = useUpdateTask();
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);
  const [editColor, setEditColor] = useState<TaskColor | null>(
    task.color && task.color in COLOR_STYLES ? (task.color as TaskColor) : null,
  );

  const openEdit = () => {
    setEditTitle(task.title);
    setEditColor(task.color && task.color in COLOR_STYLES ? (task.color as TaskColor) : null);
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setEditTitle(task.title);
    setEditColor(task.color && task.color in COLOR_STYLES ? (task.color as TaskColor) : null);
  };

  const commitEdit = () => {
    const trimmed = editTitle.trim();
    if (!trimmed) return;

    updateTask.mutate(
      { id: task.id, data: { title: trimmed, color: editColor } },
      {
        onSuccess: () => {
          toast.success('Updated');
          queryClient.invalidateQueries({ queryKey: TODO_QUERY_KEY() });
          setEditing(false);
        },
        onError: () => toast.error('Could not update todo'),
      },
    );
  };

  const handleComplete = () => {
    updateTask.mutate(
      { id: task.id, data: { completed: true, completedAt: new Date().toISOString() } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: TODO_QUERY_KEY() });
        },
      },
    );
  };

  const handleDelete = () => {
    deleteTask.mutate({ id: task.id }, {
      onSuccess: () => {
        toast.success('Removed');
        queryClient.invalidateQueries({ queryKey: TODO_QUERY_KEY() });
      },
    });
  };

  return (
    <>
      <div className="flex items-center gap-4 py-3.5">
        <button
          onClick={handleComplete}
          disabled={updateTask.isPending}
          className="flex-shrink-0 w-5 h-5 rounded-full border-2 border-muted-foreground/30 hover:border-primary hover:bg-primary/10 flex items-center justify-center transition-all disabled:opacity-50"
          aria-label="Mark complete"
        >
          <span />
        </button>
        <TaskColorDot color={task.color} />
        <div className="flex-1 min-w-0">
          <span className="text-base font-medium text-foreground leading-snug">{task.title}</span>
        </div>
        <button
          onClick={openEdit}
          disabled={deleteTask.isPending || updateTask.isPending}
          className="flex-shrink-0 p-1.5 text-muted-foreground/30 hover:text-primary hover:bg-primary/10 rounded-lg transition-all disabled:opacity-50"
          aria-label={`Edit ${task.title}`}
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={handleDelete}
          disabled={deleteTask.isPending || updateTask.isPending}
          className="flex-shrink-0 p-1.5 text-muted-foreground/30 hover:text-destructive hover:bg-destructive/10 rounded-lg transition-all disabled:opacity-50"
          aria-label="Delete"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      {editing && (
        <div className="mb-3 ml-9 rounded-xl border border-border/40 bg-muted/30 p-3 space-y-3">
          <input
            autoFocus
            value={editTitle}
            onChange={(event) => setEditTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commitEdit();
              if (event.key === 'Escape') cancelEdit();
            }}
            aria-label="Edit todo text"
            className="w-full bg-transparent border-none outline-none text-sm font-medium text-foreground placeholder:text-muted-foreground/40 focus:ring-0 p-0"
            placeholder="Todo title"
          />
          <div className="flex items-center justify-between gap-3">
            <ColorDots value={editColor} onChange={setEditColor} />
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={cancelEdit}
                className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-all"
                aria-label="Cancel edit"
              >
                <X className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={commitEdit}
                disabled={!editTitle.trim() || updateTask.isPending}
                className="p-1.5 bg-foreground text-background rounded-lg hover:bg-foreground/80 disabled:opacity-40 transition-all"
                aria-label="Save todo edit"
              >
                <Check className="w-3.5 h-3.5" strokeWidth={3} />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Completed task row ─────────────────────────────────────────────────────

function CompletedTaskItem({ task }: { task: Task }) {
  const queryClient = useQueryClient();
  const deleteTask = useDeleteTask();
  const updateTask = useUpdateTask();
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);
  const [editColor, setEditColor] = useState<TaskColor | null>(
    task.color && task.color in COLOR_STYLES ? (task.color as TaskColor) : null,
  );

  const openEdit = () => {
    setEditTitle(task.title);
    setEditColor(task.color && task.color in COLOR_STYLES ? (task.color as TaskColor) : null);
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setEditTitle(task.title);
    setEditColor(task.color && task.color in COLOR_STYLES ? (task.color as TaskColor) : null);
  };

  const commitEdit = () => {
    const trimmed = editTitle.trim();
    if (!trimmed) return;

    updateTask.mutate(
      { id: task.id, data: { title: trimmed, color: editColor } },
      {
        onSuccess: () => {
          toast.success('Updated');
          queryClient.invalidateQueries({ queryKey: TODO_QUERY_KEY() });
          setEditing(false);
        },
        onError: () => toast.error('Could not update todo'),
      },
    );
  };

  const handleDelete = () => {
    deleteTask.mutate({ id: task.id }, {
      onSuccess: () => {
        toast.success('Removed');
        queryClient.invalidateQueries({ queryKey: TODO_QUERY_KEY() });
      },
    });
  };

  return (
    <>
      <div className="flex items-center gap-4 py-3.5">
      <div className="flex-shrink-0 w-5 h-5 rounded-full bg-muted flex items-center justify-center">
        <Check className="w-3 h-3 text-muted-foreground" strokeWidth={3} />
      </div>
      <TaskColorDot color={task.color} />
      <div className="flex-1 min-w-0">
        <span className="text-base font-medium text-muted-foreground line-through leading-snug">
          {task.title}
        </span>
      </div>
      <button
        onClick={openEdit}
        disabled={deleteTask.isPending || updateTask.isPending}
        className="flex-shrink-0 p-1.5 text-muted-foreground/30 hover:text-primary hover:bg-primary/10 rounded-lg transition-all disabled:opacity-50"
        aria-label={`Edit ${task.title}`}
      >
        <Pencil className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={handleDelete}
        disabled={deleteTask.isPending || updateTask.isPending}
        className="flex-shrink-0 p-1.5 text-muted-foreground/30 hover:text-destructive hover:bg-destructive/10 rounded-lg transition-all disabled:opacity-50"
        aria-label="Delete"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
      </div>
      {editing && (
        <div className="mb-3 ml-9 rounded-xl border border-border/40 bg-muted/30 p-3 space-y-3">
        <input
          autoFocus
          value={editTitle}
          onChange={(event) => setEditTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commitEdit();
            if (event.key === 'Escape') cancelEdit();
          }}
          aria-label="Edit todo text"
          className="w-full bg-transparent border-none outline-none text-sm font-medium text-foreground placeholder:text-muted-foreground/40 focus:ring-0 p-0"
          placeholder="Todo title"
        />
        <div className="flex items-center justify-between gap-3">
          <ColorDots value={editColor} onChange={setEditColor} />
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={cancelEdit}
              className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-all"
              aria-label="Cancel edit"
            >
              <X className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={commitEdit}
              disabled={!editTitle.trim() || updateTask.isPending}
              className="p-1.5 bg-foreground text-background rounded-lg hover:bg-foreground/80 disabled:opacity-40 transition-all"
              aria-label="Save todo edit"
            >
              <Check className="w-3.5 h-3.5" strokeWidth={3} />
            </button>
          </div>
        </div>
        </div>
      )}
    </>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function Todo() {
  const [colorFilter, setColorFilter] = useState<ColorFilter>('all');
  const { data: allTasks, isLoading } = useListTasks(
    { type: 'todo' } as any,
    { query: { queryKey: TODO_QUERY_KEY() } },
  );

  const { active, completed } = useMemo(() => {
    if (!allTasks) return { active: [], completed: [] };
    const active: Task[] = [];
    const completed: Task[] = [];
    for (const t of allTasks as Task[]) {
      if (colorFilter !== 'all' && t.color !== colorFilter) continue;
      if (t.completed) completed.push(t);
      else active.push(t);
    }
    // active: newest first (by createdAt), completed: oldest first so newest done is at bottom
    active.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    completed.sort((a, b) => new Date(a.completedAt ?? a.createdAt).getTime() - new Date(b.completedAt ?? b.createdAt).getTime());
    return { active, completed };
  }, [allTasks, colorFilter]);

  const selectedColorLabel =
    colorFilter === 'all'
      ? ''
      : COLOR_OPTIONS.find(({ value }) => value === colorFilter)?.label ?? '';

  return (
    <div className="min-h-[100dvh] flex justify-center py-12 px-4 sm:px-6">
      <div className="w-full max-w-2xl space-y-10">

        <header className="space-y-1">
          <h1 className="font-serif text-4xl font-bold tracking-tight text-foreground">Todo List</h1>
          <p className="text-muted-foreground font-medium">
            {isLoading
              ? 'Loading…'
              : active.length === 0
              ? 'Nothing left to do'
              : `${active.length} thing${active.length !== 1 ? 's' : ''} to do`}
          </p>
        </header>

        <AddForm />
        <ColorTabs value={colorFilter} onChange={setColorFilter} />

        {isLoading ? (
          <div className="py-12 flex flex-col items-center justify-center text-muted-foreground space-y-3">
            <div className="w-7 h-7 rounded-full border-2 border-muted-foreground/30 border-t-primary animate-spin" />
          </div>
        ) : (
          <div>
            {active.length === 0 && completed.length === 0 ? (
              <div className="py-16 flex flex-col items-center justify-center text-center border-2 border-dashed border-border/80 rounded-2xl bg-card/50">
                <div className="w-12 h-12 rounded-xl bg-muted/50 flex items-center justify-center mb-4">
                  <Circle className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-foreground font-semibold text-lg">
                  {selectedColorLabel ? `No ${selectedColorLabel.toLowerCase()} todos yet` : 'Nothing to do yet'}
                </p>
                <p className="text-muted-foreground text-sm mt-1">
                  {selectedColorLabel ? 'Try another colour or add one above.' : 'Add something above to get started.'}
                </p>
              </div>
            ) : (
              <>
                {/* Active todos */}
                {active.length > 0 && (
                  <SortableTodoSection
                    tasks={active}
                    orderKey={`todo-order-active-${colorFilter}`}
                  >
                    {(task) => <ActiveTaskItem task={task} />}
                  </SortableTodoSection>
                )}

                {/* Completed todos */}
                {completed.length > 0 && (
                  <div className="mt-4">
                    {active.length > 0 && <hr className="border-border/50 mb-4" />}
                    <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-1">
                      Completed
                      <span className="ml-2 font-normal normal-case opacity-60">
                        — {completed.length} {completed.length === 1 ? 'item' : 'items'}
                      </span>
                    </p>
                    <SortableTodoSection
                      tasks={completed}
                      orderKey={`todo-order-completed-${colorFilter}`}
                    >
                      {(task) => <CompletedTaskItem task={task} />}
                    </SortableTodoSection>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        <footer className="pt-8 pb-6 text-center">
          <p className="text-xs text-muted-foreground/50 flex items-center justify-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-primary/40 inline-block" />
            Done List Notebook
          </p>
        </footer>
      </div>
    </div>
  );
}
