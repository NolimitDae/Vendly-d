import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { DARK, FONTS } from '../../constants/colors';

/** Renders contract text (# title, ## heading, - bullet, paragraphs) as readable native text. */
export default function ContractBody({ body }: { body: string }) {
  return (
    <View>
      {body.split('\n').map((raw, i) => {
        const line = raw.trimEnd();
        if (line.startsWith('# ')) return <Text key={i} style={s.h1}>{line.slice(2)}</Text>;
        if (line.startsWith('## ')) return <Text key={i} style={s.h2}>{line.slice(3)}</Text>;
        if (line.startsWith('- '))
          return (
            <View key={i} style={s.bulletRow}>
              <Text style={s.tick}>✓</Text>
              <Text style={[s.p, { flex: 1 }]}>{line.slice(2)}</Text>
            </View>
          );
        if (!line.trim()) return <View key={i} style={{ height: 6 }} />;
        return <Text key={i} style={s.p}>{line}</Text>;
      })}
    </View>
  );
}

const s = StyleSheet.create({
  h1: { fontSize: 20, fontFamily: FONTS.semibold, color: '#fff', marginBottom: 6 },
  h2: { fontSize: 16, fontFamily: FONTS.semibold, color: '#fff', marginTop: 16, marginBottom: 6 },
  p: { fontSize: 15, lineHeight: 23, color: '#fff', fontFamily: FONTS.regular },
  tick: { fontSize: 15, lineHeight: 23, color: DARK.accent, fontFamily: FONTS.semibold },
  bulletRow: { flexDirection: 'row', gap: 8, paddingLeft: 4 },
});
