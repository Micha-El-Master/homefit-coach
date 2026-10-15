function getWeekRecap(monday) {
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  const from = isoOf(monday);
  const to = isoOf(sunday);
  const sessions = getSessionLog().filter((s) => s.date >= from && s.date <= to);

  const feelings = { dur: 0, bien: 0, facile: 0 };
  const perExercise = {};
  let minutes = 0;
  let calories = 0;
  let totalReps = 0;
  let holdSeconds = 0;

  sessions.forEach((s) => {
    minutes += s.duration || 0;
    calories += s.calories || 0;
    if (s.feeling && feelings[s.feeling] !== undefined) feelings[s.feeling]++;
    (s.exercises || []).forEach((ex) => {
      const isHold = EXERCISES[ex.id] && EXERCISES[ex.id].type === 'hold';
      const total = ex.totalReps || 0;
      if (isHold) holdSeconds += total;
      else totalReps += total;
      const entry = perExercise[ex.id] || { name: ex.name, total: 0, unit: isHold ? 's' : 'reps' };
      entry.total += total;
      perExercise[ex.id] = entry;
    });
  });

  const top = Object.values(perExercise)
    .filter((e) => e.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 3);

  return {
    from,
    to,
    count: sessions.length,
    target: getWeeklyTarget(),
    minutes,
    calories,
    totalReps,
    holdSeconds,
    feelings,
    top,
  };
}

function getWeekTip(recap, isCurrentWeek) {
  const { count, target, feelings } = recap;
  const rated = feelings.dur + feelings.bien + feelings.facile;
  if (count === 0) {
    return isCurrentWeek
      ? "Pas encore de séance cette semaine : une séance courte aujourd'hui suffit pour lancer la dynamique."
      : "Aucune séance cette semaine-là. Pas grave : repars avec une seule séance, c'est le plus dur à relancer.";
  }
  if (count < target) {
    const missing = target - count;
    return isCurrentWeek
      ? `Il te reste ${missing} séance${missing > 1 ? 's' : ''} pour valider ta semaine. Un jour de repos peut devenir un jour de rattrapage.`
      : `Il t'a manqué ${missing} séance${missing > 1 ? 's' : ''}. Si ton objectif est trop ambitieux, réduis le nombre de jours dans les réglages : mieux vaut un rythme tenable.`;
  }
  if (rated && feelings.dur > feelings.facile && feelings.dur >= feelings.bien) {
    return 'Objectif atteint, mais tes séances étaient dures : garde bien tes jours de repos, dors suffisamment et utilise « trop dur » pour alléger.';
  }
  if (rated && feelings.facile > feelings.dur && feelings.facile >= feelings.bien) {
    return 'Objectif atteint et séances faciles : tu peux monter en intensité avec « trop facile » pendant la séance.';
  }
  return count > target
    ? 'Objectif dépassé ! Pense à garder au moins un vrai jour de repos pour bien récupérer.'
    : 'Objectif atteint, bravo. Garde ce rythme : la régularité compte plus que l\'intensité.';
}
