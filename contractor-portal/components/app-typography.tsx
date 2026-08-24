import { Text as NativeText, TextInput as NativeTextInput, type TextInputProps, type TextProps } from 'react-native';

import { TREBUCHET_FONT } from '@/lib/typography';

export function AppText({ style, ...props }: TextProps) {
  return <NativeText {...props} style={[{ fontFamily: TREBUCHET_FONT }, style]} />;
}

export function AppTextInput({ style, ...props }: TextInputProps) {
  return <NativeTextInput {...props} style={[{ fontFamily: TREBUCHET_FONT }, style]} />;
}

