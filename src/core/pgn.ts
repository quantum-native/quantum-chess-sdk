/**
 * pgn.ts — Quantum PGN (Portable Game Notation) serialization and parsing.
 *
 * Extends standard PGN format with quantum chess extensions:
 *   - Custom headers for quantum rule configuration
 *   - Split notation: source^target1target2 (e.g. b1^a3c3)
 *   - Merge notation: source1source2^target (e.g. a3c3^b5)
 *   - Measurement annotations: .m0 / .m1
 *   - Blocked-move comments: {blocked}
 */

import { formatMoveString, parseMoveString } from "./move";
import { fenToGameData } from "./state";
import type { QChessGameData, QChessMove } from "./types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PgnResult = "1-0" | "0-1" | "1/2-1/2" | "*";

export interface PgnHeaders {
  Event: string;
  Site: string;
  Date: string;
  Round: string;
  White: string;
  Black: string;
  Result: PgnResult;
  [key: string]: string;
}

export interface PgnMoveEntry {
  moveString: string;
  notation: string;
  ply: number;
  comment?: string;
}

export interface PgnGame {
  headers: PgnHeaders;
  moves: PgnMoveEntry[];
}

// ---------------------------------------------------------------------------
// Default header values
// ---------------------------------------------------------------------------

function defaultHeaders(): PgnHeaders {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return {
    Event: "Quantum Chess Game",
    Site: "quantumchess.net",
    Date: `${yyyy}.${mm}.${dd}`,
    Round: "-",
    White: "?",
    Black: "?",
    Result: "*"
  };
}

// ---------------------------------------------------------------------------
// Export (serialize)
// ---------------------------------------------------------------------------

export interface PgnExportOptions {
  headers?: Partial<PgnHeaders>;
  moves: PgnMoveEntry[];
  result?: PgnResult;
  /** Include quantum-specific headers. Defaults to true. */
  quantumHeaders?: boolean;
  /** Starting FEN (omitted if standard start position). */
  fen?: string;
}

function escapeHeaderValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function formatHeaderLine(tag: string, value: string): string {
  return `[${tag} "${escapeHeaderValue(value)}"]`;
}

export function exportPgn(options: PgnExportOptions): string {
  const merged = { ...defaultHeaders(), ...options.headers };
  // Strip undefined values so the index signature stays string→string
  const headers: PgnHeaders = Object.fromEntries(
    Object.entries(merged).filter(([, v]) => v !== undefined)
  ) as PgnHeaders;
  if (options.result) {
    headers.Result = options.result;
  }

  const lines: string[] = [];

  // Standard seven-tag roster (always in this order per PGN spec)
  const sevenTags = ["Event", "Site", "Date", "Round", "White", "Black", "Result"];
  for (const tag of sevenTags) {
    lines.push(formatHeaderLine(tag, headers[tag]));
  }

  // FEN / SetUp headers
  if (options.fen) {
    lines.push(formatHeaderLine("SetUp", "1"));
    lines.push(formatHeaderLine("FEN", options.fen));
  }

  // Quantum-specific headers
  if (options.quantumHeaders !== false) {
    lines.push(formatHeaderLine("Variant", "Quantum"));
  }

  // Any additional custom headers (skip already-written ones)
  const writtenTags = new Set([...sevenTags, "SetUp", "FEN", "Variant"]);
  for (const [tag, value] of Object.entries(headers)) {
    if (!writtenTags.has(tag)) {
      lines.push(formatHeaderLine(tag, value));
    }
  }

  // Blank line between headers and movetext
  lines.push("");

  // Movetext
  const moveTokens: string[] = [];
  for (const entry of options.moves) {
    const moveNum = Math.floor(entry.ply / 2) + 1;
    const isWhite = entry.ply % 2 === 0;

    if (isWhite) {
      moveTokens.push(`${moveNum}.`);
    } else if (moveTokens.length === 0) {
      // Black moves first (continuation) — use "1..." style
      moveTokens.push(`${moveNum}...`);
    }

    moveTokens.push(entry.notation);

    if (entry.comment) {
      moveTokens.push(`{${entry.comment}}`);
    }
  }

  // Append result
  moveTokens.push(headers.Result);

  // Wrap movetext at ~80 columns
  let currentLine = "";
  const movetextLines: string[] = [];
  for (const token of moveTokens) {
    if (currentLine.length === 0) {
      currentLine = token;
    } else if (currentLine.length + 1 + token.length > 80) {
      movetextLines.push(currentLine);
      currentLine = token;
    } else {
      currentLine += " " + token;
    }
  }
  if (currentLine) {
    movetextLines.push(currentLine);
  }

  lines.push(...movetextLines);
  lines.push("");

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Convenience: export from MoveRecord-like arrays
// ---------------------------------------------------------------------------

export interface MoveRecordLike {
  moveString: string;
  notation: string;
  ply: number;
  wasBlocked?: boolean;
  wasMeasurement?: boolean;
}

export function moveRecordsToPgnEntries(records: MoveRecordLike[]): PgnMoveEntry[] {
  return records.map((r) => {
    const comment = r.wasBlocked ? "blocked" : undefined;
    return {
      moveString: r.moveString,
      notation: r.notation,
      ply: r.ply,
      comment
    };
  });
}

// ---------------------------------------------------------------------------
// Import (parse)
// ---------------------------------------------------------------------------

function unescapeHeaderValue(value: string): string {
  return value.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
}

const HEADER_REGEX = /^\[(\w+)\s+"(.*)"\]\s*$/;
const MOVE_NUMBER_REGEX = /^(\d+)(\.{1,3})$/;
const COMMENT_REGEX = /\{([^}]*)\}/g;

