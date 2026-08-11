/**
 * French dictionary.
 *
 * Typed against `Dict` (inferred from the English file), so a missing or renamed key is a
 * compile error rather than a silent fallback.
 *
 * Several entries are functions rather than templates because French needs decisions
 * English does not: agreement in number, elision, and the singular forms that "Aucun X
 * n'est un Y" requires where English says "No Xs are Ys".
 */
import type { Dict } from './index';

/** Strips the plural marker from an invented category name: "Blicks" -> "Blick". */
function sing(term: string): string {
  return term.endsWith('s') ? term.slice(0, -1) : term;
}

/** French shape names are all regular except "croix", which is invariable. */
function plural(word: string, count: number): string {
  if (count === 1) return word;
  return word.endsWith('x') || word.endsWith('s') ? word : `${word}s`;
}

const fr: Dict = {
  locale: {
    htmlLang: 'fr',
    nativeName: 'Français',
    intl: 'fr-FR',
  },

  nav: {
    brand: 'Muscle Tes Neurones',
    home: 'Accueil',
    practice: 'Entraînement',
    sprint: 'Contre-la-montre',
    test: 'Test complet',
    progress: 'Progression',
    about: 'À propos',
    mainNav: 'Principale',
    skipToContent: 'Aller au contenu',
    languageLabel: 'Langue',
    switchTo: (name: string) => `Passer en ${name}`,
  },

  footer: {
    generated:
      'Chaque item est produit par un algorithme et vérifié pour n’admettre qu’une seule réponse défendable. Aucun item d’un test publié n’est reproduit ici.',
    noScore:
      'Ceci est un entraînement, pas une évaluation. Aucun score de QI n’est affiché, faute d’étalonnage auquel le comparer.',
    whyItMatters: 'Pourquoi cela compte',
    terms: 'Conditions d’utilisation',
  },

  domains: {
    Gf: 'Raisonnement fluide',
    Gc: 'Connaissances acquises',
    Gv: 'Traitement visuel',
    Gwm: 'Mémoire de travail',
    Gs: 'Vitesse de traitement',
    Gq: 'Raisonnement quantitatif',
  },

  quiz: {
    preparing: 'Préparation des items…',
    level: (n: number) => `Niveau ${n}`,
    progress: (current: number, total: number) => `${current} sur ${total}`,
    answerOptions: 'Réponses proposées',
    optionLabel: (n: number, description: string) => `Réponse ${n} : ${description}`,
    tip: (max: number) => ({
      before: 'Astuce : appuyez sur ',
      after: ' pour répondre.',
      first: '1',
      last: String(max),
    }),
    correct: 'Correct',
    notQuite: 'Pas tout à fait',
    next: 'Suivant',
    seeResults: 'Voir les résultats',
    youTyped: (value: string) => `Vous avez saisi ${value}.`,
    nothing: '(rien)',
    yourAnswer: 'Votre réponse',
    typeSequence: 'Saisissez la séquence',
    watching: 'Observez…',
    submit: 'Valider',
    nowTypeItBack: 'À vous de la saisir.',
    spanReady: (length: number) =>
      `${length} caractères, un à la fois. Chacun disparaît au passage — puis vous les saisissez.`,
    spanStart: 'Lancer la séquence',
    nBackReady: (length: number, n: number) =>
      `${length} lettres, une à la fois. Comptez celles qui reprennent la lettre ${n === 1 ? 'précédente' : `apparue ${n} rangs plus tôt`}.`,
    nBackDone: 'Combien y en avait-il ?',
    headCountReady: (events: number) =>
      `${events} mouvements, un à la fois. Des personnages entrent, d’autres sortent — gardez le compte de ceux qui sont dans la salle.`,
    headCountDone: 'Combien en restait-il ?',
    sprint: {
      ready: (seconds: number) =>
        `${seconds} secondes, autant d’items que possible. Le chronomètre part quand vous partez.`,
      readyNote:
        'Aucune explication avant la fin : répondre enchaîne directement sur l’item suivant. Le niveau reste fixe pour tout le bloc, ce qui rend deux séries comparables.',
      start: 'Lancer le chronomètre',
      done: (n: number) => `${n} traité${n === 1 ? '' : 's'}`,
      nothing: 'Le temps s’est écoulé avant la moindre réponse.',
      again: 'Réessayer',
    },
    headCount: {
      arriving: (n: number) => `${n} qui ${n === 1 ? 'entre' : 'entrent'}`,
      leaving: (n: number) => `${n} qui ${n === 1 ? 'sort' : 'sortent'}`,
      roomLabel: 'La salle',
    },
    weights: {
      premisesLabel: 'Ces balances s’équilibrent',
      targetLabel: 'Équilibrez celle-ci',
      premiseLabel: (n: number) => `Balance équilibrée ${n}`,
    },
    coding: {
      keyLabel: 'Légende',
      probeLabel: 'Cherchez ce chiffre',
      pairLabel: (digit: string, description: string) => `Le ${digit} est associé à ${description}`,
    },
    missingCell: 'case manquante',
    missingFigure: 'figure manquante',
    patternMatrix: 'Matrice de motifs',
    cellLabel: (n: number, description: string) => `Case ${n} : ${description}`,
    figureLabels: {
      first: 'Première figure',
      second: 'Deuxième figure',
      third: 'Troisième figure',
      target: 'Forme cible',
      targets: 'Cibles',
      searchGroup: 'Groupe à examiner',
      sheetBefore: 'La feuille avant pliage',
      sheetFolded: 'La feuille pliée, avec les perforations',
      sheet: 'feuille',
      punched: 'perforée',
      foldStep: (fold: string) => `pli ${fold}`,
      step: (n: number) => `Étape ${n}`,
      layers: (n: number) => `${n} épaisseurs`,
      foldFrameLabel: (n: number, description: string) => `Étape ${n} : ${description}`,
      punchedFrameLabel: (layers: number) =>
        `La feuille pliée, ${layers} épaisseurs, avec les perforations`,
    },
    describeFigure: (count: number, shape: string, size: number, shading: string) =>
      `${count} ${plural(shape, count)}, taille ${size}, ${shading}`,
    describeGrid: (rows: string[], filled: number) =>
      `${filled} cases : ${rows.map((row, i) => `ligne ${i + 1} ${row || 'vide'}`).join(', ')}`,
    gridRowCells: (columns: number[]) => listPhrase(columns.map(String), 'et'),
    listSeparator: ' et ',
    turnedBy: (degrees: number) => `tournée de ${degrees} degrés`,
    atPositions: (positions: number[], total: number) =>
      `en position${positions.length === 1 ? '' : 's'} ${listPhrase(positions.map(String), 'et')} sur ${total}`,
    emptyCell: 'une case vide',
    unfilled: 'sans remplissage',
    shadingLevel: (n: number) => `remplissage niveau ${n}`,
    shapeNames: {
      circle: 'cercle',
      square: 'carré',
      triangle: 'triangle',
      diamond: 'losange',
      pentagon: 'pentagone',
      hexagon: 'hexagone',
      star: 'étoile',
      cross: 'croix',
    },
  },

  /** L’aide-mémoire des raccourcis clavier. */
  shortcuts: {
    open: 'Raccourcis clavier',
    hint: 'Appuyez sur ? pour les raccourcis clavier',
    heading: 'Raccourcis clavier',
    lede: 'Une série entière peut se faire sans toucher la souris.',
    close: 'Fermer',
    keys: {
      numbers: 'Choisir une réponse',
      enter: 'Lancer une séquence, ou passer à l’item suivant',
      tab: 'Se déplacer entre les réponses',
      question: 'Afficher ou masquer cette liste',
      escape: 'Fermer cette liste',
    },
    range: (first: string, last: string) => ({ first, last }),
  },

  /** Textes des cartes de partage générées au build. */
  og: {
    disclaimer: 'Entraînement, pas évaluation. Jamais de score de QI.',
  },

  /**
   * La graine, promue du statut de paramètre d’URL à celui d’objet visible et partageable.
   */
  seed: {
    label: 'Graine',
    copy: 'Copier le lien qui rejoue cette série',
    copyShort: 'Copier le lien',
    copied: 'Lien copié',
    copyFailed: 'Copie impossible — sélectionnez la graine et copiez-la à la main.',
    concealed:
      'Masquée pendant la réponse — la graine régénère l’item. Elle revient à la correction.',
    explain:
      'Cette graine de huit caractères contient toute la série. Qui ouvre le lien copié obtient exactement ces items, dans la langue qu’il lit — rien n’est stocké sur un serveur, puisque la graine régénère les items sur sa propre machine.',
  },

  /**
   * La taxonomie des erreurs, en mots. Les libellés courts sont en minuscules : ce sont
   * des étiquettes, pas des phrases.
   */
  diagnosis: {
    heading: 'Où ça a dérapé',
    tags: {
      correct: 'correct',
      'wrong-rule': 'mauvaise règle',
      'wrong-axis': 'mauvais axe',
      'off-by-one': 'un pas de trop',
      copy: 'case recopiée',
      'wrong-attribute': 'mauvais attribut',
      mirror: 'image miroir',
      'wrong-direction': 'sens inversé',
      carry: 'report oublié',
      transposition: 'ordre perdu',
      plausible: 'presque juste',
    },
    bodies: {
      correct: 'Vous avez appliqué toutes les règles qui construisent cet item.',
      'wrong-rule':
        'Le bon attribut, mais la mauvaise règle. Vous avez repéré ce qui change, puis vous lui avez appliqué une autre transformation que celle sur laquelle l’item est bâti.',
      'wrong-axis':
        'La bonne règle, mais dans le mauvais sens : vous avez lu la colonne au lieu de la ligne. Ici les règles courent le long des lignes ; les colonnes ne semblent régulières que par ricochet.',
      'off-by-one':
        'La bonne règle, poussée d’un pas de trop — ou d’un pas de trop peu. Comptez les étapes au lieu d’estimer le point d’arrivée.',
      copy: 'Cette option ne fait que reprendre une figure déjà affichée. Ce qui est déjà visible ne peut pas être la pièce manquante.',
      'wrong-attribute':
        'Le mauvais attribut. Vous avez répondu sur une propriété réelle du stimulus — mais pas celle sur laquelle portait la question, et c’est ce qui rend l’erreur tentante plutôt que distraite. Dans un motif, cela revient à faire varier un attribut que la règle ne gouverne pas ; dans une tâche de comptage, à rapporter ce que disent les chiffres au lieu de leur nombre.',
      mirror:
        'C’est un reflet, pas une rotation. Choisissez un détail asymétrique et suivez-le : tourner conserve sa position relative, retourner l’inverse.',
      carry:
        'Le chiffre des unités est juste, un rang supérieur est faux. C’est la signature d’un report oublié ou compté deux fois — la part du calcul qui relève de la tenue de comptes plutôt que de l’arithmétique. C’est aussi pourquoi l’une des réponses fausses se termine toujours par le même chiffre que la bonne : sans cela, l’item pourrait se résoudre en ne calculant qu’un seul chiffre.',
      'wrong-direction':
        'La bonne quantité, mais dans le sens inverse. Vous teniez la taille du pas, mais vous l’avez appliqué à l’envers : ajouté ce qu’il fallait retrancher, ou l’inverse. Sur un flux qui ne se rejoue pas, un pas inversé coûte deux fois plus qu’un pas manqué.',
      transposition:
        'Tous les éléments, mais dans le désordre. Vous avez retenu ce qu’il y avait à retenir et vous en avez perdu l’agencement : c’est un autre échec que d’oublier un élément, et un échec plus encourageant, car dans une tâche d’empan le plus dur est d’ordinaire de retenir. L’ordre revient souvent avec un rythme délibéré : restituez la séquence à l’allure où elle vous a été donnée, plutôt qu’aussi vite que possible.',
      plausible:
        'Presque juste, sans diagnostic unique : cette option casse le motif de plusieurs façons à la fois, il n’y a donc pas une seule règle à corriger.',
    },
    optionTag: (tag: string) => `faux : ${tag}`,
    optionAria: (tag: string) => `Incorrect — ${tag}.`,
    answerLabel: 'La réponse',
  },

  results: {
    heading: 'Session terminée',
    sprintHeading: 'Terminé',
    sprintCorrectIn: (seconds: number) => `Justes en ${seconds} s`,
    sprintRate: 'Cadence',
    sprintAttempted: 'Sur les items tentés',
    perMinute: (n: number) => `${n}/min`,
    mistakesHeading: 'Comment vous vous êtes trompé',
    mistakesLede:
      'Chaque mauvaise réponse correspond à une lecture erronée précise, et la même revient souvent. C’est la seule chose vraiment utile à retenir d’une session.',
    mistakesNone: 'Rien à décomposer : vous avez tout juste.',
    commonestMistake: (tag: string, n: number, total: number) =>
      `${n} de vos ${total} mauvaise${total === 1 ? '' : 's'} réponse${total === 1 ? '' : 's'} ${n === 1 ? 'relève' : 'relèvent'} de la même erreur : ${tag}.`,
    mistakesSpread:
      'Vos erreurs se répartissent entre plusieurs types différents, sans qu’une habitude se dégage.',
    correct: 'Bonnes réponses',
    accuracy: 'Précision',
    medianTime: 'Temps médian',
    seed: 'Graine',
    byItemType: 'Par type d’item',
    colType: 'Type',
    colCorrect: 'Correctes',
    colAccuracy: 'Précision',
    disclaimerBefore:
      'Il s’agit de votre score sur ces items, pas d’un QI. Aucun étalonnage ne le sous-tend — voir ',
    disclaimerLink: 'ce que ce site mesure et ne mesure pas',
    disclaimerAfter: '.',
    goAgain: 'Recommencer',
    seeProgress: 'Voir la progression',
  },

  dashboard: {
    chanceLevel: (percent: string) => `hasard ${percent}`,
    switchHeading: 'Coût du basculement',
    switchLede:
      'Issu des plateaux à relier : de combien les plateaux mêlant nombres et lettres prennent plus de temps que ceux à nombres seuls. Les deux sortes exigent autant de recherche et de clics, si bien que l’écart mesure le coût de tenir deux suites à la fois et d’alterner entre elles — la part de la tâche qui n’est pas de la simple vitesse.',
    switchGap: 'Coût du basculement',
    switchFormA: (n: number) => `Nombres seuls (${n} plateaux)`,
    switchFormB: (n: number) => `Nombres et lettres (${n} plateaux)`,
    interferenceHeading: 'Interférence',
    interferenceLede:
      'Issu de l’épreuve de comptage : de combien vous ralentissez quand le chiffre contredit leur nombre. C’est le seul chiffre de cette page qui soit un écart et non un total, et l’écart est justement l’essentiel — tout le reste est identique entre les deux types d’essais, si bien qu’il ne subsiste que le coût de retenir la réponse offerte d’emblée par l’œil.',
    interferenceGap: 'Coût du conflit',
    interferenceCongruent: (n: number) => `Quand ils concordent (${n} essais)`,
    interferenceIncongruent: (n: number) => `Quand ils divergent (${n} essais)`,
    milliseconds: (n: number) => `${n > 0 ? '+' : ''}${n} ms`,
    interferenceExpected:
      'Un écart positif est le résultat ordinaire, et un écart important n’est pas un défaut : l’effet est robuste chez presque tout le monde, ce qui explique qu’on l’étudie depuis 1935.',
    interferenceUnexpected:
      'Un écart nul ou négatif signale le plus souvent un nombre d’essais insuffisant plutôt qu’une absence d’interférence. Il devrait redevenir positif à mesure qu’ils s’accumulent.',
    sprintHeading: 'Contre-la-montre',
    sprintLede:
      'Les blocs chronométrés restent à l’écart de tout ce qui précède, car ils mesurent autre chose : le débit dans une fenêtre fixe, à un niveau figé pour tout le bloc. Aucun des chiffres de précision ou de vitesse du reste de cette page ne contient de réponse chronométrée.',
    sprintRuns: (n: number) => `${n} série${n === 1 ? '' : 's'}`,
    sprintBest: 'Meilleure',
    sprintLatest: 'Dernière',
    sprintScore: (correct: number, seconds: number) => `${correct} en ${seconds} s`,
    sprintAccuracy: (percent: string) => `${percent} des items tentés`,
    loading: 'Chargement…',
    overall: 'Vue d’ensemble',
    itemsAnswered: 'Items répondus',
    accuracy: 'Précision',
    medianTime: 'Temps médian',
    sessions: 'Sessions',
    dayStreak: 'Jours d’affilée',
    byDomain: 'Par domaine cognitif',
    domainChartLabel: 'Précision par domaine cognitif',
    domainLede:
      'Votre précision sur les cinq aptitudes larges du modèle Cattell–Horn–Carroll que ces formats sollicitent. Un profil, pas un score : aucun étalonnage ne sous-tend ces barres, elles vous comparent à vous-même et à personne d’autre.',
    provisional: (attempts: number) =>
      `${attempts} item${attempts === 1 ? '' : 's'} — bien trop peu pour en tirer quoi que ce soit`,
    provisionalKey: 'Les barres estompées reposent sur moins de dix items.',

    emptyHeading: 'Rien ici pour l’instant — et c’est normal',
    emptyBody:
      'Cette page est la seule à contenir vos propres données : elle démarre donc vide. Terminez une série et elle se remplira de votre précision, de votre vitesse, des formats qui vous résistent et des erreurs précises que vous répétez.',
    emptyCtaPractice: 'S’entraîner sur un format',
    emptyCtaTest: 'Passer le test complet',
    emptyPrivacy:
      'Tout reste dans ce navigateur. Il n’y a ni compte ni serveur où l’envoyer.',

    speed: {
      heading: 'Précision et vitesse',
      lede: 'Un point par format, placé selon votre précision et le temps que vous y passez. Les formats en haut à gauche sont ceux que vous avez intégrés ; en bas à droite, ceux que vous êtes encore en train de démêler.',
      label: 'Précision en fonction du temps de réponse médian, un point par format d’item',
      axisX: 'Temps médian par bonne réponse',
      axisY: 'Précision',
      point: (name: string, accuracy: string, time: string, attempts: number) =>
        `${name} : ${accuracy} de précision sur ${attempts} item${attempts === 1 ? '' : 's'}, ${time} de médiane`,
      needMore:
        'Répondez à au moins cinq items dans deux formats ou plus et l’arbitrage entre vitesse et précision apparaîtra ici.',
      fastest: 'le plus rapide',
      mostAccurate: 'le plus précis',
    },

    mistakes: {
      heading: 'Les erreurs que vous répétez',
      lede: 'Chaque mauvaise réponse correspond à une lecture erronée précise, nommée au moment où vous l’avez faite. Sur l’ensemble de votre historique, une ou deux dominent en général — et ce sont celles qui comptent, car il s’agit d’habitudes et non de lacunes.',
      label: 'Fréquence de chaque type d’erreur',
      empty:
        'Aucune erreur diagnostiquée pour l’instant. Chaque mauvaise réponse est étiquetée avec la lecture erronée qui la sous-tend, et elles s’accumulent ici.',
      bar: (tag: string, count: number, share: string) =>
        `${tag} : ${count} fois (${share} de vos erreurs diagnostiquées)`,
      colShare: 'Part',
    },

    wall: {
      heading: 'Chaque format, dans le temps',
      lede: 'Une courbe par format, les tentatives les plus anciennes à gauche. De petits graphiques côte à côte plutôt que dix-huit courbes sur un même axe : dix-huit couleurs sur un seul tracé seraient illisibles, et ceux-ci se parcourent du regard, ils ne se lisent pas au chiffre près.',
      never: 'pas encore tenté',
    },
    byItemType: 'Par type d’item',
    colType: 'Type',
    colDomain: 'Domaine',
    colAnswered: 'Répondus',
    colAccuracy: 'Précision',
    colMedianTime: 'Temps médian',
    colBestRun: 'Meilleure série',
    colPeakLevel: 'Niveau max',
    settings: 'Réglages',
    settingFeedback: 'Expliquer chaque réponse au fil de l’eau',
    settingFeedbackHint: 'Désactivez pour une série continue, façon examen.',
    settingAdaptive: 'Adapter la difficulté à mes performances',
    settingAdaptiveHint:
      'Trois bonnes réponses d’affilée font monter d’un niveau ; deux erreurs font redescendre.',
    settingMotion: 'Ralentir la présentation de l’empan',
    settingMotionHint: 'Les éléments de l’empan mnésique restent affichés plus longtemps.',
    settingLength: 'Items par série d’entraînement',
    yourData: 'Vos données',
    storageNote: (sessions: number) =>
      `Tout est stocké dans le localStorage de ce navigateur. Rien n’est envoyé nulle part — il n’y a aucun serveur à qui l’envoyer. ${sessions} session${sessions === 1 ? '' : 's'} enregistrée${sessions === 1 ? '' : 's'}.`,
    exportJson: 'Exporter en JSON',
    importJson: 'Importer un JSON',
    reset: 'Effacer l’historique',
    resetConfirm: 'Oui, tout supprimer',
    resetCancel: 'Annuler',
    historyCleared: 'Historique effacé.',
    charts: {
      heading: 'Progression dans le temps',
      lede: 'Vos chiffres, session après session. Une courbe qui monte signifie que vous progressez sur ces formats — pas que quelque chose de sous-jacent a changé.',
      accuracyTitle: 'Précision par session',
      accuracyLabel: 'Précision par session, la plus ancienne à gauche',
      speedTitle: 'Temps médian par bonne réponse',
      speedLabel: 'Temps de réponse médian par session, le plus ancien à gauche',
      activityTitle: 'Activité',
      activityLabel: 'Items répondus par jour sur les huit dernières semaines',
      rollingAverage: 'Moyenne glissante sur 3 sessions',
      needMore: 'Terminez encore quelques sessions et une tendance apparaîtra ici.',
      noActivity: 'Aucune activité sur les huit dernières semaines.',
      session: (n: number) => `Session ${n}`,
      describeDay: (items: number, correct: number) =>
        `${items} item${items === 1 ? '' : 's'}, ${correct} correct${correct === 1 ? '' : 's'}`,
      today: 'aujourd’hui',
      weeksAgo: (n: number) => `il y a ${n} semaines`,
      colTrend: 'Tendance',
      trendLabel: (type: string) => `Évolution de la précision pour « ${type} »`,
      improvedBy: (points: number) =>
        `Votre précision a gagné ${points} point${points === 1 ? '' : 's'} par rapport à la première moitié de votre historique.`,
      declinedBy: (points: number) =>
        `Votre précision a perdu ${points} point${points === 1 ? '' : 's'} par rapport à la première moitié de votre historique. La difficulté monte à mesure que vous progressez : c’est autant attendu que décourageant.`,
      steady: 'Votre précision reste stable par rapport à la première moitié de votre historique.',
    },
  },

  storeMessages: {
    notJson: 'Ce fichier n’est pas du JSON valide.',
    missingSchema: 'Version de schéma absente — ce fichier ne provient pas de cette application.',
    schemaMismatch: (theirs: number, ours: number) =>
      `Cet export utilise le schéma v${theirs} ; cette version lit le v${ours}.`,
    noSessions: 'Aucune session exploitable dans ce fichier.',
    imported: (n: number) => `${n} session${n === 1 ? '' : 's'} importée${n === 1 ? '' : 's'}.`,
    importedPartial: (added: number, already: number) =>
      `${added} nouvelle${added === 1 ? '' : 's'} session${added === 1 ? '' : 's'} importée${added === 1 ? '' : 's'} ; ${already} étaient déjà présentes.`,
  },

  items: {
    matrix: {
      name: 'Raisonnement matriciel',
      blurb: 'Trouvez la figure qui complète le motif 3×3.',
      description:
        'Une grille 3×3 de figures dont la case en bas à droite manque. Chaque attribut — forme, taille, remplissage, nombre et disposition — suit une règle le long des lignes. Déduisez les règles et choisissez la figure qui les complète. C’est le test non verbal de référence du raisonnement fluide, et le format le plus étroitement associé au facteur g.',
      seenIn: 'Matrices progressives de Raven, Matrices de la WAIS, Cattell CFIT, NNAT',
    },
    'series-number': {
      name: 'Suites numériques',
      blurb: 'Trouvez la règle et prolongez la suite.',
      description:
        'Une suite d’entiers construite sur une règle cachée : un écart constant, un écart croissant, deux suites entrelacées, des blocs répétés, ou un multiplicateur qui change lui-même. La difficulté suit les cinq opérateurs cognitifs ANSIG, qui expliquent à eux seuls environ 77 % de la variance de difficulté dans la littérature sur la génération automatique d’items.',
      seenIn: 'Cattell CFIT, Wonderlic, CogAT quantitatif, la plupart des batteries d’aptitude',
    },
    'series-letter': {
      name: 'Suites de lettres',
      blurb: 'Prolongez le motif à travers l’alphabet.',
      description:
        'Une suite de lettres qui avance dans l’alphabet selon une règle cachée : un pas fixe, deux pas alternés, ou un pas qui grandit. C’est la même tâche de raisonnement inductif que les suites numériques, mais sur un ensemble ordonné familier plutôt que sur du calcul, si bien que l’aisance arithmétique interfère moins avec le raisonnement mesuré.',
      seenIn: 'CogAT, Wonderlic, concours d’entrée et batteries d’aptitude de la fonction publique',
    },
    'odd-one-out': {
      name: 'L’intrus',
      blurb: 'Quatre figures partagent une propriété. Une seule y échappe.',
      description:
        'Toutes les figures sauf une partagent une propriété définitoire — même forme, même remplissage, même taille ou même nombre d’éléments — tout en variant librement par ailleurs. Trouvez celle qui rompt la règle. Chaque item est vérifié pour qu’une seule figure soit défendablement l’intrus, sur une seule dimension.',
      seenIn: 'Classification du Cattell CFIT, Figure Classification du CogAT, NNAT',
    },
    'analogy-figural': {
      name: 'Analogie figurative',
      blurb: 'A est à B ce que C est à… quelle figure ?',
      description:
        'Déterminez comment la première figure a été transformée en la deuxième — changement de taille, de remplissage, d’orientation ou de forme — puis appliquez exactement la même transformation à la troisième. La mise en correspondance analogique est l’une des mesures les plus pures du raisonnement inductif : elle isole le transfert d’une règle plutôt que sa découverte.',
      seenIn: 'Matrices de la WAIS (items analogiques), Figure Analogies du CogAT, Raven',
    },
    syllogism: {
      name: 'Syllogismes',
      blurb: 'Distinguez ce qui suit de ce qui semble suivre.',
      description:
        'Deux prémisses portant sur trois catégories. Choisissez la conclusion nécessairement vraie, ou indiquez qu’aucune ne l’est. Les noms de catégories sont inventés à dessein : avec des catégories réelles, la plausibilité se substitue à la déduction. La validité est ici décidée par vérification exhaustive de tous les modèles : la clé est démontrée, pas supposée.',
      seenIn: 'Épreuves de raisonnement critique du GMAT, du LSAT, de l’UCAT et du Watson–Glaser',
    },
    rotation: {
      name: 'Rotation mentale',
      blurb: 'Repérez la même forme, tournée — et non retournée.',
      description:
        'L’une des réponses est la forme cible ayant subi une rotation ; les autres sont des images miroir ou de quasi-copies. La distinction entre rotation et réflexion est le cœur de la tâche : chaque forme est donc vérifiée comme chirale, car une forme identique à son propre miroir rendrait l’item insoluble.',
      seenIn: 'Test de rotations mentales de Vandenberg & Kuse, Shepard & Metzler (1971), DAT spatial',
    },
    'paper-folding': {
      name: 'Pliage de papier',
      blurb: 'Plier, perforer, déplier — où sont les trous ?',
      description:
        'Une feuille carrée est pliée une ou deux fois, puis perforée à travers toutes les épaisseurs. Déterminez où se trouvent les trous une fois la feuille rouverte. Il s’agit de visualisation spatiale plutôt que de rotation : il faut maintenir une image mentale et la transformer sur plusieurs étapes.',
      seenIn: 'Paper Folding Test de l’ETS (VZ-2), DAT Space Relations, nombreux concours',
    },
    span: {
      name: 'Empan mnésique',
      blurb: 'Retenez une séquence — puis restituez-la.',
      description:
        'Une séquence apparaît élément par élément, puis vous la saisissez. L’empan endroit mesure le simple stockage ; l’empan envers exige de retenir la séquence et de l’inverser en même temps, ce qui en fait une tâche de mémoire de travail et non de simple rétention. Les séquences s’allongent avec la difficulté.',
      seenIn: 'Mémoire des chiffres de la WAIS et de la WISC, Stanford–Binet',
    },
    'symbol-search': {
      name: 'Recherche de symboles',
      blurb: 'L’un des symboles figure-t-il dans le groupe ? Vite.',
      description:
        'Deux symboles cibles, puis un groupe à parcourir. Indiquez si l’un des deux y figure. Chaque item est facile isolément — ce qui est mesuré, c’est la vitesse à laquelle vous en enchaînez beaucoup sans faute. La précision restant proche du plafond, ce type est évalué sur le temps de réponse médian plutôt que sur le pourcentage de réussite.',
      seenIn: 'Symboles de la WAIS et de la WISC, Code de la WAIS (même indice)',
    },
    'figure-weights': {
      name: 'Balances',
      blurb: 'Les balances s’équilibrent. Quel groupe équilibre la dernière ?',
      description:
        'Une série de balances, chacune montrant ce qui équilibre quoi. Ces prémisses donnent à chaque forme un poids relatif aux autres ; il manque un plateau à la dernière balance, et vous choisissez le groupe qui l’équilibre. Les formes étant des valeurs et les balances des équations, il s’agit de raisonnement quantitatif sans aucune notation arithmétique — et le problème est décidable, si bien qu’une seule réponse peut équilibrer. L’erreur la plus fréquente consiste à égaler le nombre d’objets au lieu de leur poids.',
      seenIn: 'Balances de la WAIS-IV et de la WISC-V, Cattell CFIT (Conditions), épreuves de raisonnement quantitatif en général',
    },
    'n-back': {
      name: 'Tâche N-back',
      blurb: 'Comptez les lettres qui se répètent N rangs plus tôt.',
      description:
        'Un flux de lettres défile, une à la fois. Comptez celles qui reprennent la lettre apparue un nombre fixe de rangs plus tôt — un rang d’abord, jusqu’à trois. La mémoire des chiffres demande de retenir une liste immobile ; cette épreuve demande de tenir une fenêtre glissante des derniers éléments et de la réécrire à chaque pas, d’où une mesure de la mise à jour plutôt que du stockage. Le flux a disparu au moment de répondre, et il ne se rejoue pas.',
      seenIn: 'Recherche sur l’entraînement cognitif et la mémoire de travail (Jaeggi et al.), Cogmed, littérature sur le double n-back',
    },
    'trail-making': {
      name: 'Pistes à relier',
      blurb: 'Reliez les cibles dans l’ordre. Contre le chronomètre.',
      description:
        'Des cibles sont dispersées sur le plateau et vous les reliez dans l’ordre, le plus vite possible. La moitié des plateaux ne comportent que des nombres ; les autres alternent nombres et lettres — 1, A, 2, B — ce qui ajoute le travail de tenir deux suites et de passer de l’une à l’autre sans perdre le fil. La forme n’est délibérément pas un niveau de difficulté : les niveaux ne diffèrent que par le nombre de cibles, si bien que les deux formes restent appariées sur la recherche visuelle et la motricité, et que l’écart entre vos temps mesure le basculement seul. Évalué sur le temps de parcours ; cliquer une mauvaise cible pénalise la série sans l’interrompre.',
      seenIn: 'Trail Making Test A et B (Army Individual Test Battery, 1944), batterie de Halstead–Reitan, trail making de Delis–Kaplan',
    },
    'block-span': {
      name: 'Empan spatial',
      blurb: 'Regardez les blocs s’allumer. Retapez-les dans l’ordre.',
      description:
        'Neuf blocs occupent la même disposition éparpillée à chaque item. Certains s’allument l’un après l’autre, et vous les retouchez dans l’ordre où ils se sont allumés. C’est l’empan de chiffres avec des lieux à la place des chiffres — la même exigence de retenir une liste et de la restituer, faite de positions que l’on ne peut pas se répéter à voix basse, ce qui explique que les deux se dissocient et que les deux figurent ici. Le plateau ne bouge jamais d’un item à l’autre, délibérément : une nouvelle disposition à chaque fois vous obligerait à chercher les blocs avant de pouvoir en retenir l’ordre, et cette recherche se mêlerait à l’empan. Les niveaux ne diffèrent que par la longueur de la séquence — ni la vitesse des flashs, ni le nombre de blocs, et jamais un essai à rebours, car restituer une séquence à l’envers est une tâche plus difficile et non une tâche plus longue.',
      seenIn: 'Tâche des blocs de Corsi (Corsi, 1972), Empan spatial des échelles de Wechsler (WMS), littérature sur le calepin visuospatial',
    },
    interference: {
      name: 'Comptez, ne lisez pas',
      blurb: 'Combien de chiffres ? Et non lequel.',
      description:
        'Plusieurs exemplaires d’un même chiffre s’affichent : annoncez combien il y en a, et non ce qu’ils disent. Devant trois 4, « 4 » est la réponse que l’œil propose et 3 celle qu’on vous demande — et c’est le coût de retenir la première qui est mesuré ici. C’est une tâche de Stroop portant sur des chiffres plutôt que sur des couleurs : la teinte ne véhicule aucune information sur ce site, et une version colorée ferait de la vision des couleurs une condition d’accès au format plutôt qu’un détail d’accessibilité. Les chiffres gardent en outre l’item identique dans toutes les langues, ce qu’une version verbale ne pourrait pas.',
      seenIn: 'Stroop (1935) et sa variante de comptage, batteries de fonctions exécutives et d’inhibition, test d’interférence couleur-mot de Delis–Kaplan',
    },
    arithmetic: {
      name: 'Calcul mental',
      blurb: 'Trouvez le résultat. Vite.',
      description:
        'Une courte expression à évaluer — additions et soustractions d’abord, puis multiplications et divisions exactes, enfin deux opérateurs enchaînés. Les divisions tombent toujours juste et les soustractions ne passent jamais sous zéro : la gestion des signes et les fractions sont des compétences distinctes, qui méritent un traitement à part plutôt que de surgir sans prévenir dans une épreuve de vitesse. On choisit la réponse au lieu de la saisir, pour que la vitesse de frappe reste hors d’une mesure qui porte sur le calcul. L’une des réponses fausses se termine toujours par le même chiffre que la bonne : sans cela, on pourrait répondre en ne calculant que le chiffre des unités.',
      seenIn: 'Arithmétique de la WAIS et de la WISC, sections quantitatives des batteries d’aptitude, logiciels d’entraînement au calcul',
    },
    'head-count': {
      name: 'Compte des présents',
      blurb: 'Des personnages entrent et sortent. Combien en reste-t-il ?',
      description:
        'Des groupes de personnages entrent et sortent d’une salle, un mouvement à la fois. Tenez le compte courant et annoncez ce qu’il en reste à la fin. La mémoire des chiffres retient une liste immobile, la tâche N-back tient une fenêtre glissante ; ici il faut tenir un seul nombre et le réécrire à chaque pas en oubliant le précédent — voilà pourquoi les sorties font tout l’intérêt. Ne compter que les entrées donne un total toujours disponible et toujours faux. Les mouvements ont disparu au moment de répondre, et rien ne se rejoue.',
      seenIn: 'Tâches de mise à jour en mémoire de travail (keep-track, comptage courant), logiciels commerciaux d’entraînement cérébral',
    },
    coding: {
      name: 'Code chiffre–symbole',
      blurb: 'Lisez la légende. Quel symbole va avec le chiffre ?',
      description:
        'Une légende associe à chaque chiffre un symbole abstrait. Un chiffre est désigné : trouvez son symbole dans la légende. Toutes les réponses proposées figurent dans la légende, si bien qu’on ne peut pas trouver la bonne par élimination — il faut vraiment lire l’association. Dans la batterie d’origine, il s’agit d’une épreuve écrite de deux minutes évaluée au nombre de substitutions accomplies ; ce qui est mesuré ici est donc la vitesse d’une substitution, et non l’endurance.',
      seenIn: 'Code de la WAIS et de la WISC, Symboles-chiffres de Wechsler, Symbol Digit Modalities Test',
    },
  },

  gen: {
    matrixAttr: {
      number: 'Le nombre de formes',
      position: 'La disposition des formes',
      type: 'La forme',
      size: 'La taille',
      color: 'Le remplissage',
    },
    rules: {
      constant: (attr: string) => `${attr} reste identique sur chaque ligne.`,
      progression: (attr: string, step: number) =>
        `${attr} ${step > 0 ? 'augmente' : 'diminue'} de ${Math.abs(step)} à chaque étape de la ligne.`,
      arithmeticAdd: (attr: string) => `${attr} : la troisième case vaut la première plus la deuxième.`,
      arithmeticSub: (attr: string) => `${attr} : la troisième case vaut la première moins la deuxième.`,
      distributeThree: (attr: string) =>
        `${attr} : les trois mêmes valeurs apparaissent sur chaque ligne, dans un ordre différent.`,
      sameEverywhere: (attr: string) => `${attr} est identique dans toutes les cases.`,
    },

    matrix: {
      prompt: 'Quelle figure complète le motif ?',
      summary: (option: number) =>
        `La réponse ${option} est la seule figure qui satisfasse toutes les règles à la fois.`,
    },

    seriesNumber: {
      prompt: 'Quel nombre prolonge la suite ?',
      summary: (value: number) => `Le terme suivant est ${value}.`,
      sequence: (terms: string) => `Suite : ${terms}`,
      plusMinus: (d: number) =>
        `Chaque terme vaut le précédent ${d > 0 ? `plus ${d}` : `moins ${-d}`}.`,
      times: (m: number) => `Chaque terme vaut le précédent multiplié par ${m}.`,
      timesPlus: (m: number, c: number) =>
        `Chaque terme vaut le précédent multiplié par ${m}, ${c > 0 ? `plus ${c}` : `moins ${-c}`}.`,
      alternating: (a: number, b: number) =>
        `Deux suites alternent : les 1er, 3e, 5e… termes ${a > 0 ? `montent de ${a}` : `descendent de ${-a}`}, tandis que les 2e, 4e, 6e… ${b > 0 ? `montent de ${b}` : `descendent de ${-b}`}.`,
      blocks: (size: number, step: number) =>
        `La suite avance par blocs de ${size} ; chaque bloc est ${step > 0 ? `${step} plus haut` : `${-step} plus bas`} que le précédent.`,
      growingGap: (d0: number, d1: number, d2: number, dd: number) =>
        `Les écarts entre les termes sont ${d0}, ${d1}, ${d2}… — chaque écart ${dd > 0 ? `augmente de ${dd}` : `diminue de ${-dd}`}.`,
      fibonacci: 'Chaque terme est la somme des deux précédents.',
      growingFactor: (r0: number, r1: number, r2: number) =>
        `Chaque terme est multiplié par un facteur qui grandit à chaque étape : ×${r0}, ×${r1}, ×${r2}…`,
    },

    seriesLetter: {
      prompt: 'Quelle lettre prolonge la suite ?',
      summary: (letter: string) => `La lettre suivante est ${letter}.`,
      sequence: (letters: string) => `Suite : ${letters}`,
      positions: (positions: string) => `Positions dans l’alphabet : ${positions}`,
      step: (step: number) =>
        `Chaque lettre avance de ${Math.abs(step)} position${Math.abs(step) === 1 ? '' : 's'} ${step > 0 ? 'vers l’avant' : 'vers l’arrière'} dans l’alphabet.`,
      alternating: (a: number, b: number) =>
        `Deux suites alphabétiques alternent : les 1re, 3e, 5e… lettres se déplacent de ${a > 0 ? `+${a}` : a}, les 2e, 4e, 6e… de ${b > 0 ? `+${b}` : b}.`,
      growingStep: (d0: number, dd: number) =>
        `L’écart entre les lettres augmente de ${dd} à chaque étape : +${d0}, +${d0 + dd}, +${d0 + 2 * dd}…`,
    },

    oddOneOut: {
      prompt: 'Quelle figure n’a pas sa place parmi les autres ?',
      dims: {
        type: 'forme',
        size: 'taille',
        color: 'remplissage',
        count: 'nombre d’éléments',
      },
      summary: (option: number, dim: string) =>
        `La réponse ${option} est l’intrus : sa ${dim} diffère.`,
      shared: (dim: string) => `Toutes les autres figures partagent la même ${dim}.`,
      noise: (dims: string[]) =>
        `${dims.join(' et ')} varient librement et ne constituent pas la règle.`,
    },

    analogy: {
      prompt: 'La première figure devient la deuxième. Appliquez la même transformation à la troisième.',
      summary: (option: number, changes: string[]) =>
        `Réponse ${option}. En passant de la première figure à la deuxième, ${changes.join(', et ')}.`,
      rule: (change: string) => `Transformation : ${change}.`,
      sizeChange: (amount: number) =>
        `la forme ${amount > 0 ? 'grandit' : 'rétrécit'} de ${Math.abs(amount)} cran${Math.abs(amount) === 1 ? '' : 's'}`,
      colorChange: (amount: number) =>
        `le remplissage ${amount > 0 ? 'fonce' : 's’éclaircit'} de ${Math.abs(amount)} cran${Math.abs(amount) === 1 ? '' : 's'}`,
      rotationChange: (degrees: number) => `la forme tourne de ${degrees} degrés`,
      typeChange: (amount: number) =>
        `la forme devient celle située ${Math.abs(amount)} rang${Math.abs(amount) === 1 ? '' : 's'} plus loin dans la série`,
    },

    syllogism: {
      prompt: 'Les deux affirmations sont vraies. Qu’en découle-t-il nécessairement ?',
      noConclusion: 'Aucune conclusion valide ne découle de ces prémisses.',
      propA: (s: string, p: string) => `Tous les ${s} sont des ${p}.`,
      propE: (s: string, p: string) => `Aucun ${sing(s)} n’est un ${sing(p)}.`,
      propI: (s: string, p: string) => `Certains ${s} sont des ${p}.`,
      propO: (s: string, p: string) => `Certains ${s} ne sont pas des ${p}.`,
      summaryValid: (option: number, conclusion: string) => `Réponse ${option} : ${conclusion}`,
      summaryNone: (option: number) => `Réponse ${option} : rien n’en découle avec certitude.`,
      ruleValid: (conclusion: string, models: number) =>
        `« ${conclusion} » est vraie dans chacune des ${models} situations qui satisfont les deux prémisses.`,
      ruleValidOthers:
        'Chacune des autres conclusions admet au moins un contre-exemple — une situation où les prémisses tiennent mais où la conclusion échoue.',
      ruleNone: (models: number) =>
        `Sur les ${models} situations qui satisfont les deux prémisses, chaque conclusion proposée échoue dans au moins une.`,
      ruleNoneHint: (minor: string, major: string) =>
        `Des prémisses peuvent être compatibles avec une relation sans l’imposer. Rien n’est ici contraint entre les ${minor} et les ${major}.`,
    },

    rotation: {
      prompt: 'Quelle forme est celle du haut, après rotation ?',
      summary: (option: number, degrees: number) =>
        `La réponse ${option} est la forme tournée de ${degrees}° dans le sens horaire.`,
      ruleMirrors:
        'Les autres réponses sont des images miroir — retournées, et non tournées. Aucune rotation dans le plan ne permet de les obtenir.',
      ruleHint:
        'Une vérification rapide : repérez un détail asymétrique (une case isolée qui dépasse) et suivez sa position par rapport au reste. Une rotation préserve cette relation ; une réflexion l’inverse.',
    },

    paperFolding: {
      prompt: 'La feuille est pliée, puis perforée. À quoi ressemble-t-elle dépliée ?',
      folds: {
        left: 'la moitié gauche est rabattue sur la droite',
        right: 'la moitié droite est rabattue sur la gauche',
        top: 'la moitié haute est rabattue vers le bas',
        bottom: 'la moitié basse est rabattue vers le haut',
      },
      foldShort: {
        left: 'gauche rabattue à droite',
        right: 'droite rabattue à gauche',
        top: 'haut rabattu vers le bas',
        bottom: 'bas rabattu vers le haut',
      },
      summary: (option: number, punches: number, layers: number, holes: number) =>
        `Réponse ${option} : ${punches} perforation${punches === 1 ? '' : 's'} à travers ${layers} épaisseurs donnent ${holes} trous.`,
      foldStep: (n: number, description: string) => `Pli ${n} : ${description}.`,
      ruleUnfold:
        'Chaque perforation traverse toutes les épaisseurs situées en dessous ; déplier revient donc à la refléter de part et d’autre de chaque pli, dans l’ordre inverse.',
    },

    span: {
      promptForward: 'Saisissez la séquence dans l’ordre où elle est apparue.',
      promptBackward: 'Saisissez la séquence dans l’ordre inverse.',
      summary: (shown: string, expected: string) =>
        `La séquence était ${shown}, la réponse est donc ${expected}.`,
      ruleBackward:
        'L’empan envers demande de stocker la séquence et de l’inverser en même temps — c’est cette manipulation qui en fait une tâche de mémoire de travail plutôt que de simple rétention.',
      ruleForward:
        'L’empan endroit mesure ce que vous pouvez retenir d’un coup, sans manipulation.',
      ruleChunking:
        'Regrouper les éléments par deux ou trois au fur et à mesure allonge l’empan de façon fiable.',
    },

    symbolSearch: {
      prompt: 'L’un des symboles cibles figure-t-il dans le groupe ?',
      yes: 'Oui',
      no: 'Non',
      summaryPresent: 'Oui — l’une des cibles est dans le groupe.',
      summaryAbsent: 'Non — aucune des cibles n’est dans le groupe.',
      ruleMatch:
        'Un symbole ne correspond que si sa forme, son remplissage et son orientation correspondent tous les trois.',
      ruleSpeed:
        'Ce type est évalué sur la vitesse : votre temps de réponse médian compte davantage que votre précision, qui devrait rester proche du plafond.',
    },
    figureWeights: {
      prompt: 'Quel groupe équilibre la dernière balance ?',
      premisesLabel: 'Ces balances s’équilibrent',
      targetLabel: 'Équilibrez celle-ci',
      summary: (group: string) => `${group} l’équilibre.`,
      rulePremise: (heavier: string, ratio: number, lighter: string) =>
        `Un ${heavier} pèse autant que ${ratio} ${plural(lighter, ratio)}.`,
      ruleTarget: (group: string, weight: number) =>
        `Le plateau à égaler contient ${group}, soit ${weight} unités de la forme la plus légère.`,
      ruleCount:
        'C’est le poids qui équilibre, non le nombre d’objets : un groupe comptant le bon nombre de pièces pour un total erroné ne s’équilibrera pas.',
      ruleShapes:
        'Ce ne sont pas non plus les formes : contenir ce que contient l’autre plateau n’équilibre que si l’on en contient autant.',
      quantity: (n: number, shape: string) => `${n} ${plural(shape, n)}`,
      join: (parts: string[]) =>
        parts.length <= 1 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} et ${parts.at(-1)}`,
    },
    nBack: {
      prompt: (n: number) =>
        n === 1
          ? 'Combien de lettres étaient identiques à celle qui précédait immédiatement ?'
          : `Combien de lettres étaient identiques à celle apparue ${n} rangs plus tôt ?`,
      streamLabel: (n: number) =>
        n === 1 ? 'Repérez les répétitions à 1 rang' : `Repérez les répétitions à ${n} rangs`,
      summary: (count: number, n: number) =>
        `${count} lettres reprenaient celle ${n === 1 ? 'qui précédait immédiatement' : `apparue ${n} rangs plus tôt`}.`,
      ruleWindow: (n: number) =>
        n === 1
          ? 'Une répétition est une lettre identique à celle qui la précède immédiatement.'
          : `Une répétition est une lettre identique à celle apparue ${n} rangs plus tôt — les ${n - 1} lettres intercalées n’entrent pas en compte.`,
      rulePairs: (pairs: string) => `Les positions concernées étaient ${pairs}.`,
      ruleUpdating:
        'Les compter suppose de retenir les dernières lettres et de remplacer la plus ancienne à chaque pas. C’est cette mise à jour, et non la quantité stockée, que ce format mesure.',
    },
    trailMaking: {
      promptA: 'Reliez les cibles à partir de 1, dans l’ordre.',
      promptB: 'Reliez les cibles en alternant nombres et lettres : 1, A, 2, B…',
      summary: (nodes: number, formB: boolean) =>
        formB
          ? `${nodes} cibles, en alternant nombres et lettres.`
          : `${nodes} cibles, dans l’ordre numérique.`,
      ruleSequence:
        'L’ordre, ce sont les nombres croissants. Il n’y a rien à déduire : toute la tâche consiste à trouver la cible suivante et à l’atteindre.',
      ruleAlternate:
        'L’ordre alterne : 1, A, 2, B, et ainsi de suite. Deux suites doivent être tenues en même temps, et chaque bascule est une occasion de perdre sa place dans l’autre.',
      ruleTimed:
        'Ce qui est évalué, c’est le temps mis à finir, non le fait de finir — tout le monde finit. Un clic sur une mauvaise cible est comptabilisé et la série se poursuit.',
      ruleContrast:
        'La mesure à suivre est l’écart entre vos temps sur les deux sortes de plateaux. Ceux qui mêlent nombres et lettres sont appariés aux autres sur la recherche visuelle et la motricité : il ne reste donc que le coût du basculement.',
      next: (label: string) => `Suivant : ${label}`,
      progress: (done: number, total: number) => `${done} sur ${total} reliées`,
      misses: (n: number) => `${n} clic${n === 1 ? '' : 's'} erroné${n === 1 ? '' : 's'}`,
      done: 'Terminé',
      nodeLabel: (label: string) => `Cible ${label}`,
    },
    blockSpan: {
      prompt: (length: number) => `Touchez les ${length} blocs dans l’ordre où ils se sont allumés.`,
      summary: (length: number) =>
        `${length} blocs se sont allumés ; le plateau porte désormais cet ordre en chiffres.`,
      ruleOrder:
        'L’ordre est celui de l’allumage, à l’endroit. Un bloc ne s’allume jamais deux fois dans une même séquence.',
      ruleExact:
        'La séquence entière doit être juste. Quatre blocs sur cinq dans le bon ordre, c’est un essai raté et non quatre cinquièmes de réussite : ce qui se mesure est la survie de la séquence, et une séquence à moitié retenue n’a pas survécu.',
      ruleBoard:
        'Les neuf blocs occupent les mêmes places à chaque item. C’est voulu : une disposition nouvelle à chaque fois vous ferait chercher les blocs avant de pouvoir en retenir l’ordre, et cette recherche serait comptée dans votre empan.',
      ruleSpatial:
        'Les positions se disent mal, et c’est précisément l’intérêt : cette tâche sollicite la part de la mémoire de travail qui retient où sont les choses, plutôt que celle qui se répète des sons. C’est pourquoi un bon empan de chiffres ne prédit pas un bon empan spatial.',
      /** Textes du plateau en direct. */
      ready: (length: number) => `${length} blocs vont s’allumer, un par un. Regardez où.`,
      start: 'Lancer la séquence',
      watching: 'Observez…',
      nowTapThemBack: 'À vous : touchez-les dans l’ordre.',
      progress: (done: number, total: number) => `${done} sur ${total} touchés`,
      undo: 'Annuler le dernier',
      blockLabel: (position: number) => `Bloc ${position}`,
      revealRight: 'C’était bien l’ordre.',
      revealWrong: 'L’ordre est chiffré ci-dessous.',
      legendAnswer: 'Trait plein : l’ordre d’allumage',
      legendTapped: 'Trait pointillé : l’ordre que vous avez touché',
    },
    interference: {
      prompt: 'Combien y en a-t-il ?',
      summary: (count: number, digit: string) =>
        count === Number(digit)
          ? `Il y en a ${count}, et ce sont justement des ${digit} — les deux concordent ici.`
          : `Il y en a ${count}, bien que ce soient des ${digit}.`,
      ruleCongruent:
        'Ici le chiffre et le compte concordent : rien n’était à retenir. Ces essais servent de référence pour mesurer l’interférence.',
      ruleIncongruent: (digit: string, count: number) =>
        `Le chiffre dit ${digit} et il y en a ${count}. Lire le chiffre est automatique, compter ne l’est pas : ${digit} est donc la réponse qui se présente d’abord, et qu’il faut refuser.`,
      ruleInhibition:
        'Ce que ce format mesure, c’est l’inhibition : retenir une réponse automatique et rapide le temps qu’une réponse réfléchie, plus lente, arrive. Ce n’est pas une épreuve de comptage.',
      ruleScoring:
        'La véritable mesure est l’écart entre vos temps sur les deux types d’essais, non votre précision — qui devrait rester élevée. Voyez l’indice d’interférence sur la page de progression.',
    },
    arithmetic: {
      prompt: 'Combien cela fait-il ?',
      summary: (expression: string, value: number) => `${expression} fait ${value}.`,
      ruleSingle: 'Un opérateur, un calcul.',
      ruleLeftToRight:
        'Deux opérateurs de même nature, lus strictement de gauche à droite. Rien ici ne mêle addition et multiplication : aucune règle de priorité n’est donc à retenir — un item dont la réponse en dépendrait mesurerait la convention plutôt que le calcul.',
      ruleUnitsDigit: (digit: number) =>
        `La réponse se termine par ${digit}, et l’une des réponses fausses aussi — délibérément. Le chiffre des unités d’une somme ou d’un produit est fixé par celui des nombres de départ : si une seule réponse se terminait par ${digit}, l’item se résoudrait sans achever le calcul.`,
    },
    headCount: {
      prompt: 'Combien de personnages restaient-ils dans la salle ?',
      summary: (count: number) => `Il en restait ${count} dans la salle.`,
      step: (n: number, arriving: boolean, total: number) =>
        `${n} ${arriving ? 'entrent' : 'sortent'} → ${total}`,
      ruleTrack:
        'Chaque mouvement fait entrer ou sortir des personnages. Ce qu’il faut tenir, c’est le total courant et non les mouvements : additionnez ou soustrayez, puis oubliez le nombre que vous teniez.',
      ruleSteps: (steps: string) => `Pas à pas : ${steps}.`,
      ruleMissedStep:
        'Les autres réponses correspondent à une seule étape mal traitée : un mouvement jamais compté — ce qui laisse le total trop haut s’ils sortaient, trop bas s’ils entraient — ou un mouvement compté à l’envers. Elles se répartissent volontairement de part et d’autre de la bonne, et tout près d’elle : une réponse écartable parce qu’elle est trop éloignée, ou parce qu’elle occupe toujours la même place dans la liste, permettrait de répondre sans avoir regardé.',
    },
    coding: {
      prompt: (digit: string) => `Quel symbole est associé au ${digit} ?`,
      summary: (digit: string, column: number) =>
        `Le ${digit} occupe la colonne ${column} de la légende, et le symbole de cette colonne est la réponse.`,
      ruleLookup:
        'La légende est tout l’item : chaque chiffre est associé à un seul symbole.',
      ruleColumn:
        'Chaque réponse proposée figure quelque part dans la légende : impossible de trouver la bonne par élimination — et l’erreur la plus fréquente consiste à lire la colonne voisine de la bonne.',
      ruleSpeed:
        'Ce type est évalué sur la vitesse : votre temps de réponse médian compte davantage que votre précision, qui devrait rester proche du plafond.',
    },
  },

  pages: {
    home: {
      title: 'Entraînez-vous aux formats des tests de raisonnement',
      description:
        'Entraînez-vous aux formats d’items utilisés dans les tests de QI et d’aptitude — raisonnement matriciel, suites numériques, syllogismes, rotation mentale, et plus encore. Chaque item est généré à la volée, vérifié comme n’admettant qu’une seule réponse, puis expliqué. Tout fonctionne dans votre navigateur.',
      lede: 'Dix-sept formats d’items issus de la littérature sur les tests d’intelligence, générés à neuf à chaque fois et expliqués après chaque réponse. Sans compte, sans serveur, et sans score à mettre sur un CV.',
      ctaTest: 'Passer un test complet',
      ctaPractice: 'S’entraîner sur un format',
      whatHeading: 'Ce que vous pouvez travailler',
      whatLede:
        'Regroupés par aptitudes larges du modèle de Cattell–Horn–Carroll. Le raisonnement fluide (Gf) est le meilleur indicateur isolé de l’aptitude générale, et aussi le plus facile à générer par procédure — d’où la domination des items de raisonnement abstrait dans tous les tests gratuits que vous avez croisés.',
      seenIn: (tests: string) => `Présent dans : ${tests}`,
      howHeading: 'Comment les items sont fabriqués',
      how: [
        {
          title: 'Générés, jamais stockés',
          body: 'Une graine de huit caractères reproduit un item à l’identique. Il n’existe aucune banque d’items : rien à faire fuiter, rien à apprendre par cœur.',
        },
        {
          title: 'Prouvés à réponse unique',
          body: 'Un solveur distinct redérive chaque item de zéro. Si deux règles différentes conviennent et divergent, l’item est jeté puis régénéré.',
        },
        {
          title: 'Des distracteurs non rétro-ingénierables',
          body: 'Les réponses sont équilibrées pour que la bonne ne soit jamais la plus « typique » — le défaut qui rendait un jeu de données de recherche connu soluble sans même regarder la question.',
        },
        {
          title: 'Expliqués à chaque fois',
          body: 'Comme le générateur a construit l’item à partir d’une règle explicite, il peut toujours énoncer cette règle ensuite. S’entendre dire « faux » n’apprend rien.',
        },
      ],
      clearHeading: 'Une chose à dire clairement',
      clearBody:
        'Ce site ne vous affichera jamais de chiffre de QI. Un vrai score de QI est une comparaison avec un échantillon représentatif de personnes de votre âge, testées dans des conditions standardisées — et aucun site web ne dispose de cela. Tout site qui vous donne un chiffre après dix questions l’invente.',
      clearBodyAfter:
        'Ce que vous pouvez honnêtement obtenir ici, c’est de l’entraînement, et une image fidèle de votre propre précision et de votre vitesse au fil du temps. ',
      clearLink:
        'La version longue, et pourquoi les effets d’apprentissage font que s’entraîner améliore votre score au test plus que votre raisonnement',
    },

    practiceIndex: {
      title: 'Entraînement',
      description:
        'Choisissez un seul format d’item et travaillez-le, avec une difficulté qui s’adapte à vos résultats et une explication après chaque réponse.',
      lede: 'Travaillez un format à la fois. La difficulté s’adapte au fil de la série — trois bonnes réponses d’affilée vous font monter, deux erreurs vous font redescendre — pour vous maintenir au niveau où l’entraînement sert vraiment à quelque chose.',
    },

    sprintIndex: {
      title: 'Contre-la-montre',
      description:
        'Un bloc chronométré : un format, soixante secondes, autant d’items que vous pouvez traiter. Évalué sur ce que vous terminez plutôt que sur un pourcentage.',
      lede: 'Soixante secondes, un seul format, aucune explication avant la fin. C’est le seul endroit du site où le chronomètre fait partie de la mesure au lieu d’être simplement noté à côté.',
      whatHeading: 'Ce que mesure un sprint',
      whatBody:
        'La vitesse de traitement est un construit de vitesse : dans une batterie réelle, le score est le nombre d’items terminés dans une limite imposée, et non le nombre de réponses justes avec tout le temps voulu. Partout ailleurs, ce site enregistre votre temps de réponse et vous laisse le prendre ; ici la limite est réelle, le niveau reste fixe pour tout le bloc, et le score est un débit par minute. Deux de vos propres sprints deviennent ainsi comparables — et cela reste une mesure de vous, sur ce format, ce jour-là, et de rien de plus général.',
      whyFew:
        'Peu de formats figurent ici, et c’est délibéré. Un sprint exige des items traitables en deux ou trois secondes ; un format dont les items en prennent vingt réduit une minute à trois items, ce qui ne mesure rien que l’entraînement libre ne mesure mieux. Les formats qui déroulent une séquence avant qu’on puisse répondre sont exclus d’office : l’essentiel du bloc se passerait à regarder.',
    },

    sprintType: {
      title: (name: string) => `Contre-la-montre — ${name}`,
      description: (name: string) =>
        `Soixante secondes d’items « ${name} » sous chronomètre, évaluées au nombre d’items terminés.`,
      lede: 'Le chronomètre part quand vous partez. Répondre enchaîne aussitôt — aucune explication avant la fin.',
      window: '60 secondes',
      aboutHeading: 'Comment c’est évalué',
      aboutBody:
        'Le chiffre principal est le nombre de réponses justes dans la fenêtre, avec la cadence par minute à côté pour que les séries restent comparables. La précision est affichée aussi, comme garde-fou et non comme score : un débit obtenu au hasard n’est pas un débit. Le niveau est fixé pour tout le bloc, et les résultats de sprint restent séparés de vos statistiques d’entraînement — ce sont deux mesures différentes, et les mélanger déplacerait vos médianes d’entraînement sans le dire.',
    },

    practiceType: {
      aboutHeading: 'À propos de ce format',
      seenIn: (tests: string) => `Présent dans : ${tests}`,
    },

    test: {
      title: 'Test complet',
      description:
        'Une série mixte sur les dix-huit formats, deux items chacun, sans retour avant la fin.',
      lede: 'Vingt-six items, deux par format, présentés dans un ordre fixe et sans aucun retour avant la fin. Plus proche du ressenti d’une vraie batterie que les séries d’entraînement.',
      differsHeading: 'En quoi cela diffère d’une vraie batterie',
      differs: [
        'Une vraie batterie est administrée en tête-à-tête par un examinateur formé, avec des consignes, un chronométrage et des règles d’arrêt fixés. Ici, c’est vous, seul, dans un onglet.',
        'Une vraie batterie convertit votre score brut par comparaison à un échantillon d’étalonnage apparié en âge. Il n’y a pas d’échantillon ici : donc pas de centile et pas de QI — seulement vos propres chiffres.',
        'Une vraie batterie comporte de la compréhension verbale, qui ne peut pas être générée par procédure avec des réponses vérifiables. Rien ici ne la mesure.',
        'Vingt-six items, c’est bien trop peu pour estimer quoi que ce soit de stable. Ce n’est pas pour rien que les batteries publiées comptent dix à quinze subtests.',
      ],
    },

    progress: {
      title: 'Progression',
      description:
        'Votre précision, votre vitesse et vos séries par format et par domaine cognitif — stockées uniquement dans ce navigateur.',
      lede: 'Vos chiffres, et ceux de personne d’autre. La précision indique si vous avez compris un format ; le temps médian, si vous l’avez intégré.',
    },

    about: {
      title: 'Ce que ce site mesure, et ce qu’il ne mesure pas',
      description:
        'Comment les tests de QI sont construits, quels formats d’items un programme peut générer et vérifier, et pourquoi ce site n’affiche délibérément aucun score de QI.',
      lede: 'La version honnête. Ce qu’est réellement un test de QI, quelles parties un programme peut légitimement reproduire, et pourquoi le chiffre que vous cherchez probablement ne figure pas ici.',

      procedureHeading: 'Un test de QI est une procédure, pas un ensemble de questions',
      procedureP1:
        'C’est le point le plus mal compris de la psychométrie. Un test est une batterie standardisée de subtests. Votre score brut à chacun est converti en score étalonné par comparaison à un échantillon d’étalonnage — des milliers de personnes appariées à votre âge, testées dans des conditions contrôlées — puis ces scores sont combinés en indices et en un score composite, conventionnellement ramené à une moyenne de 100 et un écart-type de 15.',
      procedureP2:
        'Trois choses donnent un sens à ce chiffre, et toutes trois relèvent de la passation, non des questions :',
      procedureList: [
        'Un échantillon d’étalonnage représentatif auquel se comparer.',
        'Des consignes, un chronométrage, un ordre et des règles d’arrêt fixés.',
        'Une fidélité et une validité publiées — les grandes batteries rapportent des corrélations test-retest de 0,85 à 0,95.',
      ],
      procedureP3:
        'Un programme peut générer des questions qui se comportent comme des items de subtest. Il ne peut pas générer d’étalonnage. Ce seul écart détermine toute la conception de ce site.',

      chcHeading: 'La carte : le modèle CHC',
      chcP1:
        'Presque toutes les batteries modernes s’organisent autour du modèle de Cattell–Horn–Carroll : l’aptitude générale g au sommet, une dizaine d’aptitudes larges en dessous, et quelque soixante-dix aptitudes étroites encore en dessous. Les cinq aptitudes larges travaillées ici :',
      chcColCode: 'Code',
      chcColAbility: 'Aptitude',
      chcColFormats: 'Formats disponibles',
      chcNote:
        'Absente de cette liste : Gc, les connaissances acquises — vocabulaire, analogies verbales, culture générale. Cette absence est délibérée et expliquée ci-dessous.',

      familiesHeading: 'Les grandes familles de tests',
      families: [
        {
          name: 'Échelles de Wechsler (WAIS-IV, WISC-V, WPPSI-IV)',
          body: 'Les batteries cliniques les plus utilisées. Dix subtests principaux produisent quatre indices — compréhension verbale, raisonnement perceptif, mémoire de travail, vitesse de traitement — et un QI total. Passation individuelle par un examinateur qualifié.',
        },
        {
          name: 'Stanford–Binet 5',
          body: 'Cinq facteurs (raisonnement fluide, connaissances, raisonnement quantitatif, traitement visuo-spatial, mémoire de travail), chacun mesuré sous forme verbale et non verbale — un plan 5×2, avec des subtests d’aiguillage qui déterminent le point de départ.',
        },
        {
          name: 'Matrices progressives de Raven',
          body: 'Le test non verbal de référence du raisonnement fluide, conçu pour limiter l’effet culturel. La version standard compte 60 items en cinq séries de difficulté croissante ; la version avancée discrimine dans le haut de la distribution. Chaque item est une matrice 3×3 dont la dernière case manque.',
        },
        {
          name: 'Cattell Culture Fair (CFIT)',
          body: 'Conçu explicitement pour réduire la charge culturelle, linguistique et scolaire. Quatre subtests chronométrés : séries, classification, matrices et conditions. Rapporté sur une échelle d’écart-type 24, ce qui explique qu’un « Cattell 148 » corresponde à peu près à un « Wechsler 130 ».',
        },
        {
          name: 'Woodcock–Johnson IV',
          body: 'La batterie la plus explicitement alignée sur le modèle CHC : ses subtests sont délibérément rattachés aux aptitudes larges et étroites de Cattell–Horn–Carroll.',
        },
        {
          name: 'Tests de dépistage courts',
          body: 'Le Wonderlic (50 items variés en 12 minutes) pour la sélection professionnelle ; le CogAT et l’OLSAT comme tests scolaires collectifs ; le NNAT comme dépistage scolaire non verbal.',
        },
      ],

      verbalHeading: 'Pourquoi il n’y a pas de questions de vocabulaire ici',
      verbalP1:
        'Les analogies verbales et le vocabulaire semblent faciles à générer ; ils ne le sont pas. Leur exactitude dépend de faits sur une langue naturelle qui vivent en dehors du générateur. Un programme ne peut produire chaud : froid :: haut : ? que si un humain lui a déjà indiqué que chaud/froid et haut/bas sont des couples d’antonymes — ce qui en fait une base de contenus rédigée à la main avec une clé de correction, et non un générateur.',
      verbalP2:
        'Pire, la réponse n’est même pas unique. Pour haut : ?, la réponse attendue est bas, mais au-dessus, vers le haut et surélevé sont tous défendables selon la relation que l’on infère, et le programme n’a aucun moyen de principe de savoir laquelle vous aviez en tête. Chaque item d’ici doit admettre exactement une réponse dont l’exactitude peut être démontrée : les items verbaux sont donc exclus.',
      verbalP3:
        'C’est pour la même raison que les batteries volontairement « culture fair » — Raven, Cattell, le NNAT — sont purement non verbales, et que pratiquement tous les tests gratuits en ligne reposent sur des matrices.',

      guardsHeading: 'Comment un item est prouvé équitable',
      guardsLede: 'Chaque item généré doit passer trois contrôles avant de vous être présenté.',
      guards: [
        {
          title: '1. Un solveur distinct doit être d’accord',
          body: 'Un solveur indépendant — délibérément différent du code qui a produit l’item — redérive la règle à partir de ce qui est visible et énumère toutes les règles compatibles. Si deux règles compatibles prédisent des réponses différentes, l’item est écarté. C’est pourquoi vous ne verrez jamais 2, 4, 8, ? ici : ×2 prédit 16 et un écart croissant prédit 14, et les deux se défendent.',
        },
        {
          title: '2. Les réponses ne doivent pas trahir la bonne',
          body: 'Un jeu de données de recherche bien connu sur les matrices s’est révélé soluble sans même regarder la question : ses mauvaises réponses étaient fabriquées en modifiant un attribut de la bonne, si bien que la bonne était toujours la plus « typique ». Ici, les huit réponses forment un ensemble équilibré où chaque valeur d’attribut apparaît dans exactement la moitié d’entre elles : ce raccourci n’existe donc pas — et un test tente précisément ce raccourci et confirme qu’il ne fait pas mieux que le hasard.',
        },
        {
          title: '3. Les mauvaises réponses doivent être fausses pour une raison',
          body: 'Les distracteurs sont construits à partir d’erreurs précises : la règle appliquée en colonnes au lieu des lignes, la bonne règle poussée d’un cran de trop, une case simplement recopiée. Ainsi l’explication peut nommer l’erreur que vous avez probablement commise, au lieu de se contenter de vous dire que vous en avez commis une.',
        },
      ],

      /** La démonstration la plus convaincante du site, enfin déployée. */
      proof: {
        heading: 'La vérification, sur un item',
        lede: 'Chaque item généré doit survivre à un solveur qui le re-dérive de zéro. Voici ce que cela écarte.',
        sequence: 'Quel terme vient ensuite ?',
        readingA: 'Lu comme un doublement',
        readingAWork: 'chaque terme vaut le double du précédent',
        readingAAnswer: '16',
        readingB: 'Lu comme un écart croissant',
        readingBWork: 'les écarts sont 2, puis 4, puis 8',
        readingBAnswer: '14',
        verdict:
          'Deux règles collent à ce qui est visible et elles se contredisent : il n’y a donc pas de réponse défendable — et l’item est écarté avant que quiconque le voie.',
        verdictLabel: 'écarté',
      },

      difficultyHeading: 'La difficulté est contrôlée, pas devinée',
      difficultyP1:
        'Les niveaux des suites numériques suivent les opérateurs cognitifs de la littérature sur la génération d’items, par charge croissante : lire une suite unique, puis en repérer deux entrelacées, puis des blocs répétés, puis un écart qui croît d’une constante, puis un multiplicateur qui change lui-même. Ces cinq opérateurs expliquent à eux seuls environ 77 % de la variance de difficulté — la difficulté est ici une propriété de la structure, et non une étiquette collée après coup.',
      difficultyP2:
        'Pour les matrices, la difficulté vient du nombre d’attributs porteurs d’une règle simultanément et du degré d’abstraction de ces règles. Pour la rotation mentale, de l’angle et du nombre de cases — on sait que le temps de réponse croît linéairement avec l’angle de rotation, ce qui en fait un réglage bien maîtrisé.',

      automationHeading: 'Pourquoi la WAIS ne peut pas être mise en ligne, et les items de type Raven si',
      automationBody:
        'La ligne de partage est le format de réponse, pas le prestige du test. Les batteries à réponse fermée — Raven, le Cattell CFIT, le Wonderlic, le NNAT, ICAR — sont intégralement corrigibles par machine, d’où leurs versions web. La famille Wechsler ne l’est pas : Similitudes, Vocabulaire et Compréhension sont des réponses verbales ouvertes cotées selon une grille, et les Cubes sont une manipulation physique, chronométrée et observée par un examinateur. Cette frontière est exactement celle de ce que couvre ce site, et c’est la même que la section sur le vocabulaire atteint par l’autre bout : ce qu’un programme peut générer et ce qu’un programme peut corriger se révèlent être le même ensemble.',

      ceilingHeading: 'Là où l’échelle s’arrête',
      ceilingP1:
        'Les batteries standard perdent leur résolution dans le haut de la distribution. Une WAIS ou un Raven avancé n’a ni assez de cas normatifs ni assez d’items discriminants bien au-delà de 145–160 : près du plafond, une seule erreur d’inattention déplace le score de plusieurs points, si bien que l’erreur de mesure dépasse la différence mesurée.',
      ceilingP2:
        'Toute une sous-culture de tests « haute gamme » prétend offrir une résolution jusqu’à 190. Elle l’obtient en supprimant le chronomètre et en passant à des réponses ouvertes — ce qui élimine le hasard, mais fait aussi mesurer la persévérance, le temps libre et le goût des casse-têtes autant que le raisonnement. Leurs étalonnages proviennent de volontaires auto-sélectionnés ayant choisi de passer des semaines sur une série d’énigmes, soit à peu près l’échantillon le moins représentatif possible, et les taux de rareté au-delà d’environ quatre écarts-types supposent que la courbe normale tient dans une queue de distribution que personne n’a vérifiée.',
      ceilingP3:
        'La difficulté s’arrête donc ici au niveau 5, et il s’agit d’une échelle d’entraînement, pas d’une échelle de mesure. Si les items les plus durs vous paraissent trop faciles, c’est une vraie limite de cette conception — et le remède habituel coûte plus cher qu’il ne rapporte.',

      notMeasuredHeading: 'Ce qu’un test de QI ne mesure pas du tout',
      notMeasuredLede:
        'Même parfaitement administrée, une batterie mesure l’efficacité de certains circuits de raisonnement et de traitement de l’information. Ce n’est pas la mesure d’un esprit. Hors de son champ :',
      notMeasured: [
        {
          title: 'La créativité divergente',
          body: 'Produire des idées originales hors d’un cadre coté. Les items à réponse unique sont, par construction, le concept inverse — tout ce site repose sur l’existence d’une seule réponse défendable.',
        },
        {
          title: 'L’intelligence émotionnelle et sociale',
          body: 'L’empathie, la régulation des émotions, la lecture d’une situation, la négociation, la tolérance au stress.',
        },
        {
          title: 'La compétence pratique et adaptative',
          body: 'La débrouillardise, le jugement en situation, la résolution de problèmes du quotidien. Les échelles de comportement adaptatif existent comme instruments distincts précisément parce que le QI total ne couvre pas cela.',
        },
        {
          title: 'La personnalité et la conation',
          body: 'La conscienciosité, la curiosité, la persévérance, la motivation. Dans bien des domaines, ces traits prédisent les résultats concrets au moins aussi bien que g.',
        },
      ],
      notMeasuredClose:
        'Cela s’applique récursivement à ce site. Une précision élevée sur ces dix-huit formats est une information sur ces dix-huit formats, et sur rien d’autre.',

      difficultyP3:
        'Ce qui ne revient pas à un étalonnage. Les paliers sont conçus à partir d’opérateurs cognitifs publiés — un ordonnancement défendable — mais aucun item ne porte ici de paramètre de difficulté estimé sur des données de réponse réelles, ce qu’entend la théorie de réponse à l’item par « difficulté ». L’échelle adaptative est donc un escalier qui vous maintient près de votre propre taux de réussite, pas une estimation de votre aptitude.',
      limitsHeading: 'Les limites, dites clairement',
      limits: [
        {
          title: 'Pas d’étalonnage, donc pas de score.',
          body: 'Sans échantillon représentatif auquel vous comparer, un centile ou un « QI 132 » serait inventé. Ce site rapporte la précision, la vitesse et l’évolution dans le temps, c’est-à-dire ce qu’il peut réellement mesurer.',
        },
        {
          title: 'Les effets d’apprentissage sont importants — et c’est bien le sujet.',
          body: 'Repasser un test une deuxième fois augmente généralement le score de 5 à 15 points, et l’effet est le plus fort pour les formats nouveaux comme le raisonnement matriciel — précisément ce qu’un site d’entraînement fait travailler. C’est pour cette raison que la pratique clinique recommande au moins douze mois entre deux passations d’un même instrument. S’entraîner vous rend meilleur à la tâche. Rien ne montre sérieusement que cela élève g.',
        },
        {
          title: 'Les étalonnages vieillissent.',
          body: 'L’effet Flynn — une hausse moyenne d’environ 3 points par décennie dans les pays développés — explique le réétalonnage des batteries tous les 15 à 20 ans. Toute table de conversion figée se périme.',
        },
        {
          title: 'Sans surveillance et auto-sélectionné.',
          body: 'Vous vous testez vous-même, au moment de votre choix, dans un environnement que personne ne contrôle, votre téléphone à portée de main. C’est la critique classique des tests en ligne, et elle s’applique ici pleinement.',
        },
        {
          title: 'Rien ici n’est copié d’un test publié.',
          body: 'Les items réels de Wechsler, Raven et Cattell sont protégés par le droit d’auteur et souvent couverts par le secret des affaires. Chaque item de ce site est généré de zéro. Les formats, eux, sont décrits dans la littérature publique et ne sont pas protégeables en tant que tels. Les noms de tests apparaissent ici à titre descriptif, pour indiquer à quel instrument publié un format ressemble — jamais comme argument commercial. Ce site n’est affilié à aucun d’eux, n’est approuvé par aucun d’eux et n’en est la version d’aucun.',
        },
      ],

      dataHeading: 'Vos données',
      dataBodyBefore:
        'Tout est conservé dans le localStorage de ce navigateur et ne quitte jamais votre appareil — le site est un ensemble de fichiers statiques, sans aucun serveur à qui envoyer quoi que ce soit. Les sessions sont stockées sous forme de graines, et non d’items : c’est pourquoi l’historique complet tient en quelques kilo-octets. Vous pouvez l’exporter, le réimporter ailleurs, ou le supprimer depuis la ',
      dataLink: 'page de progression',
      dataBodyAfter: '.',

      sourcesHeading: 'Sources',
      sources: [
        'Zhang et al., RAVEN: A Dataset for Relational and Analogical Visual rEasoNing, CVPR 2019 — le schéma attributs/règles utilisé pour les matrices.',
        'Hu et al., Stratified Rule-Aware Network (I-RAVEN) — le défaut « aveugle au contexte » des distracteurs de RAVEN et sa correction.',
        'Wang & Su, Automatic Generation of Raven’s Progressive Matrices, IJCAI 2015 — critères de bonne formation et typologie des erreurs pour les distracteurs.',
        'Hornke & Habon (1986) — le premier jeu de règles procédurales pour les matrices de type Raven.',
        'Arendasy & Sommer ; Zhang et al. — les opérateurs cognitifs ANSIG pour la difficulté des suites numériques.',
        'Shepard & Metzler (1971) ; Vandenberg & Kuse (1978) — la rotation mentale.',
        'Schneider & McGrew (2018) — le cadre de Cattell–Horn–Carroll.',
        'Flynn ; Kanaya, Scullin & Ceci — l’effet Flynn et le réétalonnage.',
        'Condon & Revelle, l’International Cognitive Ability Resource (ICAR) — la seule banque d’items ouverte, calibrée par TRI et correctement licenciée. Délibérément non utilisée ici : une banque figée de quelques dizaines d’items s’épuise en une seule session, ce qui est précisément le problème que la génération résout.',
      ],
      sourcesNote:
        'Les notes de recherche complètes, l’analyse de générabilité et l’évaluation des bibliothèques se trouvent dans le répertoire docs/ du dépôt.',
    },

    terms: {
      title: 'Conditions d’utilisation',
      description:
        'Ce qu’est ce site, ce qu’il n’est pas, et les conditions dans lesquelles il est mis à disposition. Il ne délivre aucun score de QI et ne constitue pas un instrument d’évaluation ou de diagnostic.',
      lede: 'Ce site propose un entraînement à des formats de questions de raisonnement. Il ne délivre aucun score de QI, ne constitue pas un test psychométrique et ne remplace en aucun cas l’évaluation d’un psychologue.',
      updated: 'Dernière mise à jour : août 2026',
      sections: [
        {
          heading: 'Objet du site',
          body: [
            'Ce site met à disposition, gratuitement, des exercices générés par algorithme reprenant les formats de questions utilisés dans les tests d’aptitude et d’intelligence. Sa finalité est pédagogique et récréative : comprendre comment ces items sont construits et s’y entraîner. Il fonctionne intégralement dans le navigateur, sans compte et sans serveur.',
          ],
        },
        {
          heading: 'Ce site n’est pas un instrument d’évaluation',
          body: [
            'Aucun score de QI, percentile, rang ou niveau n’est produit, et aucun ne peut l’être : un score de QI est une comparaison à un échantillon d’étalonnage représentatif, passée dans des conditions standardisées, ce dont ce site ne dispose pas. Les résultats affichés (justesse, temps de réponse, progression) ne décrivent que vos performances sur ce site.',
            'En particulier, ils ne permettent pas de détecter, confirmer ou écarter un haut potentiel intellectuel, un trouble des apprentissages, un déficit cognitif ou toute autre condition. Seul un psychologue ou un neuropsychologue qualifié peut réaliser une telle évaluation, au moyen d’une batterie étalonnée passée en face-à-face. Ce site ne doit servir de base à aucune décision d’orientation, de recrutement, de scolarité ou de santé.',
          ],
        },
        {
          heading: 'Absence de garantie',
          body: [
            'Le contenu est fourni « en l’état », sans garantie d’exactitude, d’exhaustivité, de disponibilité ni d’adéquation à un usage particulier. Les items sont générés et vérifiés automatiquement ; malgré les contrôles mis en place, une erreur dans un énoncé, une explication ou une réponse attendue reste possible.',
            'Aucun résultat, aucune amélioration et aucune réussite à un test ultérieur n’est garanti — l’entraînement améliore la performance à l’exercice pratiqué, ce qui ne se transpose pas nécessairement ailleurs.',
          ],
        },
        {
          heading: 'Limitation de responsabilité',
          body: [
            'L’auteur ne saurait être tenu responsable d’un dommage direct ou indirect résultant de l’utilisation du site, de l’interprétation de ses résultats ou d’une décision prise sur leur fondement. L’utilisation du site relève de votre seule responsabilité.',
          ],
        },
        {
          heading: 'Propriété intellectuelle et marques',
          body: [
            'Le code du site est publié sous licence MIT ; les textes explicatifs sont librement consultables pour un usage personnel, avec citation courte et lien en cas de reprise. Aucun item d’un test publié n’est reproduit : toutes les questions sont engendrées par un algorithme à partir de principes logiques décrits dans la littérature scientifique, lesquels ne sont pas protégeables.',
            'Les noms de tests cités (WAIS, WISC, Raven’s Progressive Matrices, Cattell, Wonderlic, NNAT, etc.) sont des marques appartenant à leurs titulaires respectifs et ne sont mentionnés qu’à titre descriptif, pour situer un format de question. Ce site n’est ni affilié à ces éditeurs, ni approuvé par eux, et ne propose aucune version en ligne de leurs tests.',
          ],
        },
        {
          heading: 'Liens et outils externes',
          body: [
            'Les références bibliographiques et liens externes sont fournis à titre documentaire ; l’auteur n’a aucun contrôle sur leur contenu et n’en assume pas la responsabilité.',
          ],
        },
        {
          heading: 'Données personnelles',
          body: [
            'Le site est un ensemble de fichiers statiques : il n’y a aucun serveur applicatif, aucun compte, aucun cookie de mesure d’audience et aucun traceur. Vos réponses, vos sessions et vos préférences sont conservées uniquement dans le stockage local (localStorage) de votre navigateur, sur votre appareil, et ne sont transmises nulle part. Vous pouvez les exporter, les réimporter ou les effacer à tout moment depuis la page Progression.',
            'L’hébergeur (GitHub Pages) peut, de son côté, journaliser des données techniques de connexion selon ses propres conditions.',
          ],
        },
        {
          heading: 'Modifications, disponibilité et droit applicable',
          body: [
            'Le contenu du site et les présentes conditions peuvent évoluer sans préavis ; la version en ligne fait foi. La disponibilité du site n’est pas garantie, l’hébergement étant assuré par GitHub Pages.',
            'Les présentes conditions sont soumises au droit français ; à défaut de résolution amiable, les tribunaux français sont compétents. La version française fait foi en cas de divergence.',
          ],
        },
      ],
      publisherLabel: 'Éditeur',
      publisher: 'TODO — publisher name not yet supplied (see docs/PLAN-2026-08.md §1.2)',
      contactLabel: 'Contact',
      contact: 'https://github.com/aureliendrouet/flex-your-neurons/issues',
      hostLabel: 'Hébergeur',
      host: 'GitHub, Inc., 88 Colin P. Kelly Jr Street, San Francisco, CA 94107, USA',
    },

    redirect: {
      title: 'Choix de votre langue…',
      body: 'Si la redirection ne se fait pas automatiquement, choisissez une langue :',
    },
  },
};


/** "1", "1 and 3", "1, 2 and 4" — a readable list for a screen reader. */
function listPhrase(items: string[], conjunction: string): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} ${conjunction} ${items[items.length - 1]}`;
}

export default fr;
