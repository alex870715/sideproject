import { Alert, Platform } from 'react-native';

/** Two-button confirm. On web, `Alert.alert` is a no-op in react-native-web — use `window.confirm`. */
export function confirmAsync(options: {
  title: string;
  message?: string;
  cancelText?: string;
  confirmText?: string;
  destructive?: boolean;
}): Promise<boolean> {
  const {
    title,
    message,
    cancelText = '取消',
    confirmText = '確定',
    destructive,
  } = options;

  if (Platform.OS === 'web') {
    const body = message?.trim() ? `${title}\n\n${message}` : title;
    return Promise.resolve(window.confirm(body));
  }

  const msg = message?.trim() ? message : undefined;

  return new Promise((resolve) => {
    Alert.alert(title, msg, [
      { text: cancelText, style: 'cancel', onPress: () => resolve(false) },
      {
        text: confirmText,
        style: destructive ? 'destructive' : 'default',
        onPress: () => resolve(true),
      },
    ]);
  });
}

/** Single-button info alert; works on web via `window.alert`. */
export function showAlertMessage(title: string, message?: string, onDismiss?: () => void): void {
  if (Platform.OS === 'web') {
    window.alert(message?.trim() ? `${title}\n\n${message}` : title);
    onDismiss?.();
    return;
  }
  Alert.alert(title, message, [{ text: '確定', onPress: onDismiss }]);
}
