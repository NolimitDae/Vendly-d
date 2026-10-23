import React, { useEffect, useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';
import { Card, Chip, Field, GradientButton, ui } from '../brand';
import Sheet, { CheckRow } from '../Sheet';
import { ExtraLine, NewEndTime, extraStyles as x } from './shared';
import { DARK } from '../../constants/colors';
import { AddOnsService, EXTEND_CHOICES, UNIT_OPTIONS, durationText, extendChip, money, useBookingExtras, type AddOn, type AddOnKind, type AddOnUnit, type Extra } from '../../services/addons.service';
import { apiMessage } from '../../screens/auth/SignIn';
import { haptic } from '../../utils/haptics';

interface BookingLite {
  id: string;
  status: string;
  guest_count?: number | null;
  listing?: { id: string } | null;
  customer?: { name: string } | null;
}

const QTY_LABEL: Record<AddOnUnit, string> = { FIXED: '', PER_PERSON: 'Guests', PER_HOUR: 'Hours', PER_ITEM: 'Quantity' };

/**
 * The vendor's side of a booking's add-ons and fees: what the customer picked, requests sent since
 * and their status, sending a new add-on or fee, withdrawing, asking Vendly to review a fee, and
 * giving money back.
 */
export default function VendorExtras({ booking, onChanged }: { booking: BookingLite; onChanged?: () => void }) {
  const { extras, meta, loaded, reload } = useBookingExtras(booking.id);
  const [requestKind, setRequestKind] = useState<AddOnKind | null>(null);
  const [escalating, setEscalating] = useState<Extra | null>(null);
  const [givingBack, setGivingBack] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const customer = booking.customer?.name?.split(' ')[0] || 'The customer';

  const included = extras.filter((e) => e.status === 'INCLUDED');
  const requests = extras.filter((e) => e.status !== 'INCLUDED');
  const canAddOn = !!meta?.can_request.add_on;
  const canFee = !!meta?.can_request.fee;
  const canGiveBack = ['CONFIRMED', 'IN_PROGRESS', 'COMPLETED'].includes(booking.status);
  const live = ['CONFIRMED', 'IN_PROGRESS', 'COMPLETED'].includes(booking.status);
  const lockedHint =
    canFee ? null
    : booking.status === 'CONFIRMED' ? 'Fees can be requested once the job has started.'
    : canAddOn ? null
    : 'Add-ons and fees can be sent during the job and up to 14 days after it’s complete (not while a dispute is open).';

  if (!loaded || (!live && extras.length === 0)) return null;

  const withdraw = (e: Extra) =>
    Alert.alert(`Withdraw “${e.name}”?`, e.status === 'PENDING' ? `${customer} won’t be asked to pay it.` : 'It will be closed.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Withdraw',
        style: 'destructive',
        onPress: async () => {
          setBusy(e.id);
          try {
            await AddOnsService.withdraw(e.id);
            await reload();
          } catch (err) {
            Alert.alert('Could not withdraw', apiMessage(err, 'Try again in a moment.'));
          } finally {
            setBusy(null);
          }
        },
      },
    ]);

  const now = Date.now();
  const escalateState = (e: Extra): 'now' | 'later' | null => {
    if (e.kind !== 'FEE') return null;
    if (e.status === 'DECLINED') return 'now';
    if (e.status === 'PENDING' && e.can_escalate_at) return new Date(e.can_escalate_at).getTime() <= now ? 'now' : 'later';
    return null;
  };

  return (
    <>
      <Card style={{ gap: 12, borderWidth: 1, borderColor: DARK.field }}>
        <Text style={x.h2}>Add-ons and fees</Text>
        <Text style={x.muted}>Send {customer} an add-on they asked for, or a fee after the job. They approve each one before it’s charged.</Text>
        <NewEndTime extras={extras} meta={meta} />

        {included.length > 0 && <Text style={x.h3}>Booked with the package</Text>}
        {included.map((e) => <ExtraLine key={e.id} extra={e} role="VENDOR" />)}

        {requests.length > 0 && <Text style={x.h3}>Sent since booking</Text>}
        {requests.map((e) => {
          const esc = escalateState(e);
          const canWithdraw = e.status === 'PENDING' || e.status === 'DECLINED' || e.status === 'IN_REVIEW';
          return (
            <ExtraLine key={e.id} extra={e} role="VENDOR">
              {esc === 'later' && e.can_escalate_at && (
                <Text style={x.muted}>If {customer} doesn’t answer, you can ask Vendly to review it from {format(parseISO(e.can_escalate_at), 'dd MMM, h:mm a')}.</Text>
              )}
              {(canWithdraw || esc === 'now') && (
                <View style={x.actions}>
                  {esc === 'now' && (
                    <Pressable style={x.smallBtn} onPress={() => setEscalating(e)} accessibilityRole="button" accessibilityLabel={`Ask Vendly to review ${e.name}`}>
                      <Text style={x.smallBtnText}>Ask Vendly to review</Text>
                    </Pressable>
                  )}
                  {canWithdraw && (
                    <Pressable
                      style={[x.smallBtn, busy === e.id && { opacity: 0.5 }]}
                      disabled={busy === e.id}
                      onPress={() => withdraw(e)}
                      accessibilityRole="button"
                      accessibilityLabel={`Withdraw ${e.name}`}
                    >
                      <Text style={x.smallBtnText}>Withdraw</Text>
                    </Pressable>
                  )}
                </View>
              )}
            </ExtraLine>
          );
        })}

        {live && (
          <>
            <View style={[x.actions, { marginTop: 8 }]}>
              <Pressable
                style={[x.bigBtn, !canFee && { opacity: 0.4 }]}
                disabled={!canFee}
                onPress={() => setRequestKind('FEE')}
                accessibilityRole="button"
                accessibilityState={{ disabled: !canFee }}
              >
                <Ionicons name="receipt-outline" size={18} color={DARK.accent} />
                <Text style={x.bigBtnText}>Request a fee</Text>
              </Pressable>
              <Pressable
                style={[x.bigBtn, !canAddOn && { opacity: 0.4 }]}
                disabled={!canAddOn}
                onPress={() => setRequestKind('ADD_ON')}
                accessibilityRole="button"
                accessibilityState={{ disabled: !canAddOn }}
              >
                <Ionicons name="add-circle-outline" size={18} color={DARK.accent} />
                <Text style={x.bigBtnText}>Add an add-on</Text>
              </Pressable>
            </View>
            {!!lockedHint && <Text style={x.muted}>{lockedHint}</Text>}
          </>
        )}
      </Card>

      {canGiveBack && (
        <Card style={{ gap: 10 }}>
          <Text style={x.h2}>Give money back</Text>
          <Text style={x.muted}>Something not right? Give {customer} money off from your part. It lowers what they still owe first, then refunds what they paid.</Text>
          <Pressable style={x.bigBtn} onPress={() => setGivingBack(true)} accessibilityRole="button">
            <Ionicons name="return-down-back-outline" size={18} color={DARK.accent} />
            <Text style={x.bigBtnText}>Give money back</Text>
          </Pressable>
        </Card>
      )}

      <RequestSheet
        kind={requestKind}
        booking={booking}
        onClose={() => setRequestKind(null)}
        onSent={() => {
          reload();
          onChanged?.();
        }}
      />
      <EscalateSheet extra={escalating} onClose={() => setEscalating(null)} onSent={reload} />
      <GiveBackSheet
        visible={givingBack}
        bookingId={booking.id}
        customer={customer}
        onClose={() => setGivingBack(false)}
        onDone={() => {
          reload();
          onChanged?.();
        }}
      />
    </>
  );
}

