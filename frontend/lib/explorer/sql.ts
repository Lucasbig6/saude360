const IDENTIFIER_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/

export function isValidIdentifier(name: string): boolean {
  return IDENTIFIER_PATTERN.test(name)
}

export function quoteIdentifier(name: string): string {
  return `"${name.replace(/"/g, '""')}"`
}

export function generatePreviewSql(tableName: string): string {
  if (!tableName.trim()) {
    throw new Error("Nome de tabela vazio.")
  }
  return `SELECT *\nFROM ${quoteIdentifier(tableName)}\nLIMIT 100`
}

// O backend (validar_sql) só aceita consulta iniciada por SELECT/WITH, então a
// detecção de intenção espelha essa regra: qualquer outra entrada é tratada
// como linguagem natural.
const SQL_INTENT_PATTERN = /^\s*(select|with)\b/i

export function looksLikeSql(text: string): boolean {
  return SQL_INTENT_PATTERN.test(text)
}
