import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import SignatureScreen, { SignatureViewRef } from 'react-native-signature-canvas';
import { COLORS, DARK, FONTS } from '../../constants/colors';
import { GradientButton } from '../brand';
import { SignaturePayload, signerDevice } from '../../services/contracts.service';
import ContractBody from './ContractBody';

interface Props {
  title: string;
  body: string;
  contentSha256: string;
  consentText: string;
  sourcePdfUrl?: string | null;
  defaultName?: string;
  submitLabel: string;
  vendor?: { hasSavedSignature?: boolean };
  busy?: boolean;
  onSubmit: (signature: SignaturePayload) => void;
  onCancel: () => void;
}

/**
 * Full-screen contract review and signing. Sign unlocks only after the end of the
 * contract has been scrolled into view, consent is ticked and a legal name typed.
 */
export default function SignContractView({
  title,
  body,
  contentSha256,
  consentText,
  sourcePdfUrl,
  defaultName = '',
  submitLabel,
  vendor,
  busy,
  onSubmit,
  onCancel,
}: Props) {
  const [readToEnd, setReadToEnd] = useState(false);
  const [consent, setConsent] = useState(false);
  const [name, setName] = useState(defaultName);
  const [image, setImage] = useState<string | null>(null);
  const [padOpen, setPadOpen] = useState(false);
  const [useSaved, setUseSaved] = useState(!!vendor?.hasSavedSignature);
  const [saveForLater, setSaveForLater] = useState(true);
  const endY = useRef<number | null>(null);
  const viewport = useRef(0);
  const padRef = useRef<SignatureViewRef>(null);

  const markReadIfVisible = (scrollY: number) => {
    if (endY.current !== null && scrollY + viewport.current >= endY.current - 8) setReadToEnd(true);
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    viewport.current = e.nativeEvent.layoutMeasurement.height;
    markReadIfVisible(e.nativeEvent.contentOffset.y);
  };

  const canSign = readToEnd && consent && name.trim().length >= 2 && !busy;
  const usingSaved = !!vendor && useSaved;

  const submit = () => {
    if (!canSign) return;
    onSubmit({
      legal_name: name.trim(),
      consent: true,
      content_sha256: contentSha256,
      ...signerDevice(),
      ...(usingSaved ? { use_saved_signature: true } : {}),
      ...(image && !usingSaved ? { signature_image: image } : {}),
      ...(vendor && image && !usingSaved && saveForLater ? { save_signature: true } : {}),
    });
  };

  return (
    <View style={s.root}>
      <View style={s.header}>
        <TouchableOpacity onPress={onCancel} accessibilityLabel="Close" hitSlop={12} style={s.close}>
          <Ionicons name="close" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle} numberOfLines={1}>{title}</Text>
          <Text style={s.headerSub}>Please review and accept the contract to continue your booking</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        onScroll={onScroll}
        scrollEventThrottle={64}
        onLayout={(e) => {
          viewport.current = e.nativeEvent.layout.height;
          markReadIfVisible(0);
        }}
      >
        {sourcePdfUrl ? (
          <TouchableOpacity style={s.pdfBtn} onPress={() => Linking.openURL(sourcePdfUrl)}>
            <Ionicons name="document-text-outline" size={18} color={DARK.accent} />
            <Text style={s.pdfBtnText}>Open the vendor&apos;s contract (PDF)</Text>
          </TouchableOpacity>
        ) : null}
        {sourcePdfUrl ? <Text style={s.addendumLabel}>BOOKING ADDENDUM</Text> : null}

        <ContractBody body={body} />
        <View
          onLayout={(e) => {
            endY.current = e.nativeEvent.layout.y;
            markReadIfVisible(0);
          }}
        />

        <View style={s.controls}>
          {!readToEnd && <Text style={s.hint}>Scroll to the end of the contract to sign.</Text>}

          <Pressable style={s.checkRow} onPress={() => setConsent(!consent)} accessibilityRole="checkbox" accessibilityState={{ checked: consent }}>
            <Ionicons name={consent ? 'checkbox' : 'square-outline'} size={22} color={DARK.accent} />
            <Text style={s.checkText}>{consentText}</Text>
          </Pressable>

          <Text style={s.label}>Full legal name</Text>
          <TextInput
            style={s.input}
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            autoComplete="name"
            placeholder="Type your full legal name"
            placeholderTextColor={DARK.muted}
          />

          {vendor?.hasSavedSignature && (
            <Pressable style={s.checkRow} onPress={() => setUseSaved(!useSaved)}>
              <Ionicons name={useSaved ? 'checkbox' : 'square-outline'} size={22} color={DARK.accent} />
              <Text style={s.checkText}>Use my saved signature</Text>
            </Pressable>
          )}

          {!usingSaved && (
            <>
              {image ? (
                <View style={s.sigPreview}>
                  <Image source={{ uri: image }} style={s.sigImage} resizeMode="contain" />
                  <TouchableOpacity onPress={() => setImage(null)}>
                    <Text style={s.link}>Clear</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={s.drawBtn} onPress={() => setPadOpen(true)}>
                  <Ionicons name="create-outline" size={28} color="#fff" />
                  <Text style={s.drawText}>Tap to sign here</Text>
                  <Text style={s.drawSub}>Use your finger (optional)</Text>
                </TouchableOpacity>
              )}
              {vendor && !vendor.hasSavedSignature && image && (
                <Pressable style={s.checkRow} onPress={() => setSaveForLater(!saveForLater)}>
                  <Ionicons name={saveForLater ? 'checkbox' : 'square-outline'} size={22} color={DARK.accent} />
                  <Text style={s.checkText}>Save this signature for future bookings</Text>
                </Pressable>
              )}
            </>
          )}

          <GradientButton title={submitLabel} onPress={submit} disabled={!canSign} loading={busy} />
        </View>
      </ScrollView>

      <Modal visible={padOpen} animationType="slide" onRequestClose={() => setPadOpen(false)}>
        <View style={s.padRoot}>
          <Text style={s.padTitle}>Draw your signature</Text>
          <View style={s.padBox}>
            <SignatureScreen
              ref={padRef}
              onOK={(sig) => {
                setImage(sig);
                setPadOpen(false);
              }}
              onEmpty={() => setPadOpen(false)}
              descriptionText=""
              clearText="Clear"
              confirmText="Use signature"
              imageType="image/png"
              webStyle={`.m-signature-pad { box-shadow: none; border: 0; } .m-signature-pad--footer .button { background-color: ${COLORS.primary}; color: #fff; border-radius: 12px; }`}
            />
          </View>
          <TouchableOpacity onPress={() => setPadOpen(false)} style={s.padCancel}>
            <Text style={s.link}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: DARK.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16 },
  close: { width: 48, height: 48, borderRadius: 24, backgroundColor: DARK.field, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: '#fff', fontSize: 20, fontFamily: FONTS.semibold },
  headerSub: { color: DARK.muted, fontSize: 12, lineHeight: 17, fontFamily: FONTS.medium },
  scroll: { padding: 20, paddingBottom: 48, backgroundColor: DARK.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, flexGrow: 1 },
  pdfBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14, borderRadius: 12, backgroundColor: DARK.field, marginBottom: 12 },
  pdfBtnText: { color: '#fff', fontFamily: FONTS.medium },
  addendumLabel: { fontSize: 11, color: DARK.muted, letterSpacing: 1, marginBottom: 6, fontFamily: FONTS.medium },
  controls: { marginTop: 24, paddingTop: 20, borderTopWidth: 1, borderTopColor: DARK.field, gap: 14 },
  hint: { color: '#F5B700', fontSize: 13, fontFamily: FONTS.medium },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  checkText: { flex: 1, fontSize: 14, color: '#fff', lineHeight: 20, fontFamily: FONTS.medium },
  label: { fontSize: 16, color: '#fff', fontFamily: FONTS.medium },
  input: { height: 56, borderRadius: 24, paddingHorizontal: 16, fontSize: 16, color: '#fff', backgroundColor: DARK.field, fontFamily: FONTS.regular },
  drawBtn: { alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 36, borderRadius: 20, backgroundColor: DARK.field, borderWidth: 1, borderColor: DARK.border },
  drawText: { color: '#fff', fontSize: 16, fontFamily: FONTS.semibold },
  drawSub: { color: DARK.muted, fontSize: 14, fontFamily: FONTS.regular },
  sigPreview: { alignItems: 'center', gap: 6, padding: 8, borderRadius: 20, backgroundColor: '#fff' },
  sigImage: { width: '100%', height: 90 },
  link: { color: DARK.accent, fontFamily: FONTS.semibold },
  padRoot: { flex: 1, paddingTop: 60, paddingHorizontal: 20, backgroundColor: DARK.bg },
  padTitle: { fontSize: 20, fontFamily: FONTS.semibold, marginBottom: 12, color: '#fff' },
  padBox: { height: 320, borderRadius: 20, overflow: 'hidden', backgroundColor: '#fff' },
  padCancel: { alignItems: 'center', padding: 20 },
});
