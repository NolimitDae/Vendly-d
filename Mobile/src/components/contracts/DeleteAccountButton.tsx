import React from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import { apiError } from '../../services/contracts.service';

export default function DeleteAccountButton() {
  const { logout } = useAuth();

  const confirmDelete = () =>
    Alert.alert(
      'Delete account',
      'This removes your profile and personal data. Signed contracts are kept for 7 years for legal records.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete('/auth/account', { data: { confirm: 'DELETE' } });
              await logout();
            } catch (err) {
              Alert.alert('Error', apiError(err, "Couldn't delete your account"));
            }
          },
        },
      ],
    );

  return (
    <View style={s.wrap}>
      <TouchableOpacity style={s.btn} onPress={confirmDelete}>
        <Ionicons name="trash-outline" size={16} color="#dc2626" />
        <Text style={s.text}>Delete account</Text>
      </TouchableOpacity>
      <Text style={s.note}>Signed contracts are kept for 7 years for legal records.</Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 4, marginTop: 16, marginBottom: 24 },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 10 },
  text: { color: '#dc2626', fontWeight: '600' },
  note: { fontSize: 11, color: '#9ca3af' },
});
