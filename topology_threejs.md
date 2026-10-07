# INSTRUCTIONS DE TOPOLOGIE 3D (THREE.JS) - APPARTEMENT F704

L'agencement précédent basé sur des boîtes simples est incorrect. L'appartement possède des murs en biais (façade droite) et une géométrie imbriquée.
Tu dois IMPÉRATIVEMENT utiliser les coordonnées ci-dessous pour recréer fidèlement le plan. 
L'unité de mesure Three.js est le mètre (1 unité = 1 mètre). 
L'axe Y représente la hauteur (plafond à 2.5m). L'axe X est la largeur (gauche/droite) et l'axe Z est la profondeur (haut/bas sur le plan).

## 1. POLYGONES DES PIÈCES (Pour les sols et les heatmaps)

Pour créer les sols (planchers) des pièces, utilise `THREE.Shape()` en passant par les sommets (vertices) suivants, puis génère un `THREE.Mesh` avec un `THREE.ShapeGeometry`. Le point `[0, 0]` est situé en haut à gauche.

**1. Séjour & Cuisine (Espace ouvert)**
const sejourPoints = [
  [1.58, 0.00],   // Haut-Gauche (Cuisine)
  [8.30, 0.00],   // Haut-Droite (Séjour)
  [8.55, 3.41],   // Bas-Droite (Mur biaisé côté terrasse)
  [5.85, 3.41],   // Angle intérieur avec Chambre 2
  [5.85, 4.66],   // Descente vers couloir
  [1.58, 4.66]    // Retour bas-gauche Cuisine
];

**2. Chambre 2**
const chambre2Points = [
  [5.85, 3.41],   // Haut-Gauche
  [8.55, 3.41],   // Haut-Droite
  [8.90, 7.85],   // Bas-Droite (Mur biaisé côté terrasse)
  [5.85, 7.85]    // Bas-Gauche
];

**3. Chambre 1**
const chambre1Points = [
  [5.85, 8.81],   // Haut-Gauche (après le couloir)
  [8.98, 8.81],   // Haut-Droite
  [9.45, 12.96],  // Bas-Droite (Mur biaisé côté terrasse)
  [5.85, 12.96]   // Bas-Gauche
];

**4. Salle de Bains**
const sdbPoints = [
  [0.00, 4.66],   // Haut-Gauche
  [2.96, 4.66],   // Haut-Droite
  [2.96, 6.63],   // Bas-Droite
  [0.00, 6.63]    // Bas-Gauche
];

**5. Entrée & Dégagement (Couloir)**
const entreePoints = [
  [0.00, 6.63],   // Haut-Gauche
  [5.85, 6.63],   // Haut-Droite (Rejoint les chambres)
  [5.85, 8.81],   // Bas-Droite couloir
  [3.62, 8.81],   // Retour angle
  [3.62, 7.88],   // Bas-Droite entrée
  [0.00, 7.88]    // Bas-Gauche entrée
];

**6. Terrasse**
const terrassePoints = [
  [8.30, 0.00],   // Haut-Gauche (Touche le séjour)
  [10.87, 0.00],  // Haut-Droite (2.57m de large)
  [12.03, 12.96], // Bas-Droite (Longe toute la façade)
  [9.45, 12.96],  // Bas-Gauche (Touche Chambre 1)
  [8.98, 8.81],   // Point de contact Chambre 1 / Couloir
  [8.90, 7.85],   // Point de contact Chambre 2
  [8.55, 3.41]    // Point de contact Séjour
];

## 2. GÉNÉRATION DES MURS (Élévation 3D)

Pour générer les murs, crée une fonction qui prend deux points (start, end) et une épaisseur, et génère un `BoxGeometry` positionné et tourné correctement entre ces deux points. Hauteur des murs (`Y`) = 2.5m.

*   Épaisseur des murs extérieurs et murs porteurs : **0.25m**
*   Épaisseur des cloisons intérieures : **0.10m**

