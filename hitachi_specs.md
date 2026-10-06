# DOCUMENTATION TECHNIQUE : Gamme Hitachi AirHome & Compatibilité Multisplit

Ce fichier sert de base de données à l'application pour générer les modèles, valider les configurations et animer les flux d'air.

## 1. Unités Intérieures (Splits Muraux)

### Série AirHome 400 (Référence : DJ)
- **Cible** : Entrée/Cœur de gamme. Rapport qualité/prix.
- **Variantes de puissance** :
  - **2.5 kW** (RAK-DJ25RHAE) : Pour pièce jusqu'à ~25m². Indice puissance = 25.
  - **3.5 kW** (RAK-DJ35RHAE) : Pour pièce de 25 à ~35m². Indice puissance = 35.
- **Performances (Moyennes)** : SEER ~7.5, SCOP ~4.6.
- **Comportement 3D (Particules)** : Flux d'air directionnel fixe ou balayage vertical simple (Haut/Bas).
- **Fonctionnalités UI Télécommande** : FrostWash Standard, Timer de base. *PAS de balayage 3D, PAS de détection de présence.*

### Série AirHome 600 (Référence : VJ)
- **Cible** : Haut de gamme, silence, et économies d'énergie.
- **Variantes de puissance** :
  - **2.5 kW** (RAK-VJ25RHAE) : Indice = 25. Niveau sonore ultra bas (~19 dB).
  - **3.5 kW** (RAK-VJ35RHAE) : Indice = 35.
- **Performances (Moyennes)** : SEER ~8.5, SCOP ~4.9.
- **Comportement 3D (Particules)** : Balayage 3D motorisé. Les particules se dispersent sur un cône beaucoup plus large (Horizontal + Vertical).
- **Fonctionnalités UI Télécommande** : Bouton **Smart Eco**. La simulation doit baisser la consigne thermique de 2°C et réduire le volume des particules d'air si la pièce est déclarée vide pendant > 20 minutes virtuelles.

### Série AirHome 800 (Référence : XJ)
- **Cible** : Premium absolu, traitement de l'air extrême, performances ultimes.
- **Variantes de puissance** :
  - **2.5 kW** (RAK-XJ25RHAE) : Indice = 25.
  - **3.5 kW** (RAK-XJ35RHAE) : Indice = 35.
- **Performances (Moyennes)** : SEER ~9.5, SCOP ~5.2. Efficacité extrême.
- **Comportement 3D (Particules)** : Flux 4D. Les particules remplissent la pièce uniformément sans toucher directement les utilisateurs virtuels (simulation du SleepSense).
- **Fonctionnalités UI Télécommande** : Télécommande premium à clapet. Boutons **AQtiv-Ion** (déclenche des particules ionisées bleutées pour purifier) et **SleepSense** (le flux diminue et la couleur de l'UI s'assombrit pour la nuit).

## 2. Unités Extérieures Multisplits (Série RAM-G) & Règles de Compatibilité

Pour un projet à 3 pièces (Tri-split), le configurateur doit évaluer l'unité extérieure nécessaire en sommant les indices des unités intérieures.

**Formule de calcul :** `Indice Total = Unité 1 + Unité 2 + Unité 3`
*(Exemple pour le projet : 2.5 + 2.5 + 3.5 = Indice 85)*

**Blocs Extérieurs Tri-Split Disponibles (Simulation) :**

1. **RAM-G55N3HAE (Groupe 5.5 kW nominal)**
   - **Plage d'indice tolérée** : De 50 à 75.
   - **Comportement** : Parfait pour trois petites pièces (ex: 3 x 2.5kW = 75). Si l'utilisateur y branche un total de 85, l'application doit afficher une **Alerte Orange** : "Attention, coefficient de foisonnement élevé. Si les 3 pièces fonctionnent à 100% en même temps, la puissance restituée baissera."

2. **RAM-G68N3HAE (Groupe 6.8 kW nominal - Le standard pour cet appartement)**
   - **Plage d'indice tolérée** : De 75 à 95.
   - **Comportement** : Supporte idéalement la configuration de l'appartement (25 + 25 + 35 = 85). Affichage **Vert** dans l'UI. Les simulations de particules tournent à 100% d'efficacité.

3. **RAM-G75N3HAE (Groupe 7.5 kW nominal)**
   - **Plage d'indice tolérée** : De 90 à 110.
   - **Comportement** : Utile uniquement si l'utilisateur place trois splits de 3.5 kW (35+35+35 = 105). Si utilisé pour un total de 85, l'app affiche un message informatif : "Groupe surdimensionné, coût initial plus élevé sans bénéfice thermique majeur."
