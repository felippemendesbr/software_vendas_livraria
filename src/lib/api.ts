export interface Product {
  id: number;
  nome: string;
  preco: number;
  estoque: number;
  imagemUrl?: string | null;
  estado?: string | null;
}

export interface ProductManage extends Product {
  imagemUrl: string | null;
  estado: string | null;
}

export interface ProductsManageResponse {
  products: ProductManage[];
  schemaHints: {
    imagemUrl: boolean;
    estado: boolean;
    estadoIsBit: boolean;
  };
}

export interface CartItem {
  produtoId: number;
  nome: string;
  preco: number;
  quantidade: number;
  estoqueAtual: number;
}

export interface SaleItem {
  produtoId: number;
  quantidade: number;
}

export interface SaleRequest {
  itens: SaleItem[];
  formaPagamento: 'PIX' | 'CARTAO' | 'DINHEIRO';
}

export interface SaleResponse {
  pedidoId: number;
  total: number;
  formaPagamento: string;
  itens: Array<{
    produtoId: number;
    nome: string;
    quantidade: number;
    precoUnitario: number;
    subtotal: number;
  }>;
}

export interface ReportData {
  periodo: {
    from: string | null;
    to: string | null;
  };
  totalVendidoPorDia: Array<{
    data: string;
    totalVendido: number;
    numPedidos: number;
  }>;
  totalPorFormaPagamento: Array<{
    formaPagamento: string;
    total: number;
  }>;
  topProdutosQuantidade: Array<{
    id: number;
    nome: string;
    totalQuantidade: number;
    totalFaturamento: number;
  }>;
  topProdutosFaturamento: Array<{
    id: number;
    nome: string;
    totalQuantidade: number;
    totalFaturamento: number;
  }>;
  todosProdutosVendidos: Array<{
    id: number;
    nome: string;
    estoqueAtual: number;
    precoAtual: number;
    totalQuantidadeVendida: number;
    totalFaturamento: number;
  }>;
  todosProdutosPorId: Array<{
    id: number;
    nome: string;
    estoqueDisponivel: number;
    precoAtual: number;
    quantidadeVendida: number;
    totalFaturado: number;
  }>;
}

/**
 * Busca produtos por query
 */
export async function fetchProducts(query: string): Promise<Product[]> {
  try {
    const url = query
      ? `/api/products?query=${encodeURIComponent(query)}`
      : '/api/products';
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Erro ao buscar produtos: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.products || [];
  } catch (error) {
    console.error('Erro ao buscar produtos:', error);
    throw error;
  }
}

export interface FetchProductsManageParams {
  search?: string;
  sort?: 'nome' | 'preco' | 'estoque' | 'id';
  order?: 'asc' | 'desc';
  estado?: string;
  estoqueMin?: string;
  estoqueMax?: string;
  precoMin?: string;
  precoMax?: string;
  limit?: number;
}

export async function fetchProductsManage(
  params: FetchProductsManageParams = {}
): Promise<ProductsManageResponse> {
  const sp = new URLSearchParams({ manage: '1' });
  if (params.search) sp.set('search', params.search);
  if (params.sort) sp.set('sort', params.sort);
  if (params.order) sp.set('order', params.order);
  if (params.estado) sp.set('estado', params.estado);
  if (params.estoqueMin) sp.set('estoqueMin', params.estoqueMin);
  if (params.estoqueMax) sp.set('estoqueMax', params.estoqueMax);
  if (params.precoMin) sp.set('precoMin', params.precoMin);
  if (params.precoMax) sp.set('precoMax', params.precoMax);
  if (params.limit != null) sp.set('limit', String(params.limit));

  const response = await fetch(`/api/products?${sp.toString()}`);
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || err.error || `Erro ${response.status}`);
  }
  return response.json();
}

export interface ProductUpsertPayload {
  nome: string;
  preco: number;
  estoque: number;
  imagemUrl?: string | null;
  estado?: string | null;
}

export async function createProduct(payload: ProductUpsertPayload): Promise<{ id: number }> {
  const response = await fetch('/api/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || err.error || `Erro ${response.status}`);
  }
  return response.json();
}

export async function updateProduct(
  id: number,
  partial: Partial<ProductUpsertPayload>
): Promise<void> {
  const response = await fetch(`/api/products/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(partial),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || err.error || `Erro ${response.status}`);
  }
}

/**
 * Envia imagem do produto para `public/uploads/products` e retorna a URL pública (ex.: /uploads/products/80-….jpg).
 */
export async function uploadProductImage(file: File, productId: number = 0): Promise<{ url: string }> {
  const body = new FormData();
  body.set('file', file);
  body.set('productId', String(Math.max(0, Math.floor(productId))));

  const response = await fetch('/api/products/upload', {
    method: 'POST',
    body,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || err.error || `Erro no upload (${response.status})`);
  }

  return response.json();
}

/**
 * Cria uma nova venda
 */
export async function createSale(payload: SaleRequest): Promise<SaleResponse> {
  try {
    const response = await fetch('/api/sales', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || errorData.error || `Erro ao criar venda: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Erro ao criar venda:', error);
    throw error;
  }
}

/**
 * Busca relatórios
 */
export async function fetchReports(from?: string, to?: string): Promise<ReportData> {
  try {
    const params = new URLSearchParams();
    if (from) params.append('from', from);
    if (to) params.append('to', to);
    
    const url = `/api/reports?${params.toString()}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Erro ao buscar relatórios: ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Erro ao buscar relatórios:', error);
    throw error;
  }
}

/**
 * Testa conexão com o backend
 */
export async function checkHealth(): Promise<boolean> {
  try {
    const response = await fetch('/api/health');
    return response.ok;
  } catch (error) {
    return false;
  }
}
