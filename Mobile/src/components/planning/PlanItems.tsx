import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BrandGradient, Card } from '../brand';
import { DARK, FONTS } from '../../constants/colors';
import { EventsService } from '../../services/events.service';
import { apiError } from '../../services/contracts.service';
import {
  PlanningService,
  PRIORITY_LABEL,
  availabilityLabel,
  bookByLabel,
  groupByPriority,
  money,
  type Plan,
  type PlanItem,
} from '../../services/planning.service';

const COVERED_LABEL: Record<NonNullable<PlanItem['covered_by']>, string> = {
  booking: 'Booked',
  budget: 'In budget',
  venue: 'Venue set',
};

/** "Find vendors" (or "Browse all" when none are free): 44pt, gradient when there are vendors. */
export function FindVendorsButton({ item, onPress }: { item: PlanItem; onPress: () => void }) {
  const none = item.available_vendors === 0;
  const title = none ? 'Browse all' : 'Find vendors';
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${title}: ${item.category.name}`} style={({ pressed }) => [pressed && { opacity: 0.8 }]}>
      {none ? (
        <View style={[s.action, s.actionOutline]}>
          <Ionicons name="search-outline" size={16} color="#fff" />
          <Text style={s.actionText}>{title}</Text>
        </View>
      ) : (
        <BrandGradient style={s.action}>
          <Ionicons name="search-outline" size={16} color="#fff" />
          <Text style={s.actionText}>{title}</Text>
        </BrandGradient>
      )}
    </Pressable>
  );
}

function Meta({ item }: { item: PlanItem }) {
  return (
    <View style={{ gap: 6 }}>
      <View style={s.metaRow}>
        <Ionicons name={item.book_soon ? 'alarm-outline' : 'calendar-outline'} size={14} color={item.book_soon ? '#F5B700' : DARK.muted} />
        <Text style={[s.metaText, item.book_soon && { color: '#F5B700', fontFamily: FONTS.semibold }]}>{bookByLabel(item)}</Text>
      </View>
      <View style={s.metaRow}>
        <Ionicons name="storefront-outline" size={14} color={DARK.muted} />
        <Text style={s.metaText}>{availabilityLabel(item)}</Text>
      </View>
    </View>
  );
}

/** One suggested service on the "Plan your event" results. */
export function PlanItemCard({ item, onFind }: { item: PlanItem; onFind: () => void }) {
  return (
    <Card style={{ gap: 10 }}>
      <View style={s.titleRow}>
        <Text style={s.title}>{item.category.name}</Text>
        {item.suggested_budget != null ? (
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={s.amount}>{money(item.suggested_budget)}</Text>
            <Text style={s.share}>{item.share_percent}% of budget</Text>
          </View>
        ) : (
          <Text style={s.share}>about {item.share_percent}%</Text>
        )}
      </View>
      <Text style={s.why}>{item.why}</Text>
      {!!item.tip && (
        <View style={s.metaRow}>
          <Ionicons name="bulb-outline" size={14} color={DARK.accent} />
          <Text style={[s.metaText, { color: '#fff' }]}>{item.tip}</Text>
        </View>
      )}
      <Meta item={item} />
      <View style={{ alignItems: 'flex-start', marginTop: 4 }}>
        <FindVendorsButton item={item} onPress={onFind} />
      </View>
    </Card>
  );
}

/** Results grouped by priority, with the empty and no-vendors states. */
export function PlanResultsList({ plan, onFind }: { plan: Plan; onFind: (item: PlanItem) => void }) {
  if (plan.items.length === 0) {
    return (
      <View style={s.empty}>
        <Ionicons name="clipboard-outline" size={36} color={DARK.muted} />
        <Text style={s.emptyText}>No suggestions for this event yet</Text>
      </View>
    );
  }
  const noVendors = plan.items.every((i) => i.available_vendors === 0);
  return (
    <View style={{ gap: 20 }}>
      {noVendors && (
        <Card style={{ borderWidth: 1, borderColor: DARK.field }}>
          <Text style={s.why} accessibilityLiveRegion="polite">
            {`No vendors are listed for these services${plan.date ? ' on that date' : ''}${plan.near ? ' near there' : ''} yet. Vendly is growing, so the checklist still works and you can browse what's on offer.`}
          </Text>
        </Card>
      )}
      {groupByPriority(plan.items).map((g) => (
        <View key={g.priority} style={{ gap: 12 }}>
          <Text style={s.group} accessibilityRole="header">{`${PRIORITY_LABEL[g.priority]} (${g.items.length})`}</Text>
          {g.items.map((item) => (
            <PlanItemCard key={item.category.id} item={item} onFind={() => onFind(item)} />
          ))}
        </View>
      ))}
    </View>
  );
}

/**
 * Planner event Overview: services this kind of event usually needs, covered (booked / budgeted) or
 * to do, with Find vendors (bookings link to the event) and Add to budget at the suggested amount.
 */
