import React, { useState, useCallback } from 'react';
import { Check, GripVertical, Pencil, Plus, Trash2, X } from 'lucide-react';
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
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// ── Types ──────────────────────────────────────────────────────────────────

type TaskColor = 'pink' | 'grey' | 'red';
type Horizon = 'year' | 'nextyear' | 'future';

type GoalItem = {
  id: string;
  title: string;
  color: TaskColor | null;
  createdAt: string;
};

type GoalsData = {
  year: GoalItem[];
  nextyear: GoalItem[];
  future: GoalItem[];
};

// ── Colors ─────────────────────────────────────────────────────────────────

const COLOR_OPTIONS: { value: TaskColor; label: string }[] = [
  { value: 'pink', label: 'Peach' },
  { value: 'grey', label: 'Grey' },
  { value: 'red', label: 'Red' },
];

const COLOR_STYLES: Record<TaskColor, { dotBg: string }> = {
  pink: { dotBg: '#ffb997' },
  grey: { dotBg: '#9ca3af' },
  red: { dotBg: '#f87171' },
};

// ── Storage ────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'notebook-goals-v1';

function loadGoals(): GoalsData {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as any;
      return {
        year:     parsed.year     ?? [],
        nextyear: parsed.nextyear ?? parsed.longterm ?? [],
        future:   parsed.future   ?? parsed.lifetime ?? [],
      };
    }
  } catch {
    // ignore
  }
  return { year: [], nextyear: [], future: [] };
}

function saveGoals(data: GoalsData) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // ignore
  }
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ── ColorDots ──────────────────────────────────────────────────────────────

