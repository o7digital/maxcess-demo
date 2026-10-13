# Version de test premium — branche dev

La version initialement déployée est la base commune des branches `main` et `dev` (commit `ae31ee7`). `main` n’existait pas auparavant : elle a été créée depuis cette version, puis `dev` a été créée et synchronisée avec `main`. La branche historique `demo/service-hub` et la démo production restent disponibles.

## Environnement de test

URL : https://service-hub-dev-3fbf.up.railway.app

Railway : projet `maxcess-service-hub-demo`, environnement `dev`. Base PostgreSQL indépendante de l’environnement `production`, sans copie des données de production. La base de test a été vérifiée vide avant migration et seed. Secrets de session distincts. Les déploiements se font avec `railway up --service service-hub --environment dev --detach` depuis la branche `dev`.

Les accès sont dans `.local/ACCES-DEV.md`, hors de Git. L’adresse du superadministrateur est `olivier.steineur@o7digitalgroup.com` et son mot de passe de démonstration a été conservé. Les autres profils disposent d’accès distincts pour cet environnement.

## Rôles

| Rôle | Accès aux données | Gestion des comptes |
| --- | --- | --- |
| Superadministrateur | Toutes les entreprises et tous les tickets | Création de tous les profils ; activation et désactivation des comptes ordinaires |
| Admin | Toutes les entreprises et tous les tickets | Création de gérants, techniciens et clients |
| Gérant | Toutes les entreprises et tous les tickets | Création de techniciens et clients |
| Technicien support | Tickets affectés et entreprises concernées | Aucun droit administratif |
| Client | Tickets, dashboard et rapports de sa propre entreprise | Aucun droit sur les comptes internes |

Les admins et gérants voient toutes les entreprises conformément à la précision explicite du propriétaire. Ils affectent les tickets et accèdent aux notes internes. Le client ne reçoit pas les notes internes. Désactiver un compte bloque immédiatement ses sessions existantes. Les droits sont vérifiés par le serveur ; les comptes ne peuvent pas modifier leur propre accès ni créer un rôle plus élevé que leurs permissions.

## Dashboard et reporting

Graphiques de volumes créés/atendus, statuts, catégories et entreprises. Période et filtre d’entreprise côté serveur. Indicateurs : volume, cas actifs, urgences, SLA dépassés, respect des SLA et temps moyen de résolution. Les courbes suivent la cohorte de tickets créés sur la période ; la série des résolutions utilise la date de résolution de ces tickets. Les chiffres sont issus de PostgreSQL, sans tendances inventées.

Les rapports sauvegardent une photographie des indicateurs et des filtres. Un rapport ne change pas quand les tickets évoluent. Historique privé par utilisateur, export CSV et impression/PDF via le navigateur. Si l’accès d’un compte est réduit, ses anciennes photographies globales ne sont plus servies au profil client.

### Hugging Face

