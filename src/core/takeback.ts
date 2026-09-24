import type { GameModeId } from "./gameMode";

/**
 * How many plies an agreed takeback rewinds for the player asking.
 *
 * A takeback returns the board to the position BEFORE the requester's last
 * move. If it is the requester's turn, their opponent has already replied,
 * so both that reply and the requester's move come off (2). If it is the
 * opponent's turn, only the requester's own move comes off (1). Zero means
 * the requester has no move of their own to take back yet, and no takeback
 * may be asked for.
 *
 * Shared by the web client (to gate the button) and the relay (to decide
 * how far to rewind), so the two can never disagree about what "undo"
 * means in an online game.
 */
export function takebackPlyCount(ply: number, requester: "white" | "black"): number {
  const sideToMove: "white" | "black" = ply % 2 === 0 ? "white" : "black";
  const count = sideToMove === requester ? 2 : 1;
  return ply >= count ? count : 0;
}

/**
 * Live online modes whose games may take a move back by agreement.
 *
 * A takeback needs the opponent's consent, so on its own it threatens no
 * result: two players who would collude on a takeback could as easily
 * agree a result outright. Casual, ranked and league games are the two
 * players' own to rewind.
 *
 * A tournament game is not in the set, because the mode id alone cannot
 * answer for one: an event's terms are the organizer's, and the organizer
 * decides per event whether its games may be rewound. So "tournament" is
 * not excluded outright any more, it is simply not decided here. Ask
 * takebackAllowedForGame instead, which carries the event's flag.
 *
 * Shared by the web client (whether to offer the button) and the relay
 * (whether to relay the request), so the button never offers what the
 * relay would refuse. Correspondence games run under the casual mode id
 * but not on the relay; the client excludes them separately.
 */
const TAKEBACK_MODE_IDS: ReadonlySet<GameModeId> = new Set<GameModeId>([
  "online_unranked",
  "online_ranked",
  "alchemy_league",
]);

/**
 * Whether a game in this mode may take moves back by agreement. Takes the
 * mode as the loose string the relay receives from a host's game:start
 * payload; anything outside the set, including nothing at all, is a no.
 */
export function takebackAllowedInMode(modeId: string | undefined): boolean {
  return modeId !== undefined && TAKEBACK_MODE_IDS.has(modeId as GameModeId);
}

/**
 * Whether THIS game may take moves back: the mode, plus the event's own
 * answer when the mode cannot give one.
 *
 * Every mode in TAKEBACK_MODE_IDS is a yes regardless of the second field.
 * A tournament game is a yes only when the event it belongs to says so —
 * `tournaments.allowTakebacks`, where ABSENT MEANS ALLOWED, so a caller
 * that reads the row passes `row.allowTakebacks !== false` and a caller
 * that has not learned the event's answer yet passes nothing and gets a no.
 * That default is the safe one on both ends: the client hides a button the
 * relay might refuse, and the relay refuses a rewind it cannot sanction.
 */
export function takebackAllowedForGame(game: {
  modeId: string | undefined;
  tournamentAllowsTakebacks?: boolean;
}): boolean {
  if (takebackAllowedInMode(game.modeId)) return true;
  return game.modeId === "tournament" && game.tournamentAllowsTakebacks === true;
}
