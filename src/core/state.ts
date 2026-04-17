import { BOARD_SQUARES, type QChessGameData, type QChessBoardState, type QChessPosition } from "./types";

const STARTING_RANKS = "RNBQKBNRPPPPPPPP................................pppppppprnbqkbnr";

/** The standard classical starting position FEN. */
export const CLASSICAL_START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export function createEmptyGameData(): QChessGameData {
  return {
    position: {
      startingFen: "8/8/8/8/8/8/8/8 w - - 0 1",
      history: []
    },
    board: {
      pieces: Array.from({ length: BOARD_SQUARES }, () => "."),
      probabilities: Array.from({ length: BOARD_SQUARES }, () => 0),
      ply: 0,
      fiftyCount: 0,
      fiftyPieceCount: 0,
      castleFlags: 0,
      enPassantSquare: -1
    }
  };
}

export function createClassicalStartGameData(): QChessGameData {
  const pieces = STARTING_RANKS.split("");
  return {
    position: {
      startingFen: CLASSICAL_START_FEN,
      history: []
    },
    board: {
      pieces,
      probabilities: pieces.map((piece) => (piece === "." ? 0 : 1)),
      ply: 0,
      fiftyCount: 0,
      fiftyPieceCount: 32,
      castleFlags: 15,
      enPassantSquare: -1
    }
  };
}

export function cloneGameData(gameData: QChessGameData): QChessGameData {
  return {
    position: {
      startingFen: gameData.position.startingFen,
      ...(gameData.position.setupMoves ? { setupMoves: [...gameData.position.setupMoves] } : {}),
      history: [...gameData.position.history]
    },
    board: {
      pieces: [...gameData.board.pieces],
      probabilities: [...gameData.board.probabilities],
      ply: gameData.board.ply,
      fiftyCount: gameData.board.fiftyCount,
      fiftyPieceCount: gameData.board.fiftyPieceCount,
      castleFlags: gameData.board.castleFlags,
      enPassantSquare: gameData.board.enPassantSquare
    }
  };
}

const FEN_PIECE_CHARS = "KQRBNPkqrbnp";

/**
 * Convert a classical board state to a FEN string.
 * ONLY valid for positions where all pieces have probability 0 or 1 (no quantum state).
 * Use this for: sandbox editing phase, PGN starting position headers.
 */
export function classicalBoardToFen(board: QChessBoardState): string {
  const rows: string[] = [];
  for (let rank = 7; rank >= 0; rank--) {
    let row = "";
    let empty = 0;
    for (let file = 0; file < 8; file++) {
      const idx = rank * 8 + file;
      const piece = board.pieces[idx];
      if (piece === "." || !FEN_PIECE_CHARS.includes(piece)) {
        empty++;
      } else {
        if (empty > 0) { row += empty; empty = 0; }
        row += piece;
      }
    }
    if (empty > 0) row += empty;
    rows.push(row);
  }

  const activeColor = board.ply % 2 === 0 ? "w" : "b";

  let castling = "";
  if (board.castleFlags & 1) castling += "K";
  if (board.castleFlags & 2) castling += "Q";
  if (board.castleFlags & 4) castling += "k";
  if (board.castleFlags & 8) castling += "q";
  if (!castling) castling = "-";

  let ep = "-";
  if (board.enPassantSquare >= 0 && board.enPassantSquare < 64) {
    const file = String.fromCharCode(97 + (board.enPassantSquare % 8));
    const rank = Math.floor(board.enPassantSquare / 8) + 1;
    ep = `${file}${rank}`;
  }

  const halfmove = board.fiftyCount;
  const fullmove = Math.floor(board.ply / 2) + 1;

  return `${rows.join("/")} ${activeColor} ${castling} ${ep} ${halfmove} ${fullmove}`;
}

/**
 * Build the full position string from game data.
 * Format: "position fen <startingFen> moves <m1> <m2> ..."
 */
export function gameDataToPositionString(gameData: QChessGameData): string {
  const { startingFen, setupMoves, history } = gameData.position;
  const parts = [`position fen ${startingFen}`];
  if (setupMoves?.length) {
    parts.push(`setup ${setupMoves.join(" ")}`);
  }
  if (history.length > 0) {
    parts.push(`moves ${history.join(" ")}`);
  }
  return parts.join(" ");
}

export function fenToGameData(fen: string): QChessGameData | null {
  const parts = fen.trim().split(/\s+/);
  if (parts.length < 1) return null;

  const ranks = parts[0].split("/");
  if (ranks.length !== 8) return null;

  const pieces: string[] = new Array(BOARD_SQUARES).fill(".");
  const probabilities: number[] = new Array(BOARD_SQUARES).fill(0);

  for (let r = 0; r < 8; r++) {
    const rank = 7 - r;
    let file = 0;
    for (const ch of ranks[r]) {
      if (ch >= "1" && ch <= "8") {
        file += Number(ch);
      } else if (FEN_PIECE_CHARS.includes(ch)) {
        if (file >= 8) return null;
        const idx = rank * 8 + file;
        pieces[idx] = ch;
        probabilities[idx] = 1;
        file++;
      } else {
        return null;
      }
    }
    if (file !== 8) return null;
  }

  const activeColor = parts[1] ?? "w";

  let castleFlags = 0;
  const castling = parts[2] ?? "-";
  if (castling.includes("K")) castleFlags |= 1;
  if (castling.includes("Q")) castleFlags |= 2;
  if (castling.includes("k")) castleFlags |= 4;
  if (castling.includes("q")) castleFlags |= 8;

  let enPassantSquare = -1;
  const ep = parts[3] ?? "-";
  if (ep !== "-" && ep.length === 2) {
    const epFile = ep.charCodeAt(0) - 97;
    const epRank = Number(ep[1]) - 1;
    if (epFile >= 0 && epFile < 8 && epRank >= 0 && epRank < 8) {
      enPassantSquare = epRank * 8 + epFile;
    }
  }

  const fiftyCount = Number(parts[4]) || 0;
  const fullmove = Number(parts[5]) || 1;
  const computedPly = (fullmove - 1) * 2 + (activeColor === "b" ? 1 : 0);

  let fiftyPieceCount = 0;
  for (let i = 0; i < BOARD_SQUARES; i++) fiftyPieceCount += probabilities[i];

  return {
    position: {
      startingFen: fen.trim(),
      history: []
    },
    board: {
      pieces,
      probabilities,
      ply: computedPly,
      fiftyCount,
      fiftyPieceCount,
      castleFlags,
      enPassantSquare
    }
  };
}
