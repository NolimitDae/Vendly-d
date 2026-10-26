import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ChatBubble, ScreenHeader } from '../../components/brand';
import { DARK, FONTS } from '../../constants/colors';
import { openChatWith } from '../../navigation/openChat';
import { MarketplaceService, type VendorProfile as Vendor } from '../../services/marketplace.service';
import type { CustomerHomeStackParams } from '../../navigation/types';
import { useAuth } from '../../context/AuthContext';
import Sheet from '../../components/Sheet';
import TestBadge from '../../components/TestBadge';
import { EventToolsService, MAX_TEAM_SIZE, type TeamVendor, type VendorTeam } from '../../services/eventTools.service';
import { apiError } from '../../services/contracts.service';

export default function VendorProfile({ navigation, route }: NativeStackScreenProps<CustomerHomeStackParams, 'VendorProfile'>) {
  const { vendorId } = route.params;
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);

  useEffect(() => {
    MarketplaceService.getVendor(vendorId)
      .then((r) => setVendor(r.data?.data ?? null))
      .catch(() => setVendor(null))
      .finally(() => setLoading(false));
  }, [vendorId]);

  if (loading) return <ActivityIndicator color={DARK.accent} style={s.center} />;
  if (!vendor) {
    return (
      <View style={[s.center, { paddingTop: insets.top }]}>
        <Text style={s.body}>Vendor not found</Text>
      </View>
    );
  }

  const name = vendor.vendorProfile?.business_name || vendor.name;
  const listings = vendor.vendorListings ?? [];
  const cover = vendor.banner_url || vendor.avatar_url || listings.find((l) => l.images?.[0])?.images?.[0];
  const gallery = listings.flatMap((l) => l.images ?? []).slice(0, 5);
  const about = vendor.vendorProfile?.about_me || vendor.bio;
  const categories = [...new Set(listings.map((l) => l.category?.name).filter(Boolean))].join(', ');
  const reviews = vendor._count?.receivedReviews ?? 0;
  const cell = (width - 40 - 10) / 2;

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}>
        <View style={[s.cover, { paddingTop: insets.top + 12 }]}>
          {cover && <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} resizeMode="cover" />}
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.25)' }]} />
          <ScreenHeader title="Details" onBack={() => navigation.goBack()} light />
        </View>

        <View style={s.body20}>
          <View style={s.meta}>
            {!!vendor.logo_url && <Image source={{ uri: vendor.logo_url }} style={s.logo} accessibilityLabel={`${name} logo`} />}
            <Text style={[s.h1, { flex: 1 }]}>{name}</Text>
            {vendor.is_test && <TestBadge />}
          </View>
          <View style={s.rowBetween}>
            <View style={s.meta}>
              <Ionicons name="pricetag-outline" size={16} color="#fff" />
              <Text style={s.body}>{categories || 'Vendor'}</Text>
            </View>
            {vendor.avg_rating != null && (
              <View style={s.meta}>
                <Ionicons name="star" size={16} color="#F5B700" />
                <Text style={s.muted}>
                  {Number(vendor.avg_rating).toFixed(1)} ({reviews} Reviews)
                </Text>
              </View>
            )}
          </View>

          {/* planners can save any vendor to a team, booked before or not */}
          {user?.type === 'EVENT_PLANNER' && vendor.id !== user.id && (
            <AddToTeam
              vendor={{ id: vendor.id, name, avatar_url: vendor.logo_url || vendor.avatar_url || null, category: listings[0]?.category?.name ?? null }}
              onNewTeam={(v) => navigation.navigate('TeamEditor' as any, { initialVendors: [v] } as any)}
            />
          )}

          {!!about && (
            <Section title="Description">
              <Text style={s.body} numberOfLines={more ? undefined : 4}>{about}</Text>
              {about.length > 160 && (
                <Pressable onPress={() => setMore(!more)} hitSlop={8}>
                  <Text style={s.link}>{more ? 'Show Less' : 'Show More'}</Text>
                </Pressable>
              )}
            </Section>
          )}

          <Section title="Packages">
            {listings.length === 0 && <Text style={s.muted}>No packages listed yet</Text>}
            {listings.map((l) => (
              <Pressable key={l.id} style={s.pkg} onPress={() => navigation.push('ListingDetail', { listingId: l.id })} accessibilityRole="button">
                <View style={s.pkgImg}>
                  {l.images?.[0] ? <Image source={{ uri: l.images[0] }} style={StyleSheet.absoluteFill} /> : <Ionicons name="image-outline" size={24} color={DARK.muted} />}
                </View>
                <View style={{ flex: 1, gap: 20 }}>
                  <View style={s.meta}>
                    <Text style={[s.pkgTitle, { flexShrink: 1 }]} numberOfLines={1}>{l.title}</Text>
                    {vendor.is_test && <TestBadge />}
                  </View>
                  <View style={s.meta}>
                    <Ionicons name="star" size={16} color="#F5B700" />
                    <Text style={s.muted}>
                      {l.avg_rating != null ? Number(l.avg_rating).toFixed(1) : 'New'} ({l._count?.reviews ?? 0} Reviews)
                    </Text>
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 20 }}>
                  <Text style={s.pkgPrice}>${Number(l.price).toLocaleString()}</Text>
                  <Ionicons name="chevron-forward" size={22} color="#fff" />
                </View>
              </Pressable>
            ))}
          </Section>

          {!!vendor.location && (
            <Section title="Location">
              <Text style={s.body}>{vendor.location}</Text>
            </Section>
          )}

          {gallery.length > 0 && (
            <Section title="Work Gallery">
              <View style={s.gallery}>
                {gallery.map((uri, i) => (
                  <Image key={i} source={{ uri }} style={{ width: i === 0 ? width - 40 : cell, height: i === 0 ? 170 : 130, borderRadius: 10 }} resizeMode="cover" />
                ))}
              </View>
            </Section>
          )}
        </View>
      </ScrollView>
      {/* no "message yourself" on your own shop (one login, several roles) */}
      {vendor.id !== user?.id && (
        <View style={{ position: 'absolute', right: 20, bottom: insets.bottom + 20 }}>
          <ChatBubble onPress={() => openChatWith(navigation, vendor.id, name)} />
        </View>
      )}
    </View>
  );
}

