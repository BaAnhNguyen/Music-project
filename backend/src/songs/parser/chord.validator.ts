import { BadRequestException } from '@nestjs/common';

// --- INTERFACES ---
export interface ChordSegment {
  chord: string | null;
  lyrics: string;
}

export interface ChordLine {
  segments: ChordSegment[];
}

export interface ChordSection {
  type: string;
  name: string;
  lines: ChordLine[];
}

export interface SongAst {
  schemaVersion: number;
  meta: Record<string, string>;
  sections: ChordSection[];
}

export interface ParseError {
  line: number;
  message: string;
}

// --- EXCEPTION ---
export class ChordValidationException extends BadRequestException {
  constructor(public readonly errors: ParseError[]) {
    super({
      statusCode: 400,
      message: 'Validation failed',
      errors: errors,
    });
  }
}

// --- PARSER / VALIDATOR ---
const CHORD_REGEX = /^[A-G][#b]?(m|maj|min|dim|aug|sus2|sus4|add9)?(2|5|6|7|9|11|13)?(\/[A-G][#b]?)?$/;
const MAX_RAW_TEXT_SIZE = 50 * 1024; // 50KB
const MAX_LINES = 500;
const VALID_META_KEYS = ['title', 'artist', 'key', 'capo', 'bpm'];

export function parseSongText(rawText: string): SongAst {
  if (Buffer.byteLength(rawText, 'utf8') > MAX_RAW_TEXT_SIZE) {
    throw new ChordValidationException([{ line: 0, message: 'Kích thước văn bản vượt giới hạn 50KB.' }]);
  }

  const lines = rawText.split(/\r?\n/);
  if (lines.length > MAX_LINES) {
    throw new ChordValidationException([{ line: 0, message: 'Số dòng vượt quá giới hạn 500 dòng.' }]);
  }

  const errors: ParseError[] = [];
  const ast: SongAst = {
    schemaVersion: 1,
    meta: {},
    sections: [],
  };

  let currentSection: ChordSection | null = null;

  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const line = lines[i].trim();

    if (!line) continue;

    const metaMatch = line.match(/^\{(\w+)\s*:\s*(.+)\}$/);
    if (metaMatch) {
      const key = metaMatch[1].toLowerCase();
      const value = metaMatch[2].trim();
      if (!VALID_META_KEYS.includes(key)) {
        errors.push({ line: lineNo, message: `Key meta không hợp lệ: "${key}"` });
      } else {
        ast.meta[key] = value;
      }
      continue;
    }

    const sectionMatch = line.match(/^##\s*(.+)$/);
    if (sectionMatch) {
      const name = sectionMatch[1];
      const type = name.split(' ')[0].toLowerCase();
      currentSection = { type, name, lines: [] };
      ast.sections.push(currentSection);
      continue;
    }

    if (!currentSection) {
      currentSection = { type: 'untitled', name: 'Untitled', lines: [] };
      ast.sections.push(currentSection);
    }

    if (line.includes('[]')) {
      errors.push({ line: lineNo, message: "Ngoặc hợp âm rỗng '[]'." });
      continue;
    }

    const openBrackets = (line.match(/\[/g) || []).length;
    const closeBrackets = (line.match(/\]/g) || []).length;
    if (openBrackets !== closeBrackets) {
      errors.push({ line: lineNo, message: 'Ngoặc hợp âm không được đóng/mở đúng cách.' });
      continue;
    }

    const segments: ChordSegment[] = [];
    const chordSplitRegex = /\[([^\]]+)\]/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = chordSplitRegex.exec(line)) !== null) {
      if (match.index > lastIndex) {
        const textBefore = line.substring(lastIndex, match.index);
        if (segments.length === 0) {
          segments.push({ chord: null, lyrics: textBefore });
        } else {
          segments[segments.length - 1].lyrics += textBefore;
        }
      }

      const chord = match[1].trim();
      if (!CHORD_REGEX.test(chord)) {
        errors.push({ line: lineNo, message: `Hợp âm không hợp lệ: "${chord}"` });
      }

      segments.push({ chord, lyrics: '' });
      lastIndex = chordSplitRegex.lastIndex;
    }

    if (lastIndex < line.length) {
      const remainingText = line.substring(lastIndex);
      if (segments.length === 0) {
        segments.push({ chord: null, lyrics: remainingText });
      } else {
        segments[segments.length - 1].lyrics += remainingText;
      }
    }

    currentSection.lines.push({ segments });
  }

  if (errors.length > 0) {
    throw new ChordValidationException(errors);
  }

  return ast;
}