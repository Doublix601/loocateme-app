# LoocateMe App – Build iOS (TestFlight)

Ce guide couvre l’installation des dépendances et le passage d’Expo Go à une app build prête pour TestFlight (bêta fermée) via EAS Build.

Prérequis côté poste:
- Node.js LTS 18+ (ou 20+)
- Compte Apple Developer (99$/an) avec accès App Store Connect
- Xcode installé (pour signer et pour les simulateurs)

1) Installation des dépendances
- Ouvrir un terminal dans le dossier loocateme-app
- Installer les paquets:
  npm install
- Vérifier la config Expo:
  npm run doctor

2) Connexion à EAS
- Installer le CLI si ce n’est pas déjà fait (installé comme devDependency):
  npx eas --version
- Se connecter:
  npx eas login

3) Configuration iOS incluse
- Bundle Identifier: me.loocate.app (dans app.json). Adaptez-le si nécessaire pour correspondre à votre App ID Apple.
- Background Location activé (UIBackgroundModes: ["location"]).
- Chaîne de permissions iOS définie.
- Profils de build EAS prêts (eas.json): development, preview (interne), production (store).

4) Build iOS pour TestFlight (bêta fermée)
- Build interne (profile preview):
  npm run build:ios:preview
  Ensuite, téléchargez l’ipa depuis la page de build EAS.
- Build store (profile production):
  npx eas build -p ios --profile production

EAS vous guidera pour créer/ajouter les certificats et Provisioning Profiles. Laissez EAS gérer automatiquement, sauf besoin spécifique.

5) Soumission à TestFlight
- Depuis un build store terminé, soumettez:
  npm run submit:ios
  ou
  npx eas submit -p ios --latest

Après la validation par Apple, ajoutez vos testeurs internes/externes dans App Store Connect.

Notes techniques
- Le partage de position en arrière-plan utilise expo-location et expo-task-manager. Sur iOS, la permission Always peut être demandée selon le flux système; le code n’envoie des updates en arrière-plan que pendant 1h quand l’utilisateur l’active.
- Android: configuration de base OK. Vous pourrez ajuster la notification de service de localisation (texte/couleur) dans components/BackgroundLocation.js.

Dépannage
- expo doctor pour diagnostiquer la config.
- S’assurer que le Bundle Identifier (app.json) correspond bien à votre App ID.
- Si vous changez le bundleIdentifier, regénérez les credentials dans EAS lors du prochain build.
