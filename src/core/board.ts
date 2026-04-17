const FILES = "abcdefgh";

export type PieceColor = "white" | "black";

export function indexToSquareName(index: number): string {
  if (!Number.isInteger(index) || index < 0 || index > 63) {
    throw new Error(`Invalid square index: ${index}`);
  }
  const file = FILES[index % 8];
  const rank = Math.floor(index / 8) + 1;
  return `${file}${rank}`;
}

export function squareNameToIndex(square: string): number {
  if (!/^[a-h][1-8]$/.test(square)) {
    throw new Error(`Invalid square: ${square}`);
  }
  const file = FILES.indexOf(square[0]);
  const rank = Number(square[1]) - 1;
  return rank * 8 + file;
}

export function getFile(index: number): number {
  return index % 8;
}

export function getRank(index: number): number {
  return Math.floor(index / 8);
}

export function isOnBoard(index: number): boolean {
  return index >= 0 && index < 64;
}

export function isWhitePiece(piece: string): boolean {
  return piece >= "A" && piece <= "Z";
}

export function isBlackPiece(piece: string): boolean {
  return piece >= "a" && piece <= "z";
}

export function getPieceColor(piece: string): PieceColor | null {
  if (isWhitePiece(piece)) {
    return "white";
  }
  if (isBlackPiece(piece)) {
    return "black";
  }
  return null;
}

export function isEnemyPiece(piece: string, color: PieceColor): boolean {
  return color === "white" ? isBlackPiece(piece) : isWhitePiece(piece);
}
