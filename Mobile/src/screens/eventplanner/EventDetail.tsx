import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  StyleSheet,
  Alert,
  RefreshControl,
  Modal,
} from 'react-native';
import { useRoute, useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { COLORS, DARK, FONTS } from '../../constants/colors';
import { GradientButton } from '../../components/brand';
import EventContractsCard from '../../components/contracts/EventContractsCard';
import { ChatService } from '../../services/chat.service';
import { apiError } from '../../services/contracts.service';
import {
  EventsService,
  EventDetail as EventDetailType,
  BudgetItem,
  EventTask,
} from '../../services/events.service';
import type { EventDetailProps } from '../../navigation/types';

type Tab = 'overview' | 'vendors' | 'budget' | 'tasks';

const STATUS_COLORS = COLORS.status;
const STATUS_LABELS: Record<string, string> = {
  PLANNING: 'Planning',
  CONFIRMED: 'Confirmed',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

export default function EventDetail() {
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const route = useRoute<EventDetailProps['route']>();
  const { eventId } = route.params;

  const [event, setEvent] = useState<EventDetailType | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<Tab>('overview');

  const load = useCallback(async () => {
    try {
      const res = await EventsService.findOne(eventId);
      if (res.data?.success) setEvent(res.data.data);
    } catch {
      Alert.alert('Error', 'Failed to load event');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [eventId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = () => { setRefreshing(true); load(); };

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={DARK.accent} />
      </View>
    );
  }

  if (!event) return null;

  const sc = STATUS_COLORS[event.status as keyof typeof STATUS_COLORS] ?? STATUS_COLORS.PLANNING;
  const completedTasks = event.tasks.filter((t) => t.completed).length;
  const totalTasks = event.tasks.length;

  const openChat = async () => {
    if (!event) return;
    try {
      const res = await ChatService.openEventChat(event.id);
      navigation.navigate('MessagesTab' as any, { screen: 'ChatDetail', initial: false, params: { conversationId: res.data.data.conversation_id, participantName: event.name } } as any);
    } catch (e) {
      Alert.alert('Event chat', apiError(e));
    }
  };
  return (
    <View style={s.root}>
      {/* Event header */}
      <View style={s.header}>
        <View style={s.headerRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Back" hitSlop={8} style={s.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={s.headerName} numberOfLines={2}>{event.name}</Text>
          <View style={s.badge}>
            <Text style={[s.badgeText, { color: sc.text }]}>{STATUS_LABELS[event.status]}</Text>
          </View>
        </View>
        <View style={s.headerMeta}>
          {event.type && <Chip icon="pricetag-outline" label={event.type.replace('_', ' ')} />}
          {event.date && <Chip icon="calendar-outline" label={format(new Date(event.date), 'MMM d, yyyy')} />}
          {event.venue && <Chip icon="location-outline" label={event.venue} />}
          {event.guest_count && <Chip icon="people-outline" label={`${event.guest_count} guests`} />}
        </View>
        <TouchableOpacity style={s.chatBtn} onPress={openChat} accessibilityRole="button" accessibilityLabel="Open the event chat">
          <Ionicons name="chatbubbles-outline" size={18} color="#fff" />
          <Text style={s.chatBtnText}>Event chat</Text>
          <Text style={s.chatBtnHint}>planner + booked vendors</Text>
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={s.tabBar}>
        {(['overview', 'vendors', 'budget', 'tasks'] as Tab[]).map((t) => (
          <TouchableOpacity
            key={t}
            style={[s.tabBtn, tab === t && s.tabBtnActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[s.tabText, tab === t && s.tabTextActive]}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
              {t === 'tasks' && totalTasks > 0 ? ` (${completedTasks}/${totalTasks})` : ''}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
      >
        {tab === 'overview' && (
          <OverviewTab event={event} completedTasks={completedTasks} totalTasks={totalTasks} />
        )}
        {tab === 'vendors' && (
          <>
            <VendorsTab event={event} onFind={() => navigation.navigate('FindVendors', { eventId: event.id })} />
            <EventContractsCard eventId={event.id} />
          </>
        )}
        {tab === 'budget' && <BudgetTab event={event} onRefresh={load} />}
        {tab === 'tasks' && <TasksTab event={event} onRefresh={load} />}
      </ScrollView>
    </View>
  );
}

// ─── Overview Tab ────────────────────────────────────────────────────────────
function OverviewTab({ event, completedTasks, totalTasks }: { event: EventDetailType; completedTasks: number; totalTasks: number }) {
  const progress = totalTasks > 0 ? completedTasks / totalTasks : 0;
  const totalAllocated = event.budget_items.reduce((s, b) => s + Number(b.allocated), 0);
  const totalSpent = event.budget_items.reduce((s, b) => s + Number(b.spent), 0);

  return (
    <View style={{ gap: 16 }}>
      {event.notes && (
        <InfoCard title="Notes">
          <Text style={s.noteText}>{event.notes}</Text>
        </InfoCard>
      )}

      <InfoCard title="Task Progress">
        <View style={s.progressRow}>
          <Text style={s.progressLabel}>{completedTasks} of {totalTasks} tasks complete</Text>
          <Text style={s.progressPct}>{Math.round(progress * 100)}%</Text>
        </View>
        <View style={s.progressBar}>
          <View style={[s.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
        </View>
      </InfoCard>

      {totalAllocated > 0 && (
        <InfoCard title="Budget Snapshot">
          <View style={s.progressRow}>
            <Text style={s.progressLabel}>
              ${totalSpent.toLocaleString()} spent of ${totalAllocated.toLocaleString()} allocated
            </Text>
          </View>
          <View style={s.progressBar}>
            <View
              style={[
                s.progressFill,
                { width: `${Math.min(100, Math.round((totalSpent / totalAllocated) * 100))}%` },
                totalSpent > totalAllocated && { backgroundColor: '#ef4444' },
              ]}
            />
          </View>
          {event.total_budget != null && (
            <Text style={s.budgetNote}>
              Overall budget: ${Number(event.total_budget).toLocaleString()}
            </Text>
          )}
        </InfoCard>
      )}

      <InfoCard title="Event Details">
        {[
          { icon: 'calendar-outline', label: 'Date', value: event.date ? format(new Date(event.date), 'EEEE, MMMM d yyyy') : '—' },
          { icon: 'location-outline', label: 'Venue', value: event.venue ?? '—' },
          { icon: 'people-outline', label: 'Guests', value: event.guest_count ? String(event.guest_count) : '—' },
          { icon: 'cash-outline', label: 'Budget', value: event.total_budget ? `$${Number(event.total_budget).toLocaleString()}` : '—' },
        ].map(({ icon, label, value }) => (
          <View key={label} style={s.detailRow}>
            <Ionicons name={icon as any} size={16} color={DARK.muted} />
            <Text style={s.detailLabel}>{label}</Text>
            <Text style={s.detailValue} numberOfLines={1}>{value}</Text>
          </View>
        ))}
      </InfoCard>
    </View>
  );
}

// ─── Vendors Tab ─────────────────────────────────────────────────────────────
function VendorsTab({ event, onFind }: { event: EventDetailType; onFind: () => void }) {
  if (event.bookings.length === 0) {
    return (
      <View style={s.emptyCard}>
        <Ionicons name="briefcase-outline" size={40} color={DARK.accent} />
        <Text style={s.emptyText}>No vendors booked yet</Text>
        <Text style={s.emptyHint}>Find vendors and book them for this event. Their bookings show up here.</Text>
        <GradientButton title="Find Vendor" onPress={onFind} style={{ alignSelf: 'stretch', marginTop: 8 }} />
      </View>
    );
  }
  return (
    <View style={{ gap: 12 }}>
      <GradientButton title="Find another vendor" onPress={onFind} />
      {event.bookings.map((eb) => {
        const b = eb.booking;
        return (
          <View key={eb.id} style={s.vendorCard}>
            <View style={s.vendorHeader}>
              <View style={s.vendorAvatar}>
                <Text style={s.vendorInitial}>{b.vendor.name[0].toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.vendorName}>{b.vendor.name}</Text>
                <Text style={s.vendorService} numberOfLines={1}>{b.listing.title}</Text>
              </View>
              <View style={[s.badge, s.badgeSmall]}>
                <Text style={[s.badgeText, { color: '#fff' }]}>{b.status}</Text>
              </View>
            </View>
            <View style={s.vendorFooter}>
              <Text style={s.vendorPrice}>${Number(b.listing.price).toLocaleString()}</Text>
              {b.amount && (
                <Text style={s.vendorAmount}>Booked: ${Number(b.amount).toLocaleString()}</Text>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ─── Budget Tab ───────────────────────────────────────────────────────────────
function BudgetTab({ event, onRefresh }: { event: EventDetailType; onRefresh: () => void }) {
  const [showAdd, setShowAdd] = useState(false);
  const [category, setCategory] = useState('');
  const [allocated, setAllocated] = useState('');
  const [spent, setSpent] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const totalAllocated = event.budget_items.reduce((s, b) => s + Number(b.allocated), 0);
  const totalSpent = event.budget_items.reduce((s, b) => s + Number(b.spent), 0);
  const overBudget = event.total_budget != null && totalAllocated > Number(event.total_budget);

  const handleAdd = async () => {
    if (!category || !allocated) { Alert.alert('Error', 'Category and allocated amount are required'); return; }
    setSaving(true);
    try {
      const res = await EventsService.addBudgetItem(event.id, {
        category,
        allocated: parseFloat(allocated),
        spent: spent ? parseFloat(spent) : 0,
        note: note || undefined,
      });
      if (res.data?.success) {
        setCategory(''); setAllocated(''); setSpent(''); setNote('');
        setShowAdd(false);
        onRefresh();
      }
    } catch {
      Alert.alert('Error', 'Failed to add budget item');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ gap: 12 }}>
      {/* Summary card */}
      <View style={s.budgetSummary}>
        <View style={s.budgetSumRow}>
          <Text style={s.budgetSumLabel}>Total Allocated</Text>
          <Text style={[s.budgetSumValue, { color: COLORS.primary }]}>${totalAllocated.toLocaleString()}</Text>
        </View>
        <View style={s.budgetSumRow}>
          <Text style={s.budgetSumLabel}>Total Spent</Text>
          <Text style={[s.budgetSumValue, totalSpent > totalAllocated && { color: '#ef4444' }]}>
            ${totalSpent.toLocaleString()}
          </Text>
        </View>
        <View style={s.budgetSumRow}>
          <Text style={s.budgetSumLabel}>Remaining</Text>
          <Text style={[s.budgetSumValue, { color: '#10b981' }]}>
            ${(totalAllocated - totalSpent).toLocaleString()}
          </Text>
        </View>

        {/* Overall progress bar */}
        {totalAllocated > 0 && (
          <View style={{ marginTop: 12 }}>
            <View style={s.progressBar}>
              <View
                style={[
                  s.progressFill,
                  { width: `${Math.min(100, (totalSpent / totalAllocated) * 100)}%` },
                  totalSpent > totalAllocated && { backgroundColor: '#ef4444' },
                ]}
              />
            </View>
            {overBudget && (
              <Text style={s.overBudgetWarn}>
                ⚠️ Allocated ${(totalAllocated - Number(event.total_budget!)).toLocaleString()} over total budget
              </Text>
            )}
          </View>
        )}
      </View>

      {/* Per-category items */}
      {event.budget_items.map((item) => (
        <BudgetItemRow key={item.id} item={item} />
      ))}

      {event.budget_items.length === 0 && (
        <View style={s.emptyCard}>
          <Text style={s.emptyText}>No budget items yet</Text>
        </View>
      )}

      {/* Add item */}
      {showAdd ? (
        <View style={s.addCard}>
          <Text style={s.addCardTitle}>Add Budget Item</Text>
          {[
            { label: 'Category', value: category, onChange: setCategory, placeholder: 'e.g. Catering' },
            { label: 'Allocated ($)', value: allocated, onChange: setAllocated, placeholder: '0.00', keyboard: 'decimal-pad' as const },
            { label: 'Already Spent ($)', value: spent, onChange: setSpent, placeholder: '0.00', keyboard: 'decimal-pad' as const },
            { label: 'Note (optional)', value: note, onChange: setNote, placeholder: 'Any details...' },
          ].map(({ label, value, onChange, placeholder, keyboard }) => (
            <View key={label} style={{ marginBottom: 10 }}>
              <Text style={s.label}>{label}</Text>
              <TextInput
                style={s.input}
                value={value}
                onChangeText={onChange}
                placeholder={placeholder}
                keyboardType={keyboard}
              />
            </View>
          ))}
          <View style={s.addActions}>
            <TouchableOpacity style={s.cancelBtn} onPress={() => setShowAdd(false)}>
              <Text style={s.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.saveBtn, saving && { opacity: 0.6 }]} onPress={handleAdd} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.saveBtnText}>Add</Text>}
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity style={s.addBtn} onPress={() => setShowAdd(true)}>
          <Ionicons name="add" size={18} color={DARK.accent} />
          <Text style={s.addBtnText}>Add Budget Item</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function BudgetItemRow({ item }: { item: BudgetItem }) {
  const pct = item.allocated > 0 ? Math.min(100, (Number(item.spent) / Number(item.allocated)) * 100) : 0;
  const over = Number(item.spent) > Number(item.allocated);
  return (
    <View style={s.budgetItemCard}>
      <View style={s.budgetItemHeader}>
        <Text style={s.budgetItemCategory}>{item.category}</Text>
        <Text style={s.budgetItemAmt}>
          ${Number(item.spent).toLocaleString()} / ${Number(item.allocated).toLocaleString()}
        </Text>
      </View>
      {item.note && <Text style={s.budgetItemNote}>{item.note}</Text>}
      <View style={[s.progressBar, { marginTop: 8 }]}>
        <View style={[s.progressFill, { width: `${pct}%` }, over && { backgroundColor: '#ef4444' }]} />
      </View>
    </View>
  );
}

// ─── Tasks Tab ────────────────────────────────────────────────────────────────
function TasksTab({ event, onRefresh }: { event: EventDetailType; onRefresh: () => void }) {
  const [newTitle, setNewTitle] = useState('');
  const [adding, setAdding] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const handleToggle = async (task: EventTask) => {
    setTogglingId(task.id);
    try {
      await EventsService.updateTask(event.id, task.id, { completed: !task.completed });
      onRefresh();
    } catch {
      Alert.alert('Error', 'Failed to update task');
    } finally {
      setTogglingId(null);
    }
  };

  const handleAdd = async () => {
    if (!newTitle.trim()) return;
    setAdding(true);
    try {
      const res = await EventsService.addTask(event.id, { title: newTitle.trim() });
      if (res.data?.success) { setNewTitle(''); onRefresh(); }
    } catch {
      Alert.alert('Error', 'Failed to add task');
    } finally {
      setAdding(false);
    }
  };

  const incomplete = event.tasks.filter((t) => !t.completed);
  const complete = event.tasks.filter((t) => t.completed);

  return (
    <View style={{ gap: 10 }}>
      {incomplete.length === 0 && complete.length === 0 && (
        <View style={s.emptyCard}>
          <Ionicons name="checkbox-outline" size={40} color={DARK.muted} />
          <Text style={s.emptyText}>No tasks yet</Text>
        </View>
      )}

      {incomplete.map((task) => (
        <TaskRow key={task.id} task={task} toggling={togglingId === task.id} onToggle={() => handleToggle(task)} />
      ))}

      {complete.length > 0 && (
        <>
          <Text style={s.taskGroupLabel}>Completed ({complete.length})</Text>
          {complete.map((task) => (
            <TaskRow key={task.id} task={task} toggling={togglingId === task.id} onToggle={() => handleToggle(task)} />
          ))}
        </>
      )}

      {/* Add task input */}
      <View style={s.addTaskRow}>
        <TextInput
          style={s.addTaskInput}
          value={newTitle}
          onChangeText={setNewTitle}
          placeholder="Add a task..."
          returnKeyType="done"
          onSubmitEditing={handleAdd}
        />
        <TouchableOpacity
          style={[s.addTaskBtn, (!newTitle.trim() || adding) && { opacity: 0.4 }]}
          onPress={handleAdd}
          disabled={!newTitle.trim() || adding}
        >
          {adding ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Ionicons name="add" size={20} color="#fff" />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

function TaskRow({ task, toggling, onToggle }: { task: EventTask; toggling: boolean; onToggle: () => void }) {
  const isPastDue = task.due_date && !task.completed && new Date(task.due_date) < new Date();
  return (
    <TouchableOpacity style={[s.taskCard, task.completed && s.taskCardDone]} onPress={onToggle}>
      <View style={s.taskCheckbox}>
        {toggling ? (
          <ActivityIndicator size="small" color={DARK.accent} />
        ) : task.completed ? (
          <Ionicons name="checkmark-circle" size={22} color={DARK.accent} />
        ) : (
          <Ionicons name="ellipse-outline" size={22} color={DARK.muted} />
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[s.taskTitle, task.completed && s.taskTitleDone]}>{task.title}</Text>
        {task.due_date && (
          <Text style={[s.taskDue, isPastDue && s.taskDueOverdue]}>
            {isPastDue ? '⚠️ ' : ''}
            {format(new Date(task.due_date), 'MMM d, yyyy')}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

// ─── Shared components ───────────────────────────────────────────────────────
function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={s.infoCard}>
      <Text style={s.infoCardTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Chip({ icon, label }: { icon: any; label: string }) {
  return (
    <View style={s.chip}>
      <Ionicons name={icon} size={12} color="rgba(255,255,255,0.8)" />
      <Text style={s.chipText}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  chatBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', marginTop: 12, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
  chatBtnText: { color: '#fff', fontSize: 14, fontFamily: FONTS.semibold },
  chatBtnHint: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontFamily: FONTS.regular },
  root: { flex: 1, backgroundColor: DARK.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: DARK.bg },
  emptyText: { color: '#fff', fontSize: 18, fontFamily: FONTS.medium, textAlign: 'center' },
  emptyHint: { color: DARK.muted, fontSize: 14, lineHeight: 21, fontFamily: FONTS.regular, textAlign: 'center' },
  emptyCard: { alignItems: 'center', gap: 10, padding: 24, borderRadius: 20, backgroundColor: DARK.card },
  header: { paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16, gap: 8, backgroundColor: DARK.bg },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  backBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: DARK.field, alignItems: 'center', justifyContent: 'center' },
  headerName: { flex: 1, color: '#fff', fontSize: 24, fontFamily: FONTS.semibold },
  headerMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  badge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 100, backgroundColor: DARK.field },
  badgeSmall: { paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { color: '#fff', fontSize: 12, fontFamily: FONTS.semibold },
  tabBar: { flexDirection: 'row', marginHorizontal: 20, padding: 4, borderRadius: 100, backgroundColor: DARK.card, marginBottom: 16 },
  tabBtn: { flex: 1, height: 40, borderRadius: 100, alignItems: 'center', justifyContent: 'center' },
  tabBtnActive: { backgroundColor: COLORS.primary },
  tabText: { color: DARK.muted, fontSize: 13, fontFamily: FONTS.medium },
  tabTextActive: { color: '#fff' },
  infoCard: { backgroundColor: DARK.card, borderRadius: 16, padding: 16, gap: 10, marginBottom: 12 },
  infoCardTitle: { color: '#fff', fontSize: 16, fontFamily: FONTS.semibold },
  progressRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  progressLabel: { color: '#fff', fontSize: 14, fontFamily: FONTS.regular, flex: 1 },
  progressPct: { color: DARK.accent, fontSize: 14, fontFamily: FONTS.semibold },
  progressBar: { height: 8, borderRadius: 4, backgroundColor: DARK.field, overflow: 'hidden' },
  progressFill: { height: 8, borderRadius: 4, backgroundColor: COLORS.primaryLight },
  budgetNote: { color: DARK.muted, fontSize: 12, fontFamily: FONTS.regular },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailLabel: { color: DARK.muted, fontSize: 14, fontFamily: FONTS.regular, width: 70 },
  detailValue: { flex: 1, color: '#fff', fontSize: 14, fontFamily: FONTS.medium, textAlign: 'right' },
  vendorCard: { backgroundColor: DARK.card, borderRadius: 16, padding: 14, gap: 12 },
  vendorHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  vendorAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: DARK.field, alignItems: 'center', justifyContent: 'center' },
  vendorInitial: { color: '#fff', fontSize: 16, fontFamily: FONTS.semibold },
  vendorName: { color: '#fff', fontSize: 16, fontFamily: FONTS.semibold },
  vendorService: { color: DARK.muted, fontSize: 13, fontFamily: FONTS.regular },
  vendorFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 10, borderTopWidth: 1, borderTopColor: DARK.field },
  vendorPrice: { color: '#fff', fontSize: 16, fontFamily: FONTS.semibold },
  vendorAmount: { color: DARK.accent, fontSize: 13, fontFamily: FONTS.medium },
  budgetSummary: { backgroundColor: DARK.card, borderRadius: 16, padding: 16, gap: 8, marginBottom: 12 },
  budgetSumRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  budgetSumLabel: { color: DARK.muted, fontSize: 14, fontFamily: FONTS.regular },
  budgetSumValue: { color: '#fff', fontSize: 16, fontFamily: FONTS.semibold },
  overBudgetWarn: { color: '#fca5a5', fontSize: 13, fontFamily: FONTS.medium },
  budgetItemCard: { backgroundColor: DARK.card, borderRadius: 16, padding: 14, gap: 6, marginBottom: 10 },
  budgetItemHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  budgetItemCategory: { color: '#fff', fontSize: 15, fontFamily: FONTS.semibold },
  budgetItemAmt: { color: DARK.accent, fontSize: 14, fontFamily: FONTS.medium },
  budgetItemNote: { color: DARK.muted, fontSize: 13, fontFamily: FONTS.regular },
  addBtn: { height: 50, borderRadius: 100, borderWidth: 1, borderColor: DARK.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 12 },
  addBtnText: { color: DARK.accent, fontSize: 14, fontFamily: FONTS.medium },
  addCard: { backgroundColor: DARK.card, borderRadius: 16, padding: 16, gap: 10, marginBottom: 12 },
  addCardTitle: { color: '#fff', fontSize: 16, fontFamily: FONTS.semibold },
  label: { color: '#fff', fontSize: 14, fontFamily: FONTS.medium },
  input: { height: 50, borderRadius: 25, paddingHorizontal: 16, fontSize: 15, color: '#fff', backgroundColor: DARK.field, fontFamily: FONTS.regular },
  addActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  saveBtn: { flex: 1, height: 48, borderRadius: 24, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  saveBtnText: { color: '#fff', fontSize: 15, fontFamily: FONTS.medium },
  cancelBtn: { flex: 1, height: 48, borderRadius: 24, borderWidth: 1, borderColor: DARK.border, alignItems: 'center', justifyContent: 'center' },
  cancelBtnText: { color: DARK.accent, fontSize: 15, fontFamily: FONTS.medium },
  taskGroupLabel: { color: DARK.muted, fontSize: 12, fontFamily: FONTS.semibold, letterSpacing: 1, marginTop: 8, marginBottom: 6 },
  taskCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, backgroundColor: DARK.card, marginBottom: 8 },
  taskCardDone: { opacity: 0.6 },
  taskCheckbox: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: DARK.accent, alignItems: 'center', justifyContent: 'center' },
  taskTitle: { flex: 1, color: '#fff', fontSize: 15, fontFamily: FONTS.medium },
  taskTitleDone: { textDecorationLine: 'line-through', color: DARK.muted },
  taskDue: { color: DARK.muted, fontSize: 12, fontFamily: FONTS.regular },
  taskDueOverdue: { color: '#fca5a5' },
  addTaskRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  addTaskInput: { flex: 1, height: 50, borderRadius: 25, paddingHorizontal: 16, fontSize: 15, color: '#fff', backgroundColor: DARK.field, fontFamily: FONTS.regular },
  addTaskBtn: { width: 50, height: 50, borderRadius: 25, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 100, backgroundColor: DARK.field },
  chipText: { color: '#fff', fontSize: 12, fontFamily: FONTS.medium },
  noteText: { color: '#fff', fontSize: 14, lineHeight: 21, fontFamily: FONTS.regular },
});
