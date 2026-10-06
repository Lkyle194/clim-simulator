# MISSION : WebApp de Simulation Climatique Interactive (Hitachi AirHome)

## CONTEXTE
Tu dois développer une application web interactive 2D/3D (Angular + Three.js + Tailwind CSS) hébergée sur Vercel. L'application permet de configurer et simuler un système de climatisation tri-split dans un appartement virtuel. Tu devras te référer au fichier `hitachi_specs.md` pour toute la logique métier et les contraintes de compatibilité.

**Légende du plan (`plan.png`) :**
- **Rectangles rouges** : emplacements des **unités intérieures** de climatisation (Séjour, Chambre 1, Chambre 2).
- **Rectangle bleu** : emplacement de l'**unité extérieure** (sur la terrasse).

## ÉTAPES DE DÉVELOPPEMENT À SUIVRE STRICTEMENT :

### Étape 1 : Initialisation de l'architecture et du Store
1. Scaffolder le projet Angular avec Tailwind CSS.
2. Mettre en place un State Manager (NgRx ou Signals) pour gérer :
   - L'état de chaque pièce (Température actuelle, Température cible).
   - Les modèles d'unités intérieures sélectionnés par l'utilisateur pour les 3 pièces (Séjour, Chambre 1, Chambre 2).
   - Le modèle d'unité extérieure calculé automatiquement selon la combinaison.
   - L'état de fonctionnement (Allumé/Éteint, Mode, Vitesse du ventilateur, Timer 20 min pour simulation de présence).

### Étape 2 : Modélisation 3D/2D de l'appartement
1. Créer une scène WebGL via Three.js (ou angular-three).
2. Modéliser les murs en respectant les proportions du fichier de référence `plan.png` (Séjour 16.02m², Ch1 12.43m², Ch2 11.05m²).
3. Intégrer un système de caméra fluide permettant de switcher via un bouton entre une vue top-down (2D) et une vue isométrique (3D orbitale).
4. Placer des `Mesh` (représentant les splits) aux emplacements exacts indiqués sur `plan.png` (Murs extérieurs/terrasse).

### Étape 3 : Logique de configuration et compatibilité (Configurateur)
1. Créer un menu latéral (Sidebar) permettant à l'utilisateur de drag & drop ou sélectionner les unités intérieures pour chaque pièce.
2. Implémenter l'algorithme de calcul de puissance :
   - Additionner les indices de puissance des unités intérieures (ex: 25 + 25 + 35 = 85).
   - Comparer avec les capacités nominales des unités extérieures (cf. `hitachi_specs.md`).
   - Afficher un indicateur visuel (Vert/Orange/Rouge) : si la somme dépasse trop la capacité du groupe extérieur, afficher une alerte "Risque de sous-puissance en simultané".

### Étape 4 : Système de Télécommande Virtuelle (HUD)
1. Modéliser en HTML/CSS une télécommande interactive en superposition (Overlay).
2. Adapter dynamiquement l'UI de la télécommande en fonction de l'unité sélectionnée dans la scène 3D (ex: masquer le bouton "Balayage 3D" si le modèle est un AirHome 400).
3. Connecter les boutons (Power, Temp+, Temp-, Mode, Eco/Présence) au State Manager pour modifier les variables de la scène.

### Étape 5 : Shaders et Simulation de Fluides (Le cœur visuel)
1. **Heatmap au sol** : Créer un custom shader matériel pour le sol. Il doit interpoler la couleur (Bleu = Froid, Rouge = Chaud) en temps réel selon le delta entre la température initiale et la consigne de la clim.
2. **Particules (Airflow)** : Implémenter un `PointsMaterial` ou un système d'instanciation de géométries pour simuler le flux d'air sortant des unités.
   - Les vecteurs de vitesse des particules doivent réagir aux caractéristiques du modèle (Balayage simple vs 4D).
   - Si le bouton "AQtiv-Ion" (sur AirHome 800) est activé, changer la couleur/l'effet des particules (ajout de glow/scintillement).
3. **Simulation de présence** : Créer un toggle "Pièce inoccupée". Si activé, après un délai accéléré (ex: 20 secondes virtuelles = 20 minutes réelles), l'AirHome 600 et 800 doivent visuellement réduire leur flux d'air (mode Smart Eco), contrairement au 400.

### Étape 6 : Configuration CI/CD et Déploiement sur Vercel
1. **Configuration du Routage (SPA)** : Créer un fichier `vercel.json` à la racine du projet avec les règles de `rewrites` pour rediriger tout le trafic vers `index.html` (indispensable pour que le routage d'Angular fonctionne sur Vercel sans générer d'erreurs 404).
2. **Optimisation du Build** : S'assurer que le fichier `package.json` contient le script de build de production optimisé (`"build": "ng build --configuration production"`).
3. **Préparation Git / GitHub** : Initialiser le dépôt Git et générer le `.gitignore` approprié. Le code doit être packagé pour qu'une fois poussé sur GitHub, Vercel détecte automatiquement le framework Angular et lance le déploiement.
4. **Commandes de Déploiement CLI** : Générer les instructions et les commandes Vercel CLI (`vercel` pour la prévisualisation, `vercel --prod` pour la production) afin de permettre un déploiement direct depuis le terminal (VS Code / Cline) sans passer par l'interface web.
