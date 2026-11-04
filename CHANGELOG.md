# Changelog

## 2.0 (3 novembre 2026)

- **Moteur de calcul refait** : les coûts de commande (modélisation, préparation, frais fixes, veille) sont comptés une seule fois ; les coûts variables
  (matière, électricité, temps machine, post-traitement) sont multipliés par la quantité. La v1 divisait le total par la quantité, ce qui sous-évaluait les séries.
- **Devis multi-lignes** : une ligne par type de pièce, avec pièces par plateau, quantité et post-traitement par pièce. Le temps machine est compté par lancement.
- **Base de 52 machines (13 marques)** : marque → modèle remplit puissance moyenne, pic de chauffe, veille, préchauffe, enceinte, prix d'achat et durée de vie.
  Badge « mesuré au wattmètre » ou « estimé ». Machine personnalisée avec gabarits, recherche web, export / import JSON.
- **Usure calculée** : amortissement, maintenance, buse, plateau et pièces diverses remplacent le forfait de 0,50 €/h.
- **Énergie** : puissance moyenne réelle, facteur par matière et par ambiance, préchauffe par lancement, enceinte chauffée, séchoir réparti sur les bobines, veille facultative.
- **Risque et marge** : taux d'échec, perte matière, remise, arrondi, commande minimum, expédition hors marge, marge brute et taux horaire effectif.
- **Matières** : 12 matières modifiables (prix, densité, facteur énergie).
- **Devis et facture A4** imprimables : mentions de micro-entreprise (art. 293 B puis L. 233-1 du CIBS à partir de 2027), pénalités, indemnité de 40 €,
  SIREN client, nature de l'opération, numérotation séquentielle, logo, mode « tout compris » ou CAO / préparation en lignes séparées.
- Sauvegarde automatique dans le navigateur, export / import JSON, tarif d'électricité par défaut à 0,2516 €/kWh (tarif bleu Base, janvier 2026).
- Tests automatisés du moteur (`npm test`).

## 1.0 (juillet 2025)

- Première version : une pièce, filament, électricité, usure horaire fixe, modélisation, post-traitement, séchoir Sunlu, marge.