**Trace les cloisons principales avec ces segments [startX, startZ, endX, endZ, epaisseur] :**
1. Mur Gauche (Cuisine/SdB/Entrée) : `[1.58, 0, 1.58, 4.66, 0.25]` puis `[0, 4.66, 0, 7.88, 0.25]`
2. Mur Haut (Séjour) : `[1.58, 0, 8.30, 0, 0.25]`
3. Mur Bas (Chambre 1) : `[5.85, 12.96, 9.45, 12.96, 0.25]`
4. Façade biaisée (Séparation Intérieur/Terrasse) - Vitres transparentes / bleutées :
   - Segment Séjour : `[8.30, 0, 8.55, 3.41, 0.25]`
   - Segment Ch2 : `[8.55, 3.41, 8.90, 7.85, 0.25]`
   - Segment Ch1 : `[8.98, 8.81, 9.45, 12.96, 0.25]`
5. Cloison centrale verticale : `[5.85, 3.41, 5.85, 12.96, 0.10]`
6. Cloison Ch2/Séjour : `[5.85, 3.41, 8.55, 3.41, 0.10]`
7. Cloison Ch1/Couloir : `[5.85, 8.81, 8.98, 8.81, 0.10]`

### CORRECTION CRITIQUE : GÉNÉRATION DES MURS (ROTATION ET POSITION)

Les sols sont corrects, mais les murs sont mal orientés. Actuellement, tu places des BoxGeometry sans calculer leur rotation ni leur point central exact par rapport au segment défini. Remplace ta logique de création de murs par cette fonction stricte pour relier parfaitement Point A et Point B :

```javascript
function createWall(startX, startZ, endX, endZ, thickness) {
  // 1. Calculer la longueur exacte du mur (Théorème de Pythagore)
  const dx = endX - startX;
  const dz = endZ - startZ;
  const distance = Math.sqrt(dx * dx + dz * dz);

  // 2. Créer la géométrie (longueur = X, hauteur = Y, épaisseur = Z)
  const height = 2.5;
  const geometry = new THREE.BoxGeometry(distance, height, thickness);
  const material = new THREE.MeshStandardMaterial({ color: 0x555555 }); // Ajuster la couleur si besoin
  const wall = new THREE.Mesh(geometry, material);

  // 3. Positionner le mur EXACTEMENT au milieu du segment
  wall.position.x = startX + (dx / 2);
  wall.position.z = startZ + (dz / 2);
  wall.position.y = height / 2; // Posé sur le sol (Y = 0)

  // 4. Appliquer la rotation trigonométrique sur l'axe Y pour aligner le mur
  wall.rotation.y = -Math.atan2(dz, dx);
  return wall;
}
```

> **Pourquoi `-Math.atan2(dz, dx)` ?** La longueur du `BoxGeometry` est sur l'axe local X. Une rotation Y de θ envoie ce local X vers `(cos θ, 0, -sin θ)` dans le repère monde. Pour l'aligner sur la direction du segment `(dx, dz)`, il faut `cos θ = dx/d` et `-sin θ = dz/d`, donc `θ = -atan2(dz, dx)`. La formule `atan2(dx, dz)` (axes inversés) est incorrecte.

## 3. PLACEMENT EXACT DU SYSTÈME HITACHI (Meshes)

Place les unités de climatisation (des boîtes rectangulaires ou modèles 3D) à ces coordonnées exactes pour qu'elles soient plaquées contre les murs.

*   **Split Séjour (AirHome 600 - 3.5kW)** : 
    - Position : `x: 8.42, y: 2.10, z: 1.70`
    - Rotation Y : Orienté vers la gauche (pour souffler vers l'intérieur du séjour).
*   **Split Chambre 2 (AirHome 600 - 2.5kW)** : 
    - Position : `x: 8.72, y: 2.10, z: 5.60`
    - Rotation Y : Orienté vers la gauche.
*   **Split Chambre 1 (AirHome 600 - 2.5kW)** : 
    - Position : `x: 9.20, y: 2.10, z: 10.80`
    - Rotation Y : Orienté vers la gauche.
*   **Groupe Extérieur (RAM-G68N3HAE - 6.8kW)** :
    - Position : `x: 9.80, y: 0.50, z: 5.60` (Posé sur le sol de la terrasse, devant la chambre 2).
    - Rotation : Parallèle à la façade biaisée.

## 4. INSTRUCTIONS DE CAMÉRA

Initialise l'`OrbitControls` pour que la caméra regarde le centre de l'appartement :
- Target de l'OrbitControls : `x: 5.0, y: 0.0, z: 6.0`
- Position initiale de la caméra (Vue isométrique) : `x: 5.0, y: 15.0, z: 18.0`