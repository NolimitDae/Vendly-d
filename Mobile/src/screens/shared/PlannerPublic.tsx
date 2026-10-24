import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ChatBubble, ScreenHeader } from '../../components/brand';
import { DARK, FONTS } from '../../constants/colors';
import { openChatWith } from '../../navigation/openChat';
import { EventPlannerService, type PublicPlannerProfile } from '../../services/eventplanner.service';
import { useAuth } from '../../context/AuthContext';

const EVENT_TYPE_LABELS: Record<string, string> = {
  WEDDING: 'Wedding',
  BIRTHDAY: 'Birthday',
  CORPORATE: 'Corporate',
  CONCERT: 'Concert',
  CONFERENCE: 'Conference',
  PRIVATE_PARTY: 'Private party',
  OTHER: 'Other',
};

/** A verified planner's public profile, as the website shows it: about, event types, experience and work gallery. */
export default function PlannerPublic() {
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const { userId } = useRoute<RouteProp<{ PlannerPublic: { userId: string } }, 'PlannerPublic'>>().params;
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const [planner, setPlanner] = useState<PublicPlannerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);

  useEffect(() => {
    EventPlannerService.getPublicProfile(userId)
      .then((r) => setPlanner(r.data?.data ?? null))
      .catch(() => setPlanner(null))
      .finally(() => setLoading(false));
  }, [userId]);

  if (loading) return <ActivityIndicator color={DARK.accent} style={s.center} />;
  if (!planner) {
    return (
      <View style={[s.root, { paddingTop: insets.top + 8 }]}>
        <ScreenHeader title="Planner" onBack={() => navigation.goBack()} />
        <Text style={[s.muted, { textAlign: 'center', marginTop: 40, paddingHorizontal: 32 }]}>This planner's profile isn't available.</Text>
      </View>
    );
  }

  const name = planner.business_name || planner.user?.name || 'Planner';
  const gallery = planner.portfolio ?? [];
  const cell = (width - 40 - 10) / 2;
  const facts = [
    planner.years_experience != null && { icon: 'briefcase-outline' as const, text: `${planner.years_experience} year${planner.years_experience === 1 ? '' : 's'} of experience` },
    !!planner.team_size && { icon: 'people-outline' as const, text: `Team of ${planner.team_size}` },
  ].filter(Boolean) as { icon: keyof typeof Ionicons.glyphMap; text: string }[];
  const website = planner.website?.trim();
  const instagram = planner.instagram?.trim();
  // a handle like "@grandline" opens their Instagram page
  const instagramUrl = instagram && (/^https?:\/\//i.test(instagram) ? instagram : `instagram.com/${instagram.replace(/^@/, '')}`);
  const open = (url: string) => Linking.openURL(/^https?:\/\//i.test(url) ? url : `https://${url}`).catch(() => {});

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 100 }}>
        <ScreenHeader title="Profile" onBack={() => navigation.goBack()} />
        <View style={s.body20}>
          <View style={s.top}>
            {planner.user?.avatar_url ? (
              <Image source={{ uri: planner.user.avatar_url }} style={s.avatar} accessibilityLabel={name} />
            ) : (
              <View style={s.avatar}><Text style={s.avatarText}>{name[0]?.toUpperCase()}</Text></View>
            )}
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={s.h1}>{name}</Text>
              {!!planner.business_name && !!planner.user?.name && planner.business_name !== planner.user.name && <Text style={s.muted}>{planner.user.name}</Text>}
              {planner.license_status === 'APPROVED' && (
                <View style={s.meta}>
                  <Ionicons name="checkmark-circle" size={16} color="#6ee7c7" />
                  <Text style={s.verified}>Verified planner</Text>
                </View>
              )}
            </View>
          </View>

          {facts.length > 0 && (
            <View style={s.facts}>
              {facts.map((f) => (
                <View key={f.text} style={s.meta}>
                  <Ionicons name={f.icon} size={16} color={DARK.accent} />
                  <Text style={s.body}>{f.text}</Text>
                </View>
              ))}
            </View>
          )}

          {!!planner.bio && (
            <Section title="Description">
              <Text style={s.body} numberOfLines={more ? undefined : 4}>{planner.bio}</Text>
              {planner.bio.length > 160 && (
                <Pressable onPress={() => setMore(!more)} hitSlop={8} accessibilityRole="button">
                  <Text style={s.link}>{more ? 'Show Less' : 'Show More'}</Text>
                </Pressable>
              )}
            </Section>
          )}

          {(planner.event_types ?? []).length > 0 && (
            <Section title="Event types">
              <View style={s.chips}>
                {planner.event_types.map((t) => (
                  <View key={t} style={s.chip}><Text style={s.chipText}>{EVENT_TYPE_LABELS[t] ?? t}</Text></View>
                ))}
              </View>
            </Section>
          )}

          {(!!website || !!instagramUrl) && (
            <Section title="Links">
              {!!website && (
                <Pressable style={s.meta} onPress={() => open(website)} accessibilityRole="link">
                  <Ionicons name="globe-outline" size={16} color={DARK.accent} />
                  <Text style={s.link} numberOfLines={1}>{website}</Text>
                </Pressable>
              )}
              {!!instagramUrl && (
                <Pressable style={s.meta} onPress={() => open(instagramUrl)} accessibilityRole="link">
                  <Ionicons name="logo-instagram" size={16} color={DARK.accent} />
                  <Text style={s.link} numberOfLines={1}>{instagram}</Text>
                </Pressable>
              )}
            </Section>
          )}

          {gallery.length > 0 && (
            <Section title="Work Gallery">
              <View style={s.gallery}>
                {gallery.map((uri, i) => (
                  <Pressable key={uri} onPress={() => setPhoto(uri)} accessibilityRole="imagebutton" accessibilityLabel={`Photo ${i + 1} of ${gallery.length}`}>
                    <Image source={{ uri }} style={{ width: i === 0 ? width - 40 : cell, height: i === 0 ? 170 : 130, borderRadius: 10 }} resizeMode="cover" />
                  </Pressable>
                ))}
              </View>
            </Section>
          )}

          {!planner.bio && gallery.length === 0 && <Text style={[s.muted, { marginTop: 20 }]}>No more details yet.</Text>}
        </View>
      </ScrollView>

      {/* no "message yourself" on your own profile (one login, several roles) */}
      {!!planner.user && planner.user.id !== user?.id && (
        <View style={{ position: 'absolute', right: 20, bottom: insets.bottom + 20 }}>
          <ChatBubble label={`Message ${name}`} onPress={() => openChatWith(navigation, planner.user!.id, name)} />
        </View>
      )}

      <Modal visible={!!photo} transparent animationType="fade" onRequestClose={() => setPhoto(null)}>
        <Pressable style={s.viewer} onPress={() => setPhoto(null)} accessibilityRole="button" accessibilityLabel="Close photo">
          {!!photo && <Image source={{ uri: photo }} style={{ width, height: width }} resizeMode="contain" />}
        </Pressable>
      </Modal>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: DARK.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: DARK.bg },
  body20: { paddingHorizontal: 20, paddingTop: 20, gap: 8 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: DARK.card, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 26, fontFamily: FONTS.semibold },
  h1: { color: '#fff', fontSize: 18, fontFamily: FONTS.semibold },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  verified: { color: '#6ee7c7', fontSize: 13, fontFamily: FONTS.medium },
  facts: { gap: 8, marginTop: 12 },
  body: { color: '#fff', fontSize: 14, lineHeight: 22, fontFamily: FONTS.regular },
  muted: { color: DARK.muted, fontSize: 14, fontFamily: FONTS.medium },
  link: { color: DARK.accent, fontSize: 14, fontFamily: FONTS.medium },
  section: { paddingTop: 20, marginTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: DARK.field, gap: 8 },
  sectionTitle: { color: '#fff', fontSize: 16, fontFamily: FONTS.semibold },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 100, backgroundColor: DARK.field },
  chipText: { color: '#fff', fontSize: 12, fontFamily: FONTS.medium },
  gallery: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
});