/** "Add to team": into one of the planner's saved teams, or a new team that starts with this vendor. */
function AddToTeam({ vendor, onNewTeam }: { vendor: TeamVendor; onNewTeam: (v: TeamVendor) => void }) {
  const [open, setOpen] = useState(false);
  const [teams, setTeams] = useState<VendorTeam[] | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const load = () => EventToolsService.teams().then((r) => setTeams(r.data?.data ?? [])).catch(() => setTeams([]));

  const addTo = async (t: VendorTeam) => {
    setAdding(t.id);
    try {
      // the team's current (still available) vendors plus this one
      await EventToolsService.saveTeam({ name: t.name, vendor_ids: [...t.vendors.map((v) => v.id), vendor.id] }, t.id);
      setOpen(false);
      Alert.alert('Added', `${vendor.name} is in ${t.name}.`);
      load();
    } catch (e) {
      Alert.alert('Could not add to the team', apiError(e));
    } finally {
      setAdding(null);
    }
  };

  return (
    <>
      <Pressable
        style={s.teamBtn}
        onPress={() => {
          setOpen(true);
          load();
        }}
        accessibilityRole="button"
      >
        <Ionicons name="people-outline" size={18} color={DARK.accent} />
        <Text style={s.link}>Add to team</Text>
      </Pressable>
      <Sheet visible={open} onClose={() => setOpen(false)} title="Add to a team" subtitle={vendor.name}>
        {!teams ? (
          <ActivityIndicator color={DARK.accent} />
        ) : (
          <View style={{ gap: 8 }}>
            {teams.length === 0 && <Text style={s.muted}>You have no saved teams yet.</Text>}
            {teams.map((t) => {
              const has = t.vendors.some((v) => v.id === vendor.id);
              const full = t.vendors.length >= MAX_TEAM_SIZE;
              return (
                <Pressable
                  key={t.id}
                  style={[s.teamRow, (has || full) && { opacity: 0.6 }]}
                  onPress={() => addTo(t)}
                  disabled={has || full || adding !== null}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: has || full }}
                  accessibilityLabel={has ? `${t.name}, already in this team` : `Add to ${t.name}`}
                >
                  <Text style={[s.body, { flex: 1 }]} numberOfLines={1}>{t.name} ({t.vendors.length})</Text>
                  {adding === t.id ? <ActivityIndicator color={DARK.accent} /> : <Ionicons name={has ? 'checkmark' : 'add'} size={20} color={has ? '#6ee7c7' : '#fff'} />}
                </Pressable>
              );
            })}
            <Pressable
              style={s.teamRow}
              onPress={() => {
                setOpen(false);
                onNewTeam(vendor);
              }}
              accessibilityRole="button"
            >
              <Ionicons name="add-circle-outline" size={20} color={DARK.accent} />
              <Text style={[s.link, { flex: 1 }]}>New team with {vendor.name}</Text>
            </Pressable>
          </View>
        )}
      </Sheet>
    </>
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
  cover: { height: 315, backgroundColor: DARK.card, justifyContent: 'flex-start' },
  body20: { paddingHorizontal: 20, paddingTop: 20, gap: 8 },
  h1: { color: '#fff', fontSize: 18, fontFamily: FONTS.semibold },
  logo: { width: 44, height: 44, borderRadius: 10, marginRight: 6, backgroundColor: DARK.card },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  body: { color: '#fff', fontSize: 14, lineHeight: 22, fontFamily: FONTS.regular },
  muted: { color: DARK.muted, fontSize: 14, fontFamily: FONTS.medium },
  link: { color: DARK.accent, fontSize: 14, fontFamily: FONTS.medium },
  section: { paddingTop: 20, marginTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: DARK.field, gap: 8 },
  sectionTitle: { color: '#fff', fontSize: 16, fontFamily: FONTS.semibold },
  pkg: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 16, backgroundColor: DARK.card, marginTop: 4 },
  pkgImg: { width: 70, height: 70, borderRadius: 10, overflow: 'hidden', backgroundColor: DARK.field, alignItems: 'center', justifyContent: 'center' },
  pkgTitle: { color: '#fff', fontSize: 14, fontFamily: FONTS.semibold },
  pkgPrice: { color: '#fff', fontSize: 18, fontFamily: FONTS.semibold },
  gallery: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  teamBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 8, paddingHorizontal: 14, height: 38, borderRadius: 19, borderWidth: 1, borderColor: DARK.border },
  teamRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingHorizontal: 14, borderRadius: 14, backgroundColor: DARK.field },
});
