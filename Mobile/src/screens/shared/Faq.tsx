import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, LayoutAnimation, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { GradientButton, ScreenHeader, ui } from '../../components/brand';
import { Skeleton } from '../../components/Skeleton';
import { DARK, FONTS } from '../../constants/colors';
import { FaqService, type Faq } from '../../services/faq.service';
import { apiMessage } from '../auth/SignIn';

/** Help centre: the FAQs admins publish from the dashboard. Search, tap a question to show its answer. */
export default function FaqScreen() {
  const nav = useNavigation();
  const insets = useSafeAreaInsets();
  const [faqs, setFaqs] = useState<Faq[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      setFaqs(await FaqService.list());
      setError(null);
    } catch (err) {
      setError(apiMessage(err, 'Could not load FAQs.'));
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const refresh = () => {
    setRefreshing(true);
    load();
  };

  const retry = () => {
    setError(null);
    setFaqs(null);
    load();
  };

  const toggle = (id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const q = query.trim().toLowerCase();
  const shown = useMemo(
    () => (faqs ?? []).filter((f) => !q || f.question?.toLowerCase().includes(q) || f.answer?.toLowerCase().includes(q)),
    [faqs, q],
  );

  const body = () => {
    // a failed refresh keeps the list it already has
    if (error && !faqs) {
      return (
        <View style={[s.state, { marginHorizontal: 20 }]} accessibilityLiveRegion="polite">
          <Ionicons name="cloud-offline-outline" size={40} color={DARK.accent} />
          <Text style={s.stateTitle}>Couldn’t load FAQs</Text>
          <Text style={s.stateBody}>{error}</Text>
          <GradientButton title="Try again" onPress={retry} style={{ alignSelf: 'stretch', marginTop: 8 }} />
        </View>
      );
    }
    if (!faqs) {
      return (
        <View style={{ paddingHorizontal: 20, gap: 12 }} accessibilityLabel="Loading FAQs">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} height={56} radius={16} />
          ))}
        </View>
      );
    }
    return (
      <FlatList
        data={shown}
        keyExtractor={(f) => f.id}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 24, gap: 10, flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={DARK.accent} />}
        ListHeaderComponent={
          error ? (
            <Text style={s.inlineError} accessibilityLiveRegion="polite">
              Couldn’t refresh: {error}
            </Text>
          ) : null
        }
        ListEmptyComponent={
          <View style={s.state}>
            <Ionicons name={q ? 'search-outline' : 'help-circle-outline'} size={40} color={DARK.accent} />
            <Text style={s.stateTitle}>{q ? 'No matching questions' : 'No questions yet'}</Text>
            <Text style={s.stateBody}>
              {q ? `Nothing matches “${query.trim()}”. Try another word.` : 'Answers to common questions will show up here. Pull down to check again.'}
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const expanded = open.has(item.id);
          return (
            <View style={s.item}>
              <Pressable
                onPress={() => toggle(item.id)}
                style={({ pressed }) => [s.question, pressed && { opacity: 0.7 }]}
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                accessibilityHint={expanded ? 'Hides the answer' : 'Shows the answer'}
              >
                <Text style={s.questionText}>{item.question}</Text>
                <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color={DARK.muted} />
              </Pressable>
              {expanded && <Text style={s.answer}>{item.answer?.trim() || 'No answer yet.'}</Text>}
            </View>
          );
        }}
      />
    );
  };

  return (
    <View style={[s.root, { paddingTop: insets.top + 8 }]}>
      <ScreenHeader title="FAQs" onBack={() => nav.goBack()} />
      <View style={s.searchWrap}>
        <View style={ui.field}>
          <Ionicons name="search-outline" size={20} color={DARK.muted} />
          <TextInput
            style={ui.input}
            value={query}
            onChangeText={setQuery}
            placeholder="Search questions"
            placeholderTextColor={DARK.muted}
            accessibilityLabel="Search questions"
            returnKeyType="search"
            autoCorrect={false}
            editable={!!faqs}
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery('')} hitSlop={12} style={s.clear} accessibilityRole="button" accessibilityLabel="Clear search">
              <Ionicons name="close-circle" size={20} color={DARK.muted} />
            </Pressable>
          )}
        </View>
      </View>
      {body()}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: DARK.bg },
  searchWrap: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16 },
  clear: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', marginRight: -12 },
  item: { backgroundColor: DARK.card, borderRadius: 16, overflow: 'hidden' },
  question: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  questionText: { flex: 1, color: '#fff', fontSize: 16, lineHeight: 22, fontFamily: FONTS.semibold },
  answer: { color: DARK.muted, fontSize: 15, lineHeight: 23, fontFamily: FONTS.regular, paddingHorizontal: 16, paddingBottom: 16 },
  state: { alignItems: 'center', gap: 8, padding: 28, backgroundColor: DARK.card, borderRadius: 18 },
  stateTitle: { color: '#fff', fontSize: 18, fontFamily: FONTS.semibold, textAlign: 'center' },
  stateBody: { color: DARK.muted, fontSize: 14, lineHeight: 21, fontFamily: FONTS.regular, textAlign: 'center' },
  inlineError: { color: '#fca5a5', fontSize: 13, fontFamily: FONTS.medium, marginBottom: 6 },
});
