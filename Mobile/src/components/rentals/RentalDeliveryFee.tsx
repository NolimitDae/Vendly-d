import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, GradientButton } from '../brand';
import TravelFeeEditor from '../listing/TravelFeeEditor';
import { DARK, FONTS } from '../../constants/colors';
import { RentalsService } from '../../services/rentals.service';
import { apiError } from '../../services/contracts.service';
import { emptyTravelFee, travelFeeBody, travelFeeError, travelFeeFrom, type TravelFeeValue } from '../../utils/travelFee';

/** The vendor's delivery fee on rental orders they deliver: one setting for all their items. */
export default function RentalDeliveryFee() {
  const [value, setValue] = useState<TravelFeeValue>(emptyTravelFee());
  const [hasAddress, setHasAddress] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    RentalsService.deliveryFee()
      .then((r) => {
        const d = r.data?.data;
        if (!d) return;
        setValue(travelFeeFrom(d));
        setHasAddress(d.has_business_address);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const save = async () => {
    const problem = travelFeeError(value);
    if (problem) return Alert.alert('Delivery fee', problem);
    setSaving(true);
    try {
      const res = await RentalsService.saveDeliveryFee(travelFeeBody(value));
      if (res.data?.data) setValue(travelFeeFrom(res.data.data));
      Alert.alert('Delivery fee', value.enabled ? 'Saved.' : 'Turned off.');
    } catch (e) {
      Alert.alert('Delivery fee', apiError(e, 'Could not save the delivery fee'));
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) return null;
  return (
    <Card style={{ gap: 12 }}>
      <View style={s.head}>
        <Ionicons name="car-outline" size={18} color={DARK.accent} />
        <Text style={s.title}>Delivery fee</Text>
      </View>
      {!hasAddress && <Text style={s.warn}>Delivery miles are measured from your business address. Add it in Profile first.</Text>}
      <TravelFeeEditor rentals value={value} onChange={setValue} />
      <GradientButton title="Save delivery fee" onPress={save} loading={saving} />
    </Card>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: '#fff', fontSize: 16, fontFamily: FONTS.semibold },
  warn: { color: '#F5B700', fontSize: 13, lineHeight: 19, fontFamily: FONTS.medium },
});
