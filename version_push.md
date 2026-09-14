# Releasing JobOps updates to customers

Run the commands below in PowerShell from `contractor-portal`, not the repository root:

```powershell
cd contractor-portal
npm install
npm install --global eas-cli
eas login
eas whoami
```

Use the Expo account that owns this project (`descode8`). The mobile app is the Expo project in `contractor-portal`; its iOS bundle ID and Android package are both `com.jobops.contractor`. Check that the production environment uses the intended Supabase project before releasing. Never put a Supabase service-role key in the mobile app.

## Choose the release path

| Change | How customers receive it |
| --- | --- |
| JavaScript/TypeScript, screens, styling, or bundled images, with no native changes | EAS Update, **after** customers install the first update-enabled store build described below |
| New or upgraded native dependency, Expo SDK upgrade, permissions, app icon, splash screen, native plugin/config, or other native change | New iOS/Android builds submitted to the stores |
| Supabase SQL, Edge Function, or other server-only change | Deploy the backend separately; a mobile release is only needed if the app code also changed |

Pushing code to GitHub alone does **not** update installed apps. An EAS Update also does not change the version shown in the App Store or Play Store.

## One-time rollout for over-the-air updates

This repository now includes `expo-updates`, an EAS Update URL and `appVersion` runtime policy in `app.json`, and `production`/`preview` channels in `eas.json`. The first build with this configuration uses app version `1.0.1`. **Currently installed store builds should not be assumed to receive EAS Updates** until customers install a store release built with this configuration.

1. Build **and release** new production binaries for both stores using the store-release steps below. Existing installs gain EAS Update support only after customers install those new store versions.
2. Verify the new store builds appear on the `production` channel in the Expo dashboard before using the quick-update command.
3. For later native changes, increase `expo.version` in `app.json`, then build again. An EAS Update only reaches installed builds with a compatible runtime version and channel.

## Quick bug fix: app code/assets only

1. Test the change on a device or appropriate test build, and run the project checks:

   ```powershell
   npm test
   npm run lint
   ```

2. Make sure the fix uses no new native code and that the production build's runtime version still matches. From `contractor-portal`, publish:

   ```powershell
   eas update --channel production --environment production --message "Describe the bug fix"
   ```

3. Check the published update and its adoption/errors in the [Expo dashboard](https://expo.dev/accounts/descode8/projects/jobops/updates). Test the production app on an iPhone and Android device. Installed apps normally check for updates when launched; a downloaded update is typically applied on a subsequent launch, so ask a customer to fully close and reopen the app if needed.

If the fix needs native code or the installed builds are not configured for EAS Update, use a store release instead. For a bad over-the-air update, use the Expo dashboard or `eas update:rollback` to restore a previous working update; verify the result on devices.

## New version through Apple and Google

1. Test on devices and run `npm test` and `npm run lint`. If the native runtime changed and you use the `appVersion` runtime policy, increase `expo.version` in `app.json` (for example, `1.0.0` to `1.0.1`). This project uses remote app-version management and `autoIncrement` for production builds; check the resulting iOS build number and Android version code in EAS. Preserve the existing bundle ID and package name.
2. Build production binaries from `contractor-portal`:

   ```powershell
   eas build --platform all --profile production
   ```

   The production Android profile makes an `.aab` for Google Play; the preview APK is not a store release. EAS can build iOS from Windows.
3. After each build succeeds, upload it:

   ```powershell
   eas submit --platform ios --profile production
   eas submit --platform android --profile production
   ```

   Follow EAS prompts for Apple/Google credentials. Apple Developer and Google Play developer accounts, store app records, and required store information must be in place. Google Play submission through EAS may require a Google service-account key.
4. **Finish the release in the stores.** In [App Store Connect](https://appstoreconnect.apple.com/), select the processed build, complete release information, submit it for App Review, and release it after approval. An EAS iOS submission initially uploads to App Store Connect/TestFlight; it does not itself publish to customers. In [Google Play Console](https://play.google.com/console/), select the uploaded build, complete any required listing/policy items, and roll it out to the production track. Check the chosen track; a first EAS Play submission may land in internal testing.
5. Install or update from each public store and verify login and the changed flow. Customers receive the new binary through their store's update mechanism; availability depends on store review and rollout.

## References

- [Expo: EAS Update setup](https://docs.expo.dev/eas-update/getting-started/)
- [Expo: deploying updates and runtime compatibility](https://docs.expo.dev/eas-update/deployment/)
- [Expo: submit to Apple](https://docs.expo.dev/submit/ios/)
- [Expo: submit to Google Play](https://docs.expo.dev/submit/android/)
