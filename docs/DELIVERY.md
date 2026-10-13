# Livraison — 12 octobre 2026

- Démo : https://service-hub-production-3168.up.railway.app
- Projet Railway dédié : `maxcess-service-hub-demo` (`181c19c8-d9f1-4337-b827-3713d2df89f6`). Services : `service-hub` et `Postgres`, avec volume PostgreSQL persistant.
- Dépôt : https://github.com/o7digital/maxcess-demo/tree/demo/service-hub
- Accès : document privé local `.local/ACCES-DEMO.md`, exclu de Git. Quatre accès fournis : responsable, agent, client Aurora Salud et client d’une deuxième entreprise pour vérifier l’isolation.
- Scénario de cinq minutes en espagnol : [DEMO-ES.md](DEMO-ES.md).
- Intégrations réelles, adaptées et simulées : [REUSE.md](REUSE.md). Olivia reste explicitement simulée ; aucune intégration IA réelle ou Freshdesk n’est annoncée.

## Vérifications

Build JavaScript et fichiers statiques validé. Tests API sur PostgreSQL dédié : connexion des profils, CSRF, validation des champs, création, isolation des entreprises, restrictions agent, affectation, notes internes protégées, Olivia sans mutation, réponse validée visible au client, classification, résolution, fermeture, réouverture, migrations et seed sans duplication, données conservées avec une nouvelle instance applicative.

Parcours navigateur vérifié localement et sur l’URL Railway : trois profils, création, affectation, note interne, brouillon Olivia, publication validée, réponse du client, résolution, fermeture, réouverture et rechargement. Contrôle à 1440 px et 390 px, sans erreur JavaScript ni débordement horizontal de page. Captures de contrôle locales privées dans `.local/screenshots/`.

Page d’accueil et `/health` vérifiés sur Railway. Un ticket et une session sont vérifiés avant/après un redéploiement réel ; les tickets temporaires de contrôle sont ensuite retirés sans réinitialiser le seed.

## Périmètre

20 entreprises, 20 contacts, 60 tickets initiaux, 25 comptes internes illustratifs et 4 comptes clients. Le nombre de tickets évolue avec les demandes créées. La répartition commerciale et les licences restent à confirmer. Pas de pièces jointes ni de messages externes. Marque configurable via `BRAND_NAME` et `BRAND_SUBTITLE`.
