import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import { Chip, Field, GradientButton, ui } from './brand';
import Sheet, { CheckRow } from './Sheet';
import { DARK, FONTS } from '../constants/colors';
import { UNIT_OPTIONS, priceText, type AddOn, type AddOnInput, type AddOnKind, type AddOnUnit } from '../services/addons.service';
import { apiMessage } from '../screens/auth/SignIn';

export type AddOnDraft = Pick<AddOnInput, 'name' | 'description' | 'price' | 'price_unit' | 'max_quantity' | 'in_library'> & { kind: AddOnKind };

/**
 * Create or edit an add-on or fee: name, description, price, how it's charged (once / per person /
 * per hour / each, with a limit for "each"). With `libraryToggle`, the vendor chooses whether it also
 * goes into their library or stays on this package only.
 */
export default function AddOnSheet({
  visible,
  kind,
  initial,
  libraryToggle,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  kind: AddOnKind;
  /** prefill (an existing item, or an idea); `id` means editing */
  initial?: Partial<AddOn> | null;
  libraryToggle?: boolean;
  onClose: () => void;
  /** throw to keep the sheet open; the error is shown */
  onSubmit: (draft: AddOnDraft) => Promise<void> | void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [unit, setUnit] = useState<AddOnUnit>('FIXED');
  const [max, setMax] = useState('');
  const [inLibrary, setInLibrary] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setName(initial?.name ?? '');
    setDescription(initial?.description ?? '');
    setPrice(initial?.price != null && (initial.id || initial.price > 0) ? String(initial.price) : '');
    setUnit(initial?.price_unit ?? 'FIXED');
    setMax(initial?.max_quantity ? String(initial.max_quantity) : '');
    setInLibrary(initial?.in_library ?? false);
  }, [visible, initial]);

  const word = kind === 'FEE' ? 'fee' : 'add-on';
  const editing = !!initial?.id;
  const amount = Number(price);

  const save = async () => {
    if (name.trim().length < 2) return Alert.alert('Name', `Give the ${word} a name customers will recognise.`);
    if (!price.trim() || Number.isNaN(amount) || amount < 0) return Alert.alert('Price', 'Enter a price (0 or more).');
    const maxQ = unit === 'PER_ITEM' && max ? Math.floor(Number(max)) : null;
    if (maxQ != null && !(maxQ >= 1)) return Alert.alert('Most per booking', 'Enter 1 or more, or leave it empty for no limit.');
    setSaving(true);
    try {
      await onSubmit({
        kind,
        name: name.trim(),
        description: description.trim() || undefined,
        price: Math.round(amount * 100) / 100,
        price_unit: unit,
        max_quantity: unit === 'PER_ITEM' ? maxQ : null,
        in_library: libraryToggle ? inLibrary : undefined,
      });
      onClose();
    } catch (err) {
      Alert.alert(`Could not save the ${word}`, apiMessage(err, 'Try again in a moment.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={editing ? `Edit ${word}` : kind === 'FEE' ? 'New fee' : 'New add-on'}
      subtitle={kind === 'FEE' ? 'Fees are only requested after a job, and the customer approves each one before it’s charged.' : undefined}
      footer={<GradientButton title={editing ? 'Save changes' : `Save ${word}`} onPress={save} loading={saving} />}
    >
      <Field
        label="Name"
        placeholder={kind === 'FEE' ? 'e.g. Late return' : 'e.g. Bartender'}
        value={name}
        onChangeText={setName}
        maxLength={120}
        accessibilityLabel="Name"
      />

      <View style={{ gap: 8 }}>
        <Text style={ui.label}>Description (optional)</Text>
        <View style={[ui.field, s.textarea]}>
          <TextInput
            style={[ui.input, { minHeight: 64, textAlignVertical: 'top' }]}
            placeholder={kind === 'FEE' ? 'When it applies' : 'What the customer gets'}
            placeholderTextColor={DARK.muted}
            value={description}
            onChangeText={setDescription}
            maxLength={500}
            multiline
            accessibilityLabel="Description"
          />
        </View>
      </View>

      <View style={{ gap: 8 }}>
        <Text style={ui.label}>Price</Text>
        <View style={ui.field}>
          <Text style={s.currency}>$</Text>
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
        <View style={s.chips}>
          {UNIT_OPTIONS.map((u) => (
            <Chip key={u.value} label={u.label} active={unit === u.value} onPress={() => setUnit(u.value)} />
          ))}
        </View>
        {price.trim() !== '' && !Number.isNaN(amount) && <Text style={s.hint}>Shows as {priceText(amount, unit)}</Text>}
      </View>

      {unit === 'PER_ITEM' && (
        <Field
          label="Most per booking (optional)"
          placeholder="No limit"
          value={max}
          onChangeText={(t) => setMax(t.replace(/\D/g, ''))}
          keyboardType="number-pad"
          accessibilityLabel="Most a customer can pick per booking"
        />
      )}

      {libraryToggle && (
        <CheckRow
          checked={inLibrary}
          onPress={() => setInLibrary((v) => !v)}
          title="Save to my library"
          subtitle={inLibrary ? 'You can add it to other packages too' : 'Just for this package'}
        />
      )}
    </Sheet>
  );
}

const s = StyleSheet.create({
  textarea: { height: undefined, paddingVertical: 12, alignItems: 'flex-start' },
  currency: { color: DARK.muted, fontSize: 18, fontFamily: FONTS.medium },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  hint: { color: DARK.muted, fontSize: 12, fontFamily: FONTS.medium },
});
