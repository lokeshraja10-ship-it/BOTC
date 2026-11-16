// Trouble Brewing characters. Ability summaries are short paraphrases written for this app.
export const ROLES = [
  // Townsfolk
  { id: "washerwoman", name: "Washerwoman", team: "townsfolk", icon: "🧺", ability: "First night: learn two players, one of whom is a particular Townsfolk.", night: "Point to two players and show a Townsfolk token." },
  { id: "librarian", name: "Librarian", team: "townsfolk", icon: "📚", ability: "First night: learn two players, one of whom is a particular Outsider (or that none are in play).", night: "Point to two players and show an Outsider token, or show 0." },
  { id: "investigator", name: "Investigator", team: "townsfolk", icon: "🔍", ability: "First night: learn two players, one of whom is a particular Minion.", night: "Point to two players and show a Minion token." },
  { id: "chef", name: "Chef", team: "townsfolk", icon: "🍳", ability: "First night: learn how many pairs of evil players are sitting next to each other.", night: "Show the number of adjacent evil pairs." },
  { id: "empath", name: "Empath", team: "townsfolk", icon: "💞", ability: "Each night: learn how many of your two nearest living neighbours are evil.", night: "Show 0, 1 or 2." },
  { id: "fortune_teller", name: "Fortune Teller", team: "townsfolk", icon: "🔮", ability: "Each night: choose two players and learn if either is the Demon. One good player is a red herring.", night: "Player chooses two; nod yes or shake no." },
  { id: "undertaker", name: "Undertaker", team: "townsfolk", icon: "⚰️", ability: "Each night after the first: learn which character was executed today.", night: "If someone was executed today, show their character." },
  { id: "monk", name: "Monk", team: "townsfolk", icon: "🙏", ability: "Each night after the first: choose another player; the Demon cannot kill them tonight.", night: "Player chooses someone to protect." },
  { id: "ravenkeeper", name: "Ravenkeeper", team: "townsfolk", icon: "🐦", ability: "If the Demon kills you at night, wake and choose a player to learn their character.", night: "Only if killed tonight: they choose a player; show that character." },
  { id: "virgin", name: "Virgin", team: "townsfolk", icon: "🕊️", ability: "The first time you are nominated, if the nominator is a Townsfolk, they are executed immediately.", night: "" },
  { id: "slayer", name: "Slayer", team: "townsfolk", icon: "🏹", ability: "Once per game, during the day, publicly choose a player: if they are the Demon, they die.", night: "" },
  { id: "soldier", name: "Soldier", team: "townsfolk", icon: "🛡️", ability: "You are safe from the Demon.", night: "" },
  { id: "mayor", name: "Mayor", team: "townsfolk", icon: "🎩", ability: "If only three players live and there is no execution, your team wins. A night death may bounce to someone else.", night: "" },
  // Outsiders
  { id: "butler", name: "Butler", team: "outsider", icon: "🛎️", ability: "Each night: choose a master. Tomorrow you may only vote if your master votes too.", night: "Player chooses their master." },
  { id: "drunk", name: "Drunk", team: "outsider", icon: "🍺", ability: "You do not know you are the Drunk. You believe you are a Townsfolk, but your ability does not work.", night: "Wakes as the Townsfolk they think they are; give unreliable info." },
  { id: "recluse", name: "Recluse", team: "outsider", icon: "🏚️", ability: "You might register as evil, or as a Minion or Demon, even if dead.", night: "" },
  { id: "saint", name: "Saint", team: "outsider", icon: "😇", ability: "If you are executed, your team loses.", night: "" },
  // Minions
  { id: "poisoner", name: "Poisoner", team: "minion", icon: "🧪", ability: "Each night: choose a player. Their ability malfunctions tonight and tomorrow.", night: "Player chooses someone to poison." },
  { id: "spy", name: "Spy", team: "minion", icon: "🕵️", ability: "Each night: look at the Grimoire. You might register as good, or as a Townsfolk or Outsider.", night: "Show the Grimoire for as long as needed." },
  { id: "scarlet_woman", name: "Scarlet Woman", team: "minion", icon: "💋", ability: "If five or more players are alive and the Demon dies, you become the Demon.", night: "If the Demon died today, wake and show them they are now the Imp." },
  { id: "baron", name: "Baron", team: "minion", icon: "🎖️", ability: "There are two extra Outsiders in play.", night: "" },
  // Demon
  { id: "imp", name: "Imp", team: "demon", icon: "😈", ability: "Each night after the first: choose a player to kill. If you choose yourself, a Minion becomes the Imp.", night: "Player chooses someone to kill." }
];

export const ROLE_MAP = Object.fromEntries(ROLES.map(r => [r.id, r]));
export const TEAMS = ["townsfolk", "outsider", "minion", "demon"];
export const TEAM_LABEL = { townsfolk: "Townsfolk", outsider: "Outsiders", minion: "Minions", demon: "Demon" };
export const isEvil = team => team === "minion" || team === "demon";

// [townsfolk, outsiders, minions, demons] by player count
const COUNTS = {
  5: [3, 0, 1, 1], 6: [3, 1, 1, 1], 7: [5, 0, 1, 1], 8: [5, 1, 1, 1], 9: [5, 2, 1, 1],
  10: [7, 0, 2, 1], 11: [7, 1, 2, 1], 12: [7, 2, 2, 1], 13: [9, 0, 3, 1], 14: [9, 1, 3, 1], 15: [9, 2, 3, 1]
};
export const teamCounts = n => COUNTS[Math.min(15, n)] || null;

export const FIRST_NIGHT = ["_minion", "_demon", "poisoner", "washerwoman", "librarian", "investigator", "chef", "empath", "fortune_teller", "butler", "spy"];
export const OTHER_NIGHT = ["poisoner", "monk", "scarlet_woman", "imp", "ravenkeeper", "empath", "fortune_teller", "undertaker", "butler", "spy"];

export const REMINDERS = ["Poisoned", "Drunk", "Protected", "Dead tonight", "Red herring", "Master", "Executed", "No ability", "Is the Demon", "Townsfolk", "Outsider", "Minion", "Wrong", "Used"];
