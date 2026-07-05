import * as Haptics from 'expo-haptics';

// Small helpers so callers stay one-liners; failures (e.g. no vibration motor) are ignored.
export const hTap = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
export const hMedium = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
export const hSuccess = () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
export const hWarn = () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
export const hSelect = () => Haptics.selectionAsync().catch(() => {});