function ColorDots({
  value,
  onChange,
}: {
  value: TaskColor | null;
  onChange: (color: TaskColor | null) => void;
}) {
  return (
    <div className="flex items-center gap-2" aria-label="Choose goal colour">
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

function GoalColorDot({ color }: { color?: string | null }) {
  if (!color || !(color in COLOR_STYLES)) return null;
  return (
    <span
      className="flex-shrink-0 w-2 h-2 rounded-full"
      style={{ backgroundColor: COLOR_STYLES[color as TaskColor].dotBg }}
    />
  );
}

// ── Sortable wrapper ───────────────────────────────────────────────────────

function SortableItem({ item, children }: { item: GoalItem; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
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
        aria-label={`Drag to reorder ${item.title}`}
        className="mt-3 flex-shrink-0 p-0.5 text-muted-foreground/20 hover:text-muted-foreground/50 touch-none cursor-grab active:cursor-grabbing transition-colors"
        style={{ touchAction: 'none' }}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

// ── GoalRow ────────────────────────────────────────────────────────────────

function GoalRow({
  item,
  onUpdate,
  onDelete,
}: {
  item: GoalItem;
  onUpdate: (id: string, title: string, color: TaskColor | null) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(item.title);
  const [editColor, setEditColor] = useState<TaskColor | null>(
    item.color && item.color in COLOR_STYLES ? (item.color as TaskColor) : null,
  );

  const openEdit = () => {
    setEditTitle(item.title);
    setEditColor(item.color && item.color in COLOR_STYLES ? (item.color as TaskColor) : null);
    setEditing(true);
  };

  const cancelEdit = () => setEditing(false);

  const commitEdit = () => {
    const trimmed = editTitle.trim();
    if (!trimmed) return;
    onUpdate(item.id, trimmed, editColor);
    setEditing(false);
  };

  return (
    <>
      <div className="flex items-center gap-3 py-3">
        <GoalColorDot color={item.color} />
        <span className="flex-1 min-w-0 text-base font-medium text-foreground leading-snug">
          {item.title}
        </span>
        <button
          onClick={openEdit}
          className="flex-shrink-0 p-1.5 text-muted-foreground/30 hover:text-primary hover:bg-primary/10 rounded-lg transition-all"
          aria-label={`Edit ${item.title}`}
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => onDelete(item.id)}
          className="flex-shrink-0 p-1.5 text-muted-foreground/30 hover:text-destructive hover:bg-destructive/10 rounded-lg transition-all"
          aria-label={`Delete ${item.title}`}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      {editing && (
        <div className="mb-3 ml-2 rounded-xl border border-border/40 bg-muted/30 p-3 space-y-3">
          <input
            autoFocus
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitEdit();
              if (e.key === 'Escape') cancelEdit();
            }}
            aria-label="Edit goal title"
            className="w-full bg-transparent border-none outline-none text-sm font-medium text-foreground placeholder:text-muted-foreground/40 focus:ring-0 p-0"
            placeholder="Goal title"
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
                disabled={!editTitle.trim()}
                className="p-1.5 bg-foreground text-background rounded-lg hover:bg-foreground/80 disabled:opacity-40 transition-all"
                aria-label="Save goal edit"
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

// ── AddForm ────────────────────────────────────────────────────────────────

function AddForm({ onAdd }: { onAdd: (title: string, color: TaskColor | null) => void }) {
  const [title, setTitle] = useState('');
  const [color, setColor] = useState<TaskColor | null>(null);

  const submit = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    onAdd(trimmed, color);
    setTitle('');
    setColor(null);
  };

  return (
    <div className="flex items-center gap-3 py-2 px-3 rounded-xl border border-border/40 bg-muted/20 mt-3">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
        }}
        placeholder="Add goal…"
        aria-label="New goal title"
        className="flex-1 min-w-0 bg-transparent border-none outline-none text-sm font-medium text-foreground placeholder:text-muted-foreground/40 focus:ring-0 py-1.5"
      />
      <ColorDots value={color} onChange={setColor} />
      <button
        type="button"
        onClick={submit}
        disabled={!title.trim()}
        className="flex-shrink-0 p-1.5 bg-foreground text-background rounded-lg hover:bg-foreground/80 disabled:opacity-30 transition-all"
        aria-label="Add goal"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ── HorizonSection ─────────────────────────────────────────────────────────

function daysUntilEndOfYear(): number {
  const now = new Date();
  const endOfYear = new Date(now.getFullYear(), 11, 31);
  const ms = endOfYear.setHours(23, 59, 59, 999) - now.getTime();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

const SECTION_META: Record<Horizon, { title: string; description: (days?: number) => string }> = {
  year:     { title: 'This Year',  description: (days) => `Goals to reach within the next ${days} ${days === 1 ? 'day' : 'days'}` },
  nextyear: { title: 'Next Year',  description: () => 'Goals to work toward in the year ahead'    },
  future:   { title: 'Future',     description: () => 'Longer-term ambitions and big-picture aims' },
};

function HorizonSection({
  horizon,
  items,
  onAdd,
  onUpdate,
  onDelete,
  onReorder,
}: {
  horizon: Horizon;
  items: GoalItem[];
  onAdd: (title: string, color: TaskColor | null) => void;
  onUpdate: (id: string, title: string, color: TaskColor | null) => void;
  onDelete: (id: string) => void;
  onReorder: (ids: string[]) => void;
}) {
  const { title, description } = SECTION_META[horizon];
  const descriptionText = description(horizon === 'year' ? daysUntilEndOfYear() : undefined);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { delay: 500, tolerance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 500, tolerance: 5 } }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    onReorder(arrayMove(items, oldIndex, newIndex).map((i) => i.id));
  };

  return (
    <section className="bg-card/60 rounded-2xl border border-border/40 p-5 shadow-sm">
      <div className="mb-1">
        <h2 className="text-lg font-bold text-foreground">{title}</h2>
        <p className="text-xs text-muted-foreground">{descriptionText}</p>
      </div>

      {items.length > 0 && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            <div className="divide-y divide-border/30 mt-3">
              {items.map((item) => (
                <SortableItem key={item.id} item={item}>
                  <GoalRow item={item} onUpdate={onUpdate} onDelete={onDelete} />
                </SortableItem>
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <AddForm onAdd={onAdd} />
    </section>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

const HORIZONS: Horizon[] = ['year', 'nextyear', 'future'];

export default function Goals() {
  const [data, setData] = useState<GoalsData>(loadGoals);

  const persist = useCallback((next: GoalsData) => {
    setData(next);
    saveGoals(next);
  }, []);

  const handleAdd = (h: Horizon) => (title: string, color: TaskColor | null) => {
    const item: GoalItem = { id: generateId(), title, color, createdAt: new Date().toISOString() };
    persist({ ...data, [h]: [...data[h], item] });
    toast.success('Added');
  };

  const handleUpdate = (h: Horizon) => (id: string, title: string, color: TaskColor | null) => {
    persist({ ...data, [h]: data[h].map((i) => (i.id === id ? { ...i, title, color } : i)) });
    toast.success('Updated');
  };

  const handleDelete = (h: Horizon) => (id: string) => {
    persist({ ...data, [h]: data[h].filter((i) => i.id !== id) });
    toast.success('Removed');
  };

  const handleReorder = (h: Horizon) => (ids: string[]) => {
    const byId = new Map(data[h].map((i) => [i.id, i]));
    persist({ ...data, [h]: ids.map((id) => byId.get(id)!).filter(Boolean) });
  };

  return (
    <div className="min-h-[100dvh] bg-background font-sans">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Goals</h1>
          <p className="text-muted-foreground mt-1 text-sm">What you're working toward</p>
        </div>

        <div className="space-y-4">
          {HORIZONS.map((h) => (
            <HorizonSection
              key={h}
              horizon={h}
              items={data[h]}
              onAdd={handleAdd(h)}
              onUpdate={handleUpdate(h)}
              onDelete={handleDelete(h)}
              onReorder={handleReorder(h)}
            />
          ))}
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
