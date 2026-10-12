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
import { Checkpoint, RoadmapState, calendarICS, completed, formatDate, freshState, phases, progress, safeUrl, stats, status, todayISO, validBackup } from './src/model';

const STORAGE_KEY = 'altitude-roadmap-v1';
const C = { bg: '#edf3fb', card: '#ffffff', ink: '#10293a', muted: '#657888', line: '#dce6ef', navy: '#092b3c', lime: '#b9f37b', teal: '#0b846e', orange: '#a85a17', blue: '#315da8' };
export type Screen = 'overview' | 'roadmap' | 'calendar' | 'insights';
const ScreenContext = React.createContext<(screen: Screen) => React.ReactNode>(() => null);
export function RouteScreen({ screen }: { screen: Screen }) { const render = useContext(ScreenContext); return <>{render(screen)}</>; }
const tabs: { key: Screen; icon: string; label: string }[] = [
  { key: 'overview', icon: '▦', label: 'Overview' }, { key: 'roadmap', icon: '▤', label: 'Roadmap' },
  { key: 'calendar', icon: '▣', label: 'Calendar' }, { key: 'insights', icon: '▥', label: 'Insights' },
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
  const toggleTask = (itemId: string, taskId: string) => {
    setState(old => ({ ...old, items: old.items.map(x => x.id === itemId ? { ...x, tasks: x.tasks.map(t => t.id === taskId ? { ...t, done: !t.done } : t) } : x) }));
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };
  const openEditor = (item?: Checkpoint) => { const draft = item ? JSON.parse(JSON.stringify(item)) as Checkpoint : emptyEditor(); setTaskLines(draft.tasks.map(t => t.text).join('\n')); setEditor(draft); };
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
  const checkpointCard = (x: Checkpoint) => {
    const result = status(x), done = x.tasks.filter(t => t.done).length;
    return <Panel key={x.id}>
      <View style={s.cardHead}><View style={s.typeBadge}><Text style={s.typeIcon}>{typeIcon[x.type] || '◈'}</Text></View><View style={{ flex: 1 }}><Text style={s.eyebrow}>{x.type.toUpperCase()}</Text><Text style={s.cardTitle}>{x.title}</Text></View><Pressable accessibilityLabel={'Edit ' + x.title} onPress={() => openEditor(x)}><Text style={s.more}>⋯</Text></Pressable></View>
      {!!x.description && <Text style={s.muted}>{x.description}</Text>}
      <View style={s.pills}><Text style={[s.pill, result === 'overdue' && s.overduePill, result === 'done' && s.donePill]}>{result === 'done' ? '✓ Completed' : result === 'overdue' ? '! Overdue' : result === 'in-progress' ? '↗ In progress' : '◷ Upcoming'}</Text><Text style={s.pill}>{x.start ? formatDate(x.start) + (x.end ? ' – ' + formatDate(x.end) : '') : formatDate(x.end)}</Text></View>
      {x.tasks.length ? x.tasks.map(t => <Pressable key={t.id} onPress={() => toggleTask(x.id, t.id)} accessibilityRole="checkbox" accessibilityState={{ checked: t.done }} style={s.taskRow}><View style={[s.checkbox, t.done && s.checked]}>{t.done && <Text style={{ color: '#fff' }}>✓</Text>}</View><Text style={[s.taskText, t.done && s.strike]}>{t.text}</Text></Pressable>) : <Text style={s.small}>Add checklist items using Edit.</Text>}
      {!!x.notes && <Text style={s.notes}>✎ {x.notes}</Text>}
      <View style={s.cardFoot}><View style={{ flex: 1 }}><Bar value={progress(x)} /><Text style={s.small}>{done}/{x.tasks.length} tasks</Text></View>{safeUrl(x.url) ? <Pressable onPress={() => Linking.openURL(x.url).catch(() => Alert.alert('Could not open link'))}><Text style={s.link}>Open resource ↗</Text></Pressable> : <Pressable onPress={() => openEditor(x)}><Text style={s.link}>Add link →</Text></Pressable>}</View>
    </Panel>;
  };
  const overview = () => {
    const next = state.items.filter(x => !completed(x)).sort((a, b) => (a.end || '9999').localeCompare(b.end || '9999')).slice(0, 4);
    return <><Text style={s.eyebrow}>YOUR LEARNING SPACE</Text><Text style={s.title}>Your work, in motion.</Text><Text style={s.muted}>{summary.total} checkpoints across cloud engineering and AI infrastructure.</Text><View style={s.topButton}><Button onPress={() => openEditor()}>＋ Add checkpoint</Button></View>
      <View style={s.hero}><Text style={s.heroKicker}>ONE SYSTEM, BUILT IN LAYERS</Text><Text style={s.heroTitle}>From first command.{"\n"}To production AI.</Text><Text style={s.heroBody}>Track each step through APIs, containers, AWS, observability, and RAG.</Text><Text style={s.heroPercent}>{summary.percent}% <Text style={s.heroBody}>{summary.done} of {summary.total} complete</Text></Text><Bar value={summary.percent / 100} /><Pressable onPress={() => go('roadmap')}><Text style={s.heroLink}>Explore your roadmap ↗</Text></Pressable></View>
      <View style={s.metricGrid}><Metric label="Completed" value={summary.done} foot="Checkpoints finished" /><Metric label="In progress" value={summary.active} foot="On your current path" /><Metric label="Projects" value={summary.projects} foot="Build milestones" /><Metric label="Overdue" value={summary.overdue} foot="Needs attention" /></View>
      <Text style={s.sectionTitle}>Up next</Text><Text style={s.small}>Your closest unfinished deadlines</Text><Panel>{next.length ? next.map(x => <Pressable key={x.id} onPress={() => openEditor(x)} style={s.listRow}><Text style={s.listIcon}>{typeIcon[x.type] || '◈'}</Text><View style={{ flex: 1 }}><Text style={s.listTitle}>{x.title}</Text><Text style={s.small}>{formatDate(x.end)} · {x.tasks.filter(t => t.done).length}/{x.tasks.length} tasks</Text></View><Text style={s.link}>→</Text></Pressable>) : <Text style={s.muted}>All clear! Add a checkpoint to keep moving.</Text>}</Panel>
      <Text style={s.sectionTitle}>Journey map</Text><Panel>{phases.map(p => { const items = state.items.filter(x => x.phase === p.id); return <View key={p.id} style={s.listRow}><Text style={s.listIcon}>•</Text><View><Text style={s.listTitle}>{p.name}</Text><Text style={s.small}>{items.filter(completed).length} of {items.length} checkpoints complete</Text></View></View>; })}</Panel>
    </>;
  };
  const roadmap = () => {
    const q = search.trim().toLowerCase();
    const visible = state.items.filter(x => (filter === 'all' || status(x) === filter) && (typeFilter === 'all' || x.type === typeFilter) && (!q || (x.title + ' ' + x.description + ' ' + x.tasks.map(t => t.text).join(' ')).toLowerCase().includes(q)));
    return <><Text style={s.eyebrow}>THE FULL PATH</Text><Text style={s.title}>Your roadmap</Text><Text style={s.muted}>Check off work, capture notes, and adjust dates.</Text><View style={s.topButton}><Button onPress={() => openEditor()}>＋ Add checkpoint</Button></View><TextInput value={search} onChangeText={setSearch} placeholder="Search checkpoints or skills..." placeholderTextColor={C.muted} style={s.input} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={s.filters}>{['all', 'upcoming', 'in-progress', 'overdue', 'done'].map(f => <Pressable key={f} onPress={() => setFilter(f)} style={[s.chip, filter === f && s.chipActive]}><Text style={[s.chipText, filter === f && s.chipTextActive]}>{f === 'all' ? 'All statuses' : f === 'done' ? 'Completed' : f.replace('-', ' ')}</Text></Pressable>)}</ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={s.filters}>{['all', ...types].map(t => <Pressable key={t} onPress={() => setTypeFilter(t)} style={[s.chip, typeFilter === t && s.chipActive]}><Text style={[s.chipText, typeFilter === t && s.chipTextActive]}>{t === 'all' ? 'All types' : t}</Text></Pressable>)}</ScrollView>
      {phases.map((p, i) => { const items = visible.filter(x => x.phase === p.id).sort((a, b) => (a.start || '').localeCompare(b.start || '')); return items.length ? <View key={p.id}><View style={s.phaseHeading}><Text style={s.phaseNumber}>{String(i + 1).padStart(2, '0')}</Text><View><Text style={s.sectionTitle}>{p.name}</Text><Text style={s.small}>{p.subtitle}</Text></View></View>{items.map(checkpointCard)}</View> : null; })}
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
    <Text style={s.sectionTitle}>Checkpoint mix</Text><Panel>{types.map(t => <View key={t} style={s.listRow}><Text style={[s.listTitle, { flex: 1 }]}>{t[0].toUpperCase() + t.slice(1)}</Text><Text style={s.listTitle}>{state.items.filter(x => x.type === t).length}</Text></View>)}</Panel>
    <Text style={s.sectionTitle}>What this builds toward</Text><Panel>{[['01', 'A working API', 'FastAPI + PostgreSQL'], ['02', 'A deployed system', 'Docker + Actions + ECS + RDS'], ['03', 'A cloud native AI app', 'Terraform + monitoring + Bedrock RAG']].map(row => <View key={row[0]} style={s.listRow}><Text style={s.phaseNumber}>{row[0]}</Text><View><Text style={s.listTitle}>{row[1]}</Text><Text style={s.small}>{row[2]}</Text></View></View>)}</Panel>
  </>;

  const renderScreen = (selected: Screen) => !ready ? <View style={s.loading}><ActivityIndicator color={C.navy} /><Text style={s.muted}>Loading your roadmap…</Text></View> : selected === 'overview' ? overview() : selected === 'roadmap' ? roadmap() : selected === 'calendar' ? calendar() : insights();
  return <ScreenContext.Provider value={renderScreen}><SafeAreaProvider><SafeAreaView style={s.safe}><StatusBar style="dark" /><View style={s.header}><View style={s.brandMark}><Text style={s.brandArrow}>↗</Text></View><View style={{ flex: 1 }}><Text style={s.brand}>Altitude</Text><Text style={s.brandSub}>YOUR LEARNING OS</Text></View><Pressable accessibilityLabel="Deadline reminders" onPress={() => void toggleReminders()} style={s.headerButton}><Text style={s.headerButtonText}>{state.settings.reminders ? '♧' : '♢'}</Text></Pressable><Pressable accessibilityLabel="Data and backup" onPress={() => setDataOpen(true)} style={s.headerButton}><Text style={s.headerButtonText}>⋯</Text></Pressable></View>
    <ScrollView key={screen} style={{ flex: 1 }} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled"><Slot /></ScrollView>
    <View style={s.tabBar}>{tabs.map(t => <Pressable key={t.key} onPress={() => go(t.key)} style={[s.tab, screen === t.key && s.tabActive]} accessibilityRole="tab" accessibilityState={{ selected: screen === t.key }}><Text style={[s.tabIcon, screen === t.key && s.tabActiveText]}>{t.icon}</Text><Text style={[s.tabText, screen === t.key && s.tabActiveText]}>{t.label}</Text></Pressable>)}</View>
    <Modal visible={!!editor} animationType="slide" onRequestClose={() => setEditor(null)}><SafeAreaView style={s.modalSafe}><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}><ScrollView contentContainerStyle={s.modalContent} keyboardShouldPersistTaps="handled"><View style={s.modalHeader}><View><Text style={s.eyebrow}>YOUR JOURNEY</Text><Text style={s.title}>{editor?.id ? 'Edit checkpoint' : 'New checkpoint'}</Text></View><Pressable onPress={() => setEditor(null)}><Text style={s.close}>×</Text></Pressable></View>
      <Text style={s.label}>Title</Text><TextInput value={editor?.title || ''} onChangeText={title => changeEditor({ title })} maxLength={100} placeholder="What will you complete?" style={s.input} />
      <Text style={s.label}>Type</Text><View style={s.choices}>{types.map(t => <Pressable key={t} onPress={() => changeEditor({ type: t })} style={[s.chip, editor?.type === t && s.chipActive]}><Text style={[s.chipText, editor?.type === t && s.chipTextActive]}>{t}</Text></Pressable>)}</View>
      <Text style={s.label}>Phase</Text><View style={s.choices}>{phases.map(p => <Pressable key={p.id} onPress={() => changeEditor({ phase: p.id })} style={[s.chip, editor?.phase === p.id && s.chipActive]}><Text style={[s.chipText, editor?.phase === p.id && s.chipTextActive]}>{p.name}</Text></Pressable>)}</View>
      <Text style={s.label}>Start date · YYYY-MM-DD</Text><TextInput value={editor?.start || ''} onChangeText={start => changeEditor({ start })} placeholder="2027-01-15" keyboardType="numbers-and-punctuation" style={s.input} />
      <Text style={s.label}>Deadline · YYYY-MM-DD</Text><TextInput value={editor?.end || ''} onChangeText={end => changeEditor({ end })} placeholder="2027-02-15" keyboardType="numbers-and-punctuation" style={s.input} />
      <Text style={s.label}>Resource URL</Text><TextInput value={editor?.url || ''} onChangeText={url => changeEditor({ url })} placeholder="https://..." autoCapitalize="none" keyboardType="url" style={s.input} />
      <Text style={s.label}>Checklist items · one per line</Text><TextInput value={taskLines} onChangeText={setTaskLines} multiline textAlignVertical="top" placeholder={'Watch core modules\nComplete hands-on exercise'} style={[s.input, s.textarea]} />
      <Text style={s.label}>Notes / remarks</Text><TextInput value={editor?.notes || ''} onChangeText={notes => changeEditor({ notes })} multiline textAlignVertical="top" placeholder="Your plan, blockers, or reflections" style={[s.input, s.textarea]} />
      <Button onPress={saveEditor}>Save checkpoint</Button><Button onPress={() => setEditor(null)} secondary>Cancel</Button>{!!editor?.id && <Button onPress={deleteEditor} danger>Delete checkpoint</Button>}
    </ScrollView></KeyboardAvoidingView></SafeAreaView></Modal>
    <Modal visible={dataOpen} transparent animationType="fade" onRequestClose={() => setDataOpen(false)}><View style={s.scrim}><View style={s.sheet}><View style={s.modalHeader}><View><Text style={s.eyebrow}>YOUR DATA</Text><Text style={s.sheetTitle}>Back up your progress</Text></View><Pressable onPress={() => setDataOpen(false)}><Text style={s.close}>×</Text></Pressable></View><Text style={s.muted}>Progress is saved on this phone. Export a backup before replacing the old Android app, then import it here.</Text><View style={{ height: 15 }} /><Button onPress={() => void exportBackup()}>↓ Export backup</Button><Button onPress={() => void importBackup()} secondary>↑ Import backup</Button><Button onPress={reset} danger>Reset to starter roadmap</Button></View></View></Modal>
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
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 12, gap: 10, borderBottomWidth: 1, borderBottomColor: C.line },
  brandMark: { width: 36, height: 36, borderRadius: 11, backgroundColor: C.navy, alignItems: 'center', justifyContent: 'center' }, brandArrow: { color: C.lime, fontSize: 24, fontWeight: '700' }, brand: { fontSize: 20, fontWeight: '800', color: C.ink }, brandSub: { fontSize: 9, letterSpacing: 1.7, color: C.muted, fontWeight: '700' }, headerButton: { width: 36, height: 36, borderRadius: 10, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' }, headerButtonText: { fontSize: 23, color: C.ink },
  eyebrow: { color: C.teal, fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginBottom: 6 }, title: { color: C.ink, fontSize: 30, fontWeight: '800' }, muted: { color: C.muted, fontSize: 14, lineHeight: 21 }, small: { color: C.muted, fontSize: 11, marginTop: 4 }, topButton: { alignSelf: 'flex-start', marginTop: 16, marginBottom: 10 },
  button: { backgroundColor: C.navy, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center', marginBottom: 8 }, buttonText: { color: '#fff', fontWeight: '700', fontSize: 14 }, buttonSecondary: { backgroundColor: '#fff', borderWidth: 1, borderColor: C.line }, buttonDanger: { backgroundColor: '#fff2ef', borderWidth: 1, borderColor: '#f4d2ca' }, panel: { backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.line, padding: 16, marginTop: 10, marginBottom: 8 },
  hero: { backgroundColor: C.navy, borderRadius: 22, padding: 22, marginTop: 10, marginBottom: 20 }, heroKicker: { color: C.lime, fontSize: 10, letterSpacing: 1.6, fontWeight: '800' }, heroTitle: { color: '#fff', fontSize: 27, lineHeight: 33, fontWeight: '800', marginTop: 12 }, heroBody: { color: '#c8d8e0', lineHeight: 21, marginTop: 10 }, heroPercent: { color: C.lime, fontSize: 30, fontWeight: '800', marginTop: 16, marginBottom: 8 }, heroLink: { color: C.lime, fontWeight: '700', marginTop: 17 }, bar: { backgroundColor: '#dce9ee', height: 7, borderRadius: 7, overflow: 'hidden' }, barFill: { height: '100%', backgroundColor: C.teal, borderRadius: 7 },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginTop: 15 }, metric: { width: '48%', minHeight: 100, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: C.line, padding: 14, marginBottom: 12 }, metricValue: { color: C.ink, fontSize: 28, fontWeight: '800', marginTop: 4 }, sectionTitle: { color: C.ink, fontSize: 20, fontWeight: '800', marginTop: 18, marginBottom: 4 }, listRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: C.line }, listIcon: { color: C.teal, fontSize: 22, width: 30, textAlign: 'center' }, listTitle: { color: C.ink, fontWeight: '700', fontSize: 14 }, link: { color: C.teal, fontWeight: '700', fontSize: 12 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: C.line, borderRadius: 11, paddingHorizontal: 12, paddingVertical: 11, fontSize: 14, color: C.ink, marginTop: 8, marginBottom: 10 }, filters: { gap: 7, paddingBottom: 8 }, chip: { borderRadius: 30, borderWidth: 1, borderColor: C.line, paddingHorizontal: 13, paddingVertical: 8, backgroundColor: '#fff' }, chipActive: { backgroundColor: C.navy, borderColor: C.navy }, chipText: { color: C.muted, fontSize: 12, textTransform: 'capitalize', fontWeight: '700' }, chipTextActive: { color: '#fff' }, phaseHeading: { flexDirection: 'row', gap: 13, alignItems: 'center', marginTop: 16 }, phaseNumber: { fontSize: 19, fontWeight: '800', color: C.teal, marginRight: 6 },
  cardHead: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', marginBottom: 8 }, typeBadge: { backgroundColor: '#e5f4ea', width: 40, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center' }, typeIcon: { color: C.teal, fontSize: 21 }, cardTitle: { color: C.ink, fontSize: 17, fontWeight: '800' }, more: { fontSize: 25, color: C.muted, marginTop: -8 }, pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 15, marginBottom: 12 }, pill: { backgroundColor: '#eef4f8', color: C.blue, borderRadius: 15, paddingHorizontal: 9, paddingVertical: 5, fontSize: 11, fontWeight: '700', overflow: 'hidden' }, overduePill: { backgroundColor: '#fff0e3', color: C.orange }, donePill: { backgroundColor: '#e5f7ed', color: C.teal }, taskRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#edf1f4' }, checkbox: { width: 20, height: 20, borderWidth: 1.5, borderColor: '#a9bac4', borderRadius: 6, alignItems: 'center', justifyContent: 'center' }, checked: { backgroundColor: C.teal, borderColor: C.teal }, taskText: { color: C.ink, flex: 1, fontSize: 13, lineHeight: 19 }, strike: { textDecorationLine: 'line-through', color: C.muted }, notes: { color: C.muted, fontSize: 12, lineHeight: 18, backgroundColor: '#f4f8f9', padding: 10, borderRadius: 9, marginTop: 12 }, cardFoot: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16 },
  calendarHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }, calendarTitle: { color: C.ink, fontSize: 18, fontWeight: '800' }, arrow: { color: C.teal, fontSize: 32, paddingHorizontal: 8 }, calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' }, weekday: { width: '14.2857%', textAlign: 'center', color: C.muted, fontSize: 11, fontWeight: '800', marginBottom: 9 }, day: { width: '14.2857%', height: 46, alignItems: 'center', justifyContent: 'center', borderWidth: .5, borderColor: C.line }, today: { backgroundColor: '#e6f7e5' }, dayText: { color: C.ink, fontSize: 12, fontWeight: '600' }, eventDot: { backgroundColor: C.teal, width: 5, height: 5, borderRadius: 3, marginTop: 3 }, eventCount: { position: 'absolute', right: 2, bottom: 1, fontSize: 9, color: C.teal }, insightRow: { marginBottom: 17, gap: 6 },
  tabBar: { flexDirection: 'row', paddingHorizontal: 8, paddingTop: 7, paddingBottom: 6, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: C.line }, tab: { flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: 12 }, tabActive: { backgroundColor: C.navy }, tabIcon: { color: C.muted, fontSize: 19, lineHeight: 22 }, tabText: { color: C.muted, fontSize: 10, fontWeight: '700', marginTop: 3 }, tabActiveText: { color: C.lime },
  modalSafe: { flex: 1, backgroundColor: C.bg }, modalContent: { padding: 20, paddingBottom: 45 }, modalHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }, close: { fontSize: 30, color: C.muted, paddingHorizontal: 5 }, label: { color: C.ink, fontSize: 13, fontWeight: '700', marginBottom: 7, marginTop: 8 }, textarea: { minHeight: 100 }, choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 10 }, scrim: { flex: 1, backgroundColor: '#0008', justifyContent: 'flex-end' }, sheet: { backgroundColor: C.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, paddingBottom: 32 }, sheetTitle: { color: C.ink, fontSize: 23, fontWeight: '800' },
});
