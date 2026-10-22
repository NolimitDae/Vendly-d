import React from 'react';
import { Text, StyleSheet } from 'react-native';

const STYLES: Record<string, { bg: string; fg: string; label: string }> = {
  AWAITING_VENDOR: { bg: '#3a2a0a', fg: '#fcd34d', label: 'Awaiting vendor signature' },
  AWAITING_CUSTOMER: { bg: '#3a2a0a', fg: '#fcd34d', label: 'Awaiting your signature' },
  AWAITING_CLIENT: { bg: '#3a2a0a', fg: '#fcd34d', label: 'Awaiting client co-signature' },
  EXECUTED: { bg: '#0c2a25', fg: '#6ee7c7', label: 'Signed' },
  VOID: { bg: '#34183B', fg: '#B7A6BA', label: 'Void' },
  SUPERSEDED: { bg: '#34183B', fg: '#B7A6BA', label: 'Superseded' },
};

export default function ContractStatusBadge({ status }: { status: string }) {
  const st = STYLES[status] ?? { bg: '#34183B', fg: '#B7A6BA', label: status };
  return <Text style={[s.badge, { backgroundColor: st.bg, color: st.fg }]}>{st.label}</Text>;
}

const s = StyleSheet.create({
  badge: { fontSize: 11, fontWeight: '700', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, overflow: 'hidden', alignSelf: 'flex-start' },
});
