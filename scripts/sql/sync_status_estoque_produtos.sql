-- Sincroniza [Status] com a regra de negócio: 1 = ativo (Estoque > 0), 0 = inativo.
-- Execute uma vez no banco da livraria (e novamente após cargas manuais fora do sistema, se necessário).

UPDATE dbo.Produtos
SET [Status] = CASE WHEN Estoque > 0 THEN 1 ELSE 0 END;
