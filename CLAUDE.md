# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Stack & Setup

- **Framework** : React 19 + Vite (JSX, pas de TypeScript)
- **Database/Auth** : Supabase (auth + PostgreSQL + RLS)
- **CSS** : Tailwind CSS 3 avec thème custom (`kano-blue`, `kano-gold`, `kano-ink`)
- **Langue UI** : Français avec accents corrects partout (é, è, ê, à, etc.)
- **Dev** : `npm run dev` (Vite dev server)
- **Build** : `npm run build`

## Architecture

```
src/
  contexts/       # React Context (AuthContext, ClientModalContext)
  components/     # Composants réutilisables (ModaleClient, ModaleProjet, Layout, etc.)
  pages/          # Pages principales (Dashboard, Clients, Pipeline, Taches, Financier)
  lib/            # Utilitaires (supabase.js, constants.js)
```

### Contextes globaux
- **AuthContext** : gère auth Supabase, expose `userName`, `user`, `signOut`
- **ClientModalContext** : permet d'ouvrir la fiche client depuis n'importe quelle page via `openClientModal(entrepriseOrId)`. Fetch complet : `entreprises(*, contacts(*), abonnements(*), projets(*, taches(*)), taches(*))`

### Pages
- **Dashboard** : split layout — gauche (bonjour + tâches urgentes), droite (MRR collapsible + activité récente avec modal "Voir tout")
- **Clients** : liste des entreprises avec recherche/filtres, ouvre ModaleClient
- **Pipeline** : Kanban drag & drop avec colonnes `v0 → rdv → devis_envoyé → négociation → signé → en_ligne → refus`. Le changement de phase met à jour auto le `statut_commercial` (suspect/prospect/client/dead)
- **Tâches** : vue globale de toutes les tâches avec filtres (statut, assigné, priorité, tri)
- **Financier** : projets financiers, échéances, CA par mois. Icône Euro (pas Dollar)

### ModaleClient (fiche client complète)
Onglets : Projets | Tâches | Finances | Journal | Historique

- **Tâches** : création inline (bordure bleue = nouveau, gold = édition), checkbox pour compléter, affichage date création + date limite + "Terminée le X à Xh par Y"
- **Journal** : notes d'interactions (appel, email, rdv, message, autre) avec liaison optionnelle à un projet. Après création d'une note, proposition de créer une tâche en conséquence (priorité, assigné, date, projet)
- **Finances** : abonnements, paiements, résumé financier

## Base de données (Supabase)

### Tables principales
- `entreprises` : id (uuid), nom_entreprise, statut_commercial (suspect/prospect/client/dead), phase_vie (v0/rdv/devis_envoye/negociation/signe/prod/refus), secteur_activite, siret, adresse
- `contacts` : id, entreprise_id (FK), nom, prenom, email, telephone
- `projets` : id, entreprise_id (FK), nom_projet, type_projet, statut, montant_devis, montant_facture, montant_paye, modalite_paiement, date_signature, etc.
- `taches` : id, entreprise_id (FK), projet_id (FK nullable), titre, description, priorite (urgente/haute/moyenne/basse), statut (a_faire/termine), assigne_a (text, pas UUID), date_limite, date_completion (timestamptz), termine_par (text)
- `abonnements` : id, entreprise_id, projet_id, formule, tarif_mensuel, statut
- `notes` : id, entreprise_id, contact_id, projet_id (FK nullable), categorie, contenu, commentaire_perso, type_interaction, date_interaction, date_rappel, utilisateur, created_by (uuid), updated_by (uuid)
- `historique` : id, entreprise_id, projet_id, tache_id, abonnement_id, type_action, entite, description, utilisateur

### Colonnes ajoutées manuellement (migrations SQL)
- `taches.assigne_a` : changé de UUID à TEXT (drop view + drop FK + alter type + recreate view)
- `taches.date_completion` : timestamptz
- `taches.termine_par` : text
- `notes.projet_id` : uuid FK vers projets
- `notes.date_interaction` : date

## Conventions de code

- Pas de console.log en prod — toujours nettoyer
- Texte affiché toujours en français avec accents corrects
- Les noms de variables/colonnes DB restent en snake_case sans accents (ex: `priorite`, `assigne_a`)
- Historique : toujours logger les actions (création, modification, suppression, completion) dans la table `historique`
- Pour les inserts de tâches, utiliser des champs explicites (pas de spread `...formData`) avec `|| null` pour les champs optionnels UUID/date pour éviter les erreurs de type
- Notifications via le composant `Notification` (type: 'success'|'error', message)
- Modales de confirmation via `ModaleConfirm`

## Constantes (src/lib/constants.js)

- `PHASE_LABELS` : labels des phases pipeline (prod = "En ligne")
- `PHASE_COLORS` / `PHASE_COLORS_HEADER` : couleurs Tailwind par phase
- `FORMULE_LABELS` / `FORMULE_COLORS` : labels/couleurs des formules d'abonnement
- `PRIORITE_LABELS` / `PRIORITE_COLORS` : labels/couleurs des priorités de tâches

## Points d'attention

- `openClientModal` accepte un objet entreprise OU un ID (uuid string) — le contexte fetch les données complètes dans les deux cas
- Le Pipeline utilise le drag & drop HTML5 natif (pas de librairie)
- Les scrollbars sont stylisées via la classe `.scrollbar-thin` (définie dans index.css)
- Les tâches peuvent être liées à un projet OU directement au client (projet_id nullable)
- Les notes aussi peuvent être liées à un projet OU au client (projet_id nullable)
- La devise est l'Euro (icône `Euro` de lucide-react, pas `DollarSign`)

## Historique des sessions

### Session 1 (mars 2026)
- Pipeline Kanban : drag & drop fonctionnel, changement auto du statut commercial selon la phase
- ClientModalContext : ouverture de la fiche client depuis n'importe quelle page (Dashboard, Pipeline, Tâches, Financier)
- Pipeline UX : scrollbar horizontale toujours visible, scrollbar verticale dans les colonnes, cards simplifiées (nom + statut), "Refus" en dernière colonne, "En prod" renommé "En ligne"
- Dashboard redesign : split layout, tâches urgentes interactives (checkbox), MRR collapsible, activité récente (3 items + modal), phrases humaines, Euro
- Onglet Tâches dans ModaleClient : création sans projet, édition inline, dates de création/limite visibles, info de complétion
- Migration DB : assigne_a UUID→text, ajout date_completion et termine_par
- Correction accents français sur toute l'app (ModaleClient, Taches, Pipeline, Dashboard, Financier)
- Journal : refonte du flow — notes liées optionnellement à un projet, proposition de créer une tâche après publication d'une note (avec priorité, assigné, date, projet)
- Ajout colonne notes.projet_id et notes.date_interaction
