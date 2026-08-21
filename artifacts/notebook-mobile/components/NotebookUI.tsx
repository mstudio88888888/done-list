import { Feather } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  useCreateNotebookItem,
  useCreateTask,
  useDeleteNotebookItem,
  useDeleteTask,
  useListNotebookItems,
  useListTasks,
  useUpdateNotebookItem,
  useUpdateTask,
  type NotebookDomain,
  type NotebookItem,
  type Task,
  type TaskInputColor,
  type TaskType,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";

type Color = Exclude<TaskInputColor, null>;
const colorOptions: { value: Color; label: string; swatch: string }[] = [
  { value: "pink", label: "Peach", swatch: "#ffb997" },
  { value: "grey", label: "Grey", swatch: "#9ca3af" },
  { value: "red", label: "Red", swatch: "#f87171" },
];

function getError(error: unknown) {
  return error instanceof Error ? error.message : "Please try again.";
}

export function ColorPicker({
  value,
  onChange,
}: {
  value: Color | null;
  onChange: (value: Color | null) => void;
}) {
  const colors = useColors();
  return (
    <View style={styles.colorRow}>
      {colorOptions.map((option) => (
        <Pressable
          key={option.value}
          testID={`color-${option.value}`}
          onPress={() => onChange(value === option.value ? null : option.value)}
          style={[
            styles.colorDot,
            { backgroundColor: option.swatch, borderColor: colors.background },
            value === option.value && { borderWidth: 3, transform: [{ scale: 1.1 }] },
          ]}
          accessibilityLabel={option.label}
        />
      ))}
    </View>
  );
}

export function PageShell({
  children,
  title,
  subtitle,
  refreshing,
  onRefresh,
}: {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
  const colors = useColors();
  return (
    <ScrollView
      style={[styles.page, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.pageContent}
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.primary} /> : undefined}
      keyboardShouldPersistTaps="handled"
      testID={`${title.toLowerCase().replace(/\s/g, "-")}-screen`}
    >
      <Text style={[styles.eyebrow, { color: colors.mutedForeground }]}>Done List Notebook</Text>
      <Text style={[styles.pageTitle, { color: colors.foreground }]}>{title}</Text>
      {subtitle ? <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>{subtitle}</Text> : null}
      {children}
    </ScrollView>
  );
}

function LoadingOrError({
  loading,
  error,
  onRetry,
}: {
  loading: boolean;
  error: unknown;
  onRetry: () => void;
}) {
  const colors = useColors();
  if (loading) return <ActivityIndicator style={styles.loader} color={colors.primary} />;
  if (!error) return null;
  return (
    <View style={[styles.empty, { borderColor: colors.border }]}>
      <Feather name="cloud-off" size={22} color={colors.mutedForeground} />
      <Text style={[styles.emptyText, { color: colors.foreground }]}>{getError(error)}</Text>
      <Pressable onPress={onRetry}><Text style={[styles.textButton, { color: colors.primary }]}>Try again</Text></Pressable>
    </View>
  );
}

