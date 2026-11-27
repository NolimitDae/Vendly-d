import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';

/**
 * What the installed app itself (not an over-the-air update) supports. An update can reach builds made
 * before a feature's native setup existed, so features that need it check the build first.
 */

/** The installed iPhone build's number (CFBundleVersion), or 0 when unknown. */
export const iosBuildNumber = (): number => Number(Constants.platform?.ios?.buildNumber ?? 0) || 0;

/** Google sign-in on iPhone needs Google's return link registered in the build: 1.2.1 build 4 onwards. */
export const iosBuildHasGoogleSignIn = () => Platform.OS === 'ios' && iosBuildNumber() >= 4;

/**
 * Apple Pay needs the Apple Pay capability in the build: App Store / TestFlight builds from 1.2.1 build 5
 * on (test builds leave it out).
 */
export const iosBuildHasApplePay = () => Platform.OS === 'ios' && Updates.channel === 'production' && iosBuildNumber() >= 5;
