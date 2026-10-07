# INSTRUCTIONS DE MODÉLISATION 3D (THREE.JS)

L'agencement actuel est incorrect, les pièces sont simplement alignées. Tu dois recréer les pièces (sols et murs) en utilisant un repère cartésien strict (X, Z). L'axe Y représente la hauteur des murs. 

Le point d'origine `(x: 0, z: 0)` est le centre de l'Entrée. 1 unité Three.js = 1 mètre.

## 1. Tailles et Positions Relatives
Utilise ces dimensions pour paramétrer tes géométries :

*   **Entrée** : Position `x: 0, z: 0`.
*   **Séjour (16 m²)** : Pièce principale. Position `x: -3.5, z: -2`. Dimensions approx. : `width: 4.5, depth: 6`.
*   **Cuisine** : Encastrée dans le séjour. Position `x: -3.5, z: 2`. 
*   **Chambre 2 (11 m²)** : Au-dessus du couloir. Position `x: 2.5, z: -1.5`. Dimensions : `width: 2.7, depth: 4.4`.
*   **Chambre 1 (12 m²)** : En bas à droite de l'appartement. Position `x: 2.5, z: 4`. Dimensions : `width: 2.9, depth: 4.1`.
*   **Salle de bains** : Position `x: -1, z: 3`.
*   **Terrasse** : Elle enveloppe la façade (Haut et Droite). Ce n'est pas un simple rectangle, le bord extérieur est en biais.

## 2. Ajustement des Murs et des Ouvertures
- Assure-toi que les murs forment un "L" global (le Séjour à gauche, les Chambres empilées à droite).
- Les murs donnant sur la terrasse doivent être transparents ou légèrement bleutés pour simuler les baies vitrées.

## 3. Placement Strict des Unités de Climatisation (Meshes)
- **Séjour** : Fixer l'unité sur le mur adjacent à la terrasse (axe Z-).
- **Chambre 1** : Fixer l'unité sur le mur extérieur droit (axe X+).
- **Chambre 2** : Fixer l'unité sur le mur séparant la chambre de la terrasse.
- **Groupe Extérieur** : Le placer sur le mesh de la terrasse, juste devant la Chambre 2.
