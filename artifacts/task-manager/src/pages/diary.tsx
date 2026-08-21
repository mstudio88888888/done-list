import React, { useMemo, useState } from 'react';
import { BookOpen, CalendarDays, Check, Pencil, Trash2, X } from 'lucide-react';
import { format, isToday, isValid, parseISO } from 'date-fns';
import { toast } from 'sonner';

type DiaryEntry = {
  id: string;
  date: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
};

const DIARY_STORAGE_KEY = 'done-list-diary-entries';
const LEGACY_STORAGE_PREFIX = 'done-list-diary-';

function emptyEntry(): Pick<DiaryEntry, 'title' | 'body'> {
  return { title: '', body: '' };
}

function createEntryId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isDiaryEntry(value: unknown): value is DiaryEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<DiaryEntry>;
  return (
    typeof entry.id === 'string' &&
    typeof entry.date === 'string' &&
    typeof entry.title === 'string' &&
    typeof entry.body === 'string' &&
    typeof entry.createdAt === 'string' &&
    typeof entry.updatedAt === 'string'
  );
}

function readEntries(): DiaryEntry[] {
  let storedEntries: DiaryEntry[] = [];
  try {
    const stored = window.localStorage.getItem(DIARY_STORAGE_KEY);
    if (stored) {
      const parsed: unknown = JSON.parse(stored);
      if (Array.isArray(parsed)) storedEntries = parsed.filter(isDiaryEntry);
    }
  } catch {
    storedEntries = [];
  }

  // Keep entries created by the first version of Diary. Those entries were
  // stored one-per-date, so convert them into the new list format once.
  const legacyEntries: DiaryEntry[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key || !key.startsWith(LEGACY_STORAGE_PREFIX) || key === DIARY_STORAGE_KEY) continue;
    const date = key.slice(LEGACY_STORAGE_PREFIX.length);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;

    try {
      const legacy = JSON.parse(window.localStorage.getItem(key) ?? 'null') as {
        title?: unknown;
        body?: unknown;
        updatedAt?: unknown;
      } | null;
      if (!legacy || (typeof legacy.title !== 'string' && typeof legacy.body !== 'string')) continue;

      const updatedAt =
        typeof legacy.updatedAt === 'string' ? legacy.updatedAt : `${date}T12:00:00.000Z`;
      legacyEntries.push({
        id: `legacy-${date}`,
        date,
        title: typeof legacy.title === 'string' ? legacy.title : '',
        body: typeof legacy.body === 'string' ? legacy.body : '',
        createdAt: updatedAt,
        updatedAt,
      });
    } catch {
      // Ignore one malformed legacy item without losing the other entries.
    }
  }

  const entriesById = new Map(storedEntries.map((entry) => [entry.id, entry]));
  legacyEntries.forEach((entry) => {
    if (!entriesById.has(entry.id)) entriesById.set(entry.id, entry);
  });
  const entries = Array.from(entriesById.values());
  if (legacyEntries.length > 0 || entries.length !== storedEntries.length) {
    try {
      window.localStorage.setItem(DIARY_STORAGE_KEY, JSON.stringify(entries));
    } catch {
      // Keep the entries in memory even if storage is temporarily unavailable.
    }
  }
  return entries;
}

function formatEntryDate(date: string) {
  const parsedDate = parseISO(date);
  if (!isValid(parsedDate)) return 'Choose a date';
  return isToday(parsedDate) ? 'Today' : format(parsedDate, 'EEEE, MMMM d, yyyy');
}

