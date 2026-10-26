import React, { useRef, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SignatureScreen, { SignatureViewRef } from 'react-native-signature-canvas';
import { DARK, FONTS } from '../../constants/colors';
import { GradientButton } from '../brand';

interface Props {
  visible: boolean;
  /** Called with the drawn signature as a PNG data URL. */
  onConfirm: (dataUrl: string) => void;
  onCancel: () => void;
}

// The pad's own web footer (Clear / Save) is hidden: it could be cut off on small screens. Our native
// buttons sit under the pad instead, and the pad fills the box whatever its size or orientation.
const PAD_STYLE = `
  body, html { background: #fff; }
  .m-signature-pad { position: absolute; top: 0; left: 0; right: 0; bottom: 0; width: auto; height: auto; margin: 0; border: 0; box-shadow: none; }
  .m-signature-pad:before, .m-signature-pad:after { display: none; }
  .m-signature-pad--body { top: 0; left: 0; right: 0; bottom: 0; border: 0; }
  .m-signature-pad--footer { display: none; }
`;

/**
 * Full-screen signature pad. "Confirm signature" shows once something is drawn and reads the
 * drawing; an empty pad never closes silently. The layout is all flex (no fixed sizes) so the
 * screen can later be turned to landscape while it's open.
 */
export default function SignaturePadModal({ visible, onConfirm, onCancel }: Props) {
  const insets = useSafeAreaInsets();
  const padRef = useRef<SignatureViewRef>(null);
  const [hasInk, setHasInk] = useState(false);
  const [emptyNote, setEmptyNote] = useState(false);

  // each opening starts with a blank pad
  const reset = () => {
    setHasInk(false);
    setEmptyNote(false);
  };

  const clear = () => {
    padRef.current?.clearSignature();
    reset();
  };

  const cancel = () => {
    reset();
    onCancel();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={cancel}
      onShow={reset}
      // lets a later build turn the pad to landscape (iOS only shows a modal in orientations listed here)
      supportedOrientations={['portrait', 'landscape-left', 'landscape-right']}
    >
      <View
        style={[
          s.root,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16, paddingLeft: insets.left + 20, paddingRight: insets.right + 20 },
        ]}
      >
        <Text style={s.title}>Draw your signature</Text>
        <Text style={s.sub}>Sign inside the box with your finger.</Text>
        <View style={s.padBox}>
          {visible && (
            <SignatureScreen
              ref={padRef}
              onBegin={() => {
                setHasInk(true);
                setEmptyNote(false);
              }}
              onEnd={() => setHasInk(true)}
              onOK={(sig) => {
                reset();
                onConfirm(sig);
              }}
              onEmpty={() => {
                setHasInk(false);
                setEmptyNote(true);
              }}
              descriptionText=""
              imageType="image/png"
              webStyle={PAD_STYLE}
              style={s.pad}
            />
          )}
        </View>
        {emptyNote && <Text style={s.note}>Please draw your signature first.</Text>}
        <View style={s.actions}>
          <TouchableOpacity onPress={cancel} style={s.textBtn} accessibilityRole="button">
            <Text style={s.link}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={clear} style={s.textBtn} accessibilityRole="button" disabled={!hasInk}>
            <Text style={[s.link, !hasInk && s.off]}>Clear</Text>
          </TouchableOpacity>
          <View style={s.confirm}>
            {hasInk && <GradientButton title="Confirm signature" onPress={() => padRef.current?.readSignature()} />}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: DARK.bg, gap: 12 },
  title: { fontSize: 20, fontFamily: FONTS.semibold, color: '#fff' },
  sub: { fontSize: 14, fontFamily: FONTS.regular, color: DARK.muted, marginTop: -6 },
  // fills whatever space is left, in portrait or landscape
  padBox: { flex: 1, minHeight: 160, borderRadius: 20, overflow: 'hidden', backgroundColor: '#fff' },
  pad: { flex: 1 },
  note: { color: '#F5B700', fontSize: 13, fontFamily: FONTS.medium },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 56 },
  textBtn: { paddingVertical: 14, paddingHorizontal: 10 },
  link: { color: DARK.accent, fontSize: 16, fontFamily: FONTS.semibold },
  off: { opacity: 0.4 },
  confirm: { flex: 1 },
});
