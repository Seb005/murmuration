# Murmuration

Animation interactive inspirée de la **murmuration des étourneaux** — des milliers d'oiseaux qui se coordonnent sans chef d'orchestre, créant des formes collectives spectaculaires.

C'est exactement ce que produit une bonne facilitation : quand les bonnes conditions sont réunies, **l'intelligence collective émerge naturellement**.

## Demo

Ouvrez `index.html` dans votre navigateur. Aucune dépendance requise.

**Interactions :**
- **Souris** — Passez votre curseur pour réveiller les particules. L'énergie se propage entre voisins comme une réaction en chaîne.
- **Micro** — Activez le microphone pour que les particules réagissent à votre voix en temps réel (pulse, expansion, luminosité).
- **Oeil** — Masquez ou affichez l'animation.
- **?** — En savoir plus sur le concept.

## Fichiers

| Fichier | Description |
|---------|-------------|
| `index.html` | Version standalone (HTML/CSS/JS vanilla, zero dépendance) |
| `MurmurationBg.tsx` | Composant React/Next.js (TypeScript, Tailwind CSS) |

## Algorithme

L'animation utilise l'algorithme des **boids** (Craig Reynolds, 1986) avec trois règles simples :

1. **Cohésion** — Chaque particule se dirige vers le centre de masse de ses voisins
2. **Alignement** — Chaque particule aligne sa direction avec ses voisins
3. **Séparation** — Chaque particule évite les collisions avec ses voisins proches

À ces règles s'ajoutent :
- **Énergie** — Les particules démarrent immobiles et sont activées par la souris, avec propagation en chaîne
- **Réactivité audio** — Le volume du microphone module la vitesse, la cohésion, la séparation et la taille des particules
- **Évitement des bords** — Les particules restent dans le cadre visible

## Intégration React/Next.js

```tsx
import MurmurationBg from './MurmurationBg';

export default function Hero() {
  return (
    <section className="relative overflow-hidden">
      <MurmurationBg />
      <div className="relative z-10">
        {/* Votre contenu */}
      </div>
    </section>
  );
}
```

Le composant nécessite Tailwind CSS avec les couleurs custom `orange-brand` (`#F97316`) et `blue-dark` (`#0B1529`).

## Licence

MIT — Utilisez-le librement.

## Crédits

Créé par [Kodra Conseil](https://kodra.ca) avec l'aide de Claude (Anthropic).
