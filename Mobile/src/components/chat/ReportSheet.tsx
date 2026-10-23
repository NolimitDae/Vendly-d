import React, { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Chip, GradientButton, ui } from '../brand';
import { DARK, FONTS } from '../../constants/colors';
import { ChatService, REPORT_REASONS, type ReportReason } from '../../services/chat.service';
import { apiError } from '../../services/contracts.service';

/** Report a person (or one of their messages) to Vendly: reason chips, optional details, optional block. */
export default function ReportSheet({
  visible,
  person,
  conversationId,
  messageId,
  alreadyBlocked,
  onClose,
  onReported,
}: {
  visible: boolean;
  person: { id: string; name: string } | null;
  conversationId: string;
  messageId?: string;
  alreadyBlocked?: boolean;
  onClose: () => void;
  onReported: (alsoBlocked: boolean) => void;
}) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [alsoBlock, setAlsoBlock] = useState(true);
  const [busy, setBusy] = useState(false);

  // fresh form each time it opens
  useEffect(() => {
    if (!visible) return;
    setReason(null);
    setDetails('');
    setAlsoBlock(!alreadyBlocked);
  }, [visible, alreadyBlocked]);

  const send = async () => {
    if (!person) return;
    if (!reason) return Alert.alert('Report', 'Pick a reason.');
    setBusy(true);
    try {
      const block = !alreadyBlocked && alsoBlock;
      await ChatService.report({
        reported_id: person.id,
        reason,
        details: details.trim() || undefined,
        conversation_id: conversationId,
        message_id: messageId,
        block: block || undefined,
      });
      onReported(block);
      onClose();
      Alert.alert('Thanks for telling us', 'Our team will review this report.');
    } catch (e) {
      Alert.alert('Could not send the report', apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const name = person?.name ?? 'this person';
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={s.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={s.sheet}>
          <View style={s.head}>
            <Text style={s.h2}>{messageId ? 'Report message' : `Report ${name}`}</Text>
            <Pressable onPress={onClose} hitSlop={8} accessibilityLabel="Close"><Ionicons name="close" size={24} color="#fff" /></Pressable>
          </View>
          <ScrollView contentContainerStyle={{ gap: 14 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
            <Text style={s.muted}>Vendly&apos;s team reviews reports. {name} won&apos;t be told who reported them.</Text>
            <Text style={ui.label}>What&apos;s wrong?</Text>
            <View style={s.chips}>
              {REPORT_REASONS.map((r) => <Chip key={r.value} label={r.label} active={reason === r.value} onPress={() => setReason(r.value)} />)}
            </View>
            <Text style={ui.label}>Details (optional)</Text>
            <View style={[ui.field, { height: undefined, paddingVertical: 12, alignItems: 'flex-start' }]}>
              <TextInput
                style={[ui.input, { minHeight: 60, textAlignVertical: 'top' }]}
                placeholder="Anything else we should know?"
                placeholderTextColor={DARK.muted}
                value={details}
                onChangeText={setDetails}
                maxLength={2000}
                multiline
                accessibilityLabel="Details"
              />
            </View>
            {!alreadyBlocked && (
              <View style={s.row}>
                <Text style={s.rowText}>Also block {name}</Text>
                <Switch value={alsoBlock} onValueChange={setAlsoBlock} accessibilityLabel={`Also block ${name}`} />
              </View>
            )}
            <GradientButton title="Send report" onPress={send} loading={busy} disabled={!reason} style={{ marginTop: 6 }} />
          </ScrollView>
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
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  rowText: { color: '#fff', fontSize: 15, fontFamily: FONTS.medium, flex: 1 },
});
