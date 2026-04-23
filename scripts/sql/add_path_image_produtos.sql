-- Coluna de caminho da foto do produto (URL relativa servida em /public).
IF NOT EXISTS (
  SELECT 1
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = 'dbo'
    AND TABLE_NAME = 'Produtos'
    AND COLUMN_NAME = 'path_image'
)
BEGIN
  ALTER TABLE dbo.Produtos ADD [path_image] NVARCHAR(500) NULL;
END
