export interface EnvEntry {
  key: string;
  value: string;
  line?: number;
}

export interface EnvParseResult {
  entries: EnvEntry[];
  errors: string[];
  warnings: string[];
  duplicateKeys: string[];
}

const KEY_REGEX = /^[A-Za-z_][A-Za-z0-9_]*$/;
const CRITICAL_KEY_PATTERNS = [
  /^JWT_SECRET$/i,
  /SECRET$/i,
  /TOKEN$/i,
  /PASSWORD$/i,
  /API_KEY$/i,
  /PRIVATE_KEY$/i,
];

const stripBom = (text: string) => text.replace(/^\uFEFF/, '');

const isCriticalKey = (key: string) =>
  CRITICAL_KEY_PATTERNS.some((pattern) => pattern.test(key));

const unescapeDoubleQuoted = (value: string) =>
  value
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');

const escapeDoubleQuoted = (value: string) =>
  value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');

const stripInlineComment = (value: string) => {
  const match = value.match(/\s[#;]/);
  if (!match || match.index === undefined) {
    return value;
  }
  return value.slice(0, match.index).trimEnd();
};

const parseQuotedValue = (value: string, quote: '"' | "'") => {
  let escaped = false;
  let output = '';
  for (let i = 1; i < value.length; i += 1) {
    const ch = value[i];
    if (!escaped && ch === quote) {
      return { value: quote === '"' ? unescapeDoubleQuoted(output) : output, rest: value.slice(i + 1) };
    }
    if (quote === '"' && !escaped && ch === '\\') {
      escaped = true;
      continue;
    }
    if (escaped) {
      output += `\\${ch}`;
      escaped = false;
      continue;
    }
    output += ch;
  }
  return { value: output, rest: '', error: 'missing closing quote' };
};

export function parseEnvContent(content: string): EnvParseResult {
  const lines = stripBom(content).split(/\r?\n/);
  const entries: EnvEntry[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  lines.forEach((rawLine, index) => {
    const lineNumber = index + 1;
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) {
      return;
    }

    const normalized = trimmed.startsWith('export ')
      ? trimmed.slice('export '.length).trim()
      : trimmed;

    const separatorIndex = normalized.indexOf('=');
    if (separatorIndex === -1) {
      errors.push(`Line ${lineNumber}: missing '=' separator`);
      return;
    }

    const rawKey = normalized.slice(0, separatorIndex).trim();
    const rawValue = normalized.slice(separatorIndex + 1).trimStart();
    if (!rawKey) {
      errors.push(`Line ${lineNumber}: empty key is not allowed`);
      return;
    }
    if (!KEY_REGEX.test(rawKey)) {
      errors.push(`Line ${lineNumber}: invalid key '${rawKey}'`);
    }

    let parsedValue = '';
    if (rawValue.startsWith('"') || rawValue.startsWith("'")) {
      const quote = rawValue[0] as '"' | "'";
      const parsed = parseQuotedValue(rawValue, quote);
      parsedValue = parsed.value;
      if (parsed.error) {
        errors.push(`Line ${lineNumber}: ${parsed.error}`);
      }
      const remainder = parsed.rest.trim();
      if (remainder && !remainder.startsWith('#') && !remainder.startsWith(';')) {
        warnings.push(`Line ${lineNumber}: trailing characters after quoted value were ignored`);
      }
    } else {
      parsedValue = stripInlineComment(rawValue).trim();
    }

    if (seen.has(rawKey)) {
      duplicates.add(rawKey);
    }
    seen.add(rawKey);

    entries.push({ key: rawKey, value: parsedValue, line: lineNumber });
  });

  if (duplicates.size > 0) {
    errors.push(`Duplicate keys found: ${Array.from(duplicates).join(', ')}`);
  }

  entries.forEach((entry) => {
    if (!entry.value && isCriticalKey(entry.key)) {
      errors.push(`Critical variable '${entry.key}' is empty`);
    }
  });

  return {
    entries,
    errors,
    warnings,
    duplicateKeys: Array.from(duplicates),
  };
}

export function validateEnvEntries(entries: EnvEntry[]): EnvParseResult {
  const sanitized = entries.map((entry, index) => ({
    key: entry.key.trim(),
    value: entry.value ?? '',
    line: entry.line ?? index + 1,
  }));

  const errors: string[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  sanitized.forEach((entry) => {
    if (!entry.key) {
      errors.push(`Line ${entry.line}: empty key is not allowed`);
      return;
    }
    if (!KEY_REGEX.test(entry.key)) {
      errors.push(`Line ${entry.line}: invalid key '${entry.key}'`);
    }
    if (seen.has(entry.key)) {
      duplicates.add(entry.key);
    }
    seen.add(entry.key);
    if (!entry.value && isCriticalKey(entry.key)) {
      errors.push(`Critical variable '${entry.key}' is empty`);
    }
  });

  if (duplicates.size > 0) {
    errors.push(`Duplicate keys found: ${Array.from(duplicates).join(', ')}`);
  }

  return {
    entries: sanitized,
    errors,
    warnings,
    duplicateKeys: Array.from(duplicates),
  };
}

export function serializeEnvEntries(entries: EnvEntry[]): string {
  return entries
    .filter((entry) => entry.key.trim().length > 0)
    .map((entry) => {
      const key = entry.key.trim();
      const rawValue = entry.value ?? '';
      const needsQuotes =
        rawValue === '' ||
        /^\s|\s$/.test(rawValue) ||
        /[\s#;'"=]/.test(rawValue) ||
        rawValue.includes('\n') ||
        rawValue.includes('\r') ||
        rawValue.includes('\t');

      const value = needsQuotes
        ? `"${escapeDoubleQuoted(rawValue)}"`
        : rawValue;
      return `${key}=${value}`;
    })
    .join('\n');
}

export function mergeEnvEntries(current: EnvEntry[], incoming: EnvEntry[]): EnvEntry[] {
  const order: string[] = [];
  const map = new Map<string, EnvEntry>();

  current.forEach((entry) => {
    const key = entry.key.trim();
    if (!key) {
      return;
    }
    if (!order.includes(key)) {
      order.push(key);
    }
    map.set(key, { ...entry, key });
  });

  incoming.forEach((entry) => {
    const key = entry.key.trim();
    if (!key) {
      return;
    }
    if (!order.includes(key)) {
      order.push(key);
    }
    map.set(key, { ...entry, key });
  });

  return order.map((key) => map.get(key)!).filter(Boolean);
}

export function entriesToRecord(entries: EnvEntry[]): Record<string, string> {
  return entries.reduce((acc, entry) => {
    if (entry.key) {
      acc[entry.key] = entry.value ?? '';
    }
    return acc;
  }, {} as Record<string, string>);
}

export function recordToEnvEntries(record: Record<string, string>): EnvEntry[] {
  return Object.entries(record).map(([key, value], index) => ({
    key,
    value: value ?? '',
    line: index + 1,
  }));
}