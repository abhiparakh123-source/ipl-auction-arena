IPL AUCTION ARENA — AUTOMATED WINDOWS EXE + ANDROID APK BUILDS

This add-on creates a Windows installer and an Android debug APK in GitHub Actions.
Both apps open your live game: https://iplauctionbyabhi.onrender.com
Internet is required; these are online wrappers, not offline copies.

INSTALL INTO YOUR EXISTING REPOSITORY
1. Extract this ZIP on your PC.
2. Open your existing cloned ipl-auction-arena repository folder.
3. Copy the app-wrapper folder from this ZIP into the repository root.
4. Copy the .github folder from this ZIP into the repository root too.
   If Windows asks to merge folders, choose Yes. Do not delete existing files.
5. Open GitHub Desktop. Commit the new files with summary: Add cloud EXE and APK builds.
6. Click Push origin.

DOWNLOAD THE BUILDS
1. Open your GitHub repository in a browser and click Actions.
2. Open Build IPL Auction Arena apps.
3. Wait until both jobs have green check marks.
4. Open the completed workflow run and scroll to Artifacts.
5. Download windows-installer for the EXE and android-debug-apk for the APK.
6. Extract the artifact ZIPs to get the actual files.

NOTES
- APK is a debug APK for testing/sideloading, not a Play Store release.
- Windows may show SmartScreen because the installer is unsigned.
- Both apps need internet and use your Render-hosted game. Render free instances can sleep.