/** Send an add-on or fee: pick one from the library (prefills) or type a custom one, with a reason. */
function RequestSheet({ kind, booking, onClose, onSent }: { kind: AddOnKind | null; booking: BookingLite; onClose: () => void; onSent: () => void }) {
  const [library, setLibrary] = useState<AddOn[]>([]);
  const [fromId, setFromId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [unit, setUnit] = useState<AddOnUnit>('FIXED');
  const [qty, setQty] = useState('1');
  const [note, setNote] = useState('');
  // add-ons only: time it adds to the booking; a per hour add-on starts at its hours until the vendor picks
  const [extendPick, setExtendPick] = useState<number | null | undefined>(undefined);
  const [sending, setSending] = useState(false);
  const guests = booking.guest_count ? String(booking.guest_count) : '';

  useEffect(() => {
    if (!kind) return;
    setFromId(null);
    setName('');
    setPrice('');
    setUnit('FIXED');
    setQty('1');
    setNote('');
    setExtendPick(undefined);
    setLibrary([]);
    AddOnsService.list(kind, booking.listing?.id)
      .then((r) => setLibrary(r.data?.data ?? []))
      .catch(() => {});
  }, [kind, booking.listing?.id]);

  const pickUnit = (u: AddOnUnit) => {
    setUnit(u);
    setQty(u === 'PER_PERSON' ? guests : '1');
  };
  const pick = (a: AddOn) => {
    haptic.select();
    if (fromId === a.id) return setFromId(null);
    setFromId(a.id);
    setName(a.name);
    setPrice(String(a.price));
    pickUnit(a.price_unit);
  };

  const word = kind === 'FEE' ? 'fee' : 'add-on';
  const unitPrice = Number(price);
  const quantity = unit === 'FIXED' ? 1 : Number(qty);
  const amount = Math.round(unitPrice * quantity * 100) / 100;
  const lib = library.find((a) => a.id === fromId);
  const hourDefault = unit === 'PER_HOUR' && quantity > 0 ? Math.round(quantity * 60) : null;
  const extendsMinutes =
    kind !== 'ADD_ON' ? null : extendPick !== undefined ? extendPick : hourDefault && (EXTEND_CHOICES as readonly number[]).includes(hourDefault) ? hourDefault : null;

  const send = async () => {
    if (!kind) return;
    if (name.trim().length < 2) return Alert.alert('Name', `Give the ${word} a name ${booking.customer?.name ?? 'the customer'} will recognise.`);
    if (!(unitPrice >= 0.5)) return Alert.alert('Price', 'Enter a price of at least $0.50.');
    if (!(quantity > 0)) return Alert.alert(QTY_LABEL[unit] || 'Quantity', `Enter how many ${unit === 'PER_PERSON' ? 'guests' : unit === 'PER_HOUR' ? 'hours' : 'items'}.`);
    if (unit !== 'PER_HOUR' && !Number.isInteger(quantity)) return Alert.alert('Quantity', 'Only hours can be a fraction (like 1.5).');
    if (unit === 'PER_ITEM' && lib?.max_quantity && quantity > lib.max_quantity) return Alert.alert('Quantity', `Up to ${lib.max_quantity} of “${name.trim()}”.`);
    setSending(true);
    try {
      await AddOnsService.request(booking.id, {
        kind,
        add_on_id: fromId ?? undefined,
        name: name.trim(),
        unit_price: unitPrice,
        price_unit: unit,
        quantity,
        note: note.trim() || undefined,
        extends_minutes: extendsMinutes ?? undefined,
      });
      haptic.success();
      onClose();
      onSent();
      Alert.alert('Sent for approval', `${booking.customer?.name ?? 'The customer'} will be asked to approve it. Nothing is charged until they do.`);
    } catch (err) {
      Alert.alert(`Could not send the ${word}`, apiMessage(err, 'Try again in a moment.'));
    } finally {
      setSending(false);
    }
  };

  return (
    <Sheet
      visible={!!kind}
      onClose={onClose}
      title={kind === 'FEE' ? 'Request a fee' : 'Add an add-on'}
      subtitle={kind === 'FEE' ? 'For something that happened during the job, like a late return. The customer approves it before it’s charged.' : 'For something extra the customer asked for. They approve and pay for it in the app.'}
      footer={
        <GradientButton
          title={amount > 0 ? `Send ${money(amount)} for approval` : 'Send for approval'}
          onPress={send}
          loading={sending}
        />
      }
    >
      {library.length > 0 && (
        <View style={{ gap: 2 }}>
          <Text style={x.label}>From your library</Text>
          {library.map((a) => (
            <CheckRow key={a.id} checked={fromId === a.id} onPress={() => pick(a)} title={a.name} subtitle={a.price_text} />
          ))}
        </View>
      )}
      <Field label={library.length ? 'Or type a name' : 'Name'} placeholder={kind === 'FEE' ? 'e.g. Late return' : 'e.g. Extra hour'} value={name} onChangeText={setName} maxLength={120} />
      <View style={{ gap: 8 }}>
        <Text style={ui.label}>Price</Text>
        <View style={ui.field}>
          <Text style={x.currency}>$</Text>
          <TextInput
            style={ui.input}
            placeholder="0.00"
            placeholderTextColor={DARK.muted}
            value={price}
            onChangeText={(t) => setPrice(t.replace(/[^0-9.]/g, ''))}
            keyboardType="decimal-pad"
            accessibilityLabel="Price in dollars"
          />
        </View>
        <View style={x.chips}>
          {UNIT_OPTIONS.map((u) => <Chip key={u.value} label={u.label} active={unit === u.value} onPress={() => pickUnit(u.value)} />)}
        </View>
      </View>
      {unit !== 'FIXED' && (
        <Field
          label={QTY_LABEL[unit]}
          placeholder={unit === 'PER_HOUR' ? 'e.g. 1.5' : unit === 'PER_PERSON' ? 'Number of guests' : '1'}
          value={qty}
          onChangeText={(t) => setQty(t.replace(unit === 'PER_HOUR' ? /[^0-9.]/g : /\D/g, ''))}
          keyboardType={unit === 'PER_HOUR' ? 'decimal-pad' : 'number-pad'}
          accessibilityLabel={QTY_LABEL[unit]}
        />
      )}
      {kind === 'ADD_ON' && (
        <View style={{ gap: 8 }}>
          <Text style={ui.label}>Adds time to the booking (optional)</Text>
          <View style={x.chips}>
            {[null, ...EXTEND_CHOICES].map((m) => (
              <Chip key={m ?? 'none'} label={m === null ? 'No extra time' : extendChip(m)} active={extendsMinutes === m} onPress={() => setExtendPick(m)} />
            ))}
          </View>
          {!!extendsMinutes && <Text style={x.muted}>When the customer approves, the booking ends {durationText(extendsMinutes)} later.</Text>}
        </View>
      )}
      <View style={{ gap: 8 }}>
        <Text style={ui.label}>Reason (shown to the customer)</Text>
        <View style={[ui.field, x.textarea]}>
          <TextInput
            style={[ui.input, { minHeight: 64, textAlignVertical: 'top' }]}
            placeholder={kind === 'FEE' ? 'e.g. Items returned 3 hours late' : 'e.g. You asked for an extra hour of music'}
            placeholderTextColor={DARK.muted}
            value={note}
            onChangeText={setNote}
            maxLength={1000}
            multiline
            accessibilityLabel="Reason, shown to the customer"
          />
        </View>
      </View>
      {amount > 0 && (
        <Text style={x.muted}>
          {unit !== 'FIXED' ? `${money(unitPrice)} × ${quantity} = ${money(amount)}. ` : ''}
          {kind === 'ADD_ON' ? 'The customer also pays the Vendly Protection fee on add-ons.' : 'No Vendly Protection fee is added to fees.'}
        </Text>
      )}
    </Sheet>
  );
}

/** A declined or unanswered fee goes to Vendly, with the vendor's reason. */
function EscalateSheet({ extra, onClose, onSent }: { extra: Extra | null; onClose: () => void; onSent: () => void }) {
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  useEffect(() => {
    if (extra) setNote('');
  }, [extra]);

  const send = async () => {
    if (!extra) return;
    setSending(true);
    try {
      await AddOnsService.escalate(extra.id, note.trim());
      haptic.success();
      onClose();
      onSent();
      Alert.alert('Sent to Vendly', 'We’ll check the contract and the booking and let you both know.');
    } catch (err) {
      Alert.alert('Could not send', apiMessage(err, 'Try again in a moment.'));
    } finally {
      setSending(false);
    }
  };

  return (
    <Sheet
      visible={!!extra}
      onClose={onClose}
      title="Ask Vendly to review"
      subtitle={extra ? `${extra.label} · ${money(extra.amount)}. Tell us why it’s owed. Proof photos on the booking help.` : undefined}
      footer={<GradientButton title="Send to Vendly" onPress={send} loading={sending} disabled={note.trim().length < 10} />}
    >
      <View style={[ui.field, x.textarea]}>
        <TextInput
          style={[ui.input, { minHeight: 96, textAlignVertical: 'top' }]}
          placeholder="Why the fee is owed (at least 10 characters)"
          placeholderTextColor={DARK.muted}
          value={note}
          onChangeText={setNote}
          maxLength={2000}
          multiline
          accessibilityLabel="Why the fee is owed"
        />
      </View>
    </Sheet>
  );
}

/** Money off for the customer, from the vendor's part of the booking. */
function GiveBackSheet({ visible, bookingId, customer, onClose, onDone }: { visible: boolean; bookingId: string; customer: string; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [sending, setSending] = useState(false);
  useEffect(() => {
    if (visible) {
      setAmount('');
      setReason('');
    }
  }, [visible]);

  const value = Math.round(Number(amount) * 100) / 100;
  const ok = value >= 1 && reason.trim().length >= 3;

  const send = async () => {
    setSending(true);
    try {
      const res = await AddOnsService.giveBack(bookingId, value, reason.trim());
      const r = res.data?.data;
      haptic.success();
      onClose();
      onDone();
      const parts = [
        r?.lowered ? `${money(r.lowered)} taken off what ${customer} still owes` : '',
        r?.refunded ? `${money(r.refunded)} refunded to their card` : '',
      ].filter(Boolean);
      Alert.alert(
        `${money(r?.amount ?? value)} given back`,
        `${parts.join(', and ')}${parts.length ? '.' : ''}${r?.recovered_from_balance ? ` ${money(r.recovered_from_balance)} comes from your Vendly balance because it was already paid out.` : ''}`.trim(),
      );
    } catch (err) {
      Alert.alert('Could not give money back', apiMessage(err, 'Try again in a moment.'));
    } finally {
      setSending(false);
    }
  };

  const confirm = () =>
    Alert.alert(`Give ${money(value)} back to ${customer}?`, 'This can’t be undone. Vendly’s fee isn’t refunded.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Give it back', onPress: send },
    ]);

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Give money back"
      subtitle="Lowers what the customer still owes first, then refunds what they paid. If you’ve already been paid out, it comes from your balance."
      footer={<GradientButton title={value >= 1 ? `Give ${money(value)} back` : 'Give money back'} onPress={confirm} loading={sending} disabled={!ok} />}
    >
      <View style={{ gap: 8 }}>
        <Text style={ui.label}>Amount</Text>
        <View style={ui.field}>
          <Text style={x.currency}>$</Text>
          <TextInput
            style={ui.input}
            placeholder="0.00"
            placeholderTextColor={DARK.muted}
            value={amount}
            onChangeText={(t) => setAmount(t.replace(/[^0-9.]/g, ''))}
            keyboardType="decimal-pad"
            accessibilityLabel="Amount in dollars"
          />
        </View>
      </View>
      <View style={{ gap: 8 }}>
        <Text style={ui.label}>Reason (shown to the customer)</Text>
        <View style={[ui.field, x.textarea]}>
          <TextInput
            style={[ui.input, { minHeight: 64, textAlignVertical: 'top' }]}
            placeholder="e.g. Sorry the setup started late"
            placeholderTextColor={DARK.muted}
            value={reason}
            onChangeText={setReason}
            maxLength={500}
            multiline
            accessibilityLabel="Reason, shown to the customer"
          />
        </View>
      </View>
      <Text style={x.muted}>If it’s more than you can give back, we’ll tell you the most you can.</Text>
    </Sheet>
  );
}