export default function Diary() {
  const today = useMemo(() => format(new Date(), 'yyyy-MM-dd'), []);
  const [selectedDate, setSelectedDate] = useState(today);
  const [entries, setEntries] = useState<DiaryEntry[]>(readEntries);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const groupedEntries = useMemo(() => {
    const sorted = [...entries].sort((a, b) => {
      const dateDifference = b.date.localeCompare(a.date);
      if (dateDifference !== 0) return dateDifference;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    const groups = new Map<string, DiaryEntry[]>();
    sorted.forEach((entry) => {
      const existing = groups.get(entry.date) ?? [];
      existing.push(entry);
      groups.set(entry.date, existing);
    });
    return Array.from(groups.entries());
  }, [entries]);

  const wordCount = body.trim() ? body.trim().split(/\s+/).length : 0;
  const isEditing = editingId !== null;
  const canSave = Boolean(title.trim() || body.trim());

  const persistEntries = (nextEntries: DiaryEntry[]) => {
    setEntries(nextEntries);
    window.localStorage.setItem(DIARY_STORAGE_KEY, JSON.stringify(nextEntries));
  };

  const resetEditor = () => {
    setTitle('');
    setBody('');
    setEditingId(null);
  };

  const handleDateChange = (date: string) => {
    if (!date) return;
    setSelectedDate(date);
    resetEditor();
  };

  const handleSave = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSave) return;

    const now = new Date().toISOString();
    let nextEntries: DiaryEntry[];
    if (editingId) {
      nextEntries = entries.map((entry) =>
        entry.id === editingId
          ? { ...entry, date: selectedDate, title: title.trim(), body, updatedAt: now }
          : entry,
      );
      toast.success('Diary entry updated');
    } else {
      nextEntries = [
        ...entries,
        {
          id: createEntryId(),
          date: selectedDate,
          title: title.trim(),
          body,
          createdAt: now,
          updatedAt: now,
        },
      ];
      toast.success('Diary entry saved');
    }
    persistEntries(nextEntries);
    resetEditor();
  };

  const handleEdit = (entry: DiaryEntry) => {
    setSelectedDate(entry.date);
    setTitle(entry.title);
    setBody(entry.body);
    setEditingId(entry.id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = (entry: DiaryEntry) => {
    const nextEntries = entries.filter((item) => item.id !== entry.id);
    persistEntries(nextEntries);
    if (editingId === entry.id) resetEditor();
    toast.success('Diary entry deleted');
  };

  return (
    <div className="min-h-[100dvh] flex justify-center py-12 px-4 sm:px-6">
      <div className="w-full max-w-2xl space-y-8">
        <header className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <h1 className="font-serif text-4xl font-bold tracking-tight text-foreground">Diary</h1>
              <p className="text-muted-foreground font-medium">A quiet place for your thoughts</p>
            </div>
            <div className="flex-shrink-0 flex items-center gap-2 rounded-xl border border-border/70 bg-card/60 px-3 py-2">
              <CalendarDays className="w-4 h-4 text-muted-foreground" />
              <input
                type="date"
                value={selectedDate}
                onChange={(event) => handleDateChange(event.target.value)}
                aria-label="Choose diary date"
                className="w-[9.5rem] bg-transparent text-sm font-medium text-foreground outline-none focus:ring-0"
              />
            </div>
          </div>
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground/65">
            {formatEntryDate(selectedDate)}
          </p>
        </header>

        <form onSubmit={handleSave} className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <input
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Give this entry a title"
              className="min-w-0 flex-1 bg-transparent border-none outline-none text-xl font-serif font-semibold text-foreground placeholder:text-muted-foreground/30 focus:ring-0 p-0"
              maxLength={120}
            />
            {isEditing && (
              <button
                type="button"
                onClick={resetEditor}
                className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-3.5 w-3.5" />
                Cancel
              </button>
            )}
          </div>
          <div className="rounded-2xl border border-border/70 bg-card/45 shadow-sm focus-within:border-primary/40 focus-within:ring-4 focus-within:ring-primary/5 transition-all">
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="How was your day?"
              aria-label="Diary entry"
              className="min-h-[10rem] w-full resize-y bg-transparent border-none outline-none text-base leading-7 text-foreground placeholder:text-muted-foreground/35 focus:ring-0 p-5"
            />
            <div className="flex items-center justify-between border-t border-border/50 px-5 py-3">
              <span className="text-xs text-muted-foreground/60">
                {wordCount} {wordCount === 1 ? 'word' : 'words'}
              </span>
              <button
                type="submit"
                disabled={!canSave}
                className="flex items-center gap-2 rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background transition-all hover:bg-foreground/80 disabled:cursor-not-allowed disabled:opacity-30"
              >
                <Check className="h-3.5 w-3.5" strokeWidth={3} />
                {isEditing ? 'Update entry' : 'Save entry'}
              </button>
            </div>
          </div>
        </form>

        <section className="space-y-5">
          <div className="flex items-baseline justify-between border-b border-border/50 pb-3">
            <h2 className="font-serif text-2xl font-semibold text-foreground">Previous entries</h2>
            <span className="text-xs font-medium text-muted-foreground">
              {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
            </span>
          </div>

          {groupedEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border/70 bg-card/30 py-10 text-center">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-muted/50">
                <BookOpen className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="font-semibold text-foreground">No entries yet</p>
              <p className="mt-1 text-sm text-muted-foreground">Your saved thoughts will appear here.</p>
            </div>
          ) : (
            <div className="space-y-7">
              {groupedEntries.map(([date, dayEntries]) => (
                <div key={date} className="space-y-2">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                    {formatEntryDate(date)}
                    <span className="ml-2 font-normal normal-case tracking-normal opacity-60">
                      — {dayEntries.length} {dayEntries.length === 1 ? 'entry' : 'entries'}
                    </span>
                  </p>
                  <div className="space-y-2">
                    {dayEntries.map((entry) => (
                      <article
                        key={entry.id}
                        className="group rounded-2xl border border-border/60 bg-card/45 px-5 py-4 shadow-sm transition-colors hover:border-border"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0 space-y-2">
                            {entry.title && (
                              <h3 className="font-serif text-lg font-semibold text-foreground">{entry.title}</h3>
                            )}
                            <p className="whitespace-pre-wrap text-sm leading-6 text-foreground/80">{entry.body}</p>
                          </div>
                          <div className="flex flex-shrink-0 items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100">
                            <button
                              type="button"
                              onClick={() => handleEdit(entry)}
                              className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-muted-foreground/60 transition-all hover:bg-muted hover:text-foreground"
                              aria-label={`Edit ${entry.title || 'diary entry'}`}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(entry)}
                              className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-muted-foreground/60 transition-all hover:bg-destructive/10 hover:text-destructive"
                              aria-label={`Delete ${entry.title || 'diary entry'}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Delete
                            </button>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <footer className="pt-4 pb-6 text-center">
          <p className="text-xs text-muted-foreground/50 flex items-center justify-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-primary/40 inline-block" />
            Done List Notebook
          </p>
        </footer>
      </div>
    </div>
  );
}