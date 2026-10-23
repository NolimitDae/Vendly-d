import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Chip, GradientButton, ui } from '../brand';
import { DARK, FONTS } from '../../constants/colors';
import { api } from '../../services/api';
import { ChatService } from '../../services/chat.service';
import { apiError } from '../../services/contracts.service';

interface Pkg { id: string; title: string; price: number }

/** Vendor: send a custom price for one of their live packages. */
export default function SendQuoteSheet({ visible, conversationId, onClose, onSent }: { visible: boolean; conversationId: string; onClose: () => void; onSent: () => void }) {
  const [packages, setPackages] = useState<Pkg[] | null>(null);
  const [listingId, setListingId] = useState('');
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [days, setDays] = useState(7);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible || packages) return;
    api
      .get('/vendor/listings', { params: { status: 'ACTIVE', limit: 50 } })
      .then((r) => {
        const list: Pkg[] = (r.data?.data ?? []).map((l: any) => ({ id: l.id, title: l.title, price: Number(l.price) }));
        setPackages(list);
        if (list[0]) {
          setListingId(list[0].id);
          setAmount(String(list[0].price));
        }
      })
      .catch(() => setPackages([]));
  }, [visible, packages]);

  const send = async () => {
    const n = Number(amount);
    if (!listingId) return Alert.alert('Package', 'Pick the package this quote is for.');
    if (!title.trim()) return Alert.alert('Title', 'Say what the quote covers, e.g. “Bridal party of 6”.');
    if (!n || n < 1) return Alert.alert('Price', 'Enter a price of at least $1.');
    setBusy(true);
    try {
      await ChatService.sendQuote(conversationId, { listing_id: listingId, title: title.trim(), description: description.trim() || undefined, amount: n, expires_in_days: days });
      setTitle('');
      setDescription('');
      onSent();
      onClose();
    } catch (e) {
      Alert.alert('Could not send the quote', apiError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={s.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={s.sheet}>
          <View style={s.head}>
            <Text style={s.h2}>Send a quote</Text>
            <Pressable onPress={onClose} hitSlop={8} accessibilityLabel="Close"><Ionicons name="close" size={24} color="#fff" /></Pressable>
          </View>
          {!packages ? (
            <ActivityIndicator color={DARK.accent} style={{ marginVertical: 24 }} />
          ) : packages.length === 0 ? (
            <Text style={s.muted}>Publish a package first. A quote sets a custom price on one of your live packages.</Text>
          ) : (
            <ScrollView contentContainerStyle={{ gap: 14 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
              <Text style={ui.label}>Package</Text>
              <View style={s.chips}>
                {packages.map((p) => <Chip key={p.id} label={p.title} active={listingId === p.id} onPress={() => { setListingId(p.id); if (!amount) setAmount(String(p.price)); }} />)}
              </View>
              <Text style={ui.label}>What it covers</Text>
              <View style={ui.field}><TextInput style={ui.input} placeholder="e.g. Bridal party of 6, trial included" placeholderTextColor={DARK.muted} value={title} onChangeText={setTitle} /></View>
              <Text style={ui.label}>Price</Text>
              <View style={ui.field}>
                <Text style={s.currency}>$</Text>
                <TextInput style={ui.input} keyboardType="decimal-pad" value={amount} onChangeText={(t) => setAmount(t.replace(/[^0-9.]/g, ''))} accessibilityLabel="Quote price" />
              </View>
              <Text style={ui.label}>Details (optional)</Text>
              <View style={[ui.field, { height: undefined, paddingVertical: 12, alignItems: 'flex-start' }]}>
                <TextInput style={[ui.input, { minHeight: 60, textAlignVertical: 'top' }]} placeholder="What’s included, timings, extras" placeholderTextColor={DARK.muted} value={description} onChangeText={setDescription} multiline />
              </View>
              <Text style={ui.label}>Valid for</Text>
              <View style={s.chips}>{[3, 7, 14].map((d) => <Chip key={d} label={`${d} days`} active={days === d} onPress={() => setDays(d)} />)}</View>
              <GradientButton title="Send quote" onPress={send} loading={busy} style={{ marginTop: 6 }} />
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: DARK.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 36, maxHeight: '88%', gap: 14 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  h2: { color: '#fff', fontSize: 20, fontFamily: FONTS.semibold },
  muted: { color: DARK.muted, fontSize: 14, lineHeight: 20, fontFamily: FONTS.regular },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  currency: { color: DARK.muted, fontSize: 18, fontFamily: FONTS.medium },
});
