import React, { useState, useMemo, useCallback } from 'react';
import {
  useListTasks,
  getListTasksQueryKey,
  useDeleteTask,
  useCreateTask,
  useUpdateTask,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { format, isToday, isYesterday, startOfDay, subDays } from 'date-fns';
import { Check, Trash2, BookOpen, Pencil, X, GripVertical } from 'lucide-react';
import { toast } from 'sonner';
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  closestCenter,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// ── Colours ────────────────────────────────────────────────────────────────

type TaskColor = 'pink' | 'grey' | 'red';
const COLOR_ORDER: TaskColor[] = ['pink', 'grey', 'red'];

const COLOR_STYLES: Record<TaskColor, { hex: string; dotBg: string; checkBg: string }> = {
  pink: { hex: '#e8845a', dotBg: '#ffb997', checkBg: '#fff4ef' },
  grey: { hex: '#6b7280', dotBg: '#9ca3af', checkBg: '#f3f4f6' },
  red:  { hex: '#ef4444', dotBg: '#f87171', checkBg: '#fee2e2' },
};

// ── Types ──────────────────────────────────────────────────────────────────

type Task = {
  id: number;
  title: string;
  description?: string | null;
  completed: boolean;
  completedAt?: string | null;
  color?: string | null;
  createdAt: string;
};

// ── Helpers ────────────────────────────────────────────────────────────────

function formatDayLabel(dateStr: string) {
  const date = new Date(dateStr + 'T12:00:00');
  if (isToday(date)) return 'Today';
  if (isYesterday(date)) return 'Yesterday';
  return format(date, 'EEEE, MMMM d');
}

const ORDER_KEY = (date: string) => `done-order-${date}`;

function loadOrder(dateStr: string): number[] | null {
  try {
    const raw = localStorage.getItem(ORDER_KEY(dateStr));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveOrder(dateStr: string, ids: number[]) {
  try {
    localStorage.setItem(ORDER_KEY(dateStr), JSON.stringify(ids));
  } catch {}
}

function applyOrder(tasks: Task[], savedIds: number[] | null): Task[] {
  if (!savedIds) return tasks;
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const ordered: Task[] = [];
  for (const id of savedIds) {
    const t = byId.get(id);
    if (t) { ordered.push(t); byId.delete(id); }
  }
  // append any new tasks not yet in saved order
  for (const t of byId.values()) ordered.push(t);
  return ordered;
}

function groupByDay(tasks: Task[]): [string, Task[]][] {
  const map = new Map<string, Task[]>();
  for (const task of tasks) {
    const raw = task.completedAt ?? task.createdAt;
    const key = format(new Date(raw), 'yyyy-MM-dd');
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(task);
  }
  // default colour sort within each day (overridden by user order via applyOrder)
  for (const [, dayTasks] of map.entries()) {
    dayTasks.sort((a, b) => {
      const ai = COLOR_ORDER.indexOf((a.color ?? '') as TaskColor);
      const bi = COLOR_ORDER.indexOf((b.color ?? '') as TaskColor);
      return (ai === -1 ? COLOR_ORDER.length : ai) - (bi === -1 ? COLOR_ORDER.length : bi);
    });
  }
  return Array.from(map.entries()).sort(([a], [b]) => b.localeCompare(a));
}

// ── Colour picker ──────────────────────────────────────────────────────────

function ColorDots({ value, onChange }: { value: TaskColor | null; onChange: (c: TaskColor | null) => void }) {
  return (
    <div className="flex items-center gap-2">
      {COLOR_ORDER.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(value === c ? null : c)}
          aria-label={c}
          style={{ backgroundColor: COLOR_STYLES[c].dotBg }}
          className={`w-5 h-5 rounded-full transition-all ${
            value === c
              ? 'ring-2 ring-offset-2 ring-offset-background scale-110'
              : 'opacity-60 hover:opacity-100'
          }`}
        />
      ))}
    </div>
  );
}

// ── Sortable task row ──────────────────────────────────────────────────────

function SortableTaskItem({ task, isDragging: anyDragging }: { task: Task; isDragging: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging: thisIsDragging } =
    useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: thisIsDragging ? 0.4 : 1,
    zIndex: thisIsDragging ? 50 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <TaskItem task={task} dragHandleProps={{ ...attributes, ...listeners }} anyDragging={anyDragging} />
    </div>
  );
}

// ── Task item ──────────────────────────────────────────────────────────────

