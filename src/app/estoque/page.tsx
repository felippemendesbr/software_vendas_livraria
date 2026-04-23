'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import {
  ArrowLeft,
  Package,
  Plus,
  Pencil,
  Check,
  X,
  Search,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import Toast, { ToastType } from '@/components/Toast';
import {
  Product,
  createProduct,
  fetchProductsList,
  updateProduct,
  uploadProductImage,
} from '@/lib/api';

interface ToastState {
  message: string;
  type: ToastType;
}

type SortableColumn = 'id' | 'nome' | 'preco' | 'estoque' | 'status';
type SortDirection = 'asc' | 'desc';

function compareProducts(
  a: Product,
  b: Product,
  col: SortableColumn,
  dir: SortDirection
): number {
  const mul = dir === 'asc' ? 1 : -1;
  switch (col) {
    case 'id':
      return (a.id - b.id) * mul;
    case 'nome':
      return a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }) * mul;
    case 'preco':
      return (a.preco - b.preco) * mul;
    case 'estoque':
      return (a.estoque - b.estoque) * mul;
    case 'status': {
      const av = a.ativo !== false ? 1 : 0;
      const bv = b.ativo !== false ? 1 : 0;
      return (av - bv) * mul;
    }
    default:
      return 0;
  }
}

export default function EstoquePage() {
  const router = useRouter();
  const [toast, setToast] = useState<ToastState | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingList, setLoadingList] = useState(false);

  // Form: novo SKU
  const [novoNome, setNovoNome] = useState('');
  const [novoPreco, setNovoPreco] = useState('');
  const [novoEstoque, setNovoEstoque] = useState('');
  const [submittingNew, setSubmittingNew] = useState(false);

  // Filtro de pesquisa na listagem
  const [searchFilter, setSearchFilter] = useState('');

  // Edição inline por linha (lápis)
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editPreco, setEditPreco] = useState('');
  const [editEstoque, setEditEstoque] = useState('');
  const [submittingEdit, setSubmittingEdit] = useState(false);
  const [editImagePreview, setEditImagePreview] = useState<string | null>(null);
  const editImageObjectUrlRef = useRef<string | null>(null);
  const editImageFileRef = useRef<File | null>(null);
  const editBasePathImageRef = useRef<string | null>(null);
  const editFileInputRef = useRef<HTMLInputElement>(null);

  const [sortColumn, setSortColumn] = useState<SortableColumn>('id');
  const [sortDir, setSortDir] = useState<SortDirection>('asc');

  const handleSortHeader = (col: SortableColumn) => {
    if (col === sortColumn) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(col);
      setSortDir('asc');
    }
  };

  const displayedProducts = useMemo(() => {
    const term = searchFilter.trim().toLowerCase();
    const filtered =
      term === ''
        ? products
        : products.filter(
            (p) =>
              p.nome.toLowerCase().includes(term) ||
              String(p.id) === term ||
              String(p.id).startsWith(term)
          );
    return [...filtered].sort((a, b) => compareProducts(a, b, sortColumn, sortDir));
  }, [products, searchFilter, sortColumn, sortDir]);

  const showToast = (message: string, type: ToastType) => {
    setToast({ message, type });
  };

  const loadProducts = async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoadingList(true);
    try {
      const list = await fetchProductsList(2000);
      setProducts(list);
    } catch (e) {
      showToast('Erro ao carregar lista de produtos', 'error');
    } finally {
      if (!opts?.silent) setLoadingList(false);
    }
  };

  useEffect(() => {
    loadProducts();
  }, []);

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    const nome = novoNome.trim();
    const preco = parseFloat(novoPreco.replace(',', '.'));
    const estoque = parseInt(novoEstoque, 10);

    if (!nome) {
      showToast('Informe o nome do produto', 'warning');
      return;
    }
    if (isNaN(preco) || preco < 0) {
      showToast('Preço inválido', 'warning');
      return;
    }
    if (isNaN(estoque) || estoque < 0) {
      showToast('Estoque inicial inválido', 'warning');
      return;
    }

    setSubmittingNew(true);
    try {
      const created = await createProduct({ nome, preco, estoque });
      showToast(`Produto "${created.nome}" cadastrado (ID ${created.id})`, 'success');
      setNovoNome('');
      setNovoPreco('');
      setNovoEstoque('');
      loadProducts();
    } catch (err: any) {
      showToast(err?.message || 'Erro ao cadastrar produto', 'error');
    } finally {
      setSubmittingNew(false);
    }
  };

  const handleEditImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (editImageObjectUrlRef.current) {
      URL.revokeObjectURL(editImageObjectUrlRef.current);
      editImageObjectUrlRef.current = null;
    }
    if (f) {
      editImageFileRef.current = f;
      const url = URL.createObjectURL(f);
      editImageObjectUrlRef.current = url;
      setEditImagePreview(url);
    } else {
      editImageFileRef.current = null;
      setEditImagePreview(editBasePathImageRef.current);
    }
  };

  const startEdit = (p: Product) => {
    if (editImageObjectUrlRef.current) {
      URL.revokeObjectURL(editImageObjectUrlRef.current);
      editImageObjectUrlRef.current = null;
    }
    setEditingId(p.id);
    setEditPreco(String(p.preco));
    setEditEstoque(String(p.estoque));
    editBasePathImageRef.current = p.pathImage ?? null;
    setEditImagePreview(p.pathImage ?? null);
    editImageFileRef.current = null;
    if (editFileInputRef.current) editFileInputRef.current.value = '';
  };

  const cancelEdit = () => {
    if (editImageObjectUrlRef.current) {
      URL.revokeObjectURL(editImageObjectUrlRef.current);
      editImageObjectUrlRef.current = null;
    }
    setEditingId(null);
    setEditPreco('');
    setEditEstoque('');
    editImageFileRef.current = null;
    setEditImagePreview(null);
    editBasePathImageRef.current = null;
    if (editFileInputRef.current) editFileInputRef.current.value = '';
  };

  const saveEdit = async () => {
    if (editingId == null) return;
    const produtoId = editingId;
    const preco = parseFloat(String(editPreco).replace(',', '.'));
    const estoqueRaw = String(editEstoque).trim();
    const estoque = parseInt(estoqueRaw, 10);
    if (isNaN(preco) || preco < 0) {
      showToast('Preço inválido', 'warning');
      return;
    }
    if (estoqueRaw === '' || isNaN(estoque) || estoque < 0) {
      showToast('Estoque inválido', 'warning');
      return;
    }

    const arquivoImagem = editImageFileRef.current;

    setSubmittingEdit(true);
    try {
      await updateProduct(produtoId, { preco, estoque });
      if (arquivoImagem) {
        await uploadProductImage(produtoId, arquivoImagem);
      }
      showToast('Produto atualizado', 'success');
      cancelEdit();
      await loadProducts({ silent: true });
    } catch (err: any) {
      showToast(err?.message || 'Erro ao atualizar', 'error');
    } finally {
      setSubmittingEdit(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#E6E1CF] to-[#F2EFE6]">
      <header className="bg-white border-b border-[#E6E1CF] shadow-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <button
            type="button"
            onClick={() => router.push('/')}
            className="flex items-center gap-2 text-[#1F1312] hover:text-[#1F1312]/80 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="font-medium">Voltar</span>
          </button>
          <div className="flex items-center gap-2">
            <Image src="/logo-GS.png" alt="Logo" width={36} height={36} />
            <h1 className="text-lg font-semibold text-[#1F1312]">Estoque</h1>
          </div>
          <div className="w-20" />
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Cadastrar novo SKU */}
        <section className="bg-white rounded-2xl shadow-md border border-[#E6E1CF] p-6">
          <h2 className="flex items-center gap-2 text-xl font-bold text-[#1F1312] mb-4">
            <Plus className="w-6 h-6 text-green-600" />
            Cadastrar novo SKU
          </h2>
          <form onSubmit={handleCreateProduct} className="space-y-4">
            <div>
              <label htmlFor="novo-nome" className="block text-sm font-medium text-gray-700 mb-1">
                Nome do produto
              </label>
              <input
                id="novo-nome"
                type="text"
                value={novoNome}
                onChange={(e) => setNovoNome(e.target.value)}
                placeholder="Ex: Livro X"
                maxLength={100}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1F1312]/20 focus:border-[#1F1312]"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="novo-preco" className="block text-sm font-medium text-gray-700 mb-1">
                  Preço (R$)
                </label>
                <input
                  id="novo-preco"
                  type="text"
                  inputMode="decimal"
                  value={novoPreco}
                  onChange={(e) => setNovoPreco(e.target.value)}
                  placeholder="0,00"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1F1312]/20 focus:border-[#1F1312]"
                />
              </div>
              <div>
                <label htmlFor="novo-estoque" className="block text-sm font-medium text-gray-700 mb-1">
                  Estoque inicial
                </label>
                <input
                  id="novo-estoque"
                  type="number"
                  min={0}
                  value={novoEstoque}
                  onChange={(e) => setNovoEstoque(e.target.value)}
                  placeholder="0"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1F1312]/20 focus:border-[#1F1312]"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={submittingNew}
              className="w-full sm:w-auto px-6 py-3 bg-[#1F1312] text-white font-semibold rounded-lg hover:bg-[#1F1312]/90 disabled:opacity-50 transition-colors"
            >
              {submittingNew ? 'Cadastrando...' : 'Cadastrar produto'}
            </button>
          </form>
        </section>

        {/* Lista de produtos: edição inline (lápis); status derivado do estoque */}
        <section className="bg-white rounded-2xl shadow-md border border-[#E6E1CF] p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
            <div>
              <h2 className="flex items-center gap-2 text-xl font-bold text-[#1F1312]">
                <Package className="w-6 h-6 text-amber-600" />
                Produtos cadastrados
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                Use o lápis para editar preço, estoque e foto (upload gravado em path_image no banco). O status exibido vem da coluna Status no banco.
              </p>
            </div>
            <div className="flex-shrink-0 w-full sm:w-64">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  placeholder="Filtrar por nome ou ID..."
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1F1312]/20 focus:border-[#1F1312] text-sm"
                />
              </div>
            </div>
          </div>
          {loadingList ? (
            <p className="text-gray-500">Carregando...</p>
          ) : products.length === 0 ? (
            <p className="text-gray-500">Nenhum produto cadastrado.</p>
          ) : displayedProducts.length === 0 ? (
            <p className="text-gray-500">Nenhum produto encontrado para &quot;{searchFilter}&quot;.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-gray-200 text-gray-600">
                    <th className="py-3 px-2 text-left" scope="col">
                      <button
                        type="button"
                        onClick={() => handleSortHeader('id')}
                        className="inline-flex items-center gap-1 font-semibold hover:text-[#1F1312] select-none cursor-pointer"
                        aria-sort={sortColumn === 'id' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                      >
                        ID
                        {sortColumn === 'id' &&
                          (sortDir === 'asc' ? (
                            <ArrowUp className="w-3.5 h-3.5 shrink-0" aria-hidden />
                          ) : (
                            <ArrowDown className="w-3.5 h-3.5 shrink-0" aria-hidden />
                          ))}
                      </button>
                    </th>
                    <th className="py-3 px-1 text-center font-semibold w-20" scope="col">
                      Foto
                    </th>
                    <th className="py-3 px-2 text-left" scope="col">
                      <button
                        type="button"
                        onClick={() => handleSortHeader('nome')}
                        className="inline-flex items-center gap-1 font-semibold hover:text-[#1F1312] select-none cursor-pointer"
                        aria-sort={sortColumn === 'nome' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                      >
                        Nome
                        {sortColumn === 'nome' &&
                          (sortDir === 'asc' ? (
                            <ArrowUp className="w-3.5 h-3.5 shrink-0" aria-hidden />
                          ) : (
                            <ArrowDown className="w-3.5 h-3.5 shrink-0" aria-hidden />
                          ))}
                      </button>
                    </th>
                    <th className="py-3 px-2 text-right" scope="col">
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => handleSortHeader('preco')}
                          className="inline-flex items-center gap-1 font-semibold hover:text-[#1F1312] select-none cursor-pointer"
                          aria-sort={sortColumn === 'preco' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                        >
                          Preço
                          {sortColumn === 'preco' &&
                            (sortDir === 'asc' ? (
                              <ArrowUp className="w-3.5 h-3.5 shrink-0" aria-hidden />
                            ) : (
                              <ArrowDown className="w-3.5 h-3.5 shrink-0" aria-hidden />
                            ))}
                        </button>
                      </div>
                    </th>
                    <th className="py-3 px-2 text-right" scope="col">
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => handleSortHeader('estoque')}
                          className="inline-flex items-center gap-1 font-semibold hover:text-[#1F1312] select-none cursor-pointer"
                          aria-sort={sortColumn === 'estoque' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                        >
                          Estoque
                          {sortColumn === 'estoque' &&
                            (sortDir === 'asc' ? (
                              <ArrowUp className="w-3.5 h-3.5 shrink-0" aria-hidden />
                            ) : (
                              <ArrowDown className="w-3.5 h-3.5 shrink-0" aria-hidden />
                            ))}
                        </button>
                      </div>
                    </th>
                    <th className="py-3 px-2 text-center" scope="col">
                      <button
                        type="button"
                        onClick={() => handleSortHeader('status')}
                        className="inline-flex items-center justify-center gap-1 font-semibold hover:text-[#1F1312] select-none cursor-pointer w-full"
                        aria-sort={sortColumn === 'status' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                      >
                        Status
                        {sortColumn === 'status' &&
                          (sortDir === 'asc' ? (
                            <ArrowUp className="w-3.5 h-3.5 shrink-0" aria-hidden />
                          ) : (
                            <ArrowDown className="w-3.5 h-3.5 shrink-0" aria-hidden />
                          ))}
                      </button>
                    </th>
                    <th className="py-3 px-2 text-center w-28 font-semibold" scope="col">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {displayedProducts.map((p) => (
                    <tr
                      key={p.id}
                      className={`border-b border-gray-100 hover:bg-gray-50 ${
                        p.ativo === false ? 'opacity-60 bg-gray-50' : ''
                      }`}
                    >
                      <td className="py-2 px-2 font-mono text-gray-600">{p.id}</td>
                      <td className="py-2 px-1 w-20 align-middle text-center">
                        {editingId === p.id ? (
                          <div className="flex flex-col gap-1 items-center">
                            {editImagePreview ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={editImagePreview}
                                alt=""
                                className="h-14 w-14 rounded object-cover border border-gray-200"
                              />
                            ) : (
                              <span className="text-[10px] text-gray-400">Sem foto</span>
                            )}
                            <label className="text-[10px] text-[#1F1312] cursor-pointer hover:underline text-center leading-tight">
                              <input
                                ref={editFileInputRef}
                                type="file"
                                accept="image/jpeg,image/png,image/webp,image/gif"
                                className="sr-only"
                                onChange={handleEditImageChange}
                              />
                              Enviar foto
                            </label>
                          </div>
                        ) : p.pathImage ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={p.pathImage}
                            alt=""
                            className="h-12 w-12 rounded object-cover border border-gray-200 mx-auto"
                          />
                        ) : (
                          <span className="text-gray-400 text-xs">—</span>
                        )}
                      </td>
                      <td className="py-2 px-2 font-medium">{p.nome}</td>

                      {editingId === p.id ? (
                        <>
                          <td className="py-2 px-2">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={editPreco}
                              onChange={(e) => setEditPreco(e.target.value)}
                              className="w-20 px-2 py-1 border border-gray-300 rounded text-right"
                              placeholder="0,00"
                            />
                          </td>
                          <td className="py-2 px-2">
                            <input
                              type="number"
                              min={0}
                              value={editEstoque}
                              onChange={(e) => setEditEstoque(e.target.value)}
                              className="w-20 px-2 py-1 border border-gray-300 rounded text-right"
                            />
                          </td>
                          <td className="py-2 px-2 text-center" />
                          <td className="py-2 px-2">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  void saveEdit();
                                }}
                                disabled={submittingEdit}
                                className="p-2 text-green-600 hover:bg-green-50 rounded-lg disabled:opacity-50"
                                title="Salvar"
                              >
                                <Check className="w-5 h-5" />
                              </button>
                              <button
                                type="button"
                                onClick={cancelEdit}
                                disabled={submittingEdit}
                                className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg"
                                title="Cancelar"
                              >
                                <X className="w-5 h-5" />
                              </button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="py-2 px-2 text-right">
                            R$ {p.preco.toFixed(2).replace('.', ',')}
                          </td>
                          <td
                            className={`py-2 px-2 text-right font-semibold ${
                              p.estoque === 0
                                ? 'text-red-600'
                                : p.estoque < 10
                                  ? 'text-amber-600'
                                  : 'text-green-600'
                            }`}
                          >
                            {p.estoque}
                          </td>
                          <td className="py-2 px-2 text-center">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium ${
                                p.ativo !== false
                                  ? 'bg-green-100 text-green-800'
                                  : 'bg-gray-200 text-gray-600'
                              }`}
                              title={
                                p.ativo !== false
                                  ? 'Status ativo no banco (Status = 1)'
                                  : 'Status inativo no banco (Status = 0)'
                              }
                            >
                              {p.ativo !== false ? 'Ativo' : 'Inativo'}
                            </span>
                          </td>
                          <td className="py-2 px-2">
                            <div className="flex items-center justify-center">
                              <button
                                type="button"
                                onClick={() => startEdit(p)}
                                className="p-2 text-[#1F1312] hover:bg-gray-200 rounded-lg"
                                title="Editar preço, estoque e foto"
                              >
                                <Pencil className="w-5 h-5" />
                              </button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </main>
  );
}
