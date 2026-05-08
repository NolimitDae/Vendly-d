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
import { useRoute, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { COLORS } from '../../constants/colors';
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
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (!event) return null;

  const sc = STATUS_COLORS[event.status as keyof typeof STATUS_COLORS] ?? STATUS_COLORS.PLANNING;
  const completedTasks = event.tasks.filter((t) => t.completed).length;
  const totalTasks = event.tasks.length;

  return (
    <View style={s.root}>
      {/* Event header */}
      <View style={s.header}>
        <View style={s.headerRow}>
          <Text style={s.headerName} numberOfLines={2}>{event.name}</Text>
          <View style={[s.badge, { backgroundColor: sc.bg, borderColor: sc.border }]}>
            <Text style={[s.badgeText, { color: sc.text }]}>{STATUS_LABELS[event.status]}</Text>
          </View>
        </View>
        <View style={s.headerMeta}>
          {event.type && <Chip icon="pricetag-outline" label={event.type.replace('_', ' ')} />}
          {event.date && <Chip icon="calendar-outline" label={format(new Date(event.date), 'MMM d, yyyy')} />}
          {event.venue && <Chip icon="location-outline" label={event.venue} />}
          {event.guest_count && <Chip icon="people-outline" label={`${event.guest_count} guests`} />}
        </View>
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
        {tab === 'vendors' && <VendorsTab event={event} />}
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
            <Ionicons name={icon as any} size={16} color={COLORS.gray[400]} />
            <Text style={s.detailLabel}>{label}</Text>
            <Text style={s.detailValue} numberOfLines={1}>{value}</Text>
          </View>
        ))}
      </InfoCard>
    </View>
  );
}

