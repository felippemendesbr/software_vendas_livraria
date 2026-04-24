-- Adiciona coluna Ativo na tabela Produtos (para inativar itens sem excluir).
-- Execute uma vez no banco legado.
IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME = 'Produtos' AND COLUMN_NAME = 'Ativo'
)
BEGIN
  ALTER TABLE Produtos ADD Ativo BIT NOT NULL DEFAULT 1;
END
GO
