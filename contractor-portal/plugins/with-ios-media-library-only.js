module.exports = function withIosMediaLibraryOnly(config) {
  const imagePickerInfoPlistMod = config.mods?.ios?.infoPlist;

  if (!imagePickerInfoPlistMod) {
    throw new Error('with-ios-media-library-only must run after expo-image-picker');
  }

  const mediaLibraryOnlyInfoPlistMod = async (modConfig) => {
    const configWithImagePicker = await imagePickerInfoPlistMod(modConfig);
    delete configWithImagePicker.modResults.NSCameraUsageDescription;
    delete configWithImagePicker.modResults.NSMicrophoneUsageDescription;
    return configWithImagePicker;
  };

  mediaLibraryOnlyInfoPlistMod.isIntrospective = imagePickerInfoPlistMod.isIntrospective;
  config.mods.ios.infoPlist = mediaLibraryOnlyInfoPlistMod;
  return config;
};