// ─── Vendors Tab ─────────────────────────────────────────────────────────────
function VendorsTab({ event }: { event: EventDetailType }) {
  if (event.bookings.length === 0) {
    return (
      <View style={s.emptyCard}>
        <Ionicons name="briefcase-outline" size={40} color={COLORS.gray[300]} />
        <Text style={s.emptyText}>No vendors booked yet</Text>
        <Text style={s.emptyHint}>Discover vendors in the Discover tab and add them to this event</Text>
      </View>
    );
  }
  return (
    <View style={{ gap: 12 }}>
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
                <Text style={[s.badgeText, { color: COLORS.gray[600] }]}>{b.status}</Text>
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
              {saving ? <ActivityIndicator color={COLORS.white} /> : <Text style={s.saveBtnText}>Add</Text>}
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity style={s.addBtn} onPress={() => setShowAdd(true)}>
          <Ionicons name="add" size={18} color={COLORS.primary} />
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
          <Ionicons name="checkbox-outline" size={40} color={COLORS.gray[300]} />
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
            <ActivityIndicator color={COLORS.white} size="small" />
          ) : (
            <Ionicons name="add" size={20} color={COLORS.white} />
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
          <ActivityIndicator size="small" color={COLORS.primary} />
        ) : task.completed ? (
          <Ionicons name="checkmark-circle" size={22} color={COLORS.primary} />
        ) : (
          <Ionicons name="ellipse-outline" size={22} color={COLORS.gray[300]} />
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
  root: { flex: 1, backgroundColor: COLORS.gray[50] },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { backgroundColor: COLORS.primary, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 20 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 },
  headerName: { fontSize: 20, fontWeight: '800', color: COLORS.white, flex: 1, marginRight: 8 },
  headerMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, borderWidth: 1 },
  badgeSmall: { backgroundColor: COLORS.gray[100], borderColor: COLORS.gray[200] },
  badgeText: { fontSize: 11, fontWeight: '600' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  chipText: { fontSize: 12, color: 'rgba(255,255,255,0.9)', fontWeight: '500' },
  tabBar: { flexDirection: 'row', backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.gray[100] },
  tabBtn: { flex: 1, paddingVertical: 13, alignItems: 'center' },
  tabBtnActive: { borderBottomWidth: 2, borderBottomColor: COLORS.primary },
  tabText: { fontSize: 12, fontWeight: '600', color: COLORS.gray[500] },
  tabTextActive: { color: COLORS.primary },
  // Overview
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  progressLabel: { fontSize: 13, color: COLORS.gray[600] },
  progressPct: { fontSize: 13, fontWeight: '700', color: COLORS.primary },
  progressBar: { height: 8, backgroundColor: COLORS.gray[100], borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: 8, backgroundColor: COLORS.primary, borderRadius: 4 },
  budgetNote: { fontSize: 12, color: COLORS.gray[400], marginTop: 6 },
  infoCard: { backgroundColor: COLORS.white, borderRadius: 14, padding: 16, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  infoCardTitle: { fontSize: 14, fontWeight: '700', color: COLORS.gray[700], marginBottom: 12 },
  noteText: { fontSize: 14, color: COLORS.gray[600], lineHeight: 20 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  detailLabel: { fontSize: 13, color: COLORS.gray[500], width: 60 },
  detailValue: { fontSize: 13, fontWeight: '600', color: COLORS.gray[800], flex: 1 },
  // Vendors
  vendorCard: { backgroundColor: COLORS.white, borderRadius: 14, padding: 14 },
  vendorHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  vendorAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.primaryBg, alignItems: 'center', justifyContent: 'center' },
  vendorInitial: { fontSize: 16, fontWeight: '700', color: COLORS.primary },
  vendorName: { fontSize: 15, fontWeight: '700', color: COLORS.gray[900] },
  vendorService: { fontSize: 12, color: COLORS.gray[500], marginTop: 2 },
  vendorFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: COLORS.gray[100] },
  vendorPrice: { fontSize: 14, fontWeight: '700', color: COLORS.primary },
  vendorAmount: { fontSize: 13, color: COLORS.gray[500] },
  // Budget
  budgetSummary: { backgroundColor: COLORS.white, borderRadius: 14, padding: 16 },
  budgetSumRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  budgetSumLabel: { fontSize: 14, color: COLORS.gray[600] },
  budgetSumValue: { fontSize: 14, fontWeight: '700', color: COLORS.gray[800] },
  overBudgetWarn: { fontSize: 12, color: '#ef4444', marginTop: 8 },
  budgetItemCard: { backgroundColor: COLORS.white, borderRadius: 12, padding: 14 },
  budgetItemHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  budgetItemCategory: { fontSize: 14, fontWeight: '700', color: COLORS.gray[800] },
  budgetItemAmt: { fontSize: 13, color: COLORS.gray[600] },
  budgetItemNote: { fontSize: 12, color: COLORS.gray[400], marginTop: 4 },
  addCard: { backgroundColor: COLORS.white, borderRadius: 14, padding: 16 },
  addCardTitle: { fontSize: 15, fontWeight: '700', color: COLORS.gray[800], marginBottom: 12 },
  addActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: COLORS.gray[200], alignItems: 'center' },
  cancelBtnText: { fontSize: 14, fontWeight: '600', color: COLORS.gray[600] },
  saveBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: COLORS.primary, alignItems: 'center' },
  saveBtnText: { fontSize: 14, fontWeight: '700', color: COLORS.white },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12, borderWidth: 2, borderColor: COLORS.primaryLight, borderStyle: 'dashed' },
  addBtnText: { fontSize: 14, fontWeight: '700', color: COLORS.primary },
  // Tasks
  taskGroupLabel: { fontSize: 12, fontWeight: '600', color: COLORS.gray[400], textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4 },
  taskCard: { backgroundColor: COLORS.white, borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  taskCardDone: { opacity: 0.6 },
  taskCheckbox: { width: 22, alignItems: 'center', justifyContent: 'center' },
  taskTitle: { fontSize: 14, fontWeight: '600', color: COLORS.gray[800] },
  taskTitleDone: { textDecorationLine: 'line-through', color: COLORS.gray[400] },
  taskDue: { fontSize: 12, color: COLORS.gray[400], marginTop: 2 },
  taskDueOverdue: { color: '#ef4444' },
  addTaskRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  addTaskInput: { flex: 1, backgroundColor: COLORS.white, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, borderWidth: 1, borderColor: COLORS.gray[200] },
  addTaskBtn: { width: 44, height: 44, borderRadius: 10, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-end' },
  // Shared
  emptyCard: { backgroundColor: COLORS.white, borderRadius: 14, padding: 32, alignItems: 'center', gap: 8 },
  emptyText: { fontSize: 15, color: COLORS.gray[500], fontWeight: '600' },
  emptyHint: { fontSize: 13, color: COLORS.gray[400], textAlign: 'center' },
  input: { backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.gray[200], borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14 },
  label: { fontSize: 12, fontWeight: '600', color: COLORS.gray[600], marginBottom: 4 },
});
