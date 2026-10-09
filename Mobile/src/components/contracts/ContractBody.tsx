import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { COLORS } from '../../constants/colors';

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
              <Text style={s.p}>•</Text>
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
  h1: { fontSize: 20, fontWeight: '800', color: COLORS.gray[900], marginBottom: 6 },
  h2: { fontSize: 15, fontWeight: '700', color: COLORS.gray[900], marginTop: 14, marginBottom: 4 },
  p: { fontSize: 15, lineHeight: 22, color: COLORS.gray[800] },
  bulletRow: { flexDirection: 'row', gap: 8, paddingLeft: 4 },
});