export function parsePgn(pgn: string): PgnGame | null {
  const text = pgn.trim();
  if (!text) return null;

  const headers: PgnHeaders = { ...defaultHeaders() };
  const moves: PgnMoveEntry[] = [];

  const lines = text.split(/\r?\n/);
  let i = 0;

  // Parse headers
  while (i < lines.length) {
    const line = lines[i].trim();
    if (line === "") {
      i++;
      // Skip blank lines; if we already parsed headers, move to movetext
      if (Object.keys(headers).length > 7 || i > 1) break;
      continue;
    }
    const headerMatch = HEADER_REGEX.exec(line);
    if (headerMatch) {
      headers[headerMatch[1]] = unescapeHeaderValue(headerMatch[2]);
      i++;
    } else {
      break;
    }
  }

  // Collect remaining lines as movetext
  const movetextRaw = lines.slice(i).join(" ");

  // Extract comments and replace with placeholders
  const comments: string[] = [];
  const movetextNoComments = movetextRaw.replace(COMMENT_REGEX, (_match, content) => {
    comments.push(content.trim());
    return ` __COMMENT_${comments.length - 1}__ `;
  });

  // Tokenize
  const tokens = movetextNoComments.split(/\s+/).filter((t) => t.length > 0);

  let currentPly = 0;

  // If there's a FEN header, figure out the starting ply
  if (headers.FEN) {
    const fenData = fenToGameData(headers.FEN);
    if (fenData) {
      currentPly = fenData.board.ply;
    }
  }

  for (const token of tokens) {
    // Skip result tokens
    if (token === "1-0" || token === "0-1" || token === "1/2-1/2" || token === "*") {
      continue;
    }

    // Comment placeholder
    const commentPlaceholder = /^__COMMENT_(\d+)__$/.exec(token);
    if (commentPlaceholder) {
      const commentIdx = Number(commentPlaceholder[1]);
      // Attach to previous move
      if (moves.length > 0 && comments[commentIdx] !== undefined) {
        moves[moves.length - 1].comment = comments[commentIdx];
      }
      continue;
    }

    // Move number (e.g. "1." or "1...")
    const moveNumMatch = MOVE_NUMBER_REGEX.exec(token);
    if (moveNumMatch) {
      const num = Number(moveNumMatch[1]);
      const dots = moveNumMatch[2];
      if (dots === "...") {
        // Black's move — set ply to the black ply for this move number
        currentPly = (num - 1) * 2 + 1;
      } else {
        // White's move
        currentPly = (num - 1) * 2;
      }
      continue;
    }

    // It's a move notation
    const notation = token;
    const parsed = parseMoveString(notation);
    const moveString = parsed ? formatMoveString(parsed) : notation;

    moves.push({
      moveString,
      notation,
      ply: currentPly
    });
    currentPly++;
  }

  return { headers, moves };
}

// ---------------------------------------------------------------------------
// Round-trip helpers
// ---------------------------------------------------------------------------

/**
 * Parse a PGN string and extract just the move strings (useful for replay).
 */
export function pgnToMoveStrings(pgn: string): string[] {
  const game = parsePgn(pgn);
  if (!game) return [];
  return game.moves.map((m) => m.moveString);
}

/**
 * Build a PGN string from game state and move records.
 */
export function buildPgn(options: {
  white?: string;
  black?: string;
  result?: PgnResult;
  moves: MoveRecordLike[];
  fen?: string;
  event?: string;
  site?: string;
  date?: string;
  round?: string;
  extraHeaders?: Record<string, string>;
}): string {
  const headers: Partial<PgnHeaders> = {};
  if (options.white) headers.White = options.white;
  if (options.black) headers.Black = options.black;
  if (options.event) headers.Event = options.event;
  if (options.site) headers.Site = options.site;
  if (options.date) headers.Date = options.date;
  if (options.round) headers.Round = options.round;
  if (options.extraHeaders) {
    Object.assign(headers, options.extraHeaders);
  }

  return exportPgn({
    headers,
    moves: moveRecordsToPgnEntries(options.moves),
    result: options.result,
    fen: options.fen
  });
}
