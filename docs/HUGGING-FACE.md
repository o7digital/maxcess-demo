# Rapports Hugging Face

L'application conserve les tableaux, graphiques et exports PostgreSQL. Le bouton de synthèse ajoute un rapport rédigé à partir des indicateurs autorisés pour le rôle connecté. La langue suit le choix espagnol/anglais/français de l'utilisateur, puis la langue de son organisation. Les noms des clients sont remplacés par des références anonymes avant envoi ; aucun texte de ticket, mot de passe ni secret n'est envoyé. La génération consomme le quota IA de l'abonné et est limitée à 800 tokens de sortie.

## Éléments nécessaires sur Railway, service `service-hub`, environnement `dev`

1. `HF_TOKEN` : token Hugging Face à droits fins, avec **Make calls to Inference Providers**. Le créer depuis https://huggingface.co/settings/tokens et l'enregistrer directement dans les variables Railway. Ne pas le mettre dans Git, Vercel, le frontend ou une capture publique.
2. `HF_REPORT_MODEL` : identifiant exact d'un modèle de chat disponible auprès d'Inference Providers (avec le suffixe fournisseur si nécessaire). Vérifier sa disponibilité et les éventuelles conditions d'accès dans le Playground du compte.
3. Crédit/facturation Hugging Face disponible et budget d'utilisation convenu. Le quota de requêtes de Service Hub limite l'usage par abonné ; ce quota n’est pas un plafond monétaire. Suivre les dépenses dans le compte Hugging Face et choisir le modèle en fonction du budget.

L'intégration utilise `https://router.huggingface.co/v1/chat/completions`. Après configuration : redéployer Railway, vérifier l'état de l'intégration, puis générer une synthèse depuis Informes avec des données QA. Sans token et modèle configurés, le bouton reste désactivé et les rapports de données fonctionnent.

Sources : [jetons et accès Inference Providers](https://huggingface.co/docs/inference-providers/index), [facturation](https://huggingface.co/docs/inference-providers/pricing), [chat completions](https://huggingface.co/docs/inference-providers/tasks/chat-completion).
