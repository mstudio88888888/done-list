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
type Frequency = 'daily' | 'weekly' | 'monthly';

type RoutineItem = {
  id: string;
  title: string;
  color: TaskColor | null;
  createdAt: string;
};

type RoutineData = {
  daily: RoutineItem[];
  weekly: RoutineItem[];
  monthly: RoutineItem[];
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

const STORAGE_KEY = 'notebook-routine-v1';
const LEGACY_STORAGE_KEYS = ['notebook-routine', 'done-list-routine', 'routine'];

function normalizeRoutine(value: unknown): RoutineData | null {
  if (!value || typeof value !== 'object') return null;
  const parsed = value as Record<string, unknown>;
  const daily = parsed.daily ?? parsed.dailyTasks;
  const weekly = parsed.weekly ?? parsed.weeklyTasks;
  const monthly = parsed.monthly ?? parsed.monthlyTasks;
  if (!Array.isArray(daily) && !Array.isArray(weekly) && !Array.isArray(monthly)) return null;
  return {
    daily: Array.isArray(daily) ? daily : [],
    weekly: Array.isArray(weekly) ? weekly : [],
    monthly: Array.isArray(monthly) ? monthly : [],
  } as RoutineData;
}

function loadRoutine(): RoutineData {
  const keys = [STORAGE_KEY, ...LEGACY_STORAGE_KEYS];
  for (const key of keys) {
    try {
      const stored = window.localStorage.getItem(key);
      if (!stored) continue;
      const normalized = normalizeRoutine(JSON.parse(stored));
      if (normalized) {
        if (key !== STORAGE_KEY) saveRoutine(normalized);
        return normalized;
      }
    } catch {
      // Try the next compatible storage key.
    }
  }
  return { daily: [], weekly: [], monthly: [] };
}

function saveRoutine(data: RoutineData) {
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

function ItemColorDot({ color }: { color?: string | null }) {
  if (!color || !(color in COLOR_STYLES)) return null;
  const style = COLOR_STYLES[color as TaskColor];
  return (
    <span
      className="flex-shrink-0 w-2 h-2 rounded-full"
      style={{ backgroundColor: style.dotBg }}
    />
  );
}

// ── Sortable wrapper ───────────────────────────────────────────────────────

function SortableItem({ item, children }: { item: RoutineItem; children: React.ReactNode }) {
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

// ── RoutineRow ─────────────────────────────────────────────────────────────

function RoutineRow({
  item,
  onUpdate,
  onDelete,
}: {
  item: RoutineItem;
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

  const cancelEdit = () => {
    setEditing(false);
  };

  const commitEdit = () => {
    const trimmed = editTitle.trim();
    if (!trimmed) return;
    onUpdate(item.id, trimmed, editColor);
    setEditing(false);
  };

  return (
    <>
      <div className="flex items-center gap-3 py-3">
        <ItemColorDot color={item.color} />
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
            aria-label="Edit routine title"
            className="w-full bg-transparent border-none outline-none text-sm font-medium text-foreground placeholder:text-muted-foreground/40 focus:ring-0 p-0"
            placeholder="Routine title"
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
                aria-label="Save routine edit"
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
        placeholder="Add routine…"
        aria-label="New routine title"
        className="flex-1 min-w-0 bg-transparent border-none outline-none text-sm font-medium text-foreground placeholder:text-muted-foreground/40 focus:ring-0 py-1.5"
      />
      <ColorDots value={color} onChange={setColor} />
      <button
        type="button"
        onClick={submit}
        disabled={!title.trim()}
        className="flex-shrink-0 p-1.5 bg-foreground text-background rounded-lg hover:bg-foreground/80 disabled:opacity-30 transition-all"
        aria-label="Add routine"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ── FrequencySection ───────────────────────────────────────────────────────

const SECTION_LABELS: Record<Frequency, { title: string; description: string }> = {
  daily:   { title: 'Daily',   description: 'Things you do every day'       },
  weekly:  { title: 'Weekly',  description: 'Things you do each week'        },
  monthly: { title: 'Monthly', description: 'Things you do once a month'     },
};

function FrequencySection({
  frequency,
  items,
  onAdd,
  onUpdate,
  onDelete,
  onReorder,
}: {
  frequency: Frequency;
  items: RoutineItem[];
  onAdd: (title: string, color: TaskColor | null) => void;
  onUpdate: (id: string, title: string, color: TaskColor | null) => void;
  onDelete: (id: string) => void;
  onReorder: (ids: string[]) => void;
}) {
  const { title, description } = SECTION_LABELS[frequency];

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
    const reordered = arrayMove(items, oldIndex, newIndex);
    onReorder(reordered.map((i) => i.id));
  };

  return (
    <section className="bg-card/60 rounded-2xl border border-border/40 p-5 shadow-sm">
      <div className="mb-1">
        <h2 className="text-lg font-bold text-foreground">{title}</h2>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>

      {items.length > 0 && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            <div className="divide-y divide-border/30 mt-3">
              {items.map((item) => (
                <SortableItem key={item.id} item={item}>
                  <RoutineRow item={item} onUpdate={onUpdate} onDelete={onDelete} />
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

export default function Routine() {
  const [data, setData] = useState<RoutineData>(loadRoutine);

  const persist = useCallback((next: RoutineData) => {
    setData(next);
    saveRoutine(next);
  }, []);

  const handleAdd = (freq: Frequency) => (title: string, color: TaskColor | null) => {
    const item: RoutineItem = { id: generateId(), title, color, createdAt: new Date().toISOString() };
    const next = { ...data, [freq]: [...data[freq], item] };
    persist(next);
    toast.success('Added');
  };

  const handleUpdate = (freq: Frequency) => (id: string, title: string, color: TaskColor | null) => {
    const next = {
      ...data,
      [freq]: data[freq].map((item) => (item.id === id ? { ...item, title, color } : item)),
    };
    persist(next);
    toast.success('Updated');
  };

  const handleDelete = (freq: Frequency) => (id: string) => {
    const next = { ...data, [freq]: data[freq].filter((item) => item.id !== id) };
    persist(next);
    toast.success('Removed');
  };

  const handleReorder = (freq: Frequency) => (ids: string[]) => {
    const byId = new Map(data[freq].map((item) => [item.id, item]));
    const reordered = ids.map((id) => byId.get(id)!).filter(Boolean);
    persist({ ...data, [freq]: reordered });
  };

  const FREQUENCIES: Frequency[] = ['daily', 'weekly', 'monthly'];

  return (
    <div className="min-h-[100dvh] bg-background font-sans">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Routine</h1>
          <p className="text-muted-foreground mt-1 text-sm">Your recurring habits and commitments</p>
        </div>

        <div className="space-y-4">
          {FREQUENCIES.map((freq) => (
            <FrequencySection
              key={freq}
              frequency={freq}
              items={data[freq]}
              onAdd={handleAdd(freq)}
              onUpdate={handleUpdate(freq)}
              onDelete={handleDelete(freq)}
              onReorder={handleReorder(freq)}
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
