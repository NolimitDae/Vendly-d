import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../constants/colors';
import { api } from '../services/api';
import { navigationRef } from '../navigation/navigationRef';
import { openInTab } from '../navigation/crossTab';

/** Same rule as the API: an approved licence, or an admin saying none is needed. */
export const canPublish = (status?: string | null) => status === 'APPROVED' || status === 'NOT_APPLICABLE';

type Licence = { status: string | null; uploaded: boolean };

/** What the note says, or null when the vendor can publish. */
export function licenceNote(licence: Licence | null, things = 'packages'): { text: string; action: string } | null {
  if (!licence || canPublish(licence.status)) return null;
  if (licence.status === 'SUSPENDED') return { text: `Your business licence needs attention. Upload it again so you can publish ${things}; drafts still save.`, action: 'Upload your licence' };
  if (licence.uploaded) return { text: `Vendly is reviewing your business licence. You can save ${things} as drafts now and publish them once it’s approved.`, action: 'View your licence' };
  return { text: `You need an approved business licence to publish ${things}. You can still save drafts.`, action: 'Upload your licence' };
}

/**
 * A short note for vendors who can't publish yet because their business licence isn't approved,
 * with a link to the licence screen. Re-checked each time the screen comes back into view.
 */
export default function LicenceNotice({ things = 'packages', style }: { things?: string; style?: object }) {
  const [licence, setLicence] = useState<Licence | null>(null);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      api
        .get('/auth/me')
        .then((res) => {
          const d = res.data?.success ? res.data.data : null;
          if (alive && d?.type === 'VENDOR') setLicence({ status: d.license_status ?? null, uploaded: !!d.license_uploaded });
        })
        .catch(() => undefined);
      return () => {
        alive = false;
      };
    }, []),
  );

  const note = licenceNote(licence, things);
  if (!note) return null;
  return (
    <View style={[s.box, style]} accessibilityRole="summary">
      <Ionicons name="shield-outline" size={20} color="#FCD34D" />
      <View style={{ flex: 1, gap: 6 }}>
        <Text style={s.text}>{note.text}</Text>
        <Pressable
          onPress={() => navigationRef.isReady() && openInTab(navigationRef, 'ProfileTab', 'License')}
          accessibilityRole="link"
          hitSlop={8}
        >
          <Text style={s.link}>{note.action}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  box: { flexDirection: 'row', gap: 10, padding: 14, borderRadius: 16, backgroundColor: 'rgba(252, 211, 77, 0.12)', borderWidth: 1, borderColor: 'rgba(252, 211, 77, 0.35)' },
  text: { color: '#fff', fontSize: 14, lineHeight: 21, fontFamily: FONTS.regular },
  link: { color: '#FCD34D', fontSize: 14, fontFamily: FONTS.semibold, textDecorationLine: 'underline' },
});
