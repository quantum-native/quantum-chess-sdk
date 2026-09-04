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
