-- Opcional: adiciona colunas usadas pelo painel de produtos (imagem por URL e estado).
-- Execute no mesmo database configurado em LEGACY_DB_NAME.

IF COL_LENGTH('dbo.Produtos', 'ImagemUrl') IS NULL
BEGIN
  ALTER TABLE dbo.Produtos ADD ImagemUrl NVARCHAR(2000) NULL;
END
GO

IF COL_LENGTH('dbo.Produtos', 'Estado') IS NULL
BEGIN
  ALTER TABLE dbo.Produtos ADD Estado NVARCHAR(100) NULL;
  UPDATE dbo.Produtos SET Estado = N'Ativo' WHERE Estado IS NULL;
END
GO
