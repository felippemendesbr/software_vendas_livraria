import type { ConnectionPool } from 'mssql';

export type ProdutosSchema = {
  hasStatus: boolean;
  hasAtivo: boolean;
  hasPathImage: boolean;
};

let cached: ProdutosSchema | null = null;

/**
 * Colunas reais da tabela dbo.Produtos (cache em memória até reiniciar o processo).
 * Evita 500 quando o legado tem [Ativo] em vez de [Status], ou ainda não tem path_image.
 */
export async function getProdutosSchema(pool: ConnectionPool): Promise<ProdutosSchema> {
  if (cached) return cached;
  const r = await pool.request().query(`
    SELECT LOWER(c.COLUMN_NAME) AS col
    FROM INFORMATION_SCHEMA.COLUMNS c
    WHERE UPPER(c.TABLE_NAME) = 'PRODUTOS'
  `);
  const names = new Set<string>(
    (r.recordset || []).map((row: { col: string }) => String(row.col).toLowerCase())
  );
  cached = {
    hasStatus: names.has('status'),
    hasAtivo: names.has('ativo'),
    hasPathImage: names.has('path_image'),
  };
  return cached;
}

/** Após rodar scripts de migração sem reiniciar o Next (uso raro). */
export function clearProdutosSchemaCache(): void {
  cached = null;
}

export function sqlProductStatusSelect(schema: ProdutosSchema): string {
  if (schema.hasStatus) {
    return 'ISNULL([Status], 0) AS ProductStatus';
  }
  if (schema.hasAtivo) {
    return 'CAST(CASE WHEN ISNULL([Ativo], 1) = 1 THEN 1 ELSE 0 END AS INT) AS ProductStatus';
  }
  return 'CAST(1 AS INT) AS ProductStatus';
}

export function sqlPathImageSelect(schema: ProdutosSchema): string {
  if (schema.hasPathImage) {
    return "NULLIF(LTRIM(RTRIM([path_image])), '') AS pathImage";
  }
  return 'CAST(NULL AS NVARCHAR(500)) AS pathImage';
}

/** Filtro: produto disponível para venda (PDV). */
export function sqlActiveProductWhere(schema: ProdutosSchema): string {
  if (schema.hasStatus) {
    return 'ISNULL([Status], 0) = 1';
  }
  if (schema.hasAtivo) {
    return '(ISNULL([Ativo], 1) = 1)';
  }
  return '1 = 1';
}

/** Atualiza flag ativo/inativo conforme estoque > 0. */
export function sqlSyncActiveFromStock(schema: ProdutosSchema): string | null {
  if (schema.hasStatus) {
    return `UPDATE Produtos SET [Status] = CASE WHEN Estoque > 0 THEN 1 ELSE 0 END WHERE Id = @id`;
  }
  if (schema.hasAtivo) {
    return `UPDATE Produtos SET [Ativo] = CASE WHEN Estoque > 0 THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END WHERE Id = @id`;
  }
  return null;
}