function TaskItem({
  task,
  dragHandleProps,
  anyDragging,
}: {
  task: Task;
  dragHandleProps?: React.HTMLAttributes<HTMLButtonElement>;
  anyDragging: boolean;
}) {
  const queryClient = useQueryClient();
  const deleteTask = useDeleteTask();
  const updateTask = useUpdateTask();
  const [editing, setEditing] = useState(false);

  const rawDate = task.completedAt ?? task.createdAt;
  const [editTitle, setEditTitle] = useState(task.title);
  const [editDate, setEditDate] = useState(format(new Date(rawDate), 'yyyy-MM-dd'));
  const [editColor, setEditColor] = useState<TaskColor | null>((task.color ?? null) as TaskColor | null);

  const colorKey = (task.color ?? null) as TaskColor | null;
  const styles = colorKey ? COLOR_STYLES[colorKey] : null;

  const handleDelete = () =>
    deleteTask.mutate({ id: task.id }, {
      onSuccess: () => {
        toast.success('Entry removed');
        queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
      },
    });

  const openEdit = () => {
    setEditTitle(task.title);
    setEditDate(format(new Date(task.completedAt ?? task.createdAt), 'yyyy-MM-dd'));
    setEditColor((task.color ?? null) as TaskColor | null);
    setEditing(true);
  };

  const commitEdit = () => {
    const trimmed = editTitle.trim();
    if (!trimmed) return;
    updateTask.mutate(
      { id: task.id, data: { title: trimmed, completedAt: new Date(editDate + 'T12:00:00').toISOString(), color: editColor ?? null } },
      {
        onSuccess: () => {
          toast.success('Updated');
          queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
          setEditing(false);
        },
      },
    );
  };

  return (
    <div>
      <div className="flex items-center gap-4 py-3.5">
        {/* Drag handle */}
        <button
          {...dragHandleProps}
          className="flex-shrink-0 p-0.5 text-muted-foreground/20 hover:text-muted-foreground/50 touch-none cursor-grab active:cursor-grabbing transition-colors"
          aria-label="Drag to reorder"
          tabIndex={-1}
          style={{ touchAction: 'none' }}
        >
          <GripVertical className="w-4 h-4" />
        </button>

        {/* Colour check */}
        <div
          className="flex-shrink-0 w-5 h-5 rounded-md flex items-center justify-center"
          style={{ backgroundColor: styles ? styles.checkBg : '#e5e7eb' }}
        >
          <Check className="w-3.5 h-3.5" color={styles ? styles.hex : '#6b7280'} strokeWidth={3} />
        </div>

        {/* Title */}
        <div className="flex-1 min-w-0">
          <span
            className="text-base font-medium leading-snug"
            style={styles ? { color: styles.hex } : {}}
          >
            {task.title}
          </span>
        </div>

        {/* Actions — hidden while any item is dragging */}
        {!anyDragging && (
          <>
            <button
              onClick={openEdit}
              disabled={deleteTask.isPending}
              className="flex-shrink-0 p-1.5 text-muted-foreground/30 hover:text-primary hover:bg-primary/10 rounded-lg transition-all"
              aria-label="Edit entry"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleDelete}
              disabled={deleteTask.isPending}
              className="flex-shrink-0 p-1.5 text-muted-foreground/30 hover:text-destructive hover:bg-destructive/10 rounded-lg transition-all disabled:opacity-50"
              aria-label="Remove entry"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>

      {/* Inline edit panel */}
      {editing && (
        <div className="mb-3 ml-9 p-3 rounded-xl bg-muted/30 border border-border/40 space-y-3">
          <input
            autoFocus
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditing(false); }}
            className="w-full bg-transparent border-none outline-none text-sm font-medium text-foreground placeholder:text-muted-foreground/40 focus:ring-0 p-0"
            placeholder="Task title"
          />
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <input
                type="date"
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
                max={format(new Date(), 'yyyy-MM-dd')}
                className="text-xs text-muted-foreground bg-transparent border-none outline-none focus:ring-0 cursor-pointer"
              />
              <ColorDots value={editColor} onChange={setEditColor} />
            </div>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => setEditing(false)} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-all" aria-label="Cancel">
                <X className="w-3.5 h-3.5" />
              </button>
              <button type="button" onClick={commitEdit} disabled={!editTitle.trim() || updateTask.isPending} className="p-1.5 bg-foreground text-background rounded-lg hover:bg-foreground/80 disabled:opacity-40 transition-all" aria-label="Save">
                <Check className="w-3.5 h-3.5" strokeWidth={3} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sortable day group ─────────────────────────────────────────────────────

function DayGroup({ dateStr, initialTasks }: { dateStr: string; initialTasks: Task[] }) {
  const [tasks, setTasks] = useState<Task[]>(() => applyOrder(initialTasks, loadOrder(dateStr)));
  const [activeDragId, setActiveDragId] = useState<number | null>(null);

  // Sync when tasks from server change (new task added, deleted, etc.)
  const prevIds = React.useRef<string>('');
  const incoming = useMemo(
    () => initialTasks.map((t) => t.id).sort().join(','),
    [initialTasks],
  );
  if (prevIds.current !== incoming) {
    prevIds.current = incoming;
    setTasks(applyOrder(initialTasks, loadOrder(dateStr)));
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { delay: 500, tolerance: 5 } }),
    useSensor(TouchSensor,   { activationConstraint: { delay: 500, tolerance: 5 } }),
  );

  const handleDragStart = useCallback(({ active }: { active: { id: number | string } }) => {
    setActiveDragId(Number(active.id));
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setTasks((prev) => {
      const oldIdx = prev.findIndex((t) => t.id === active.id);
      const newIdx = prev.findIndex((t) => t.id === over.id);
      const next = arrayMove(prev, oldIdx, newIdx);
      saveOrder(dateStr, next.map((t) => t.id));
      return next;
    });
  }, [dateStr]);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <div className="divide-y divide-border/30">
          {tasks.map((task) => (
            <SortableTaskItem key={task.id} task={task} isDragging={activeDragId !== null} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

// ── Log form ───────────────────────────────────────────────────────────────

function LogForm() {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [color, setColor] = useState<TaskColor | null>(null);
  const queryClient = useQueryClient();
  const createTask = useCreateTask();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    createTask.mutate(
      { data: { title: title.trim(), completed: true, completedAt: new Date(date + 'T12:00:00').toISOString(), color: color ?? undefined } },
      {
        onSuccess: () => {
          setTitle('');
          setColor(null);
          toast.success('Logged');
          queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
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
          placeholder="What did you get done?"
          className="flex-1 bg-transparent border-none outline-none text-base text-foreground placeholder:text-muted-foreground/30 focus:ring-0 p-0"
          autoComplete="off"
        />
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          max={format(new Date(), 'yyyy-MM-dd')}
          className="text-sm text-muted-foreground bg-transparent border-none outline-none focus:outline-none focus:ring-0 cursor-pointer"
        />
        <button
          type="submit"
          disabled={!title.trim() || createTask.isPending}
          className="flex-shrink-0 w-8 h-8 rounded-full bg-foreground flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed hover:bg-foreground/80 transition-colors"
          aria-label="Log entry"
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

// ── Page ───────────────────────────────────────────────────────────────────

export default function Home() {
  const weekAgo = startOfDay(subDays(new Date(), 6));

  const { data: allTasks, isLoading } = useListTasks(
    { filter: 'completed', type: 'done' } as any,
    { query: { queryKey: getListTasksQueryKey({ filter: 'completed', type: 'done' } as any) } },
  );

  const weekTasks = useMemo(() => {
    if (!allTasks) return [];
    return allTasks.filter((t) => new Date(t.completedAt ?? t.createdAt) >= weekAgo);
  }, [allTasks]);

  const grouped = useMemo(() => groupByDay(weekTasks), [weekTasks]);
  const weekCount = weekTasks.length;

  return (
    <div className="min-h-[100dvh] flex justify-center py-12 px-4 sm:px-6">
      <div className="w-full max-w-2xl space-y-10">
        <header className="space-y-1">
          <h1 className="font-serif text-4xl font-bold tracking-tight text-foreground">Done List</h1>
          <p className="text-muted-foreground font-medium">
            {weekCount === 0 ? 'Nothing logged this week yet' : `${weekCount} thing${weekCount !== 1 ? 's' : ''} done this week`}
          </p>
        </header>

        <LogForm />

        <div>
          {isLoading ? (
            <div className="py-12 flex flex-col items-center justify-center text-muted-foreground space-y-3">
              <div className="w-7 h-7 rounded-full border-2 border-muted-foreground/30 border-t-primary animate-spin" />
              <p className="text-sm font-medium tracking-wide">Loading…</p>
            </div>
          ) : grouped.length === 0 ? (
            <div className="py-16 flex flex-col items-center justify-center text-center border-2 border-dashed border-border/80 rounded-2xl bg-card/50">
              <div className="w-12 h-12 rounded-xl bg-muted/50 flex items-center justify-center mb-4">
                <BookOpen className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-foreground font-semibold text-lg">Nothing logged this week</p>
              <p className="text-muted-foreground text-sm mt-1">Start by logging something you got done above.</p>
            </div>
          ) : (
            grouped.map(([dateStr, dayTasks], index) => (
              <div key={dateStr}>
                {index > 0 && <hr className="border-border/50 my-6" />}
                <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-1">
                  {formatDayLabel(dateStr)}
                  <span className="ml-2 font-normal normal-case opacity-60">
                    — {dayTasks.length} {dayTasks.length === 1 ? 'item' : 'items'}
                  </span>
                </p>
                <DayGroup dateStr={dateStr} initialTasks={dayTasks} />
              </div>
            ))
          )}
        </div>

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
