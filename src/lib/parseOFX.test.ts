import { describe, it, expect } from 'vitest';
import { parseOFX } from './parseOFX';

const SAMPLE_OFX = `OFXHEADER:100
DATA:OFXSGML

<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<BANKTRANLIST>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20261012120000[0:GMT]
<TRNAMT>-45.23
<FITID>20261012001
<NAME>KROGER #1234
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20261015000000[0:GMT]
<TRNAMT>500.00
<FITID>20261015001
<NAME>PAYROLL DEPOSIT
</STMTTRN>
</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>`;

describe('parseOFX', () => {
  it('parses single STMTTRN block correctly', () => {
    const content = '<STMTTRN>\n<DTPOSTED>20261012\n<TRNAMT>-45.23\n<NAME>KROGER #1234\n</STMTTRN>';
    const result = parseOFX(content);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      payee: 'KROGER #1234',
      amountCents: -4523,
      date: '2026-10-12',
      isCleared: true,
    });
  });

  it('parses multiple STMTTRN blocks', () => {
    const result = parseOFX(SAMPLE_OFX);
    expect(result).toHaveLength(2);
    expect(result[0]!.payee).toBe('KROGER #1234');
    expect(result[1]!.payee).toBe('PAYROLL DEPOSIT');
  });

  it('handles debit (negative TRNAMT → negative amountCents)', () => {
    const result = parseOFX(SAMPLE_OFX);
    expect(result[0]!.amountCents).toBe(-4523);
  });

  it('handles credit (positive TRNAMT → positive amountCents)', () => {
    const result = parseOFX(SAMPLE_OFX);
    expect(result[1]!.amountCents).toBe(50000);
  });

  it('falls back to MEMO when NAME is absent', () => {
    const content = '<STMTTRN>\n<DTPOSTED>20261012\n<TRNAMT>-10.00\n<MEMO>ATM WITHDRAWAL\n</STMTTRN>';
    const result = parseOFX(content);
    expect(result[0]!.payee).toBe('ATM WITHDRAWAL');
  });

  it('returns empty array for content with no STMTTRN blocks', () => {
    const result = parseOFX('<OFX><STMTRS></STMTRS></OFX>');
    expect(result).toEqual([]);
  });

  it('handles STMTTRN without closing tag (SGML style)', () => {
    const content = '<STMTTRN>\n<DTPOSTED>20261012\n<TRNAMT>-5.00\n<NAME>Store\n<STMTTRN>\n<DTPOSTED>20261013\n<TRNAMT>-6.00\n<NAME>Store2\n';
    const result = parseOFX(content);
    expect(result).toHaveLength(2);
  });

  it('handles STMTTRN with closing tag (XML style)', () => {
    const content = '<STMTTRN>\n<DTPOSTED>20261012\n<TRNAMT>-45.23\n<NAME>KROGER\n</STMTTRN>';
    const result = parseOFX(content);
    expect(result).toHaveLength(1);
  });

  it('converts DTPOSTED format "20261012120000[0:GMT]" → "2026-10-12"', () => {
    const content = '<STMTTRN>\n<DTPOSTED>20261012120000[0:GMT]\n<TRNAMT>-45.23\n<NAME>Store\n</STMTTRN>';
    const result = parseOFX(content);
    expect(result[0]!.date).toBe('2026-10-12');
  });

  it('skips transactions missing DTPOSTED', () => {
    const content = '<STMTTRN>\n<TRNAMT>-10.00\n<NAME>Store\n</STMTTRN>';
    const result = parseOFX(content);
    expect(result).toHaveLength(0);
  });

  it('skips transactions missing TRNAMT', () => {
    const content = '<STMTTRN>\n<DTPOSTED>20261012\n<NAME>Store\n</STMTTRN>';
    const result = parseOFX(content);
    expect(result).toHaveLength(0);
  });
});
