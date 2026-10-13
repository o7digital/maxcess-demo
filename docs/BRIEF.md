# Instructions Codex — Démo SAV premium sur Railway

Construis et déploie une démo fonctionnelle pour la réunion d'Olivier avec Omar. Pars du fichier index.html inclus : conserve sa direction visuelle premium graphite / ivoire / citron vert, ses proportions et son espace Olivia. Améliore la lisibilité et le comportement mobile si nécessaire.

## Contexte

Omar gère environ 20 entreprises clientes et prévoit 20 à 25 utilisateurs. La répartition agents / clients reste à confirmer. Prévoir des rôles séparés. Toute l'interface est en espagnol professionnel.

Le lien exact entre Maxcess International et le Contact Center n'est pas confirmé : rendre le branding configurable et utiliser par défaut « Service Hub — powered by O7 Digital ». Ne pas affirmer que Benavides et Martí sont des clients de Maxcess.

## Réutilisation

Inspecter les dépôts CRM du compte o7digital, dont crm-suites-o7. Identifier et réutiliser les modules adaptés : authentification, utilisateurs, entreprises, contacts. Ne pas remplacer les applications en production. Travailler dans un projet ou une branche dédiée et utiliser exclusivement des données fictives.

## Parcours principal

À l'entrée, proposer « Recorrido guiado » et « Probar la plataforma ». Préparer trois profils authentifiés : responsable, agent et client.

1. Le client découvre le parcours, puis crée un ticket avec sujet, entreprise/site, catégorie, description et priorité souhaitée.
2. Le responsable retrouve le ticket dans la file globale et l'affecte à un agent.
3. L'agent consulte l'historique et prépare une réponse avec Olivia.
4. Après validation, la réponse apparaît dans le portail client.
5. L'agent documente la résolution, puis clôture ou rouvre le ticket.
6. Les indicateurs et l'historique reflètent les données sauvegardées.

## Espaces

- Responsable : vue des entreprises, utilisateurs, tickets, urgences et SLA ; filtres ; affectation ; liste et Kanban ; indicateurs calculés depuis la base.
- Agent : file personnelle, fiche complète, conversation, notes internes séparées, priorités, résolution et réouverture.
- Client : créer une demande, consulter ses tickets autorisés et répondre. Aucun accès aux notes internes ou aux autres entreprises.

Contrôler les droits côté serveur. Un éventuel sélecteur de profil est strictement réservé à l'environnement de démonstration et ne doit pas permettre de contourner les autorisations.

## Olivia IA v3.6

Inspecter l'intégration existante si accessible. Réutiliser uniquement des paramètres et endpoints documentés, côté serveur. Fonctions : résumé, priorité/catégorie suggérée, brouillon de réponse, prochaine action et synthèse de résolution.

Si le service manque, conserver un mode démo explicitement identifié avec des réponses adaptées au ticket. Ne pas inventer de connexion réelle. Validation humaine avant toute réponse ou modification. Aucun envoi de message externe pendant la démo.

## Données et base

Créer 20 entreprises fictives, environ 60 tickets réalistes, quelques comptes clients et un effectif interne illustratif configurable de 25 comptes. Ne pas considérer cette répartition comme un accord sur les licences.

Les statuts, échéances, agents et historiques doivent être cohérents. Les nouveaux tickets doivent survivre au rechargement et au redéploiement. Ne pas réinitialiser la base au démarrage.

## Railway

Choisir la stack existante si elle convient ; architecture simple application/API + PostgreSQL dédié à la démo. Configurer DATABASE_URL, secrets côté serveur, écoute sur PORT, /health, migrations reproductibles et seed sans duplication.

Ajouter sessions et mots de passe hachés. Aucun secret dans Git. Aucune connexion aux bases de production. Pour les éventuelles pièces jointes : stockage persistant et limites de taille/type, jamais le disque temporaire du conteneur.

Déployer via les accès Railway disponibles dans un projet dédié. S'ils manquent, terminer les travaux indépendants et préciser le blocage exact.

## Qualité et livraison

Vérifier connexion des trois profils, création, affectation, réponse, résolution, réouverture, persistance, isolation entre entreprises, protection des notes internes et fonctionnement du mode Olivia démo.

Contrôler visuellement ordinateur et mobile ; corriger les débordements, les champs illisibles et les erreurs console. Toutes les actions principales visibles doivent fonctionner.

Livrer URL Railway, accès de test transmis séparément des sources publiques, dépôt/branche, scénario de présentation de cinq minutes en espagnol et liste précise des intégrations réelles ou simulées.

Priorité : parcours complet, stable, esthétique et utilisable. Ne pas s'arrêter à un plan ou à la maquette statique fournie.
