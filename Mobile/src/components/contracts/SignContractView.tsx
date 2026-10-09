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
import { COLORS } from '../../constants/colors';
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
        <TouchableOpacity onPress={onCancel} accessibilityLabel="Close" hitSlop={12}>
          <Ionicons name="close" size={26} color={COLORS.gray[700]} />
        </TouchableOpacity>
        <Text style={s.headerTitle} numberOfLines={1}>{title}</Text>
        <View style={{ width: 26 }} />
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
            <Ionicons name="document-text-outline" size={18} color={COLORS.primary} />
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
            <Ionicons name={consent ? 'checkbox' : 'square-outline'} size={22} color={COLORS.primary} />
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
            placeholderTextColor={COLORS.gray[400]}
          />

          {vendor?.hasSavedSignature && (
            <Pressable style={s.checkRow} onPress={() => setUseSaved(!useSaved)}>
              <Ionicons name={useSaved ? 'checkbox' : 'square-outline'} size={22} color={COLORS.primary} />
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
                  <Ionicons name="create-outline" size={18} color={COLORS.gray[600]} />
                  <Text style={s.drawText}>Draw signature (optional)</Text>
                </TouchableOpacity>
              )}
              {vendor && !vendor.hasSavedSignature && image && (
                <Pressable style={s.checkRow} onPress={() => setSaveForLater(!saveForLater)}>
                  <Ionicons name={saveForLater ? 'checkbox' : 'square-outline'} size={22} color={COLORS.primary} />
                  <Text style={s.checkText}>Save this signature for future bookings</Text>
                </Pressable>
              )}
            </>
          )}

          <TouchableOpacity style={[s.submit, !canSign && s.disabled]} onPress={submit} disabled={!canSign}>
            {busy ? <ActivityIndicator color={COLORS.white} /> : <Text style={s.submitText}>{submitLabel}</Text>}
          </TouchableOpacity>
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
              webStyle={`.m-signature-pad--footer .button { background-color: ${COLORS.primary}; color: #fff; }`}
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
  root: { flex: 1, backgroundColor: COLORS.white },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 54, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: COLORS.gray[100],
  },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', color: COLORS.gray[900], marginHorizontal: 8 },
  scroll: { padding: 20, paddingBottom: 48 },
  pdfBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14, borderRadius: 12, backgroundColor: COLORS.primaryBg, marginBottom: 12 },
  pdfBtnText: { color: COLORS.primary, fontWeight: '600' },
  addendumLabel: { fontSize: 11, color: COLORS.gray[400], letterSpacing: 1, marginBottom: 6 },
  controls: { marginTop: 24, paddingTop: 20, borderTopWidth: 1, borderTopColor: COLORS.gray[100], gap: 12 },
  hint: { color: '#b45309', fontSize: 13 },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  checkText: { flex: 1, fontSize: 14, color: COLORS.gray[700], lineHeight: 20 },
  label: { fontSize: 13, fontWeight: '600', color: COLORS.gray[600] },
  input: {
    borderWidth: 1, borderColor: COLORS.gray[200], borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 16, color: COLORS.gray[900], backgroundColor: COLORS.gray[50],
  },
  drawBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16,
    borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: COLORS.gray[300],
  },
  drawText: { color: COLORS.gray[600] },
  sigPreview: { alignItems: 'center', gap: 6, padding: 8, borderRadius: 12, borderWidth: 1, borderColor: COLORS.gray[200] },
  sigImage: { width: '100%', height: 90 },
  link: { color: COLORS.primary, fontWeight: '600' },
  submit: { backgroundColor: COLORS.primary, borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 4 },
  submitText: { color: COLORS.white, fontWeight: '700', fontSize: 16 },
  disabled: { opacity: 0.45 },
  padRoot: { flex: 1, paddingTop: 60, paddingHorizontal: 16, backgroundColor: COLORS.white },
  padTitle: { fontSize: 18, fontWeight: '700', marginBottom: 12, color: COLORS.gray[900] },
  padBox: { height: 320, borderWidth: 1, borderColor: COLORS.gray[200], borderRadius: 12, overflow: 'hidden' },
  padCancel: { alignItems: 'center', padding: 20 },
});
