import { Text, TextInput } from 'react-native';

export const TREBUCHET_FONT = 'Trebuchet';
export const TREBUCHET_ITALIC_FONT = 'TrebuchetItalic';

type ComponentWithDefaults = {
  defaultProps?: { style?: unknown };
};

function applyDefaultFont(component: ComponentWithDefaults) {
  const defaults = component.defaultProps ?? {};
  component.defaultProps = {
    ...defaults,
    style: [{ fontFamily: TREBUCHET_FONT }, defaults.style],
  };
}

applyDefaultFont(Text as unknown as ComponentWithDefaults);
applyDefaultFont(TextInput as unknown as ComponentWithDefaults);
