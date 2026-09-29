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
