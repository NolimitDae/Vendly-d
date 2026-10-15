import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { DARK } from '../constants/colors';
import Onboarding, { ONBOARDED_KEY } from '../screens/auth/Onboarding';
import RoleSelect from '../screens/auth/RoleSelect';
import SignIn from '../screens/auth/SignIn';
import SignUp from '../screens/auth/SignUp';
import VerifyEmail from '../screens/auth/VerifyEmail';
import ForgotPassword from '../screens/auth/ForgotPassword';
import ResetPassword from '../screens/auth/ResetPassword';
import type { AuthStackParams } from './types';

const Stack = createNativeStackNavigator<AuthStackParams>();

export default function AuthScreens() {
  // Onboarding shows once per install; after that the app opens on sign in.
  const [seen, setSeen] = useState<boolean | null>(null);
  useEffect(() => {
    AsyncStorage.getItem(ONBOARDED_KEY).then((v) => setSeen(!!v), () => setSeen(false));
  }, []);

  if (seen === null) return <View style={{ flex: 1, backgroundColor: DARK.bg }} />;

  return (
    <Stack.Navigator
      initialRouteName={seen ? 'SignIn' : 'Onboarding'}
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: DARK.bg }, animation: 'slide_from_right' }}
    >
      <Stack.Screen name="Onboarding" component={Onboarding} options={{ animation: 'fade' }} />
      <Stack.Screen name="RoleSelect" component={RoleSelect} />
      <Stack.Screen name="SignIn" component={SignIn} />
      <Stack.Screen name="SignUp" component={SignUp} />
      <Stack.Screen name="VerifyEmail" component={VerifyEmail} />
      <Stack.Screen name="ForgotPassword" component={ForgotPassword} />
      <Stack.Screen name="ResetPassword" component={ResetPassword} />
    </Stack.Navigator>
  );
}
