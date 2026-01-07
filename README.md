# LoocateMe App – Build iOS (TestFlight)

Ce guide couvre l’installation des dépendances et le passage d’Expo Go à une app build prête pour TestFlight (bêta fermée) via EAS Build.

Prérequis côté poste:
- Node.js LTS 20 (recommandé 20.18.0). N'utilisez pas Node 23+ pour ce projet.
- Compte Apple Developer (99$/an) avec accès App Store Connect
- Xcode installé (pour signer et pour les simulateurs)

1) Installation des dépendances
- Ouvrir un terminal dans le dossier loocateme-app
- Installer les paquets:
  npm install
- Vérifier la config Expo:
  npm run doctor

2) Connexion à EAS
- Vérifier le CLI (installé comme devDependency):
  npx eas --version
- Se connecter si nécessaire:
  npx eas login

3) Configuration iOS incluse
- Bundle Identifier: me.loocate.app (dans app.json). Adaptez-le si nécessaire pour correspondre à votre App ID Apple.
- Background Location activé (UIBackgroundModes: ["location"]).
- Chaîne de permissions iOS définie.
- Profils de build EAS prêts (eas.json): development, preview (interne), production (store).

4) Build iOS pour TestFlight (automatique)
- Tout‑en‑un (build + envoi TestFlight, profils gérés auto):
  npm run release:ios
  (Le script ouvre une session Expo si besoin, lance le build iOS «production» et auto‑soumet sur TestFlight. Il imprime des liens utiles et des instructions testeurs.)
- Build interne (profile preview) si besoin:
  npm run build:ios:preview

EAS vous guidera pour créer/ajouter les certificats et Provisioning Profiles. Laissez EAS gérer automatiquement, sauf besoin spécifique.

5) Soumission à TestFlight (manuel)
- Depuis un build store terminé, vous pouvez aussi soumettre manuellement:
  npm run submit:ios
  ou
  npx eas submit -p ios --latest

Après la validation par Apple, ajoutez vos testeurs internes/externes dans App Store Connect.

Instructions TestFlight (rappel)
- Testeurs internes (équipe, accès immédiat): App Store Connect > My Apps > Votre App > TestFlight > Ajouter des utilisateurs internes.
- Testeurs externes: Créer un groupe de test externe, ajouter des emails ou activer un lien public, puis soumettre à la Beta App Review si demandé.

Liens utiles
- L’outil affiche la page du build et (si dispo) les logs de soumission.
- Lister les derniers builds: npx eas build:list --platform ios
- Re‑soumettre le dernier IPA: npx eas submit -p ios --latest

Notes techniques
- Le partage de position en arrière-plan utilise expo-location et expo-task-manager. Sur iOS, la permission Always peut être demandée selon le flux système; le code n’envoie des updates en arrière-plan que pendant 1h quand l’utilisateur l’active.
- Android: configuration de base OK. Vous pourrez ajuster la notification de service de localisation (texte/couleur) dans components/BackgroundLocation.js.

Dépannage
- expo doctor pour diagnostiquer la config.
- S’assurer que le Bundle Identifier (app.json) correspond bien à votre App ID.
- Si vous changez le bundleIdentifier, regénérez les credentials dans EAS lors du prochain build.

Versions de Node recommandées (important)
- Le projet impose Node >=20 <23 (voir package.json). Des versions récentes comme 23.x provoqueront l’erreur: The engine "node" is incompatible with this module. Expected version ">=20 <23".
- Un fichier .nvmrc est fourni à la racine du repo avec la version 20.18.0, alignée avec eas.json.

Basculer de version facilement
- Avec nvm:
  - nvm install 20.18.0
  - nvm use 20.18.0
  - Optionnel: nvm alias default 20.18.0
- Avec asdf:
  - asdf plugin add nodejs https://github.com/asdf-vm/asdf-nodejs.git (si besoin)
  - asdf install nodejs 20.18.0
  - asdf local nodejs 20.18.0 (à la racine du repo)

Vérifier:
- node -v doit afficher v20.18.0 (ou une 20.x compatible) avant npm install / expo start.
