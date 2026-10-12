import React, { useContext, useEffect, useMemo, useState } from 'react';
import { Slot, usePathname, useRouter } from 'expo-router';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import * as Updates from 'expo-updates';
import { Checkpoint, RoadmapState, calendarICS, completed, formatDate, freshState, phases, progress, safeUrl, stats, status, todayISO, validBackup } from './src/model';

const STORAGE_KEY = 'altitude-roadmap-v1';
const C = { bg: '#faf6f3', card: '#ffffff', ink: '#292726', muted: '#817b77', line: '#eee8e3', navy: '#55301e', lime: '#ffe3ca', teal: '#a54d19', orange: '#bb5c1b', blue: '#7c5846' };
export type Screen = 'overview' | 'roadmap' | 'calendar' | 'insights';
const ScreenContext = React.createContext<(screen: Screen) => React.ReactNode>(() => null);
export function RouteScreen({ screen }: { screen: Screen }) { const render = useContext(ScreenContext); return <>{render(screen)}</>; }
const tabs: { key: Screen; label: string }[] = [
  { key: 'overview', label: 'Home' }, { key: 'roadmap', label: 'Roadmap' },
  { key: 'calendar', label: 'Calendar' }, { key: 'insights', label: 'Insights' },
];
const types = ['course', 'project', 'certification', 'practice'];
const typeIcon: Record<string, string> = { course: '▤', project: '◇', certification: '✦', practice: '◈' };
const emptyEditor = (): Checkpoint => ({ id: '', phase: 'fundamentals', type: 'course', title: '', start: '', end: '', url: '', tasks: [], description: '', notes: '', createdAt: '' });
const dateValid = (value: string) => {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T12:00:00');
  return !Number.isNaN(date.getTime()) && date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0') === value;
};

Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }) });

function Button({ children, onPress, secondary, danger }: { children: React.ReactNode; onPress: () => void; secondary?: boolean; danger?: boolean }) {
  return <Pressable onPress={onPress} style={({ pressed }) => [s.button, secondary && s.buttonSecondary, danger && s.buttonDanger, pressed && { opacity: .7 }]}><Text style={[s.buttonText, (secondary || danger) && { color: danger ? '#a33d32' : C.ink }]}>{children}</Text></Pressable>;
}
function Panel({ children }: { children: React.ReactNode }) { return <View style={s.panel}>{children}</View>; }
function Bar({ value }: { value: number }) { return <View style={s.bar}><View style={[s.barFill, { width: (String(Math.round(value * 100)) + '%') as any }]} /></View>; }
function Metric({ label, value, foot }: { label: string; value: string | number; foot: string }) {
  return <View style={s.metric}><Text style={s.muted}>{label}</Text><Text style={s.metricValue}>{value}</Text><Text style={s.small}>{foot}</Text></View>;
}

