import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { format } from 'date-fns';
import { COLORS } from '../../constants/colors';
import { api } from '../../services/api';
import { ContractsService, apiError, openSignedLink } from '../../services/contracts.service';
import ContractBody from '../../components/contracts/ContractBody';

interface FieldDef {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'money' | 'number' | 'select';
  required?: boolean;
  options?: { value: string; label: string }[];
  placeholder?: string;
}

interface Template {
  category: string;
  category_label: string;
  title: string;
  fields: FieldDef[];
}

interface VendorContract {
  id: string;
  type: 'DEFAULT' | 'UPLOADED';
  version: number;
  status: string;
  template: { category: string; title: string } | null;
  field_values: Record<string, string>;
  additional_terms: string | null;
  file_name: string | null;
  applies_to_all: boolean;
  listing_ids: string[];
  disabled_reason: string | null;
  created_at: string;
}

type Mode = { kind: 'list' } | { kind: 'default'; replaceId?: string } | { kind: 'upload'; replaceId?: string };

const MAX_PDF = 10 * 1024 * 1024;

function Field({ def, value, onChange }: { def: FieldDef; value: string; onChange: (v: string) => void }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={s.label}>
        {def.label}
        {def.required ? <Text style={{ color: '#dc2626' }}> *</Text> : null}
      </Text>
      {def.type === 'select' ? (
        <View style={s.chips}>
          {def.options?.map((o) => (
            <TouchableOpacity key={o.value} style={[s.chip, value === o.value && s.chipOn]} onPress={() => onChange(o.value)}>
              <Text style={[s.chipText, value === o.value && s.chipTextOn]}>{o.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : (
        <TextInput
          style={[s.input, def.type === 'textarea' && s.textarea]}
          value={value}
          onChangeText={onChange}
          placeholder={def.placeholder}
          placeholderTextColor={COLORS.gray[400]}
          multiline={def.type === 'textarea'}
          textAlignVertical={def.type === 'textarea' ? 'top' : 'center'}
          keyboardType={def.type === 'money' || def.type === 'number' ? 'decimal-pad' : 'default'}
        />
      )}
    </View>
  );
}

export default function VendorContracts() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [uploadFields, setUploadFields] = useState<FieldDef[]>([]);
  const [maxTerms, setMaxTerms] = useState(3000);
  const [active, setActive] = useState<VendorContract[]>([]);
  const [history, setHistory] = useState<VendorContract[]>([]);
  const [listings, setListings] = useState<{ id: string; title: string }[]>([]);
  const [mode, setMode] = useState<Mode>({ kind: 'list' });

  const [category, setCategory] = useState('GENERAL');
  const [values, setValues] = useState<Record<string, string>>({});
  const [terms, setTerms] = useState('');
  const [appliesToAll, setAppliesToAll] = useState(true);
  const [listingIds, setListingIds] = useState<string[]>([]);
  const [file, setFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [confirmOwn, setConfirmOwn] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [t, mine, l] = await Promise.all([
        ContractsService.templates(),
        ContractsService.vendorList(),
        api.get('/vendor/listings', { params: { limit: 100 } }),
      ]);
      setTemplates(t.data.data.templates);
      setUploadFields(t.data.data.upload_fields);
      setMaxTerms(t.data.data.max_additional_terms);
      setActive(mine.data.data.active);
      setHistory(mine.data.data.history);
      setListings((l.data?.data ?? []).map((x: any) => ({ id: x.id, title: x.title })));
    } catch (err) {
      Alert.alert('Error', apiError(err, "Couldn't load contracts"));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const template = templates.find((t) => t.category === category);

  const startForm = (kind: 'default' | 'upload', from?: VendorContract) => {
    setMode({ kind, replaceId: from?.id });
    setCategory(from?.template?.category ?? 'GENERAL');
    setValues(from?.field_values ?? {});
    setTerms(from?.additional_terms ?? '');
    setAppliesToAll(from ? from.applies_to_all : true);
    setListingIds(from?.listing_ids ?? []);
    setFile(null);
    setConfirmOwn(false);
  };

  const run = async (fn: () => Promise<unknown>, success: string) => {
    setBusy(true);
    try {
      await fn();
      Alert.alert('Saved', success);
      setMode({ kind: 'list' });
      await load();
    } catch (err) {
      Alert.alert('Error', apiError(err));
    } finally {
      setBusy(false);
    }
  };

  const showPreview = async () => {
    setBusy(true);
    try {
      const res = await ContractsService.vendorPreview({ category, field_values: values, additional_terms: terms || undefined });
      setPreview(res.data.data.body);
    } catch (err) {
      Alert.alert('Error', apiError(err));
    } finally {
      setBusy(false);
    }
  };

  const saveDefault = () => {
    if (mode.kind !== 'default') return;
    const dto = { category, field_values: values, additional_terms: terms || undefined, applies_to_all: appliesToAll, listing_ids: appliesToAll ? [] : listingIds };
    run(
      () => (mode.replaceId ? ContractsService.vendorReplaceDefault(mode.replaceId, dto) : ContractsService.vendorCreateDefault(dto)),
      'Your contract applies to new bookings. Signed bookings keep their version.',
    );
  };

  const pickPdf = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
    if (res.canceled) return;
    const asset = res.assets[0];
    if (asset.size && asset.size > MAX_PDF) return Alert.alert('Too large', 'The PDF must be 10 MB or smaller.');
    setFile(asset);
  };

  const saveUpload = () => {
    if (mode.kind !== 'upload') return;
    if (!file) return Alert.alert('PDF required', 'Choose your contract PDF.');
    const form = new FormData();
    form.append('file', { uri: file.uri, name: file.name || 'contract.pdf', type: 'application/pdf' } as any);
    form.append('confirm_ownership', String(confirmOwn));
    form.append('field_values', JSON.stringify(values));
    form.append('applies_to_all', String(appliesToAll));
    if (!appliesToAll) form.append('listing_ids', JSON.stringify(listingIds));
    run(() => ContractsService.vendorUpload(form), 'Vendly adds a booking addendum and signature page to each booking.');
  };

  const archive = (id: string) =>
    Alert.alert('Archive contract', 'Future bookings will use your other active contract or the Vendly default.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Archive', style: 'destructive', onPress: () => run(() => ContractsService.vendorArchive(id), 'Contract archived.') },
    ]);

  const assignment = (
    <View style={{ gap: 8 }}>
      <Text style={s.label}>Applies to</Text>
      <View style={s.chips}>
        <TouchableOpacity style={[s.chip, appliesToAll && s.chipOn]} onPress={() => setAppliesToAll(true)}>
          <Text style={[s.chipText, appliesToAll && s.chipTextOn]}>All listings</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.chip, !appliesToAll && s.chipOn]} onPress={() => setAppliesToAll(false)}>
          <Text style={[s.chipText, !appliesToAll && s.chipTextOn]}>Selected listings</Text>
        </TouchableOpacity>
      </View>
      {!appliesToAll &&
        listings.map((l) => {
          const on = listingIds.includes(l.id);
          return (
            <Pressable key={l.id} style={s.checkRow} onPress={() => setListingIds((ids) => (on ? ids.filter((x) => x !== l.id) : [...ids, l.id]))}>
              <Ionicons name={on ? 'checkbox' : 'square-outline'} size={20} color={COLORS.primary} />
              <Text style={s.checkText}>{l.title}</Text>
            </Pressable>
          );
        })}
    </View>
  );

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (mode.kind === 'default') {
    return (
      <ScrollView style={s.root} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <Text style={s.h1}>{mode.replaceId ? 'Edit contract (new version)' : 'Vendly default contract'}</Text>
        <Text style={s.label}>Category</Text>
        <View style={s.chips}>
          {templates.map((t) => (
            <TouchableOpacity key={t.category} style={[s.chip, category === t.category && s.chipOn]} onPress={() => setCategory(t.category)}>
              <Text style={[s.chipText, category === t.category && s.chipTextOn]}>{t.category_label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {template?.fields.map((f) => (
          <Field key={f.key} def={f} value={values[f.key] ?? ''} onChange={(v) => setValues((st) => ({ ...st, [f.key]: v }))} />
        ))}
        <Text style={s.label}>Additional terms (optional)</Text>
        <TextInput style={[s.input, s.textarea]} value={terms} onChangeText={(t) => setTerms(t.slice(0, maxTerms))} multiline textAlignVertical="top" />
        <Text style={s.counter}>{terms.length}/{maxTerms}</Text>
        {assignment}
        <TouchableOpacity style={s.secondary} onPress={showPreview} disabled={busy}>
          <Text style={s.secondaryText}>Preview with a sample booking</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.primary, busy && { opacity: 0.6 }]} onPress={saveDefault} disabled={busy}>
          {busy ? <ActivityIndicator color={COLORS.white} /> : <Text style={s.primaryText}>Save contract</Text>}
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setMode({ kind: 'list' })} style={{ alignItems: 'center', padding: 12 }}>
          <Text style={s.link}>Cancel</Text>
        </TouchableOpacity>
        <Modal visible={!!preview} animationType="slide" onRequestClose={() => setPreview(null)}>
          <View style={{ flex: 1, backgroundColor: COLORS.white, paddingTop: 54 }}>
            <TouchableOpacity onPress={() => setPreview(null)} style={{ paddingHorizontal: 16 }} accessibilityLabel="Close">
              <Ionicons name="close" size={26} color={COLORS.gray[700]} />
            </TouchableOpacity>
            <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48 }}>{preview && <ContractBody body={preview} />}</ScrollView>
          </View>
        </Modal>
      </ScrollView>
    );
  }

  if (mode.kind === 'upload') {
    return (
      <ScrollView style={s.root} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <Text style={s.h1}>{mode.replaceId ? 'Replace uploaded contract' : 'Upload your own contract'}</Text>
        <Text style={s.muted}>
          PDF only, up to 10 MB, not password-protected. Vendly adds a booking addendum and a signature certificate to each booking.
        </Text>
        <TouchableOpacity style={s.drop} onPress={pickPdf}>
          <Ionicons name="document-attach-outline" size={22} color={COLORS.primary} />
          <Text style={s.link}>{file ? file.name : 'Choose PDF'}</Text>
        </TouchableOpacity>
        {uploadFields.map((f) => (
          <Field key={f.key} def={f} value={values[f.key] ?? ''} onChange={(v) => setValues((st) => ({ ...st, [f.key]: v }))} />
        ))}
        {assignment}
        <Pressable style={s.checkRow} onPress={() => setConfirmOwn(!confirmOwn)}>
          <Ionicons name={confirmOwn ? 'checkbox' : 'square-outline'} size={22} color={COLORS.primary} />
          <Text style={s.checkText}>This contract is mine to use, and it doesn&apos;t conflict with the Vendly Terms of Service.</Text>
        </Pressable>
        <TouchableOpacity style={[s.primary, (!confirmOwn || busy) && { opacity: 0.5 }]} onPress={saveUpload} disabled={!confirmOwn || busy}>
          {busy ? <ActivityIndicator color={COLORS.white} /> : <Text style={s.primaryText}>Upload contract</Text>}
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setMode({ kind: 'list' })} style={{ alignItems: 'center', padding: 12 }}>
          <Text style={s.link}>Cancel</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={s.root} contentContainerStyle={s.content}>
      <Text style={s.muted}>Customers sign your contract when they request a booking. You countersign when you Accept &amp; Sign.</Text>

      {active.length === 0 && (
        <View style={s.warn}>
          <Text style={s.warnText}>You need an active contract before accepting paid bookings.</Text>
          <TouchableOpacity style={s.warnBtn} onPress={() => run(() => ContractsService.vendorUseDefault(), "You're using the Vendly default contract.")}>
            <Text style={s.primaryText}>Use Vendly default</Text>
          </TouchableOpacity>
        </View>
      )}

      {active.map((c) => (
        <View key={c.id} style={s.card}>
          <Text style={s.cardTitle}>{c.type === 'UPLOADED' ? `Uploaded: ${c.file_name}` : c.template?.title}</Text>
          <Text style={s.muted}>
            Version {c.version} · {format(new Date(c.created_at), 'MMM d, yyyy')} · {c.applies_to_all ? 'All listings' : `${c.listing_ids.length} listing(s)`}
          </Text>
          <View style={s.row}>
            {c.type === 'UPLOADED' && (
              <TouchableOpacity style={s.secondarySm} onPress={() => openSignedLink(() => ContractsService.vendorFile(c.id)).catch((e) => Alert.alert('Error', apiError(e)))}>
                <Text style={s.secondaryText}>View</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={s.secondarySm} onPress={() => startForm(c.type === 'UPLOADED' ? 'upload' : 'default', c)}>
              <Text style={s.secondaryText}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.secondarySm} onPress={() => archive(c.id)}>
              <Text style={s.secondaryText}>Archive</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}

      <TouchableOpacity style={s.primary} onPress={() => startForm('default')}>
        <Text style={s.primaryText}>Set up Vendly default</Text>
      </TouchableOpacity>
      <TouchableOpacity style={s.secondary} onPress={() => startForm('upload')}>
        <Text style={s.secondaryText}>Upload my own PDF</Text>
      </TouchableOpacity>

      {history.length > 0 && (
        <View style={{ gap: 4, marginTop: 8 }}>
          <Text style={s.label}>Earlier versions</Text>
          {history.map((c) => (
            <Text key={c.id} style={s.muted}>
              v{c.version} · {c.type === 'UPLOADED' ? c.file_name : c.template?.title} · {c.status.toLowerCase()}
              {c.disabled_reason ? ` · disabled by Vendly: ${c.disabled_reason}` : ''}
            </Text>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.gray[50] },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, gap: 12, paddingBottom: 48 },
  h1: { fontSize: 18, fontWeight: '800', color: COLORS.gray[900] },
  label: { fontSize: 13, fontWeight: '600', color: COLORS.gray[600] },
  muted: { fontSize: 13, color: COLORS.gray[500], lineHeight: 19 },
  counter: { fontSize: 11, color: COLORS.gray[400], textAlign: 'right' },
  input: {
    borderWidth: 1, borderColor: COLORS.gray[200], borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: COLORS.gray[900], backgroundColor: COLORS.white,
  },
  textarea: { height: 110 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: COLORS.gray[200], borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: COLORS.white },
  chipOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { color: COLORS.gray[700], fontSize: 13 },
  chipTextOn: { color: COLORS.white, fontWeight: '600' },
  checkRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  checkText: { flex: 1, color: COLORS.gray[700], fontSize: 14, lineHeight: 20 },
  primary: { backgroundColor: COLORS.primary, borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  primaryText: { color: COLORS.white, fontWeight: '700' },
  secondary: { borderWidth: 1, borderColor: COLORS.gray[300], borderRadius: 12, paddingVertical: 14, alignItems: 'center', backgroundColor: COLORS.white },
  secondarySm: { borderWidth: 1, borderColor: COLORS.gray[200], borderRadius: 10, paddingVertical: 8, paddingHorizontal: 14 },
  secondaryText: { color: COLORS.gray[800], fontWeight: '600' },
  link: { color: COLORS.primary, fontWeight: '600' },
  drop: {
    flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', padding: 18,
    borderWidth: 1, borderStyle: 'dashed', borderColor: COLORS.gray[300], borderRadius: 12, backgroundColor: COLORS.white,
  },
  warn: { backgroundColor: '#fffbeb', borderColor: '#fde68a', borderWidth: 1, borderRadius: 12, padding: 14, gap: 10 },
  warnText: { color: '#92400e' },
  warnBtn: { backgroundColor: '#d97706', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  card: { backgroundColor: COLORS.white, borderRadius: 14, padding: 16, gap: 6 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: COLORS.gray[900] },
  row: { flexDirection: 'row', gap: 8, marginTop: 6 },
});