Le bouton de synthèse IA est prêt et désactivé tant que `HF_TOKEN` (ou `HUGGING_FACE_TOKEN`) et `HF_REPORT_MODEL` ne sont pas configurés côté serveur sur Railway **dev**. Le propriétaire fournira l’API. Aucun token n’est demandé dans l’interface ni inclus dans Git. L’endpoint utilise le contrat officiel [Chat Completion de Hugging Face](https://huggingface.co/docs/inference-providers/tasks/chat-completion), avec `https://router.huggingface.co/v1/chat/completions`.

Seuls les indicateurs agrégés autorisés sont envoyés pour produire la synthèse ; pas de mots de passe, de notes internes ni de conversations. Un échec du fournisseur est explicite et ne produit pas de faux rapport IA. Les rapports sans IA restent fonctionnels.

## Olivia V3.5 sur VPS2

Le contrat réel a été vérifié via `/openapi.json` et `/health` sur le VPS2 : version `3.5.0`, chat réel, authentification JWT, header tenant. Le serveur principal reste privé. Une passerelle dédiée `maxcess-olivia-dev` relie Service Hub à `/v1/chat` via une route serveur authentifiée `https://olivia.o7digitalgroup.com/maxcess-dev/chat`.

Code de cette passerelle : `infra/olivia-bridge/`. Installation VPS2 : `/opt/o7/apps/maxcess-olivia-dev`. Secrets uniquement dans le fichier privé du serveur et les variables Railway dev. La route a été ajoutée et validée dans le proxy existant sans remplacement des autres routes. Le moteur V3.5 et les services existants n’ont pas été redéployés.

Scopes dédiés `service-hub-dev-global`, `service-hub-dev-client-<entreprise>` et `service-hub-dev-support-<utilisateur>`. Le serveur Service Hub calcule le scope depuis le compte authentifié. Le navigateur ne peut pas choisir un tenant. Les scopes initiaux client 1–20 et support 2–32 sont préparés ; un technicien nouvellement créé avec un identifiant supérieur nécessite la préparation d’un scope V3.5 dédié avant d’utiliser le chat réel. Le service n’a aucune clé de bootstrap dans son environnement d’exécution.

Les conversations et messages sont sauvegardés dans PostgreSQL, privés par utilisateur. Le contexte inclut uniquement les métriques et le ticket explicitement autorisés. Le chat ne modifie pas les tickets et ne publie aucune réponse. Les fonctions de brouillon de ticket déjà présentes restent des suggestions de démonstration clairement identifiées ; elles sont distinctes du chat V3.5 réel.

Le widget reprend la direction du [composant O7Widget de suitesmine-bot](https://github.com/o7digital/suitesmine-bot) : coins arrondis, statut de présence, panneau flottant, ombre légère et survol du bouton. Le logo typographique O7 reprend le composant de navigation de la [holding](https://www.o7digitalgroup.com/), avec lien direct vers celle-ci.

## Vérification

`npm run build`, `npm test`, `npm run test:browser`, `npm run test:dashboard`. Tests de droits, suspension de session, isolation, reporting, disponibilité Hugging Face et contrat du chat, puis parcours navigateur des cinq profils et contrôles ordinateur/mobile. Captures privées dans `.local/screenshots/`.

Les contrôles navigateur ont également passé sur l’URL Railway dev pour les cinq profils : parcours de tickets, création/suspension de compte, sauvegarde de rapport, export et réponse réelle du chat. Le endpoint privé Olivia refuse les appels sans sa clé (HTTP 401).

## Démo utilisateur responsive

- Présentation des trois formats : https://service-hub-dev-3fbf.up.railway.app/demo
- Portail client plein écran : https://service-hub-dev-3fbf.up.railway.app/cliente

Un seul portail, adapté aux écrans mobiles, tablettes/iPad et desktop. Pas d’application native ni de PWA dans cette livraison, conformément au choix du propriétaire. Le portail propose un accueil client dédié, des cartes de demandes, le dashboard, les rapports et Olivia. La navigation devient une barre tactile inférieure sur mobile et un menu latéral sur tablette/desktop.

La page `/demo` permet de changer entre 390 × 844, 820 × 1180 et 1280 × 800, de tourner mobile/tablette et d’ouvrir le portail plein écran. Les aperçus utilisent la véritable application dans une iframe de même origine ; ils simulent les dimensions de viewport, pas un système iOS ou Android. Le changement de format redimensionne la même vue et conserve sa session et son état.

Profil fictif dédié : **Camila Vega — Aurora Salud**, avec un compte de rôle client. L’entrée rapide sans mot de passe est disponible exclusivement lorsque `DEMO_MODE=true` et `APP_ENV=dev`. Le serveur choisit cette identité fixe et refuse les paramètres de rôle, d’utilisateur ou d’entreprise fournis par le navigateur. Désactiver le compte bloque également la démo. Les accès ordinaires avec compte client restent possibles.

La session du portail utilise un cookie HttpOnly distinct de celui du cockpit, enregistré dans la même base persistante. La démo n’efface donc pas la session administrateur. Les droits client sont imposés côté serveur, y compris si un cookie d’un autre rôle est présenté au portail. Les notes internes et les autres entreprises restent protégées.

Le seed ajoute ce profil de démonstration aux quatre comptes clients existants, sans modifier leurs mots de passe ni réinitialiser les tickets. Pour une base déjà déployée, provisionner uniquement ce compte fictif avant de publier la fonctionnalité.

Tests : `npm run test:devices` valide les trois viewports, la rotation, une création réelle de ticket, la persistance après changement de format/rechargement et les sessions admin/client indépendantes dans le même navigateur. Les tests API couvrent également l’interdiction hors dev et les refus de privilèges. Le contrôle visuel est effectué dans Chromium, pas sur un iPad physique.
