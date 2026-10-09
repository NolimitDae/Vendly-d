import React from 'react';
import { Text, StyleSheet } from 'react-native';

const STYLES: Record<string, { bg: string; fg: string; label: string }> = {
  AWAITING_VENDOR: { bg: '#fef3c7', fg: '#92400e', label: 'Awaiting vendor signature' },
  AWAITING_CUSTOMER: { bg: '#fef3c7', fg: '#92400e', label: 'Awaiting customer signature' },
  EXECUTED: { bg: '#dcfce7', fg: '#166534', label: 'Signed' },
  VOID: { bg: '#f3f4f6', fg: '#4b5563', label: 'Void' },
  SUPERSEDED: { bg: '#f3f4f6', fg: '#4b5563', label: 'Superseded' },
};

export default function ContractStatusBadge({ status }: { status: string }) {
  const st = STYLES[status] ?? { bg: '#f3f4f6', fg: '#4b5563', label: status };
  return <Text style={[s.badge, { backgroundColor: st.bg, color: st.fg }]}>{st.label}</Text>;
}

const s = StyleSheet.create({
  badge: { fontSize: 11, fontWeight: '700', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, overflow: 'hidden', alignSelf: 'flex-start' },
});
