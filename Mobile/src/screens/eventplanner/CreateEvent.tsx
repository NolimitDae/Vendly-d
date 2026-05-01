import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Platform,
  Alert,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useNavigation } from '@react-navigation/native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/colors';
import { EventsService, EventType } from '../../services/events.service';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { EventPlannerStackParams } from '../../navigation/types';

type Nav = NativeStackNavigationProp<EventPlannerStackParams>;

const EVENT_TYPES: { label: string; value: EventType }[] = [
  { label: 'Wedding', value: 'WEDDING' },
  { label: 'Birthday', value: 'BIRTHDAY' },
  { label: 'Corporate', value: 'CORPORATE' },
  { label: 'Concert', value: 'CONCERT' },
  { label: 'Conference', value: 'CONFERENCE' },
  { label: 'Private Party', value: 'PRIVATE_PARTY' },
  { label: 'Other', value: 'OTHER' },
];

const schema = z.object({
  name: z.string().min(2, 'Event name must be at least 2 characters'),
  type: z.enum(['WEDDING', 'BIRTHDAY', 'CORPORATE', 'CONCERT', 'CONFERENCE', 'PRIVATE_PARTY', 'OTHER']).optional(),
  venue: z.string().optional(),
  guest_count: z
    .string()
    .optional()
    .refine((v) => !v || /^\d+$/.test(v), 'Must be a number'),
  total_budget: z
    .string()
    .optional()
    .refine((v) => !v || /^\d+(\.\d+)?$/.test(v), 'Must be a number'),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export default function CreateEvent() {
  const nav = useNavigation<Nav>();
  const [date, setDate] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [typeOpen, setTypeOpen] = useState(false);

  const {
    control,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const selectedType = watch('type');

  const onSubmit = async (values: FormValues) => {
    setSubmitting(true);
    try {
      const res = await EventsService.create({
        name: values.name,
        type: values.type,
        date: date ? date.toISOString() : undefined,
        venue: values.venue || undefined,
        guest_count: values.guest_count ? parseInt(values.guest_count) : undefined,
        total_budget: values.total_budget ? parseFloat(values.total_budget) : undefined,
        notes: values.notes || undefined,
      });
      if (res.data?.success) {
        nav.navigate('EventDetail', {
          eventId: res.data.data.id,
          eventName: res.data.data.name,
        });
      } else {
        Alert.alert('Error', 'Failed to create event');
      }
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message ?? 'Failed to create event');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={s.root} contentContainerStyle={{ paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
      <View style={s.form}>
        {/* Event Name */}
        <Field label="Event Name *" error={errors.name?.message}>
          <Controller
            control={control}
            name="name"
            render={({ field: { onChange, value } }) => (
              <TextInput
                style={[s.input, errors.name && s.inputError]}
                placeholder="e.g. Sarah & John's Wedding"
                value={value}
                onChangeText={onChange}
              />
            )}
          />
        </Field>

        {/* Event Type */}
        <Field label="Event Type" error={errors.type?.message}>
          <TouchableOpacity style={s.select} onPress={() => setTypeOpen(!typeOpen)}>
            <Text style={selectedType ? s.selectValue : s.selectPlaceholder}>
              {selectedType
                ? EVENT_TYPES.find((t) => t.value === selectedType)?.label ?? selectedType
                : 'Select type...'}
            </Text>
            <Ionicons name={typeOpen ? 'chevron-up' : 'chevron-down'} size={16} color={COLORS.gray[400]} />
          </TouchableOpacity>
          {typeOpen && (
            <View style={s.dropdown}>
              {EVENT_TYPES.map((t) => (
                <TouchableOpacity
                  key={t.value}
                  style={[s.dropdownItem, selectedType === t.value && s.dropdownItemActive]}
                  onPress={() => { setValue('type', t.value); setTypeOpen(false); }}
                >
                  <Text style={[s.dropdownText, selectedType === t.value && s.dropdownTextActive]}>
                    {t.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </Field>

        {/* Date */}
        <Field label="Event Date">
          <TouchableOpacity
            style={s.input}
            onPress={() => setShowDatePicker(true)}
          >
            <Text style={date ? s.selectValue : s.selectPlaceholder}>
              {date ? format(date, 'MMMM d, yyyy') : 'Select date...'}
            </Text>
          </TouchableOpacity>
          {showDatePicker && (
            <DateTimePicker
              value={date ?? new Date()}
              mode="date"
              minimumDate={new Date()}
              onChange={(_, selected) => {
                setShowDatePicker(Platform.OS === 'ios');
                if (selected) setDate(selected);
              }}
            />
          )}
          {Platform.OS === 'ios' && showDatePicker && (
            <TouchableOpacity style={s.doneBtn} onPress={() => setShowDatePicker(false)}>
              <Text style={s.doneBtnText}>Done</Text>
            </TouchableOpacity>
          )}
        </Field>

        {/* Venue */}
        <Field label="Venue" error={errors.venue?.message}>
          <Controller
            control={control}
            name="venue"
            render={({ field: { onChange, value } }) => (
              <TextInput
                style={s.input}
                placeholder="e.g. Grand Ballroom, NYC"
                value={value}
                onChangeText={onChange}
              />
            )}
          />
        </Field>

        {/* Guest Count + Budget (side by side) */}
        <View style={s.row}>
          <View style={{ flex: 1 }}>
            <Field label="Guest Count" error={errors.guest_count?.message}>
              <Controller
                control={control}
                name="guest_count"
                render={({ field: { onChange, value } }) => (
                  <TextInput
                    style={[s.input, errors.guest_count && s.inputError]}
                    placeholder="150"
                    value={value}
                    onChangeText={onChange}
                    keyboardType="numeric"
                  />
                )}
              />
            </Field>
          </View>
          <View style={{ width: 12 }} />
          <View style={{ flex: 1 }}>
            <Field label="Total Budget ($)" error={errors.total_budget?.message}>
              <Controller
                control={control}
                name="total_budget"
                render={({ field: { onChange, value } }) => (
                  <TextInput
                    style={[s.input, errors.total_budget && s.inputError]}
                    placeholder="10000"
                    value={value}
                    onChangeText={onChange}
                    keyboardType="decimal-pad"
                  />
                )}
              />
            </Field>
          </View>
        </View>

        {/* Notes */}
        <Field label="Notes" error={errors.notes?.message}>
          <Controller
            control={control}
            name="notes"
            render={({ field: { onChange, value } }) => (
              <TextInput
                style={[s.input, s.textarea]}
                placeholder="Any special requirements or notes..."
                value={value}
                onChangeText={onChange}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
            )}
          />
        </Field>

        <TouchableOpacity
          style={[s.submitBtn, submitting && s.submitBtnDisabled]}
          onPress={handleSubmit(onSubmit)}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color={COLORS.white} />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={20} color={COLORS.white} />
              <Text style={s.submitText}>Create Event</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      {children}
      {error && <Text style={s.error}>{error}</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.gray[50] },
  form: { padding: 20 },
  field: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: COLORS.gray[700], marginBottom: 6 },
  input: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.gray[200],
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: COLORS.gray[900],
  },
  inputError: { borderColor: '#ef4444' },
  textarea: { height: 100 },
  error: { fontSize: 12, color: '#ef4444', marginTop: 4 },
  select: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.gray[200],
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectValue: { fontSize: 15, color: COLORS.gray[900] },
  selectPlaceholder: { fontSize: 15, color: COLORS.gray[400] },
  dropdown: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.gray[200],
    borderRadius: 10,
    marginTop: 4,
    overflow: 'hidden',
  },
  dropdownItem: { paddingHorizontal: 14, paddingVertical: 12 },
  dropdownItemActive: { backgroundColor: COLORS.primaryBg },
  dropdownText: { fontSize: 14, color: COLORS.gray[700] },
  dropdownTextActive: { color: COLORS.primary, fontWeight: '700' },
  row: { flexDirection: 'row' },
  doneBtn: { alignSelf: 'flex-end', marginTop: 4 },
  doneBtnText: { color: COLORS.primary, fontWeight: '700', fontSize: 14 },
  submitBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitText: { color: COLORS.white, fontSize: 16, fontWeight: '700' },
});