export default function App() {
  const router = useRouter();
  const pathname = usePathname();
  const screen: Screen = pathname === '/roadmap' ? 'roadmap' : pathname === '/calendar' ? 'calendar' : pathname === '/insights' ? 'insights' : 'overview';
  const [ready, setReady] = useState(false);
  const [storageAvailable, setStorageAvailable] = useState(true);
  const [state, setState] = useState<RoadmapState>(freshState);
  const [editor, setEditor] = useState<Checkpoint | null>(null);
  const [taskLines, setTaskLines] = useState('');
  const [dataOpen, setDataOpen] = useState(false);
  const [editorDetailsOpen, setEditorDetailsOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [insightsMoreOpen, setInsightsMoreOpen] = useState(false);
  const [expandedPhase, setExpandedPhase] = useState<string | null>(phases[0]?.id ?? null);
  const [expandedCheckpoint, setExpandedCheckpoint] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const summary = useMemo(() => stats(state.items), [state.items]);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(raw => {
      if (raw) { try { const parsed = JSON.parse(raw); if (validBackup(parsed)) setState({ items: parsed.items, settings: { reminders: !!parsed.settings?.reminders } }); } catch {} }
    }).catch(() => { setStorageAvailable(false); Alert.alert('Storage unavailable', 'Progress could not be loaded. You can still export a backup.'); }).finally(() => setReady(true));
  }, []);
  useEffect(() => { if (ready && storageAvailable) AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => { setStorageAvailable(false); Alert.alert('Could not save', 'Export a backup of your progress.'); }); }, [state, ready, storageAvailable]);
  useEffect(() => { if (ready && state.settings.reminders) void scheduleReminders(state.items); }, [state, ready]);

  const go = (next: Screen) => { router.replace((next === 'overview' ? '/' : '/' + next) as any); void Haptics.selectionAsync(); };
  const showCheckpoint = (item: Checkpoint) => { setExpandedPhase(item.phase); setExpandedCheckpoint(item.id); go('roadmap'); };
  const toggleTask = (itemId: string, taskId: string) => {
    setState(old => ({ ...old, items: old.items.map(x => x.id === itemId ? { ...x, tasks: x.tasks.map(t => t.id === taskId ? { ...t, done: !t.done } : t) } : x) }));
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };
  const openEditor = (item?: Checkpoint) => { const draft = item ? JSON.parse(JSON.stringify(item)) as Checkpoint : emptyEditor(); setTaskLines(draft.tasks.map(t => t.text).join('\n')); setEditorDetailsOpen(false); setEditor(draft); };
  const changeEditor = (patch: Partial<Checkpoint>) => setEditor(old => old ? { ...old, ...patch } : null);
  const saveEditor = () => {
    if (!editor) return;
    if (!editor.title.trim()) return Alert.alert('Add a title');
    if (!dateValid(editor.start) || !dateValid(editor.end)) return Alert.alert('Check the dates', 'Use YYYY-MM-DD, for example 2027-01-15.');
    if (editor.start && editor.end && editor.end < editor.start) return Alert.alert('Check the deadline', 'It must be on or after the start date.');
    if (editor.url.trim() && !safeUrl(editor.url)) return Alert.alert('Check the link', 'Use a complete http:// or https:// URL.');
    const old = state.items.find(x => x.id === editor.id);
    const id = old?.id || 'custom-' + Date.now();
    const used = new Set<string>();
    const tasks = taskLines.split('\n').map(x => x.trim()).filter(Boolean).map((text, i) => {
      const match = old?.tasks.find((t, j) => !used.has(t.id) && t.text === text && j === i) || old?.tasks.find(t => !used.has(t.id) && t.text === text);
      if (match) used.add(match.id);
      return { id: match?.id || id + '-' + Date.now() + '-' + i, text, done: match?.done || false };
    });
    const item: Checkpoint = { ...editor, id, title: editor.title.trim(), url: safeUrl(editor.url), notes: editor.notes.trim(), tasks, createdAt: old?.createdAt || new Date().toISOString() };
    setState(current => ({ ...current, items: old ? current.items.map(x => x.id === id ? item : x) : [...current.items, item] }));
    setEditor(null);
  };
  const deleteEditor = () => {
    if (!editor?.id) return;
    Alert.alert('Delete checkpoint?', 'Its notes and progress will also be removed.', [
      { text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => { setState(old => ({ ...old, items: old.items.filter(x => x.id !== editor.id) })); setEditor(null); } },
    ]);
  };
  const shareText = async (name: string, mimeType: string, content: string) => {
    const uri = FileSystem.cacheDirectory + name;
    await FileSystem.writeAsStringAsync(uri, content);
    if (!await Sharing.isAvailableAsync()) throw new Error('Sharing is unavailable');
    await Sharing.shareAsync(uri, { mimeType, dialogTitle: name });
  };
  const exportBackup = async () => {
    try { await shareText('altitude-roadmap-backup.json', 'application/json', JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), ...state }, null, 2)); }
    catch (error) { Alert.alert('Export failed', String(error)); }
  };
  const exportCalendar = async () => {
    try { await shareText('altitude-deadlines.ics', 'text/calendar', calendarICS(state.items)); }
    catch (error) { Alert.alert('Calendar export failed', String(error)); }
  };
  const importBackup = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (result.canceled) return;
      const parsed = JSON.parse(await FileSystem.readAsStringAsync(result.assets[0].uri));
      if (!validBackup(parsed)) throw new Error('This is not an Altitude backup.');
      Alert.alert('Replace current progress?', 'The imported backup will replace all checkpoints and notes.', [
        { text: 'Cancel', style: 'cancel' }, { text: 'Import', onPress: () => { setState({ items: parsed.items, settings: { reminders: !!parsed.settings?.reminders } }); setDataOpen(false); } },
      ]);
    } catch (error) { Alert.alert('Import failed', String(error)); }
  };
  const reset = () => Alert.alert('Reset roadmap?', 'All progress, notes, and custom checkpoints will be removed.', [
    { text: 'Cancel', style: 'cancel' }, { text: 'Reset', style: 'destructive', onPress: () => { setState(freshState()); setDataOpen(false); } },
  ]);
  const toggleReminders = async () => {
    if (state.settings.reminders) { setState(old => ({ ...old, settings: { reminders: false } })); await Notifications.cancelAllScheduledNotificationsAsync(); return; }
    try {
      if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('deadlines', { name: 'Deadline reminders', importance: Notifications.AndroidImportance.DEFAULT });
      const permission = await Notifications.requestPermissionsAsync();
      if (!permission.granted) return Alert.alert('Notifications disabled', 'Allow notifications in Android settings.');
      setState(old => ({ ...old, settings: { reminders: true } }));
    } catch (error) { Alert.alert('Reminders unavailable', String(error)); }
  };
  const checkForAppUpdate = async () => {
    try {
      const result = await Updates.checkForUpdateAsync();
      if (!result.isAvailable) return Alert.alert('Already up to date', 'You have the latest Altitude interface.');
      await Updates.fetchUpdateAsync();
      Alert.alert('Update ready', 'Restart Altitude to apply the new interface.', [
        { text: 'Later', style: 'cancel' }, { text: 'Restart now', onPress: () => void Updates.reloadAsync() },
      ]);
    } catch { Alert.alert('Could not check for updates', 'Check your internet connection and try again.'); }
  };
  const checkpointCard = (x: Checkpoint) => {
    const result = status(x), done = x.tasks.filter(t => t.done).length, expanded = expandedCheckpoint === x.id;
    return <Panel key={x.id}>
      <Pressable onPress={() => setExpandedCheckpoint(expanded ? null : x.id)} accessibilityRole="button" accessibilityState={{ expanded }} accessibilityLabel={`${x.title}, ${done} of ${x.tasks.length} tasks, ${expanded ? 'hide' : 'show'} details`} style={s.cardSummary}>
        <View style={{ flex: 1 }}><Text style={s.cardTitle}>{x.title}</Text><Text style={s.small}>{x.type} · {x.end ? `Due ${formatDate(x.end)}` : 'No deadline'}</Text></View><Text style={s.expandMark}>{expanded ? '−' : '+'}</Text>
      </Pressable>
      <View style={s.cardProgress}><Bar value={progress(x)} /><View style={s.cardMeta}><Text style={[s.statusText, result === 'overdue' && s.overdueText]}>{result === 'done' ? 'Completed' : result === 'overdue' ? 'Overdue' : result === 'in-progress' ? 'In progress' : 'Upcoming'}</Text><Text style={s.small}>{done}/{x.tasks.length} tasks</Text></View></View>
      {expanded && <View style={s.cardDetails}>
        {!!x.description && <Text style={s.muted}>{x.description}</Text>}
        {!!x.start && <Text style={s.detailLabel}>Started {formatDate(x.start)}</Text>}
        {x.tasks.length ? x.tasks.map(t => <Pressable key={t.id} onPress={() => toggleTask(x.id, t.id)} accessibilityRole="checkbox" accessibilityState={{ checked: t.done }} style={s.taskRow}><View style={[s.checkbox, t.done && s.checked]}>{t.done && <Text style={{ color: '#fff' }}>✓</Text>}</View><Text style={[s.taskText, t.done && s.strike]}>{t.text}</Text></Pressable>) : <Text style={s.small}>No tasks yet. Add them by editing this checkpoint.</Text>}
        {!!x.notes && <Text style={s.notes}>✎ {x.notes}</Text>}
        <View style={s.detailActions}><Pressable onPress={() => openEditor(x)} accessibilityRole="button" style={s.actionButton}><Text style={s.link}>Edit checkpoint</Text></Pressable>{!!safeUrl(x.url) && <Pressable onPress={() => Linking.openURL(x.url).catch(() => Alert.alert('Could not open link'))} accessibilityRole="link" style={s.actionButton}><Text style={s.link}>Open resource ↗</Text></Pressable>}</View>
      </View>}
    </Panel>;
  };
  const overview = () => {
    const unfinished = state.items.filter(x => !completed(x)).sort((a, b) => (a.end || '9999').localeCompare(b.end || '9999'));
    const queue = unfinished.flatMap(item => { const task = item.tasks.find(t => !t.done); return task ? [{ item, task }] : []; }).slice(0, 4);
    const now = new Date(), monday = new Date(now); monday.setDate(now.getDate() - (now.getDay() + 6) % 7);
    const week = Array.from({ length: 7 }, (_, i) => { const day = new Date(monday); day.setDate(monday.getDate() + i); return day; });
    return <>
      <View style={s.weekStrip}>{week.map(day => { const selected = day.toDateString() === now.toDateString(); return <Pressable key={day.toDateString()} onPress={() => { setMonth(new Date(day.getFullYear(), day.getMonth(), 1)); go('calendar'); }} accessibilityRole="button" accessibilityLabel={`Open calendar for ${day.toDateString()}`} style={s.weekDay}><Text style={[s.weekLabel, selected && s.weekLabelSelected]}>{day.toLocaleDateString('en-US', { weekday: 'short' })}</Text><View style={[s.weekCircle, selected && s.weekCircleSelected]}><Text style={[s.weekNumber, selected && s.weekNumberSelected]}>{day.getDate()}</Text></View></Pressable>; })}</View>
      <View style={s.reminderCard}><View style={{ flex: 1 }}><Text style={s.reminderTitle}>{state.settings.reminders ? 'Stay on your path' : 'Set a reminder'}</Text><Text style={s.reminderBody}>{state.settings.reminders ? 'We will remind you before upcoming deadlines.' : 'A gentle nudge before a deadline can keep your plan moving.'}</Text><Pressable onPress={() => void toggleReminders()} accessibilityRole="button" style={s.reminderButton}><Text style={s.reminderButtonText}>{state.settings.reminders ? 'Reminders on' : 'Set now'}</Text></Pressable></View><View style={s.bellWrap}><View style={s.bellTop} /><View style={s.bellBody} /><View style={s.bellRim} /><View style={s.bellClapper} /></View></View>
      <View style={s.sectionHead}><View><Text style={s.sectionTitle}>Today’s focus</Text><Text style={s.small}>Small steps on your roadmap</Text></View><Pressable onPress={() => go('roadmap')} accessibilityRole="button"><Text style={s.seeAll}>See all</Text></Pressable></View>
      {queue.length ? <View style={s.focusList}>{queue.map(({ item, task }, i) => <View key={task.id} style={s.focusRow}><Pressable onPress={() => toggleTask(item.id, task.id)} accessibilityRole="checkbox" accessibilityState={{ checked: false }} accessibilityLabel={`Complete ${task.text}`} style={s.focusCheck}><Text style={s.focusCheckText}>○</Text></Pressable><Pressable onPress={() => showCheckpoint(item)} accessibilityRole="button" style={s.focusRowContent}><View style={[s.focusGlyph, { backgroundColor: ['#fce1cb', '#e9edc5', '#f5dcdf', '#e1e6ee'][i % 4] }]}><Text style={s.focusGlyphText}>{typeIcon[item.type] || '✦'}</Text></View><View style={{ flex: 1 }}><Text style={s.focusRowTitle} numberOfLines={2}>{task.text}</Text><Text style={s.focusRowSubtitle} numberOfLines={1}>{item.title}</Text></View><Text style={s.focusChevron}>›</Text></Pressable></View>)}</View> : <Panel><Text style={s.muted}>{unfinished.length ? 'Add tasks to a checkpoint to see them here.' : 'All clear. Add a checkpoint to keep going.'}</Text></Panel>}
      <View style={s.progressStrip}><View style={{ flex: 1 }}><Text style={s.progressLabel}>Your journey</Text><Text style={s.progressValue}>{summary.done} of {summary.total} checkpoints complete</Text></View><Text style={s.progressPercent}>{summary.percent}%</Text></View><Bar value={summary.percent / 100} />
    </>;
  };
  const roadmap = () => {
    const q = search.trim().toLowerCase();
    const visible = state.items.filter(x => (filter === 'all' || status(x) === filter) && (typeFilter === 'all' || x.type === typeFilter) && (!q || (x.title + ' ' + x.description + ' ' + x.tasks.map(t => t.text).join(' ')).toLowerCase().includes(q)));
    return <><View style={s.pageHead}><View style={{ flex: 1 }}><Text style={s.eyebrow}>THE FULL PATH</Text><Text style={s.title}>Roadmap</Text><Text style={s.muted}>{visible.length} checkpoints across {phases.length} phases</Text></View><Pressable onPress={() => openEditor()} accessibilityRole="button" accessibilityLabel="Add checkpoint" style={s.addButton}><Text style={s.addButtonText}>＋</Text></Pressable></View>
      <TextInput value={search} onChangeText={setSearch} placeholder="Search checkpoints" placeholderTextColor={C.muted} style={s.input} />
      <Pressable onPress={() => setFiltersOpen(!filtersOpen)} accessibilityRole="button" accessibilityState={{ expanded: filtersOpen }} style={s.filterToggle}><Text style={s.link}>{filtersOpen ? 'Hide filters' : 'Filter by status or type'}{filter !== 'all' || typeFilter !== 'all' ? ' · Active' : ''}</Text><Text style={s.link}>{filtersOpen ? '−' : '+'}</Text></Pressable>
      {filtersOpen && <View style={s.filterPanel}><Text style={s.filterLabel}>STATUS</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={s.filters}>{['all', 'upcoming', 'in-progress', 'overdue', 'done'].map(f => <Pressable key={f} onPress={() => setFilter(f)} style={[s.chip, filter === f && s.chipActive]}><Text style={[s.chipText, filter === f && s.chipTextActive]}>{f === 'all' ? 'All' : f === 'done' ? 'Completed' : f.replace('-', ' ')}</Text></Pressable>)}</ScrollView><Text style={s.filterLabel}>TYPE</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={s.filters}>{['all', ...types].map(t => <Pressable key={t} onPress={() => setTypeFilter(t)} style={[s.chip, typeFilter === t && s.chipActive]}><Text style={[s.chipText, typeFilter === t && s.chipTextActive]}>{t === 'all' ? 'All' : t}</Text></Pressable>)}</ScrollView></View>}
      {phases.map((p, i) => { const items = visible.filter(x => x.phase === p.id).sort((a, b) => (a.start || '').localeCompare(b.start || '')); const all = state.items.filter(x => x.phase === p.id); const open = expandedPhase === p.id; return items.length ? <View key={p.id} style={s.phaseSection}><Pressable onPress={() => setExpandedPhase(open ? null : p.id)} accessibilityRole="button" accessibilityState={{ expanded: open }} style={s.phaseHeading}><Text style={s.phaseNumber}>{String(i + 1).padStart(2, '0')}</Text><View style={{ flex: 1 }}><Text style={s.phaseName}>{p.name}</Text><Text style={s.small}>{all.filter(completed).length} of {all.length} complete · {items.length} shown</Text></View><Text style={s.expandMark}>{open ? '−' : '+'}</Text></Pressable>{open && items.map(checkpointCard)}</View> : null; })}
      {!visible.length && <Panel><Text style={s.muted}>No checkpoints found. Try another search or filter.</Text></Panel>}
    </>;
  };
  const calendar = () => {
    const year = month.getFullYear(), mon = month.getMonth(), offset = new Date(year, mon, 1).getDay(), days = new Date(year, mon + 1, 0).getDate();
    const monthKey = year + '-' + String(mon + 1).padStart(2, '0');
    const deadlines = state.items.filter(x => x.end?.startsWith(monthKey)).sort((a, b) => a.end.localeCompare(b.end));
    const cells = Array.from({ length: Math.ceil((offset + days) / 7) * 7 }, (_, i) => i - offset + 1);
    return <><Text style={s.eyebrow}>DATES & DEADLINES</Text><Text style={s.title}>Calendar</Text><Text style={s.muted}>See commitments and export them to your calendar.</Text><View style={s.topButton}><Button onPress={() => void exportCalendar()} secondary>↓ Export .ics</Button></View>
      <Panel><View style={s.calendarHead}><Pressable onPress={() => setMonth(new Date(year, mon - 1, 1))}><Text style={s.arrow}>‹</Text></Pressable><Pressable onPress={() => { const d = new Date(); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); }}><Text style={s.calendarTitle}>{month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</Text></Pressable><Pressable onPress={() => setMonth(new Date(year, mon + 1, 1))}><Text style={s.arrow}>›</Text></Pressable></View><View style={s.calendarGrid}>{['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <Text key={i} style={s.weekday}>{d}</Text>)}{cells.map((d, i) => { const iso = monthKey + '-' + String(d).padStart(2, '0'), events = d > 0 && d <= days ? deadlines.filter(x => x.end === iso) : []; return <Pressable key={i} onPress={() => events.length && openEditor(events[0])} style={[s.day, iso === todayISO() && s.today]}><Text style={[s.dayText, (d < 1 || d > days) && { color: 'transparent' }]}>{d > 0 && d <= days ? d : '0'}</Text>{events.length > 0 && <View style={s.eventDot} />}{events.length > 1 && <Text style={s.eventCount}>{events.length}</Text>}</Pressable>; })}</View></Panel>
      <Text style={s.sectionTitle}>Deadlines this month</Text><Text style={s.small}>{deadlines.length} checkpoints</Text><Panel>{deadlines.length ? deadlines.map(x => <Pressable key={x.id} onPress={() => openEditor(x)} style={s.listRow}><View style={{ flex: 1 }}><Text style={s.listTitle}>{x.title}</Text><Text style={s.small}>{formatDate(x.end, { weekday: 'short', month: 'short', day: 'numeric' })} · {x.type} · {status(x).replace('-', ' ')}</Text></View><Text style={s.link}>→</Text></Pressable>) : <Text style={s.muted}>No deadlines here. Use the arrows to explore your plan.</Text>}</Panel>
    </>;
  };
  const insights = () => <><Text style={s.eyebrow}>YOUR MOMENTUM</Text><Text style={s.title}>Insights</Text><Text style={s.muted}>What is moving and what needs attention.</Text><View style={s.metricGrid}><Metric label="Overall progress" value={String(summary.percent) + '%'} foot="Completed checkpoints" /><Metric label="Tasks finished" value={summary.tasksDone} foot="Checklist items" /><Metric label="Projects" value={String(state.items.filter(x => x.type === 'project' && completed(x)).length) + '/' + summary.projects} foot="Build milestones" /><Metric label="Overdue" value={summary.overdue} foot="Review or reschedule" /></View>
    <Text style={s.sectionTitle}>Progress by phase</Text><Panel>{phases.map(p => { const items = state.items.filter(x => x.phase === p.id), pct = items.length ? items.filter(completed).length / items.length : 0; return <View key={p.id} style={s.insightRow}><Text style={s.listTitle}>{p.name}</Text><Bar value={pct} /><Text style={s.small}>{Math.round(pct * 100)}%</Text></View>; })}</Panel>
    <Pressable onPress={() => setInsightsMoreOpen(!insightsMoreOpen)} accessibilityRole="button" accessibilityState={{ expanded: insightsMoreOpen }} style={s.filterToggle}><Text style={s.link}>{insightsMoreOpen ? 'Hide more insights' : 'More insights'}</Text><Text style={s.link}>{insightsMoreOpen ? '−' : '+'}</Text></Pressable>
    {insightsMoreOpen && <><Text style={s.sectionTitle}>Checkpoint mix</Text><Panel>{types.map(t => <View key={t} style={s.listRow}><Text style={[s.listTitle, { flex: 1 }]}>{t[0].toUpperCase() + t.slice(1)}</Text><Text style={s.listTitle}>{state.items.filter(x => x.type === t).length}</Text></View>)}</Panel>
    <Text style={s.sectionTitle}>What this builds toward</Text><Panel>{[['01', 'A working API', 'FastAPI + PostgreSQL'], ['02', 'A deployed system', 'Docker + Actions + ECS + RDS'], ['03', 'A cloud native AI app', 'Terraform + monitoring + Bedrock RAG']].map(row => <View key={row[0]} style={s.listRow}><Text style={s.phaseNumber}>{row[0]}</Text><View><Text style={s.listTitle}>{row[1]}</Text><Text style={s.small}>{row[2]}</Text></View></View>)}</Panel></>}
  </>;

  const renderScreen = (selected: Screen) => !ready ? <View style={s.loading}><ActivityIndicator color={C.navy} /><Text style={s.muted}>Loading your roadmap…</Text></View> : selected === 'overview' ? overview() : selected === 'roadmap' ? roadmap() : selected === 'calendar' ? calendar() : insights();
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  return <ScreenContext.Provider value={renderScreen}><SafeAreaProvider><SafeAreaView style={s.safe}><StatusBar style="dark" /><View style={[s.header, screen === 'overview' && s.homeHeader]}>{screen === 'overview' ? <View style={{ flex: 1 }}><Text style={s.greeting}>{greeting}</Text><Text style={s.headerDate}>{new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' })}</Text></View> : <><View style={s.brandMark}><Text style={s.brandArrow}>↗</Text></View><View style={{ flex: 1 }}><Text style={s.brand}>Altitude</Text></View></>}<Pressable accessibilityLabel="Settings and backup" onPress={() => setDataOpen(true)} style={[s.headerButton, screen === 'overview' && s.avatarButton]}><Text style={s.headerButtonText}>{screen === 'overview' ? '↗' : '⋯'}</Text></Pressable></View>
    <ScrollView key={screen} style={{ flex: 1 }} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled"><Slot /></ScrollView>
    {screen === 'overview' && <Pressable onPress={() => openEditor()} accessibilityRole="button" accessibilityLabel="Add checkpoint" style={s.fab}><Text style={s.fabText}>＋</Text></Pressable>}
    <View style={s.tabBar}>{tabs.map(t => <Pressable key={t.key} onPress={() => go(t.key)} style={[s.tab, screen === t.key && s.tabActive]} accessibilityRole="tab" accessibilityState={{ selected: screen === t.key }}><Text style={[s.tabText, screen === t.key && s.tabActiveText]}>{t.label}</Text></Pressable>)}</View>
    <Modal visible={!!editor} animationType="slide" onRequestClose={() => setEditor(null)}><SafeAreaView style={s.modalSafe}><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}><ScrollView contentContainerStyle={s.modalContent} keyboardShouldPersistTaps="handled"><View style={s.modalHeader}><View><Text style={s.eyebrow}>YOUR JOURNEY</Text><Text style={s.title}>{editor?.id ? 'Edit checkpoint' : 'New checkpoint'}</Text></View><Pressable onPress={() => setEditor(null)}><Text style={s.close}>×</Text></Pressable></View>
      <Text style={s.label}>Title</Text><TextInput value={editor?.title || ''} onChangeText={title => changeEditor({ title })} maxLength={100} placeholder="What will you complete?" style={s.input} />
      <Text style={s.label}>Type</Text><View style={s.choices}>{types.map(t => <Pressable key={t} onPress={() => changeEditor({ type: t })} style={[s.chip, editor?.type === t && s.chipActive]}><Text style={[s.chipText, editor?.type === t && s.chipTextActive]}>{t}</Text></Pressable>)}</View>
      <Text style={s.label}>Phase</Text><View style={s.choices}>{phases.map(p => <Pressable key={p.id} onPress={() => changeEditor({ phase: p.id })} style={[s.chip, editor?.phase === p.id && s.chipActive]}><Text style={[s.chipText, editor?.phase === p.id && s.chipTextActive]}>{p.name}</Text></Pressable>)}</View>
      <Text style={s.label}>Checklist items · one per line</Text><TextInput value={taskLines} onChangeText={setTaskLines} multiline textAlignVertical="top" placeholder={'Watch core modules\nComplete hands-on exercise'} style={[s.input, s.textarea]} />
      <Pressable onPress={() => setEditorDetailsOpen(!editorDetailsOpen)} accessibilityRole="button" accessibilityState={{ expanded: editorDetailsOpen }} style={s.filterToggle}><Text style={s.link}>Dates, resource link & notes</Text><Text style={s.link}>{editorDetailsOpen ? '−' : '+'}</Text></Pressable>
      {editorDetailsOpen && <View><Text style={s.label}>Start date · YYYY-MM-DD</Text><TextInput value={editor?.start || ''} onChangeText={start => changeEditor({ start })} placeholder="2027-01-15" keyboardType="numbers-and-punctuation" style={s.input} />
      <Text style={s.label}>Deadline · YYYY-MM-DD</Text><TextInput value={editor?.end || ''} onChangeText={end => changeEditor({ end })} placeholder="2027-02-15" keyboardType="numbers-and-punctuation" style={s.input} />
      <Text style={s.label}>Resource URL</Text><TextInput value={editor?.url || ''} onChangeText={url => changeEditor({ url })} placeholder="https://..." autoCapitalize="none" keyboardType="url" style={s.input} />
      <Text style={s.label}>Notes / remarks</Text><TextInput value={editor?.notes || ''} onChangeText={notes => changeEditor({ notes })} multiline textAlignVertical="top" placeholder="Your plan, blockers, or reflections" style={[s.input, s.textarea]} /></View>}
      <Button onPress={saveEditor}>Save checkpoint</Button><Button onPress={() => setEditor(null)} secondary>Cancel</Button>{!!editor?.id && <Button onPress={deleteEditor} danger>Delete checkpoint</Button>}
    </ScrollView></KeyboardAvoidingView></SafeAreaView></Modal>
    <Modal visible={dataOpen} transparent animationType="fade" onRequestClose={() => setDataOpen(false)}><View style={s.scrim}><View style={s.sheet}><View style={s.modalHeader}><View><Text style={s.eyebrow}>PREFERENCES & DATA</Text><Text style={s.sheetTitle}>Settings</Text></View><Pressable onPress={() => setDataOpen(false)}><Text style={s.close}>×</Text></Pressable></View><Pressable onPress={() => void toggleReminders()} accessibilityRole="switch" accessibilityState={{ checked: state.settings.reminders }} style={s.settingRow}><View style={{ flex: 1 }}><Text style={s.listTitle}>Deadline reminders</Text><Text style={s.small}>Notify me before upcoming deadlines</Text></View><Text style={s.link}>{state.settings.reminders ? 'On' : 'Off'}</Text></Pressable>{Updates.isEnabled && <Pressable onPress={() => void checkForAppUpdate()} accessibilityRole="button" style={s.settingRow}><View style={{ flex: 1 }}><Text style={s.listTitle}>App updates</Text><Text style={s.small}>Check for a new interface</Text></View><Text style={s.link}>Check →</Text></Pressable>}<Text style={s.sectionTitle}>Your data</Text><Text style={s.muted}>Progress stays on this phone. Export a backup to keep a copy or move to another device.</Text><View style={{ height: 15 }} /><Button onPress={() => void exportBackup()}>↓ Export backup</Button><Button onPress={() => void importBackup()} secondary>↑ Import backup</Button><Button onPress={reset} danger>Reset to starter roadmap</Button></View></View></Modal>
  </SafeAreaView></SafeAreaProvider></ScreenContext.Provider>;
}

async function scheduleReminders(items: Checkpoint[]) {
  try {
    const permission = await Notifications.getPermissionsAsync();
    if (!permission.granted) return;
    if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('deadlines', { name: 'Deadline reminders', importance: Notifications.AndroidImportance.DEFAULT });
    await Notifications.cancelAllScheduledNotificationsAsync();
    const now = Date.now();
    for (const x of items.filter(x => !completed(x) && x.end).slice(0, 50)) {
      const due = new Date(x.end + 'T09:00:00');
      const reminder = new Date(due); reminder.setDate(reminder.getDate() - 3);
      const date = reminder.getTime() > now ? reminder : due.getTime() > now ? due : null;
      if (date) await Notifications.scheduleNotificationAsync({ content: { title: 'Altitude · upcoming deadline', body: x.title + ' · ' + formatDate(x.end) }, trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date, channelId: 'deadlines' } });
    }
  } catch {}
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg }, content: { padding: 20, paddingBottom: 40 }, loading: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 10, gap: 10, backgroundColor: C.bg }, homeHeader: { paddingTop: 22, paddingBottom: 4 }, greeting: { color: C.ink, fontSize: 28, fontWeight: '700', letterSpacing: -.7 }, headerDate: { color: C.muted, fontSize: 13, marginTop: 3 }, avatarButton: { backgroundColor: '#f7dfb4', borderRadius: 23, width: 44, height: 44 },
  brandMark: { width: 32, height: 32, borderRadius: 10, backgroundColor: C.navy, alignItems: 'center', justifyContent: 'center' }, brandArrow: { color: C.lime, fontSize: 22, fontWeight: '700' }, brand: { fontSize: 19, fontWeight: '800', color: C.ink }, headerButton: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, headerButtonText: { fontSize: 24, color: C.ink },
  eyebrow: { color: C.teal, fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginBottom: 6 }, title: { color: C.ink, fontSize: 30, fontWeight: '800' }, muted: { color: C.muted, fontSize: 14, lineHeight: 21 }, small: { color: C.muted, fontSize: 12, marginTop: 4 }, topButton: { alignSelf: 'flex-start', marginTop: 16, marginBottom: 10 },
  button: { backgroundColor: C.navy, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 13, alignItems: 'center', marginBottom: 8 }, buttonText: { color: '#fff', fontWeight: '700', fontSize: 14 }, buttonSecondary: { backgroundColor: '#fff', borderWidth: 1, borderColor: C.line }, buttonDanger: { backgroundColor: '#fff2ef', borderWidth: 1, borderColor: '#f4d2ca' }, panel: { backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.line, padding: 16, marginTop: 10, marginBottom: 8 },
  bar: { backgroundColor: '#efe4db', height: 7, borderRadius: 7, overflow: 'hidden' }, barFill: { height: '100%', backgroundColor: C.teal, borderRadius: 7 },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginTop: 15 }, metric: { width: '48%', minHeight: 100, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: C.line, padding: 14, marginBottom: 12 }, metricValue: { color: C.ink, fontSize: 28, fontWeight: '800', marginTop: 4 }, sectionTitle: { color: C.ink, fontSize: 20, fontWeight: '800', marginTop: 18, marginBottom: 4 }, listRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: C.line }, listIcon: { color: C.teal, fontSize: 22, width: 30, textAlign: 'center' }, listTitle: { color: C.ink, fontWeight: '700', fontSize: 14 }, link: { color: C.teal, fontWeight: '700', fontSize: 12 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: C.line, borderRadius: 11, paddingHorizontal: 12, paddingVertical: 11, fontSize: 14, color: C.ink, marginTop: 8, marginBottom: 10 }, filters: { gap: 7, paddingBottom: 8 }, chip: { borderRadius: 30, borderWidth: 1, borderColor: C.line, paddingHorizontal: 13, paddingVertical: 8, backgroundColor: '#fff' }, chipActive: { backgroundColor: C.navy, borderColor: C.navy }, chipText: { color: C.muted, fontSize: 12, textTransform: 'capitalize', fontWeight: '700' }, chipTextActive: { color: '#fff' }, phaseHeading: { flexDirection: 'row', gap: 13, alignItems: 'center', marginTop: 16 }, phaseNumber: { fontSize: 19, fontWeight: '800', color: C.teal, marginRight: 6 },
  cardTitle: { color: C.ink, fontSize: 17, fontWeight: '700' }, taskRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line }, checkbox: { width: 20, height: 20, borderWidth: 1.5, borderColor: '#b9aaa0', borderRadius: 6, alignItems: 'center', justifyContent: 'center' }, checked: { backgroundColor: C.teal, borderColor: C.teal }, taskText: { color: C.ink, flex: 1, fontSize: 13, lineHeight: 19 }, strike: { textDecorationLine: 'line-through', color: C.muted }, notes: { color: C.muted, fontSize: 12, lineHeight: 18, backgroundColor: '#fff3e9', padding: 10, borderRadius: 9, marginTop: 12 },
  calendarHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }, calendarTitle: { color: C.ink, fontSize: 18, fontWeight: '800' }, arrow: { color: C.teal, fontSize: 32, paddingHorizontal: 8 }, calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' }, weekday: { width: '14.2857%', textAlign: 'center', color: C.muted, fontSize: 11, fontWeight: '800', marginBottom: 9 }, day: { width: '14.2857%', height: 46, alignItems: 'center', justifyContent: 'center', borderWidth: .5, borderColor: C.line }, today: { backgroundColor: '#ffead9' }, dayText: { color: C.ink, fontSize: 12, fontWeight: '600' }, eventDot: { backgroundColor: C.teal, width: 5, height: 5, borderRadius: 3, marginTop: 3 }, eventCount: { position: 'absolute', right: 2, bottom: 1, fontSize: 9, color: C.teal }, insightRow: { marginBottom: 17, gap: 6 },
  tabBar: { flexDirection: 'row', paddingHorizontal: 10, paddingTop: 9, paddingBottom: 8, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: C.line }, tab: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 42, borderRadius: 11 }, tabActive: { backgroundColor: C.navy }, tabText: { color: C.muted, fontSize: 12, fontWeight: '700' }, tabActiveText: { color: '#fff' },
  modalSafe: { flex: 1, backgroundColor: C.bg }, modalContent: { padding: 20, paddingBottom: 45 }, modalHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }, close: { fontSize: 30, color: C.muted, paddingHorizontal: 5 }, label: { color: C.ink, fontSize: 13, fontWeight: '700', marginBottom: 7, marginTop: 8 }, textarea: { minHeight: 100 }, choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 10 }, scrim: { flex: 1, backgroundColor: '#0008', justifyContent: 'flex-end' }, sheet: { backgroundColor: C.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, paddingBottom: 32 }, sheetTitle: { color: C.ink, fontSize: 23, fontWeight: '800' },
  progressStrip: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 28, marginBottom: 12 }, progressLabel: { color: C.ink, fontSize: 16, fontWeight: '700' }, progressValue: { color: C.muted, fontSize: 12, marginTop: 4 }, progressPercent: { color: C.teal, fontSize: 22, fontWeight: '800' }, sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6, marginBottom: 14 },
  pageHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 }, addButton: { width: 44, height: 44, borderRadius: 14, backgroundColor: C.navy, alignItems: 'center', justifyContent: 'center' }, addButtonText: { color: '#fff', fontSize: 26, lineHeight: 30 }, filterToggle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, marginBottom: 4 }, filterPanel: { paddingBottom: 8 }, filterLabel: { color: C.muted, fontSize: 10, letterSpacing: 1, fontWeight: '800', marginTop: 8, marginBottom: 9 },
  phaseSection: { marginTop: 12 }, phaseName: { color: C.ink, fontSize: 17, fontWeight: '700' }, expandMark: { color: C.teal, fontSize: 24, fontWeight: '500', paddingHorizontal: 8 }, cardSummary: { flexDirection: 'row', alignItems: 'center', minHeight: 48 }, cardProgress: { marginTop: 13 }, cardMeta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }, statusText: { color: C.teal, fontSize: 12, fontWeight: '700' }, overdueText: { color: C.orange }, cardDetails: { borderTopWidth: 1, borderTopColor: C.line, marginTop: 14, paddingTop: 14 }, detailLabel: { color: C.muted, fontSize: 12, marginTop: 8 }, detailActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 18, marginTop: 16 }, actionButton: { paddingVertical: 8 }, settingRow: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: C.line, paddingVertical: 15 },
  weekStrip: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 7, marginBottom: 20 }, weekDay: { alignItems: 'center', width: '14.2857%' }, weekLabel: { color: C.muted, fontSize: 11, marginBottom: 10 }, weekLabelSelected: { color: C.ink, fontWeight: '700' }, weekCircle: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }, weekCircleSelected: { backgroundColor: C.ink }, weekNumber: { color: C.ink, fontSize: 13, fontWeight: '600' }, weekNumberSelected: { color: '#fff' },
  reminderCard: { backgroundColor: '#fbd4b9', borderRadius: 20, padding: 17, flexDirection: 'row', alignItems: 'center', minHeight: 138, marginBottom: 18, overflow: 'hidden' }, reminderTitle: { color: C.ink, fontSize: 17, fontWeight: '700' }, reminderBody: { color: '#746055', fontSize: 12, lineHeight: 17, marginTop: 5, maxWidth: 225 }, reminderButton: { alignSelf: 'flex-start', backgroundColor: C.navy, borderRadius: 20, paddingHorizontal: 15, paddingVertical: 7, marginTop: 12 }, reminderButtonText: { color: '#fff', fontSize: 11, fontWeight: '700' }, bellWrap: { width: 80, height: 88, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '12deg' }] }, bellTop: { position: 'absolute', top: 12, width: 14, height: 13, borderRadius: 7, backgroundColor: '#f48627' }, bellBody: { position: 'absolute', top: 21, width: 49, height: 47, borderTopLeftRadius: 27, borderTopRightRadius: 27, borderBottomLeftRadius: 10, borderBottomRightRadius: 10, backgroundColor: '#f48627' }, bellRim: { position: 'absolute', top: 62, width: 62, height: 10, borderRadius: 5, backgroundColor: '#ec7520' }, bellClapper: { position: 'absolute', top: 71, width: 16, height: 9, borderBottomLeftRadius: 8, borderBottomRightRadius: 8, backgroundColor: '#c75c1a' },
  seeAll: { color: C.navy, fontSize: 12, fontWeight: '700' }, focusList: { gap: 10 }, focusRow: { flexDirection: 'row', alignItems: 'center', gap: 10 }, focusCheck: { width: 16, height: 48, alignItems: 'center', justifyContent: 'center' }, focusCheckText: { color: '#ed8a3b', fontSize: 21 }, focusRowContent: { flex: 1, backgroundColor: '#fff', borderRadius: 15, minHeight: 65, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 11, paddingVertical: 9 }, focusGlyph: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }, focusGlyphText: { color: C.navy, fontSize: 18 }, focusRowTitle: { color: C.ink, fontSize: 13, fontWeight: '700' }, focusRowSubtitle: { color: C.muted, fontSize: 11, marginTop: 3 }, focusChevron: { color: '#b9afa8', fontSize: 24, marginLeft: 4 }, fab: { position: 'absolute', right: 21, bottom: 72, width: 52, height: 52, borderRadius: 26, backgroundColor: C.navy, alignItems: 'center', justifyContent: 'center', elevation: 6 }, fabText: { color: '#fff', fontSize: 30, lineHeight: 34 },
});
