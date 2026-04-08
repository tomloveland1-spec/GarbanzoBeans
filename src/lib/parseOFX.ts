import type { CreateTransactionInput } from './types';

function ofxField(block: string, tag: string): string | null {
  // Use a case-insensitive regex on the original string to avoid UTF-16 index
  // skew that occurs when toUpperCase() expands multi-byte characters.
  const re = new RegExp(`<${tag}>([^<\\n\\r]*)`, 'i');
  const match = re.exec(block);
  return match ? match[1]!.trim() || null : null;
}

function ofxDateToIso(dtposted: string): string | null {
  const d = dtposted.slice(0, 8);
  if (!/^\d{8}$/.test(d)) return null;
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}

function ofxAmountToCents(amount: string): number | null {
  const trimmed = amount.trim();
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return null;
  const negative = trimmed.startsWith('-');
  const abs = negative ? trimmed.slice(1) : trimmed;
  const [intStr = '0', fracStr = ''] = abs.split('.');
  const intCents = parseInt(intStr, 10) * 100;
  const fracCents = parseInt(fracStr.slice(0, 2).padEnd(2, '0'), 10);
  const result = intCents + fracCents;
  return negative ? -result : result;
}

export function parseOFX(content: string): CreateTransactionInput[] {
  const results: CreateTransactionInput[] = [];
  const upperContent = content.toUpperCase();
  let searchFrom = 0;

  while (true) {
    const relStart = upperContent.indexOf('<STMTTRN>', searchFrom);
    if (relStart === -1) break;
    const blockStart = relStart + '<STMTTRN>'.length;
    const upperRest = upperContent.slice(blockStart);
    const contentRest = content.slice(blockStart);

    const closeAt = upperRest.indexOf('</STMTTRN>');
    const nextOpen = upperRest.indexOf('<STMTTRN>');
    const blockEnd = Math.min(
      closeAt === -1 ? Infinity : closeAt,
      nextOpen === -1 ? Infinity : nextOpen,
    );

    const block = blockEnd === Infinity ? contentRest : contentRest.slice(0, blockEnd);
    const payee = ofxField(block, 'NAME') ?? ofxField(block, 'MEMO') ?? '';
    const dtposted = ofxField(block, 'DTPOSTED');
    const trnamt = ofxField(block, 'TRNAMT');
    const date = dtposted ? ofxDateToIso(dtposted) : null;
    const amountCents = trnamt ? ofxAmountToCents(trnamt) : null;

    if (date !== null && amountCents !== null) {
      results.push({ payee, amountCents, date, isCleared: true });
    }

    if (blockEnd === Infinity) break;
    searchFrom = blockStart + blockEnd + (closeAt !== -1 && closeAt < (nextOpen === -1 ? Infinity : nextOpen) ? '</STMTTRN>'.length : 0);
  }

  return results;
}
