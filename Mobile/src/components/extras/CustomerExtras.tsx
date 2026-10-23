import React, { useEffect, useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AddCardSheet from '../AddCardSheet';
import { BrandGradient, Card, GradientButton, ui } from '../brand';
import Sheet from '../Sheet';
import { ExtraLine, NewEndTime, extraStyles as x } from './shared';
import { DARK, FONTS } from '../../constants/colors';
import { AddOnsService, money, type Extra, type ExtrasMeta } from '../../services/addons.service';
import { PaymentsService, type SavedCard } from '../../services/payments.service';
import { CardRow } from '../../screens/customer/PaymentMethods';
import { apiMessage } from '../../screens/auth/SignIn';
import { haptic } from '../../utils/haptics';

/** "Your vendor sent 1 request · $100.00", shown at the top of the booking while anything waits on the customer. */
export function ExtrasBanner({ meta, vendor, onPress }: { meta: ExtrasMeta | null; vendor: string; onPress: () => void }) {
  if (!meta?.waiting_on_customer) return null;
  const n = meta.waiting_on_customer;
  const text = `${vendor} sent ${n} request${n === 1 ? '' : 's'} · ${money(meta.waiting_total)}`;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${text}. Review now`} style={{ marginHorizontal: 20 }}>
      <BrandGradient style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16, borderRadius: 16 }}>
        <Ionicons name="notifications-outline" size={22} color="#fff" />
        <View style={{ flex: 1 }}>
          <Text style={{ color: '#fff', fontSize: 15, fontFamily: FONTS.semibold }}>{text}</Text>
          <Text style={{ color: '#fff', fontSize: 12, fontFamily: FONTS.medium, opacity: 0.85 }}>Nothing is charged until you approve</Text>
        </View>
        <Ionicons name="chevron-down" size={20} color="#fff" />
      </BrandGradient>
    </Pressable>
  );
}

/**
 * The customer's add-ons and fees on a booking: what they picked when booking, and anything the
 * vendor sent since, to approve (charged right away) or decline. A failed charge can be retried.
 */
export default function CustomerExtras({ bookingId, vendor, extras, meta, reload, onChanged }: { bookingId: string; vendor: string; extras: Extra[]; meta?: ExtrasMeta | null; reload: () => Promise<void>; onChanged?: () => void }) {
  const [approving, setApproving] = useState<Extra | null>(null);
  const [declining, setDeclining] = useState<Extra | null>(null);
  const [newCardFor, setNewCardFor] = useState<{ extra: Extra; retry: boolean } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const included = extras.filter((e) => e.status === 'INCLUDED');
  const requests = extras.filter((e) => e.status !== 'INCLUDED');
  if (!extras.length) return null;

  const after = async () => {
    await reload();
    onChanged?.();
  };

  const approve = async (e: Extra, paymentMethodId?: string) => {
    setBusy(e.id);
    try {
      const res = await AddOnsService.approve(e.id, paymentMethodId);
      const r = res.data?.data;
      setApproving(null);
      if (r?.paid) {
        haptic.success();
        Alert.alert('Approved and paid', `${money(e.total)} for ${e.name}. Vendly holds it with the rest of your booking.`);
      } else if (r?.payment?.status === 'FAILED') {
        haptic.warning();
        Alert.alert('Payment didn’t go through', `${r.payment.last_error ?? 'Your card was declined.'} Try again or use another card.`);
      } else {
        Alert.alert('Approved', 'We’re taking the payment now.');
      }
    } catch (err) {
      Alert.alert('Could not approve', apiMessage(err, 'Try again in a moment.'));
    } finally {
      setBusy(null);
      after();
    }
  };

  const retry = async (e: Extra, paymentMethodId?: string) => {
    if (!e.payment) return;
    setBusy(e.id);
    try {
      const res = await PaymentsService.retry(bookingId, e.payment.installment_id, paymentMethodId);
      if (res.data?.data?.status === 'PAID') {
        haptic.success();
        Alert.alert('Paid', `${money(e.total)} for ${e.name}.`);
      }
    } catch (err) {
      Alert.alert('Payment failed again', apiMessage(err, 'Try another card.'));
    } finally {
      setBusy(null);
      after();
    }
  };

  return (
    <Card style={{ gap: 12, borderWidth: 1, borderColor: DARK.field }}>
      <Text style={x.h2}>Add-ons and fees</Text>
      <NewEndTime extras={extras} meta={meta ?? null} />

      {included.length > 0 && <Text style={x.h3}>Included add-ons</Text>}
      {included.map((e) => <ExtraLine key={e.id} extra={e} role="CUSTOMER" />)}

      {requests.length > 0 && (
        <>
          <Text style={x.h3}>Sent by {vendor}</Text>
          <Text style={x.muted}>You’re only charged for what you approve.</Text>
        </>
      )}
      {requests.map((e) => {
        const failed = e.status === 'APPROVED' && e.payment?.status === 'FAILED';
        const off = busy === e.id;
        return (
          <ExtraLine key={e.id} extra={e} role="CUSTOMER">
            {e.status === 'PENDING' && (
              <View style={x.actions}>
                <Pressable
                  style={[x.smallBtn, off && { opacity: 0.5 }]}
                  disabled={off}
                  onPress={() => setDeclining(e)}
                  accessibilityRole="button"
                  accessibilityLabel={`Decline ${e.name}`}
                >
                  <Text style={x.smallBtnText}>Decline</Text>
                </Pressable>
                <GradientButton title={`Approve ${money(e.total)}`} onPress={() => setApproving(e)} loading={off} style={{ flex: 1 }} />
              </View>
            )}
            {failed && (
              <View style={x.actions}>
                <Pressable
                  style={[x.smallBtn, off && { opacity: 0.5 }]}
                  disabled={off}
                  onPress={() => retry(e)}
                  accessibilityRole="button"
                  accessibilityLabel={`Retry payment for ${e.name}`}
                >
                  <Text style={x.smallBtnText}>{off ? 'Trying…' : 'Retry'}</Text>
                </Pressable>
                <Pressable
                  style={[x.smallBtn, off && { opacity: 0.5 }]}
                  disabled={off}
                  onPress={() => setNewCardFor({ extra: e, retry: true })}
                  accessibilityRole="button"
                >
                  <Text style={x.smallBtnText}>Use another card</Text>
                </Pressable>
              </View>
            )}
          </ExtraLine>
        );
      })}

      <ApproveSheet
        extra={approving}
        busy={!!approving && busy === approving.id}
        onClose={() => setApproving(null)}
        onApprove={(pm) => approving && approve(approving, pm)}
        onNewCard={() => {
          const e = approving;
          setApproving(null);
          // let this sheet slide away before the card sheet opens (iOS shows one modal at a time)
          if (e) setTimeout(() => setNewCardFor({ extra: e, retry: false }), 450);
        }}
      />
      <DeclineSheet
        extra={declining}
        onClose={() => setDeclining(null)}
        onDone={() => {
          setDeclining(null);
          after();
        }}
      />
      <AddCardSheet
        visible={!!newCardFor}
        onClose={() => setNewCardFor(null)}
        onSaved={(pm) => {
          const job = newCardFor;
          setNewCardFor(null);
          if (job) (job.retry ? retry(job.extra, pm) : approve(job.extra, pm));
        }}
      />
    </Card>
  );
}

/** Approve and pay: the booking's card by default, or another saved card. */
function ApproveSheet({ extra, busy, onClose, onApprove, onNewCard }: { extra: Extra | null; busy: boolean; onClose: () => void; onApprove: (paymentMethodId?: string) => void; onNewCard: () => void }) {
  const [cards, setCards] = useState<SavedCard[]>([]);
  const [card, setCard] = useState<string | null>(null);

  useEffect(() => {
    if (!extra) return;
    setCard(null);
    PaymentsService.cards()
      .then((r) => setCards(r.data?.data ?? []))
      .catch(() => {});
  }, [extra]);

  const kind = extra?.kind === 'FEE' ? 'fee' : 'add-on';
  return (
    <Sheet
      visible={!!extra}
      onClose={onClose}
      title={`Approve ${kind}`}
      subtitle={extra ? `${extra.label}${extra.note ? ` · “${extra.note}”` : ''}` : undefined}
      footer={<GradientButton title={extra ? `Approve and pay ${money(extra.total)}` : 'Approve'} onPress={() => onApprove(card ?? undefined)} loading={busy} />}
    >
      {extra && (
        <View style={{ gap: 6 }}>
          <Row label={extra.kind === 'FEE' ? 'Fee' : 'Add-on'} value={money(extra.amount)} />
          {extra.fee_amount > 0 && <Row label="Vendly Protection fee" value={money(extra.fee_amount)} />}
          <Row label="Total" value={money(extra.total)} bold />
        </View>
      )}
      <View style={{ gap: 10 }}>
        <Text style={x.label}>Pay with</Text>
        <Pressable
          style={({ pressed }) => [rowStyle, card === null && { borderColor: DARK.border }, pressed && { opacity: 0.7 }]}
          onPress={() => setCard(null)}
          accessibilityRole="radio"
          accessibilityState={{ selected: card === null }}
        >
          <Ionicons name="card-outline" size={22} color={DARK.accent} />
          <Text style={{ flex: 1, color: '#fff', fontSize: 15, fontFamily: FONTS.medium }}>The card on this booking</Text>
          <Ionicons name={card === null ? 'radio-button-on' : 'radio-button-off'} size={22} color={card === null ? DARK.accent : DARK.muted} />
        </Pressable>
        {cards.map((c) => <CardRow key={c.id} card={c} selected={card === c.id} onPress={() => setCard(c.id)} />)}
        <Pressable onPress={onNewCard} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 }} accessibilityRole="button">
          <Ionicons name="add-circle-outline" size={22} color={DARK.accent} />
          <Text style={{ color: DARK.accent, fontSize: 15, fontFamily: FONTS.semibold }}>Use a new card</Text>
        </Pressable>
      </View>
      <Text style={x.muted}>It’s charged now. Vendly holds it with the rest of your booking.</Text>
    </Sheet>
  );
}

const rowStyle = { minHeight: 56, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, paddingHorizontal: 14, borderRadius: 16, backgroundColor: DARK.field, borderWidth: 1, borderColor: 'transparent' };

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  const st = { color: bold ? '#fff' : DARK.muted, fontSize: bold ? 16 : 15, fontFamily: bold ? FONTS.semibold : FONTS.regular };
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
      <Text style={st}>{label}</Text>
      <Text style={[st, { color: '#fff' }]}>{value}</Text>
    </View>
  );
}

function DeclineSheet({ extra, onClose, onDone }: { extra: Extra | null; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const [sending, setSending] = useState(false);
  useEffect(() => {
    if (extra) setReason('');
  }, [extra]);

  const send = async () => {
    if (!extra) return;
    setSending(true);
    try {
      await AddOnsService.decline(extra.id, reason.trim() || undefined);
      onDone();
    } catch (err) {
      Alert.alert('Could not decline', apiMessage(err, 'Try again in a moment.'));
    } finally {
      setSending(false);
    }
  };

  return (
    <Sheet
      visible={!!extra}
      onClose={onClose}
      title={`Decline ${extra?.kind === 'FEE' ? 'fee' : 'add-on'}?`}
      subtitle={extra ? `${extra.label} · ${money(extra.total)}. You won’t be charged.${extra.kind === 'FEE' ? ' If the vendor thinks it’s owed under the contract, they can ask Vendly to review it.' : ''}` : undefined}
      footer={<GradientButton title="Decline" onPress={send} loading={sending} />}
    >
      <View style={[ui.field, x.textarea]}>
        <TextInput
          style={[ui.input, { minHeight: 72, textAlignVertical: 'top' }]}
          placeholder="Reason (optional), shared with the vendor"
          placeholderTextColor={DARK.muted}
          value={reason}
          onChangeText={setReason}
          maxLength={1000}
          multiline
          accessibilityLabel="Reason for declining, optional"
        />
      </View>
    </Sheet>
  );
}
