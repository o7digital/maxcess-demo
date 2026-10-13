# Service Hub — démo SAV

Application dédiée pour la présentation à Omar : design premium du ZIP, interface espagnole, trois rôles authentifiés et PostgreSQL. Sources : branche `demo/service-hub` du dépôt `o7digital/maxcess-demo`.

## Lancer localement

Node.js 22+ et une base PostgreSQL **dédiée à cette démo** sont requis.

```sh
npm ci
cp .env.example .env
# Renseigner DATABASE_URL et SESSION_SECRET (32 caractères aléatoires minimum).
npm run migrate
npm run seed
npm start
```

Le seed ajoute 20 entreprises, 20 contacts, 60 tickets, 25 comptes internes illustratifs par défaut et 4 comptes clients. `DEMO_INTERNAL_USERS` configure l’effectif interne initial (2–100). Le seed ne réinitialise ni les mots de passe ni les tickets existants. Il n’est pas exécuté au démarrage. Les accès de test générés sont écrits dans `.local/demo-access.json`, ignoré par Git, et doivent être transmis séparément. Les autres comptes illustratifs ont un mot de passe aléatoire non divulgué.

Le client voit les tickets de son entreprise. L’agent voit ses tickets affectés et les contacts correspondants. Le responsable gère la file globale, les entreprises, les comptes et l’affectation. Notes internes masquées par le serveur. Réponse et classification soumises à validation humaine. Olivia est simulée et n’envoie aucun message externe.

## Vérification

```sh
npm run build
npm test
# Le serveur doit être démarré pour le contrôle navigateur.
npm run test:browser
```

Les tests utilisent la base de démo configurée et suppriment leurs tickets temporaires. Ne pas les exécuter sur une base de production. Le test navigateur utilise Google Chrome sur macOS ; `CHROME_PATH` permet un autre chemin Chromium et `QA_BASE_URL` un serveur distant. Captures privées dans `.local/screenshots/`.

## Railway

Projet dédié, un service `service-hub` et un PostgreSQL avec volume. Voir `railway.json` : Docker, migration avant déploiement, `/health` et écoute sur `PORT`. Variables serveur : `DATABASE_URL=${{Postgres.DATABASE_URL}}`, `SESSION_SECRET` aléatoire, `NODE_ENV=production`, `DEMO_MODE=true`, `PORT=3000`. `BRAND_NAME` et `BRAND_SUBTITLE` personnalisent la marque.

Déployer avec `railway up --service service-hub --detach`. Exécuter le seed une seule fois depuis un environnement privé connecté à cette base, puis conserver les identifiants hors du dépôt. La base est persistante ; les redéploiements ne font que les migrations manquantes. Les données et sessions survivent au remplacement du conteneur.

[Scénario en espagnol](docs/DEMO-ES.md) · [réutilisation et intégrations](docs/REUSE.md) · [brief fourni](docs/BRIEF.md).
