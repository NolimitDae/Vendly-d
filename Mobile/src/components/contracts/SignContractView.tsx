import React, { useEffect, useRef, useState } from 'react';
import {
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DARK, FONTS } from '../../constants/colors';
import { GradientButton } from '../brand';
import { SignaturePayload, signerDevice } from '../../services/contracts.service';
import ContractBody from './ContractBody';
import SignaturePadModal from './SignaturePadModal';

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
  /** shown above the contract (suggested changes show what changed) */
  intro?: React.ReactNode;
  /** replaces the line under the title */
  subtitle?: string;
}

/**
 * Full-screen contract review and signing. Sign unlocks only after the end of the
 * contract has been scrolled into view, consent is ticked, a legal name typed and a
 * signature drawn and confirmed (a vendor may use their saved one instead).
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
  intro,
  subtitle,
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
  const scrollRef = useRef<ScrollView>(null);
  const controlsY = useRef(0);
  const nameY = useRef(0);
  const nameFocused = useRef(false);

  // keeps the name field (and, when there's room, the sign button below it) above the keyboard
  const scrollToName = () => scrollRef.current?.scrollTo({ y: Math.max(0, controlsY.current + nameY.current - 16), animated: true });
  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidShow', () => {
      if (nameFocused.current) setTimeout(scrollToName, 50);
    });
    return () => sub.remove();
  }, []);

  const markReadIfVisible = (scrollY: number) => {
    if (endY.current !== null && scrollY + viewport.current >= endY.current - 8) setReadToEnd(true);
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    viewport.current = e.nativeEvent.layoutMeasurement.height;
    markReadIfVisible(e.nativeEvent.contentOffset.y);
  };

  const usingSaved = !!vendor?.hasSavedSignature && useSaved;
  const signed = usingSaved || !!image;
  const canSign = readToEnd && consent && name.trim().length >= 2 && signed && !busy;

  const submit = () => {
    if (!canSign) return;
    onSubmit({
      legal_name: name.trim(),
      consent: true,
      content_sha256: contentSha256,
      ...signerDevice(),
      ...(usingSaved ? { use_saved_signature: true } : { signature_image: image! }),
      ...(vendor && !usingSaved && saveForLater ? { save_signature: true } : {}),
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
          <Text style={s.headerSub}>{subtitle ?? 'Please review and accept the contract to continue your booking'}</Text>
        </View>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={s.scroll}
          onScroll={onScroll}
          scrollEventThrottle={64}
          keyboardShouldPersistTaps="handled"
          onLayout={(e) => {
            viewport.current = e.nativeEvent.layout.height;
            markReadIfVisible(0);
          }}
        >
          {intro ? <View style={{ marginBottom: 20 }}>{intro}</View> : null}
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

          <View style={s.controls} onLayout={(e) => (controlsY.current = e.nativeEvent.layout.y)}>
            {!readToEnd && <Text style={s.hint}>Scroll to the end of the contract to sign.</Text>}

            <Pressable style={s.checkRow} onPress={() => setConsent(!consent)} accessibilityRole="checkbox" accessibilityState={{ checked: consent }}>
              <Ionicons name={consent ? 'checkbox' : 'square-outline'} size={22} color={DARK.accent} />
              <Text style={s.checkText}>{consentText}</Text>
            </Pressable>

            <View style={s.nameField} onLayout={(e) => (nameY.current = e.nativeEvent.layout.y)}>
              <Text style={s.label}>Full legal name</Text>
              <TextInput
                style={s.input}
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                autoComplete="name"
                returnKeyType="done"
                placeholder="Type your full legal name"
                placeholderTextColor={DARK.muted}
                onFocus={() => {
                  nameFocused.current = true;
                  // the keyboard may already be up (keyboardDidShow won't fire again)
                  setTimeout(scrollToName, 300);
                }}
                onBlur={() => (nameFocused.current = false)}
              />
            </View>

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
                    <Image source={{ uri: image }} style={s.sigImage} resizeMode="contain" accessibilityLabel="Your signature" />
                    <View style={s.sigActions}>
                      <TouchableOpacity onPress={() => setPadOpen(true)} hitSlop={8}>
                        <Text style={s.sigLink}>Redo</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => setImage(null)} hitSlop={8}>
                        <Text style={s.sigLink}>Clear</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity style={s.drawBtn} onPress={() => setPadOpen(true)} accessibilityRole="button">
                    <Ionicons name="create-outline" size={28} color="#fff" />
                    <Text style={s.drawText}>Tap to sign here</Text>
                    <Text style={s.drawSub}>Draw your signature with your finger</Text>
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

            {!signed && <Text style={s.hint}>Draw your signature to sign.</Text>}
            <GradientButton title={submitLabel} onPress={submit} disabled={!canSign} loading={busy} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <SignaturePadModal
        visible={padOpen}
        onConfirm={(sig) => {
          setImage(sig);
          setPadOpen(false);
        }}
        onCancel={() => setPadOpen(false)}
      />
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
  nameField: { gap: 14 },
  label: { fontSize: 16, color: '#fff', fontFamily: FONTS.medium },
  input: { height: 56, borderRadius: 24, paddingHorizontal: 16, fontSize: 16, color: '#fff', backgroundColor: DARK.field, fontFamily: FONTS.regular },
  drawBtn: { alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 36, borderRadius: 20, backgroundColor: DARK.field, borderWidth: 1, borderColor: DARK.border },
  drawText: { color: '#fff', fontSize: 16, fontFamily: FONTS.semibold },
  drawSub: { color: DARK.muted, fontSize: 14, fontFamily: FONTS.regular },
  sigPreview: { alignItems: 'center', gap: 6, padding: 8, borderRadius: 20, backgroundColor: '#fff' },
  sigImage: { width: '100%', height: 90 },
  sigActions: { flexDirection: 'row', gap: 24 },
  // on the white signature box
  sigLink: { color: '#7A2A82', fontFamily: FONTS.semibold },
});