export function TaskList({ type }: { type: TaskType }) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [color, setColor] = useState<Color | null>(null);
  const [filter, setFilter] = useState<Color | "all">("all");
  const tasksQuery = useListTasks({ type, filter: "all" });
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();

  const tasks = useMemo(() => {
    const rows = tasksQuery.data ?? [];
    const filtered = filter === "all" ? rows : rows.filter((task) => task.color === filter);
    return [...filtered].sort((a, b) => {
      if (type === "todo" && a.completed !== b.completed) return a.completed ? 1 : -1;
      return a.position - b.position || a.createdAt.localeCompare(b.createdAt);
    });
  }, [filter, tasksQuery.data, type]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
  const add = async () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    await createTask.mutateAsync({
      data: {
        title: trimmed,
        type,
        color,
        position: tasks.length,
        completed: type === "done",
        completedAt: type === "done" ? new Date().toISOString() : null,
      },
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTitle("");
    setColor(null);
    refresh();
  };
  const update = async (id: number, data: Parameters<typeof updateTask.mutateAsync>[0]["data"]) => {
    await updateTask.mutateAsync({ id, data });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    refresh();
  };
  const remove = (task: Task) => Alert.alert("Delete item?", `"${task.title}" will be removed.`, [
    { text: "Keep", style: "cancel" },
    { text: "Delete", style: "destructive", onPress: async () => { await deleteTask.mutateAsync({ id: task.id }); refresh(); } },
  ]);
  const reorder = async (task: Task, direction: -1 | 1) => {
    const index = tasks.findIndex((entry) => entry.id === task.id);
    const sibling = tasks[index + direction];
    if (!sibling) return;
    await Promise.all([
      update(task.id, { position: sibling.position }),
      update(sibling.id, { position: task.position }),
    ]);
  };

  const active = tasks.filter((task) => !task.completed);
  const completed = tasks.filter((task) => task.completed);
  const heading = type === "done" ? "Done List" : "Todo List";
  return (
    <PageShell title={heading} subtitle={type === "done" ? "A gentle record of what you finished." : "Keep the next small thing visible."} refreshing={tasksQuery.isFetching} onRefresh={refresh}>
      <View style={[styles.composer, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <TextInput value={title} onChangeText={setTitle} placeholder={type === "done" ? "What did you finish?" : "Add a to-do"} placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} onSubmitEditing={add} returnKeyType="done" testID="task-title-input" />
        <View style={styles.composerFooter}>
          <ColorPicker value={color} onChange={setColor} />
          <Pressable style={[styles.roundButton, { backgroundColor: colors.primary }]} onPress={add} testID="add-task" disabled={createTask.isPending}>
            <Feather name="check" size={18} color={colors.primaryForeground} />
          </Pressable>
        </View>
      </View>
      {type === "todo" ? <View style={styles.filterRow}>
        {(["all", "pink", "grey", "red"] as const).map((item) => <Pressable key={item} onPress={() => setFilter(item)} style={[styles.filter, { borderColor: colors.border }, filter === item && { backgroundColor: colors.primary, borderColor: colors.primary }]}><Text style={{ color: filter === item ? colors.primaryForeground : colors.mutedForeground, fontWeight: "700" }}>{item === "all" ? "All" : item === "pink" ? "Peach" : item}</Text></Pressable>)}
      </View> : null}
      <LoadingOrError loading={tasksQuery.isLoading} error={tasksQuery.error} onRetry={refresh} />
      {!tasksQuery.isLoading && !tasksQuery.error ? <>
        <TaskSection title={type === "todo" ? "Active" : "Recently completed"} tasks={type === "todo" ? active : tasks} onUpdate={update} onDelete={remove} onReorder={reorder} />
        {type === "todo" ? <TaskSection title="Completed" tasks={completed} onUpdate={update} onDelete={remove} onReorder={reorder} /> : null}
      </> : null}
    </PageShell>
  );
}

function TaskSection({ title, tasks, onUpdate, onDelete, onReorder }: { title: string; tasks: Task[]; onUpdate: (id: number, data: { completed?: boolean; title?: string; color?: Color | null }) => Promise<void>; onDelete: (task: Task) => void; onReorder: (task: Task, direction: -1 | 1) => Promise<void> }) {
  const colors = useColors();
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  return <View style={styles.section}>
    <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>{title} · {tasks.length}</Text>
    {tasks.length === 0 ? <View style={[styles.empty, { borderColor: colors.border }]}><Feather name="sun" size={22} color={colors.mutedForeground} /><Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Nothing here yet.</Text></View> : tasks.map((task) => <View key={task.id} style={[styles.taskCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Pressable onPress={() => onUpdate(task.id, { completed: !task.completed })} style={[styles.check, { borderColor: task.completed ? colors.primary : colors.border, backgroundColor: task.completed ? colors.primary : "transparent" }]}><Feather name="check" size={14} color={colors.primaryForeground} /></Pressable>
      <View style={styles.taskContent}>
        {editing === task.id ? <TextInput autoFocus value={draft} onChangeText={setDraft} style={[styles.inlineInput, { color: colors.foreground, borderColor: colors.border }]} onSubmitEditing={async () => { if (draft.trim()) await onUpdate(task.id, { title: draft.trim() }); setEditing(null); }} /> : <Text style={[styles.taskTitle, { color: colors.foreground }, task.completed && styles.strike]}>{task.title}</Text>}
        {task.color ? <View style={[styles.tag, { backgroundColor: task.color === "pink" ? "#ffb997" : task.color === "grey" ? "#d4d4d8" : "#f87171" }]} /> : null}
      </View>
      <View style={styles.taskActions}>
        <Pressable onPress={() => onReorder(task, -1)} hitSlop={10}><Feather name="chevron-up" size={17} color={colors.mutedForeground} /></Pressable>
        <Pressable onPress={() => onReorder(task, 1)} hitSlop={10}><Feather name="chevron-down" size={17} color={colors.mutedForeground} /></Pressable>
        <Pressable onPress={() => { setEditing(task.id); setDraft(task.title); }} hitSlop={10}><Feather name="edit-3" size={15} color={colors.mutedForeground} /></Pressable>
        <Pressable onPress={() => onDelete(task)} hitSlop={10}><Feather name="trash-2" size={15} color={colors.destructive} /></Pressable>
      </View>
    </View>)}
  </View>;
}

export function DiaryScreen() {
  const colors = useColors();
  const queryClient = useQueryClient();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const query = useListNotebookItems({ domain: "diary" });
  const create = useCreateNotebookItem();
  const update = useUpdateNotebookItem();
  const remove = useDeleteNotebookItem();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["/api/notebook-items"] });
  const save = async () => {
    if (!title.trim() && !body.trim()) return;
    const data = { title: title.trim() || null, body: body.trim() || null, entryDate: date, domain: "diary" as NotebookDomain };
    if (editing) await update.mutateAsync({ id: editing, data }); else await create.mutateAsync({ data });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTitle(""); setBody(""); setEditing(null); refresh();
  };
  const items = [...(query.data ?? [])].sort((a, b) => (b.entryDate ?? "").localeCompare(a.entryDate ?? ""));
  return <PageShell title="Diary" subtitle="A private place for the small details." refreshing={query.isFetching} onRefresh={refresh}>
    <View style={[styles.composer, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <TextInput value={date} onChangeText={setDate} style={[styles.dateInput, { color: colors.primary, borderColor: colors.border }]} placeholder="YYYY-MM-DD" placeholderTextColor={colors.mutedForeground} />
      <TextInput value={title} onChangeText={setTitle} style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} placeholder="A title, if you want one" placeholderTextColor={colors.mutedForeground} />
      <TextInput value={body} onChangeText={setBody} style={[styles.bodyInput, { color: colors.foreground, borderColor: colors.border }]} placeholder="Write a few lines…" placeholderTextColor={colors.mutedForeground} multiline textAlignVertical="top" />
      <View style={styles.composerFooter}><Text style={[styles.helper, { color: colors.mutedForeground }]}>{body.trim() ? `${body.trim().split(/\s+/).length} words` : "Private to your account"}</Text><Pressable style={[styles.saveButton, { backgroundColor: colors.primary }]} onPress={save}><Text style={{ color: colors.primaryForeground, fontWeight: "700" }}>{editing ? "Update" : "Save"}</Text></Pressable></View>
    </View>
    <LoadingOrError loading={query.isLoading} error={query.error} onRetry={refresh} />
    <View style={styles.section}><Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>Previous entries</Text>
      {items.map((item) => <View key={item.id} style={[styles.diaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}><Text style={[styles.dateLabel, { color: colors.primary }]}>{item.entryDate}</Text>{item.title ? <Text style={[styles.diaryTitle, { color: colors.foreground }]}>{item.title}</Text> : null}{item.body ? <Text style={[styles.diaryBody, { color: colors.foreground }]}>{item.body}</Text> : null}<View style={styles.rowEnd}><Pressable onPress={() => { setEditing(item.id); setDate(item.entryDate ?? date); setTitle(item.title ?? ""); setBody(item.body ?? ""); }}><Text style={[styles.textButton, { color: colors.primary }]}>Edit</Text></Pressable><Pressable onPress={() => Alert.alert("Delete entry?", undefined, [{ text: "Keep", style: "cancel" }, { text: "Delete", style: "destructive", onPress: async () => { await remove.mutateAsync({ id: item.id }); refresh(); } }])}><Text style={[styles.textButton, { color: colors.destructive }]}>Delete</Text></Pressable></View></View>)}
    </View>
  </PageShell>;
}

export function PlansScreen() {
  const colors = useColors();
  const [domain, setDomain] = useState<NotebookDomain>("routine");
  const sections = domain === "routine" ? ["Daily", "Weekly", "Monthly"] : ["This Year", "Next Year", "Future"];
  const [section, setSection] = useState(sections[0]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [color, setColor] = useState<Color | null>(null);
  const [editing, setEditing] = useState<NotebookItem | null>(null);
  const queryClient = useQueryClient();
  const query = useListNotebookItems({ domain });
  const create = useCreateNotebookItem();
  const update = useUpdateNotebookItem();
  const remove = useDeleteNotebookItem();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["/api/notebook-items"] });
  const save = async () => {
    if (!title.trim()) return;
    if (editing) {
      await update.mutateAsync({ id: editing.id, data: { section, title: title.trim(), body: body.trim() || null, color } });
    } else {
      await create.mutateAsync({ data: { domain, section, title: title.trim(), body: body.trim() || null, color, position: (query.data ?? []).length } });
    }
    setTitle(""); setBody(""); setColor(null); setEditing(null); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); refresh();
  };
  React.useEffect(() => setSection(sections[0]), [domain]);
  const items = query.data ?? [];
  return <PageShell title={domain === "routine" ? "Routine" : "Goals"} subtitle={domain === "goals" ? `${Math.max(0, Math.ceil((new Date(new Date().getFullYear(), 11, 31).getTime() - Date.now()) / 86400000))} days left this year.` : "Simple rhythms, kept in one place."} refreshing={query.isFetching} onRefresh={refresh}>
    <View style={styles.segmented}>{(["routine", "goals"] as NotebookDomain[]).map((value) => <Pressable key={value} onPress={() => setDomain(value)} style={[styles.segment, { borderColor: colors.border }, domain === value && { backgroundColor: colors.primary, borderColor: colors.primary }]}><Text style={{ color: domain === value ? colors.primaryForeground : colors.mutedForeground, fontWeight: "700" }}>{value === "routine" ? "Routine" : "Goals"}</Text></Pressable>)}</View>
    <View style={[styles.composer, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontal}>
        {sections.map((item) => <Pressable key={item} onPress={() => setSection(item)} style={[styles.filter, { borderColor: colors.border }, section === item && { backgroundColor: colors.accent }]}><Text style={{ color: colors.foreground, fontWeight: "700" }}>{item}</Text></Pressable>)}
      </ScrollView>
      <TextInput value={title} onChangeText={setTitle} style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} placeholder="Add an intention" placeholderTextColor={colors.mutedForeground} />
      <TextInput value={body} onChangeText={setBody} style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} placeholder={domain === "routine" ? "A helpful note (optional)" : "Why this matters (optional)"} placeholderTextColor={colors.mutedForeground} />
      <View style={styles.composerFooter}><ColorPicker value={color} onChange={setColor} /><View style={styles.rowEnd}>{editing ? <Pressable onPress={() => { setEditing(null); setTitle(""); setBody(""); setColor(null); }}><Text style={[styles.textButton, { color: colors.mutedForeground }]}>Cancel</Text></Pressable> : null}<Pressable style={[styles.saveButton, { backgroundColor: colors.primary }]} onPress={save}><Text style={{ color: colors.primaryForeground, fontWeight: "700" }}>{editing ? "Update" : "Add"}</Text></Pressable></View></View>
    </View>
    <LoadingOrError loading={query.isLoading} error={query.error} onRetry={refresh} />
    {sections.map((group) => <PlanSection key={group} title={group} items={items.filter((item) => item.section === group)} onEdit={(item) => { setEditing(item); setSection(item.section ?? group); setTitle(item.title ?? ""); setBody(item.body ?? ""); setColor((item.color as Color | null) ?? null); }} onSwap={async (first, second) => { await Promise.all([update.mutateAsync({ id: first.id, data: { position: second.position } }), update.mutateAsync({ id: second.id, data: { position: first.position } })]); refresh(); }} onDelete={async (id) => { await remove.mutateAsync({ id }); refresh(); }} />)}
  </PageShell>;
}

function PlanSection({ title, items, onEdit, onSwap, onDelete }: { title: string; items: NotebookItem[]; onEdit: (item: NotebookItem) => void; onSwap: (first: NotebookItem, second: NotebookItem) => Promise<void>; onDelete: (id: number) => Promise<void> }) {
  const colors = useColors();
  return <View style={styles.section}><Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>{title}</Text>{items.length === 0 ? <View style={[styles.empty, { borderColor: colors.border }]}><Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Nothing added yet.</Text></View> : items.map((item, index) => <View key={item.id} style={[styles.taskCard, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={[styles.planMarker, { backgroundColor: item.color === "red" ? "#f87171" : item.color === "grey" ? "#9ca3af" : "#ffb997" }]} /><Pressable onPress={() => onEdit(item)} style={styles.taskContent}><Text style={[styles.taskTitle, { color: colors.foreground }]}>{item.title}</Text>{item.body ? <Text style={[styles.helper, { color: colors.mutedForeground }]}>{item.body}</Text> : null}</Pressable><View style={styles.taskActions}><Pressable onPress={() => index > 0 && onSwap(item, items[index - 1])}><Feather name="chevron-up" size={17} color={colors.mutedForeground} /></Pressable><Pressable onPress={() => index < items.length - 1 && onSwap(item, items[index + 1])}><Feather name="chevron-down" size={17} color={colors.mutedForeground} /></Pressable><Pressable onPress={() => onDelete(item.id)}><Feather name="trash-2" size={15} color={colors.destructive} /></Pressable></View></View>)}</View>;
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  pageContent: { paddingTop: 90, paddingHorizontal: 20, paddingBottom: 110, gap: 16 },
  eyebrow: { fontSize: 11, fontWeight: "700", letterSpacing: 1.4, textTransform: "uppercase" },
  pageTitle: { fontFamily: "Fraunces_700Bold", fontSize: 38, lineHeight: 42, letterSpacing: -1 },
  subtitle: { fontSize: 15, lineHeight: 22, marginTop: -8 },
  composer: { borderWidth: 1, borderRadius: 18, padding: 14, gap: 10, marginTop: 4 },
  input: { borderWidth: 1, borderRadius: 12, minHeight: 46, paddingHorizontal: 13, fontSize: 16, fontFamily: "DMSans_400Regular" },
  dateInput: { borderWidth: 1, borderRadius: 12, minHeight: 38, paddingHorizontal: 12, fontSize: 14, fontWeight: "700", alignSelf: "flex-start" },
  bodyInput: { borderWidth: 1, borderRadius: 12, minHeight: 122, paddingHorizontal: 13, paddingTop: 12, fontSize: 16, lineHeight: 23, fontFamily: "DMSans_400Regular" },
  composerFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  colorRow: { flexDirection: "row", gap: 10, paddingVertical: 4 },
  colorDot: { width: 21, height: 21, borderRadius: 12, borderWidth: 2 },
  roundButton: { width: 38, height: 38, borderRadius: 19, justifyContent: "center", alignItems: "center" },
  saveButton: { paddingHorizontal: 18, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  helper: { fontSize: 13, lineHeight: 19 },
  filterRow: { flexDirection: "row", gap: 7, flexWrap: "wrap" },
  filter: { borderWidth: 1, minHeight: 32, paddingHorizontal: 11, borderRadius: 16, justifyContent: "center" },
  segmented: { flexDirection: "row", gap: 8 },
  segment: { flex: 1, borderWidth: 1, borderRadius: 11, alignItems: "center", paddingVertical: 10 },
  horizontal: { gap: 7, paddingBottom: 2 },
  section: { gap: 8, marginTop: 6 },
  sectionTitle: { fontSize: 11, letterSpacing: 1.1, textTransform: "uppercase", fontWeight: "800" },
  taskCard: { borderWidth: 1, borderRadius: 15, minHeight: 58, flexDirection: "row", alignItems: "center", paddingHorizontal: 12, gap: 10 },
  check: { width: 25, height: 25, borderRadius: 13, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  taskContent: { flex: 1, gap: 4 },
  taskTitle: { fontSize: 16, fontWeight: "600", fontFamily: "DMSans_500Medium" },
  inlineInput: { borderBottomWidth: 1, fontSize: 16, minHeight: 34, fontFamily: "DMSans_500Medium" },
  strike: { textDecorationLine: "line-through", opacity: 0.5 },
  taskActions: { flexDirection: "row", alignItems: "center", gap: 9 },
  tag: { width: 9, height: 9, borderRadius: 5 },
  planMarker: { width: 9, height: 36, borderRadius: 5 },
  empty: { borderWidth: 1, borderStyle: "dashed", minHeight: 86, borderRadius: 15, justifyContent: "center", alignItems: "center", gap: 7, padding: 14 },
  emptyText: { fontSize: 14, textAlign: "center" },
  loader: { marginVertical: 28 },
  diaryCard: { borderWidth: 1, borderRadius: 15, padding: 14, gap: 7 },
  dateLabel: { fontSize: 12, fontWeight: "800", letterSpacing: 0.6, textTransform: "uppercase" },
  diaryTitle: { fontSize: 18, fontWeight: "700", fontFamily: "Fraunces_700Bold" },
  diaryBody: { fontSize: 15, lineHeight: 23, fontFamily: "DMSans_400Regular" },
  rowEnd: { flexDirection: "row", justifyContent: "flex-end", gap: 16, marginTop: 2 },
  textButton: { fontSize: 14, fontWeight: "700" },
});