'use client';

import { useState, useEffect, useRef, KeyboardEvent } from 'react';
import { Product } from '@/lib/api';

interface SearchBoxProps {
  onSelectProduct: (product: Product) => void;
  onFocus?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
}

export default function SearchBox({ onSelectProduct, onFocus, placeholder, autoFocus = true }: SearchBoxProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Product[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout>();

  // Autofocus (opcional) e suporte a F2
  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    if (autoFocus) inputRef.current?.focus();

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [autoFocus]);

  // Busca com debounce (autocomplete)
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    const trimmedQuery = query.trim();

    // Se query estiver vazia (após trim), limpar resultados mas manter o foco
    if (trimmedQuery.length === 0) {
      setResults([]);
      setSelectedIndex(-1);
      return;
    }

    // Se query tiver menos de 2 caracteres (após trim), não buscar ainda
    // Mas manter a query visível no input para não perder a referência
    if (trimmedQuery.length < 2) {
      // Não limpar resultados imediatamente - manter os últimos resultados visíveis
      // Isso evita que o usuário perca a referência ao digitar
      return;
    }

    // Buscar com a query (trim apenas para a busca, mas manter o valor original no input)
    setIsLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const { fetchProducts } = await import('@/lib/api');
        // Passar a query com trim apenas para a busca
        const products = await fetchProducts(trimmedQuery);
        setResults(products);
        setSelectedIndex(-1);
      } catch (error) {
        console.error('Erro ao buscar produtos:', error);
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    }, 150); // Debounce reduzido para resposta mais rápida

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query]);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) =>
        prev < results.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0 && results[selectedIndex]) {
        handleSelectProduct(results[selectedIndex]);
      } else if (results.length > 0) {
        handleSelectProduct(results[0]);
      }
    } else if (e.key === 'Escape') {
      setQuery('');
      setResults([]);
      setSelectedIndex(-1);
      // Manter o foco no input mesmo após limpar
      inputRef.current?.focus();
    }
    // Não fazer nada especial para espaços - deixar o comportamento padrão
  };

  const handleSelectProduct = (product: Product) => {
    onSelectProduct(product);
    setQuery('');
    setResults([]);
    setSelectedIndex(-1);
    // Foco volta ao campo de busca após adicionar
    setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
  };

  // Função para normalizar texto removendo acentos (para comparação semântica)
  const normalizeText = (text: string): string => {
    return text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove diacríticos (acentos)
      .toLowerCase();
  };

  // Função para destacar o texto pesquisado no resultado (autocomplete)
  // Case-insensitive e accent-insensitive - destaca independente de maiúsculas/minúsculas e acentos
  const highlightText = (text: string, search: string) => {
    if (!search.trim()) return text;

    const normalizedText = normalizeText(text);
    const normalizedSearch = normalizeText(search);

    // Encontrar todas as ocorrências no texto normalizado
    const matches: Array<{ start: number; end: number }> = [];
    let startIndex = 0;

    while ((startIndex = normalizedText.indexOf(normalizedSearch, startIndex)) !== -1) {
      const endIndex = startIndex + normalizedSearch.length;
      matches.push({ start: startIndex, end: endIndex });
      startIndex += normalizedSearch.length;
    }

    if (matches.length === 0) return text;

    // Construir array de partes (texto normal + destacado)
    // Como a normalização pode mudar o tamanho (ex: "ã" vira "a"), 
    // vamos usar uma abordagem mais simples: destacar baseado na posição aproximada
    const parts: Array<{ text: string; highlight: boolean }> = [];
    let lastIndex = 0;

    // Para cada match, encontrar a posição aproximada no texto original
    matches.forEach((match) => {
      // Aproximação: usar os mesmos índices (pode não ser 100% preciso com acentos,
      // mas funciona na maioria dos casos e é mais simples)
      const originalStart = Math.min(match.start, text.length);
      const originalEnd = Math.min(match.end, text.length);

      // Adicionar texto antes do match
      if (originalStart > lastIndex) {
        parts.push({
          text: text.substring(lastIndex, originalStart),
          highlight: false,
        });
      }

      // Adicionar texto do match (destacado)
      if (originalEnd > originalStart) {
        parts.push({
          text: text.substring(originalStart, originalEnd),
          highlight: true,
        });
      }

      lastIndex = originalEnd;
    });

    // Adicionar texto restante
    if (lastIndex < text.length) {
      parts.push({
        text: text.substring(lastIndex),
        highlight: false,
      });
    }

    return (
      <>
        {parts.map((part, index) =>
          part.highlight ? (
            <mark key={index} className="bg-yellow-200 font-semibold">
              {part.text}
            </mark>
          ) : (
            <span key={index}>{part.text}</span>
          )
        )}
      </>
    );
  };

  return (
    <div className="relative w-full">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            // Manter o valor exatamente como digitado (incluindo espaços)
            setQuery(e.target.value);
          }}
          onKeyDown={handleKeyDown}
          onFocus={(e) => {
            // Garantir que o foco seja mantido
            e.target.select?.();
            onFocus?.();
          }}
          onBlur={(e) => {
            // Pequeno delay para permitir cliques nos resultados antes de perder foco
            setTimeout(() => {
              // Só perder foco se não houver resultados ou se não estiver clicando nos resultados
              if (results.length === 0) {
                // Permitir perder foco apenas se não houver resultados
              }
            }, 200);
          }}
          placeholder={placeholder ?? 'Digite o nome ou ID do produto (F2 para focar)'}
          className="
          w-full
          px-4 py-3
          text-base
          border border-[#E6E1CF]
          rounded-xl
          bg-gray-50
          text-[#1F1312]
          placeholder:text-[#7A6F6A]
          focus:border-[#f7f2e3]
          focus:outline-none
          focus:ring-2
          focus:ring-[#f7f2e3]
          transition"
          autoComplete="off"
          autoFocus={autoFocus}
          aria-label="Buscar produto"
          aria-autocomplete="list"
          aria-expanded={results.length > 0}
          aria-controls="product-results"
        />
        {isLoading && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2">
            <div className="animate-spin rounded-full h-5 w-5 border-2 border-[#1F1312] border-t-transparent"></div>
          </div>
        )}
      </div>

      {results.length > 0 && (
        <div
          id="product-results"
          className="absolute z-10 w-full mt-2 bg-white border border-gray-200 rounded-lg shadow-lg max-h-96 overflow-y-auto"
          role="listbox"
        >
          {results.map((product, index) => (
            <button
              key={product.id}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleSelectProduct(product);
              }}
              onMouseDown={(e) => {
                // Prevenir que o onBlur do input seja disparado antes do clique
                e.preventDefault();
              }}
              role="option"
              aria-selected={index === selectedIndex}
              className={`w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors ${index === selectedIndex ? 'bg-blue-100 ring-2 ring-blue-300' : ''
                } ${index !== results.length - 1 ? 'border-b border-gray-100' : ''}`}
            >
              <div className="flex justify-between items-center gap-3">
                {product.pathImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={product.pathImage}
                    alt=""
                    className="h-11 w-11 shrink-0 rounded object-cover border border-gray-200"
                  />
                ) : (
                  <div className="h-11 w-11 shrink-0 rounded bg-gray-100 border border-dashed border-gray-200" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900">
                    {highlightText(product.nome, query)}
                  </p>
                  <p className="text-sm text-gray-500">
                    ID: {product.id}
                    {query && !isNaN(Number(query)) && Number(query) === product.id && (
                      <span className="ml-2 text-blue-600 font-semibold">✓ Encontrado por ID</span>
                    )}
                  </p>
                </div>
                <div className="text-right ml-4">
                  <p className="font-bold text-blue-600">
                    R$ {product.preco.toFixed(2).replace('.', ',')}
                  </p>
                  <p className={`text-xs ${product.estoque > 0 ? 'text-gray-500' : 'text-red-500 font-semibold'}`}>
                    Estoque: {product.estoque}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {query && results.length === 0 && !isLoading && (
        <div
          className="absolute z-10 w-full mt-2 bg-white border border-gray-200 rounded-lg shadow-lg p-4 text-center text-gray-500"
          role="status"
          aria-live="polite"
        >
          <p>Nenhum produto encontrado para "{query}"</p>
          <p className="text-xs mt-1">Tente buscar por nome ou ID</p>
        </div>
      )}
    </div>
  );
}
