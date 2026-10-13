# Réutilisation et intégrations

Inspection en lecture seule des dépôts o7digital le 12 octobre 2026. Aucun service ni aucune base de production n’a été modifié.

- `crm-suites-o7`, branche `main`, commit distant `7ca81e7633ba58cde931b839083dcb391fb74b9f` : NestJS, Prisma, PostgreSQL. Son AuthService et sa gestion de clients ont été examinés. `server/identity.js` adapte la méthode bcrypt (10 tours), la connexion par email insensible à la casse et la projection explicite des données utilisateur. Les relations utilisateurs/entreprises/contacts et les filtres d’appartenance du Client/ClientCollaborator ont été repris dans un schéma SQL dédié. Il s’agit d’une adaptation de ces éléments, pas d’un import du CRM entier : sa facturation, ses subscriptions et son accès support ne conviennent pas à cette démo SAV.
- `crm.artimex.o7digitalgroup.com` : inspection du manifeste ; application Next.js de démonstration. Aucun module de ce dépôt n’a été copié.
- `olivia-v3` : inspection du README distant et de la documentation v3.6 disponible dans le checkout local `olivia-v3-build`. Le contrat repose sur JWT, tenant et paramètres serveur ; aucun accès SAV de démonstration n’est configuré. L’intégration CRM repérée est une intégration d’opportunités ou de reporting, pas un raccordement SAV prêt à l’emploi.
- `reference/premium.html` : référence visuelle originale du ZIP. Les styles graphite/ivoire/citron, la grille, les panneaux et l’orbe Olivia ont été réutilisés dans `public/style.css`. Ce fichier de référence est un document historique ; ses noms commerciaux ne désignent pas les clients de la nouvelle application et il n’est pas servi par le serveur.

## Réel

Authentification bcrypt ; sessions PostgreSQL ; CSRF ; permissions serveur ; entreprises et contacts ; tickets, affectation, priorité, conversation, notes internes, résolution, fermeture, réouverture ; historique et indicateurs calculés ; export CSV ; PostgreSQL dédié ; migrations versionnées ; seed idempotent ; déploiement Railway.

## Simulé ou absent

Olivia est une génération déterministe, adaptée au ticket, clairement marquée « MODO DEMO ». Elle ne contacte ni Olivia réel ni un modèle IA externe. Résumé, priorité/catégorie, brouillon, prochaine action et synthèse n’appliquent aucune mutation. Classification et réponse exigent une confirmation humaine. La résolution reste une documentation humaine.

Pas d’intégration Freshdesk, messagerie externe, téléphone, WhatsApp, facturation ou pièces jointes. Aucun secret fourni au navigateur. Aucun sélecteur de rôle : chaque changement de profil nécessite une connexion avec le compte correspondant.