export function SuggestedServicesCard({
  eventId,
  readOnly,
  refreshKey,
  onFind,
  onBudgetAdded,
}: {
  eventId: string;
  readOnly?: boolean;
  refreshKey?: unknown;
  onFind: (item: PlanItem) => void;
  onBudgetAdded?: () => void;
}) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    PlanningService.eventPlan(eventId)
      .then((r) => setPlan(r.data?.success ? r.data.data : null))
      .catch(() => setPlan(null))
      .finally(() => setLoading(false));
  }, [eventId]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const addToBudget = async (item: PlanItem) => {
    if (item.suggested_budget == null) return;
    setAdding(item.category.id);
    try {
      await EventsService.addBudgetItem(eventId, { category: item.category.name, allocated: item.suggested_budget, note: 'Suggested split' });
      setPlan((p) =>
        p
          ? {
              ...p,
              items: p.items.map((i) => (i.category.id === item.category.id ? { ...i, covered: true, covered_by: 'budget' } : i)),
              summary: p.summary ? { ...p.summary, covered: p.summary.covered + 1 } : p.summary,
            }
          : p,
      );
      onBudgetAdded?.();
    } catch (e) {
      Alert.alert('Budget', apiError(e));
    } finally {
      setAdding(null);
    }
  };

  return (
    <Card style={{ gap: 14 }}>
      <View style={s.titleRow}>
        <Text style={s.cardTitle} accessibilityRole="header">Suggested services</Text>
        {!!plan?.summary?.total && <Text style={s.share}>{`${plan.summary.covered} of ${plan.summary.total} covered`}</Text>}
      </View>
      {loading && !plan ? (
        <ActivityIndicator color={DARK.accent} accessibilityLabel="Loading suggestions" />
      ) : !plan ? (
        <Text style={s.why}>Suggestions aren’t available right now.</Text>
      ) : plan.items.length === 0 ? (
        <Text style={s.why}>No suggestions for this event yet.</Text>
      ) : (
        <>
          {(!plan.event?.type_set || plan.budget == null) && (
            <Text style={s.metaText}>
              {`${!plan.event?.type_set ? 'Set the event type for a list made for it. ' : ''}${plan.budget == null ? 'Add a total budget to see a suggested split.' : ''}`}
            </Text>
          )}
          {groupByPriority(plan.items).map((g) => (
            <View key={g.priority} style={{ gap: 10 }}>
              <Text style={s.group}>{PRIORITY_LABEL[g.priority]}</Text>
              {g.items.map((item) => (
                <View key={item.category.id} style={s.row}>
                  <View style={s.rowHead}>
                    <Ionicons
                      name={item.covered ? 'checkmark-circle' : 'ellipse-outline'}
                      size={22}
                      color={item.covered ? '#4ADE80' : DARK.muted}
                      accessibilityLabel={item.covered ? 'Covered' : 'To do'}
                    />
                    <Text style={[s.title, { flex: 1 }]}>{item.category.name}</Text>
                    <View style={[s.pill, item.covered && s.pillDone]}>
                      <Text style={[s.pillText, item.covered && { color: '#0B3B1E' }]}>
                        {item.covered && item.covered_by ? `✓ ${COVERED_LABEL[item.covered_by]}` : 'To do'}
                      </Text>
                    </View>
                  </View>
                  <Text style={s.why}>{item.why}</Text>
                  {!!item.tip && <Text style={s.metaText}>{item.tip}</Text>}
                  {!item.covered && <Meta item={item} />}
                  {!readOnly && !item.covered && (
                    <View style={s.actions}>
                      {item.suggested_budget != null && (
                        <Pressable
                          onPress={() => addToBudget(item)}
                          disabled={adding === item.category.id}
                          accessibilityRole="button"
                          accessibilityLabel={`Add to budget: ${item.category.name}, ${money(item.suggested_budget)}`}
                          accessibilityState={{ disabled: adding === item.category.id }}
                          style={({ pressed }) => [s.action, s.actionOutline, pressed && { opacity: 0.8 }]}
                        >
                          {adding === item.category.id ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="add" size={16} color="#fff" />}
                          <Text style={s.actionText}>{`Add ${money(item.suggested_budget)}`}</Text>
                        </Pressable>
                      )}
                      <FindVendorsButton item={item} onPress={() => onFind(item)} />
                    </View>
                  )}
                </View>
              ))}
            </View>
          ))}
        </>
      )}
    </Card>
  );
}

const s = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  cardTitle: { color: '#fff', fontSize: 16, fontFamily: FONTS.semibold },
  title: { color: '#fff', fontSize: 16, lineHeight: 22, fontFamily: FONTS.semibold, flexShrink: 1 },
  amount: { color: '#fff', fontSize: 16, fontFamily: FONTS.bold },
  share: { color: DARK.muted, fontSize: 12, fontFamily: FONTS.medium },
  why: { color: DARK.muted, fontSize: 14, lineHeight: 20, fontFamily: FONTS.regular },
  metaRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  metaText: { flex: 1, color: DARK.muted, fontSize: 13, lineHeight: 18, fontFamily: FONTS.regular },
  group: { color: DARK.accent, fontSize: 13, fontFamily: FONTS.semibold, textTransform: 'uppercase', letterSpacing: 0.6 },
  row: { gap: 8, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: DARK.field },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pill: { borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: DARK.field },
  pillDone: { backgroundColor: '#86EFAC' },
  pillText: { color: '#fff', fontSize: 11, fontFamily: FONTS.semibold },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 2 },
  action: { minHeight: 44, minWidth: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 16, borderRadius: 22 },
  actionOutline: { borderWidth: 1, borderColor: DARK.border, backgroundColor: 'transparent' },
  actionText: { color: '#fff', fontSize: 14, fontFamily: FONTS.semibold },
  empty: { alignItems: 'center', paddingVertical: 32, gap: 10, backgroundColor: DARK.card, borderRadius: 16 },
  emptyText: { color: DARK.muted, fontSize: 14, fontFamily: FONTS.medium },
});
