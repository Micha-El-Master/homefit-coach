const POSES = {
  standing: {
    animClass: 'anim-breathe',
    svg: `<svg viewBox="0 0 120 160" class="ill-figure">
      <circle class="ill-part" cx="60" cy="26" r="13"/>
      <path class="ill-part" d="M60 39 L60 96"/>
      <path class="ill-part" d="M60 52 L32 78"/>
      <path class="ill-part" d="M60 52 L88 78"/>
      <path class="ill-part" d="M60 96 L42 150"/>
      <path class="ill-part" d="M60 96 L78 150"/>
    </svg>`,
  },
  squat: {
    animClass: 'anim-bob',
    svg: `<svg viewBox="0 0 120 160" class="ill-figure">
      <circle class="ill-part" cx="60" cy="36" r="13"/>
      <path class="ill-part" d="M60 49 L60 96"/>
      <path class="ill-part" d="M60 58 L22 70"/>
      <path class="ill-part" d="M60 58 L98 70"/>
      <path class="ill-part" d="M60 96 L42 122 L46 150"/>
      <path class="ill-part" d="M60 96 L78 122 L74 150"/>
    </svg>`,
  },
  lunge: {
    animClass: 'anim-bob-small',
    svg: `<svg viewBox="0 0 120 160" class="ill-figure">
      <circle class="ill-part" cx="58" cy="30" r="13"/>
      <path class="ill-part" d="M58 43 L62 92"/>
      <path class="ill-part" d="M58 52 L34 68"/>
      <path class="ill-part" d="M58 52 L86 62"/>
      <path class="ill-part" d="M62 92 L84 112 L88 150"/>
      <path class="ill-part" d="M62 92 L40 118 L34 150"/>
    </svg>`,
  },
  pushup: {
    animClass: 'anim-bob-small',
    svg: `<svg viewBox="0 0 120 160" class="ill-figure">
      <circle class="ill-part" cx="26" cy="112" r="12"/>
      <path class="ill-part" d="M26 122 L58 96 L100 58"/>
      <path class="ill-part" d="M40 108 L38 128 L26 138"/>
      <path class="ill-part" d="M100 58 L112 42"/>
    </svg>`,
  },
  dip: {
    animClass: 'anim-bob-small',
    svg: `<svg viewBox="0 0 120 160" class="ill-figure">
      <circle class="ill-part" cx="52" cy="34" r="13"/>
      <path class="ill-part" d="M52 47 L58 88"/>
      <path class="ill-part" d="M52 58 L78 66 L82 96"/>
      <path class="ill-part" d="M58 88 L46 118 L50 150"/>
      <path class="ill-part" d="M58 88 L76 116 L72 150"/>
    </svg>`,
  },
  bridge: {
    animClass: 'anim-lift',
    svg: `<svg viewBox="0 0 120 160" class="ill-figure">
      <circle class="ill-part" cx="24" cy="108" r="12"/>
      <path class="ill-part" d="M24 118 L56 118 L92 88"/>
      <path class="ill-part" d="M56 118 L58 150"/>
      <path class="ill-part" d="M92 88 L96 122 L82 150"/>
    </svg>`,
  },
  crunch: {
    animClass: 'anim-curl',
    svg: `<svg viewBox="0 0 120 160" class="ill-figure">
      <circle class="ill-part" cx="34" cy="96" r="12"/>
      <path class="ill-part" d="M34 106 L64 112"/>
      <path class="ill-part" d="M64 112 L64 140 L48 150"/>
      <path class="ill-part" d="M64 112 L88 118 L94 150"/>
      <path class="ill-part" d="M40 90 L54 78"/>
    </svg>`,
  },
  prone: {
    animClass: 'anim-lift-small',
    svg: `<svg viewBox="0 0 120 160" class="ill-figure">
      <circle class="ill-part" cx="22" cy="98" r="12"/>
      <path class="ill-part" d="M22 108 L92 96"/>
      <path class="ill-part" d="M40 100 L18 78"/>
      <path class="ill-part" d="M92 96 L112 106"/>
      <path class="ill-part" d="M92 96 L108 128"/>
    </svg>`,
  },
  row: {
    animClass: 'anim-pull',
    svg: `<svg viewBox="0 0 120 160" class="ill-figure">
      <circle class="ill-part" cx="80" cy="34" r="13"/>
      <path class="ill-part" d="M80 47 L64 92"/>
      <path class="ill-part" d="M80 58 L44 66"/>
      <path class="ill-part" d="M64 92 L48 122 L52 150"/>
      <path class="ill-part" d="M64 92 L78 122 L74 150"/>
    </svg>`,
  },
  jack: {
    animClass: 'anim-pulse',
    svg: `<svg viewBox="0 0 120 160" class="ill-figure">
      <circle class="ill-part" cx="60" cy="26" r="13"/>
      <path class="ill-part" d="M60 39 L60 96"/>
      <path class="ill-part" d="M60 48 L18 30"/>
      <path class="ill-part" d="M60 48 L102 30"/>
      <path class="ill-part" d="M60 96 L28 148"/>
      <path class="ill-part" d="M60 96 L92 148"/>
    </svg>`,
  },
};

const PHOTO_EXERCISES = new Set([
  'pompes', 'dips-chaise', 'extension-triceps', 'elevations-laterales', 'squat', 'fentes',
  'pont-fessier', 'crunch', 'superman', 'curl-biceps', 'mountain-climbers', 'squat-jump', 'planche',
  'pike-pushup', 'mollets', 'rowing-serviette', 'tirage-elastique', 'star-jump',
]);

function renderExerciseMedia(ex) {
  if (!PHOTO_EXERCISES.has(ex.id)) return renderIllustration(ex.pose);
  return `<div class="exo-photo">
    <img src="images/exercises/${ex.id}-0.jpg" alt="${ex.name} : position de départ" />
    <img class="alt" src="images/exercises/${ex.id}-1.jpg" alt="${ex.name} : position d’arrivée" />
  </div>`;
}

function getPose(key) {
  return POSES[key] || POSES.standing;
}

function renderIllustration(poseKey, extraClass = '') {
  const pose = getPose(poseKey);
  return `<div class="illustration ${pose.animClass} ${extraClass}">${pose.svg}</div>`;
}
