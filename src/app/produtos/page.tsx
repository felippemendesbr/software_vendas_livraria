'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Package,
  Plus,
  Pencil,
  Loader2,
  ArrowUpDown,
  Upload,
  X,
  Search,
  SlidersHorizontal,
  Filter,
  CircleDollarSign,
  Warehouse,
  ChevronDown,
} from 'lucide-react';

import Toast, { ToastType } from '@/components/Toast';
import ProductPhoto from '@/components/ProductPhoto';
import {
  fetchProductsManage,
  createProduct,
  updateProduct,
  uploadProductImage,
  type ProductManage,
  type ProductsManageResponse,
} from '@/lib/api';
import { resolveProductImageSrc } from '@/lib/product-image';

type SortKey = 'nome' | 'preco' | 'estoque' | 'id';

function formatBRL(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const filterInputCls =
  'w-full rounded-xl border border-[#E0DBD2] bg-white px-3 py-2.5 text-sm text-[#1F1312] shadow-sm placeholder:text-[#9A918A] transition focus:border-[#B8A99B] focus:outline-none focus:ring-2 focus:ring-[#D4C9BA]/45';

const filterSelectCls = [
  filterInputCls,
  'cursor-pointer appearance-none pr-10',
  'disabled:cursor-not-allowed disabled:bg-[#F3EFE8] disabled:text-[#8A8279] disabled:opacity-90',
].join(' ');

const filterLabelCls = 'mb-1.5 flex items-center gap-1.5 text-xs font-medium text-[#5C534D]';

const statusSegmentBtn = (active: boolean) =>
  [
    'relative flex-1 rounded-lg px-2 py-2.5 text-center text-xs font-semibold transition sm:px-3 sm:text-sm',
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1F1312]/25 focus-visible:ring-offset-1',
    active
      ? 'bg-white text-[#1F1312] shadow-sm ring-1 ring-[#D8D0C6]'
      : 'text-[#6B625C] hover:bg-white/60 hover:text-[#1F1312]',
  ].join(' ');

export default function ProdutosPage() {
  const router = useRouter();
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<ProductsManageResponse | null>(null);
  const hasLoadedOnceRef = useRef(false);

  const [searchDraft, setSearchDraft] = useState('');
  const [filters, setFilters] = useState({
    search: '',
    estado: '',
    estoqueMin: '',
    estoqueMax: '',
    precoMin: '',
    precoMax: '',
  });
  const [sort, setSort] = useState<SortKey>('nome');
  const [order, setOrder] = useState<'asc' | 'desc'>('asc');
  const [estadoDraft, setEstadoDraft] = useState('');
  const [estoqueMinDraft, setEstoqueMinDraft] = useState('');
  const [estoqueMaxDraft, setEstoqueMaxDraft] = useState('');
  const [precoMinDraft, setPrecoMinDraft] = useState('');
  const [precoMaxDraft, setPrecoMaxDraft] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ProductManage | null>(null);
  const [formNome, setFormNome] = useState('');
  const [formPreco, setFormPreco] = useState('');
  const [formEstoque, setFormEstoque] = useState('');
  const [formImagem, setFormImagem] = useState('');
  const [formEstado, setFormEstado] = useState('Ativo');

  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showToast = (message: string, type: ToastType) => setToast({ message, type });

  const load = useCallback(async () => {
    const firstLoad = !hasLoadedOnceRef.current;
    if (firstLoad) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await fetchProductsManage({
        search: filters.search || undefined,
        sort,
        order,
        estado: filters.estado || undefined,
        estoqueMin: filters.estoqueMin || undefined,
        estoqueMax: filters.estoqueMax || undefined,
        precoMin: filters.precoMin || undefined,
        precoMax: filters.precoMax || undefined,
        limit: 300,
      });
      setData(res);
      hasLoadedOnceRef.current = true;
    } catch (e: any) {
      showToast(e.message || 'Erro ao carregar produtos', 'error');
      setData(null);
      hasLoadedOnceRef.current = false;
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filters, sort, order]);

  useEffect(() => {
    load();
  }, [load]);

  const schema = data?.schemaHints;

  const openNew = () => {
    setEditing(null);
    setFormNome('');
    setFormPreco('');
    setFormEstoque('0');
    setFormImagem('');
    setFormEstado('Ativo');
    setModalOpen(true);
  };

  const openEdit = (p: ProductManage) => {
    setEditing(p);
    setFormNome(p.nome);
    setFormPreco(String(p.preco).replace('.', ','));
    setFormEstoque(String(p.estoque));
    setFormImagem(p.imagemUrl || '');
    setFormEstado(p.estado || 'Ativo');
    setModalOpen(true);
  };

  const parsePrecoInput = (s: string): number => {
    const t = s.trim().replace(/\./g, '').replace(',', '.');
    return parseFloat(t);
  };

  const handleSubmitForm = async () => {
    const nome = formNome.trim();
    const preco = parsePrecoInput(formPreco);
    const estoque = parseInt(formEstoque, 10);
    const imagemUrl = formImagem.trim() || null;
    const estadoVal = formEstado.trim() || 'Ativo';
    const hadImageIntent = Boolean(formImagem.trim());

    if (!nome) {
      showToast('Informe o nome', 'error');
      return;
    }
    if (isNaN(preco) || preco < 0) {
      showToast('Preço inválido', 'error');
      return;
    }
    if (isNaN(estoque) || estoque < 0) {
      showToast('Estoque inválido', 'error');
      return;
    }

    setSaving(true);
    try {
      if (editing) {
        const partial: Record<string, unknown> = {
          nome,
          preco,
          estoque,
        };
        if (schema?.imagemUrl) partial.imagemUrl = imagemUrl;
        if (schema?.estado) partial.estado = estadoVal;
        await updateProduct(editing.id, partial);
        if (!schema?.imagemUrl && hadImageIntent) {
          showToast(
            'Dados salvos, mas a imagem não foi gravada no banco: falta a coluna ImagemUrl (veja scripts/produtos-admin-columns.sql).',
            'warning'
          );
        } else {
          showToast('Produto atualizado', 'success');
        }
      } else {
        await createProduct({
          nome,
          preco,
          estoque,
          imagemUrl: schema?.imagemUrl ? imagemUrl : undefined,
          estado: schema?.estado ? estadoVal : undefined,
        });
        if (!schema?.imagemUrl && hadImageIntent) {
          showToast(
            'Produto cadastrado, mas a imagem não foi gravada: adicione a coluna ImagemUrl no SQL Server.',
            'warning'
          );
        } else {
          showToast('Produto cadastrado', 'success');
        }
      }
      setModalOpen(false);
      await load();
    } catch (e: any) {
      showToast(e.message || 'Erro ao salvar', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handlePickImage = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setUploadingImage(true);
    try {
      const pid = editing?.id ?? 0;
      const { url } = await uploadProductImage(file, pid);
      setFormImagem(url);
      showToast('Imagem enviada', 'success');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro no upload';
      showToast(msg, 'error');
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const applyFilters = () => {
    setFilters({
      search: searchDraft.trim(),
      estado: estadoDraft.trim(),
      estoqueMin: estoqueMinDraft.trim(),
      estoqueMax: estoqueMaxDraft.trim(),
      precoMin: precoMinDraft.trim(),
      precoMax: precoMaxDraft.trim(),
    });
  };

  const toggleSort = (key: SortKey) => {
    if (sort === key) {
      setOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    } else {
      setSort(key);
      setOrder('asc');
    }
  };

  const statusFilterEnabled = Boolean(schema?.estado);
  const statusFilterBit = Boolean(schema?.estado && schema.estadoIsBit);

  const statusFilterControl = useMemo(() => {
    if (statusFilterBit) {
      return (
        <div className="relative w-full min-w-0">
          <select
            id="filtro-status"
            aria-label="Filtrar por status"
            title="Filtrar por status"
            disabled={!statusFilterEnabled}
            value={estadoDraft}
            onChange={(e) => setEstadoDraft(e.target.value)}
            className={filterSelectCls}
          >
            <option value="">Todos os status</option>
            <option value="Ativo">Ativo</option>
            <option value="Inativo">Inativo</option>
          </select>
          <ChevronDown
            className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8A8279]"
            aria-hidden
          />
        </div>
      );
    }
    return (
      <div className="relative w-full min-w-0">
        <input
          id="filtro-status"
          type="text"
          aria-label="Filtrar por status (texto exato)"
          disabled={!statusFilterEnabled}
          title={
            statusFilterEnabled
              ? 'Valor exato da coluna de status no banco'
              : 'Adicione a coluna Estado na tabela Produtos para habilitar este filtro'
          }
          value={estadoDraft}
          onChange={(e) => setEstadoDraft(e.target.value)}
          placeholder={
            statusFilterEnabled ? 'Texto exato do status' : 'Filtro indisponível (sem coluna)'
          }
          className={filterInputCls}
        />
      </div>
    );
  }, [statusFilterBit, statusFilterEnabled, estadoDraft]);

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-[#E6E1CF] to-[#F2EFE6]">
      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}

      <header className="shrink-0 bg-white border-b border-[#E6E1CF]">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-3 sm:py-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <Image
              src="/logo-GS.png"
              alt="GS Store"
              width={48}
              height={48}
              className="shrink-0"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-lg sm:text-xl font-bold text-[#1F1312]">
                <Package className="w-5 h-5 shrink-0" aria-hidden />
                <span className="truncate">Controle de produtos</span>
              </div>
              <p className="text-xs sm:text-sm text-gray-500 truncate">
                Cadastro, estoque, preço e imagem
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-stretch sm:items-center gap-2">
            <button
              type="button"
              onClick={openNew}
              className="inline-flex flex-1 sm:flex-initial justify-center items-center gap-2 px-4 py-2.5 rounded-xl bg-[#1F1312] text-white text-sm font-semibold hover:opacity-90"
            >
              <Plus className="w-4 h-4 shrink-0" />
              Novo produto
            </button>
            <button
              type="button"
              onClick={() => router.push('/')}
              className="inline-flex flex-1 sm:flex-initial justify-center items-center gap-2 px-4 py-2.5 text-sm rounded-xl border border-[#E6E1CF] bg-white hover:bg-[#F5F3ED]"
            >
              <ArrowLeft className="w-[18px] h-[18px] shrink-0" aria-hidden />
              Início
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full min-w-0 max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-4 pb-10">
        <section className="rounded-2xl border border-[#D4CEC4] bg-gradient-to-br from-white via-[#FFFCF8] to-[#F3EFE8] p-4 shadow-[0_2px_14px_rgba(31,19,18,0.07)] sm:p-5">
          <div className="flex flex-col gap-4 border-b border-[#E6E1CF]/90 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#1F1312] text-white shadow-md ring-2 ring-white/40">
                <SlidersHorizontal className="h-5 w-5" aria-hidden />
              </span>
              <div className="min-w-0">
                <h2 className="text-base font-semibold tracking-tight text-[#1F1312]">Filtros</h2>
                <p className="mt-0.5 text-xs leading-relaxed text-[#736A64]">
                  Refine por texto, status, faixas de estoque e preço; depois aplique.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={applyFilters}
              className="inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-[#1F1312] px-5 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-[#2a1c1a] sm:w-auto"
            >
              <Filter className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
              Aplicar filtros
            </button>
          </div>

          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-end">
              <div className="min-w-0 space-y-1.5 lg:col-span-5">
                <label htmlFor="filtro-busca" className={filterLabelCls}>
                  Buscar
                </label>
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#B0A69D]"
                    aria-hidden
                  />
                  <input
                    id="filtro-busca"
                    type="text"
                    value={searchDraft}
                    onChange={(e) => setSearchDraft(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
                    placeholder="Nome ou ID do produto"
                    className={`${filterInputCls} pl-10`}
                  />
                </div>
              </div>

              <div className="min-w-0 space-y-1.5 lg:col-span-3">
                <label htmlFor="filtro-status" className={filterLabelCls}>
                  Status
                </label>
                <div className="w-full min-w-0">{statusFilterControl}</div>
                {!statusFilterEnabled && data !== null && (
                  <p className="text-[11px] leading-snug text-[#9A918A]">
                    Sem coluna de status na tabela — use o script SQL do projeto para adicionar e habilitar o filtro.
                  </p>
                )}
              </div>

              <div className="rounded-2xl border border-[#E4DFD6] bg-white/90 p-4 shadow-inner lg:col-span-4">
                <p className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[#8A8279]">
                  <Warehouse className="h-3.5 w-3.5" aria-hidden />
                  Estoque e preço
                </p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="min-w-0 space-y-1.5">
                    <label className="block text-[11px] font-medium text-[#6B625C]">Estoque mín.</label>
                    <input
                      type="number"
                      min={0}
                      value={estoqueMinDraft}
                      onChange={(e) => setEstoqueMinDraft(e.target.value)}
                      placeholder="0"
                      className={filterInputCls}
                    />
                  </div>
                  <div className="min-w-0 space-y-1.5">
                    <label className="block text-[11px] font-medium text-[#6B625C]">Estoque máx.</label>
                    <input
                      type="number"
                      min={0}
                      value={estoqueMaxDraft}
                      onChange={(e) => setEstoqueMaxDraft(e.target.value)}
                      placeholder="∞"
                      className={filterInputCls}
                    />
                  </div>
                  <div className="min-w-0 space-y-1.5">
                    <label className="flex items-center gap-1 text-[11px] font-medium text-[#6B625C]">
                      <CircleDollarSign className="h-3.5 w-3.5 shrink-0 text-[#8A8279]" aria-hidden />
                      Preço mín.
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={precoMinDraft}
                      onChange={(e) => setPrecoMinDraft(e.target.value)}
                      placeholder="0,00"
                      className={filterInputCls}
                    />
                  </div>
                  <div className="min-w-0 space-y-1.5">
                    <label className="flex items-center gap-1 text-[11px] font-medium text-[#6B625C]">
                      <CircleDollarSign className="h-3.5 w-3.5 shrink-0 text-[#8A8279]" aria-hidden />
                      Preço máx.
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={precoMaxDraft}
                      onChange={(e) => setPrecoMaxDraft(e.target.value)}
                      placeholder="999,99"
                      className={filterInputCls}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <p className="mt-4 border-t border-[#E6E1CF]/80 pt-3 text-xs leading-relaxed text-[#7A726A]">
            <span className="font-medium text-[#5C534D]">Ordenação:</span> use os cabeçalhos da tabela (ID, Nome,
            Preço, Estoque). A direção alterna a cada clique.
          </p>
        </section>

        <section className="bg-white rounded-xl border border-[#E6E1CF] shadow-sm overflow-hidden">
          {loading && !data ? (
            <div className="flex items-center justify-center py-20 text-gray-500 gap-2">
              <Loader2 className="w-6 h-6 animate-spin shrink-0" />
              Carregando…
            </div>
          ) : data && data.products.length === 0 ? (
            <div className="py-16 text-center text-gray-500 px-4">Nenhum produto encontrado.</div>
          ) : data && data.products.length > 0 ? (
            <div className="relative overflow-x-auto">
              {refreshing ? (
                <div
                  className="absolute inset-0 z-10 flex items-center justify-center bg-white/75"
                  aria-busy="true"
                  aria-live="polite"
                >
                  <span className="inline-flex items-center gap-2 rounded-lg border border-[#E6E1CF] bg-white px-4 py-2 text-sm text-gray-600 shadow-sm">
                    <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                    Atualizando…
                  </span>
                </div>
              ) : null}
              <table className="w-full min-w-[720px] table-auto border-collapse text-sm">
                <thead className="bg-[#F5F3ED] text-left text-[#1F1312]">
                  <tr className="whitespace-nowrap">
                    <th className="px-2 sm:px-3 py-2 align-middle" scope="col">
                      <span className="sr-only">Imagem</span>
                    </th>
                    <th className="px-2 sm:px-3 py-2 align-middle" scope="col">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 font-semibold hover:underline text-left"
                        onClick={() => toggleSort('id')}
                      >
                        ID
                        <ArrowUpDown className="w-3 h-3 shrink-0" aria-hidden />
                      </button>
                    </th>
                    <th className="px-2 sm:px-3 py-2 align-middle" scope="col">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 font-semibold hover:underline text-left"
                        onClick={() => toggleSort('nome')}
                      >
                        Nome
                        <ArrowUpDown className="w-3 h-3 shrink-0" aria-hidden />
                      </button>
                    </th>
                    <th className="px-2 sm:px-3 py-2 align-middle text-right" scope="col">
                      <div className="flex w-full justify-end">
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 font-semibold hover:underline"
                          onClick={() => toggleSort('preco')}
                        >
                          Preço
                          <ArrowUpDown className="w-3 h-3 shrink-0" aria-hidden />
                        </button>
                      </div>
                    </th>
                    <th className="px-2 sm:px-3 py-2 align-middle text-right" scope="col">
                      <div className="flex w-full justify-end">
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 font-semibold hover:underline"
                          onClick={() => toggleSort('estoque')}
                        >
                          Estoque
                          <ArrowUpDown className="w-3 h-3 shrink-0" aria-hidden />
                        </button>
                      </div>
                    </th>
                    {schema?.estado ? (
                      <th className="px-2 sm:px-3 py-2 align-middle" scope="col">
                        Status
                      </th>
                    ) : null}
                    <th className="px-2 sm:px-3 py-2 align-middle" scope="col">
                      <span className="sr-only">Ações</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.products.map((p) => (
                    <tr key={p.id} className="border-t border-[#E6E1CF] hover:bg-[#FAF9F6]">
                      <td className="px-2 sm:px-3 py-1.5 align-middle w-14 sm:w-16">
                        {resolveProductImageSrc(p.imagemUrl) ? (
                          <button
                            type="button"
                            onClick={() =>
                              setLightboxUrl(resolveProductImageSrc(p.imagemUrl)!)
                            }
                            className="block rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1F1312]/40"
                            title={`Ampliar foto — ${p.nome}`}
                            aria-label={`Ampliar foto de ${p.nome}`}
                          >
                            <ProductPhoto src={p.imagemUrl} alt="" variant="thumb" />
                          </button>
                        ) : (
                          <ProductPhoto src={p.imagemUrl} alt="" variant="thumb" />
                        )}
                      </td>
                      <td className="px-2 sm:px-3 py-1.5 text-gray-600 tabular-nums whitespace-nowrap align-middle">{p.id}</td>
                      <td
                        className="px-2 sm:px-3 py-1.5 font-medium text-[#1F1312] min-w-0 max-w-[200px] sm:max-w-[280px] truncate align-middle"
                        title={p.nome}
                      >
                        {p.nome}
                      </td>
                      <td className="px-2 sm:px-3 py-1.5 text-right tabular-nums whitespace-nowrap align-middle">{formatBRL(p.preco)}</td>
                      <td className="px-2 sm:px-3 py-1.5 text-right tabular-nums whitespace-nowrap align-middle">
                        <span className={p.estoque === 0 ? 'text-red-600 font-semibold' : ''}>{p.estoque}</span>
                      </td>
                      {schema?.estado && (
                        <td className="px-2 sm:px-3 py-1.5 text-gray-700 truncate max-w-[120px] align-middle" title={p.estado ?? ''}>
                          {p.estado ?? '—'}
                        </td>
                      )}
                      <td className="px-2 sm:px-3 py-1.5 whitespace-nowrap align-middle">
                        <button
                          type="button"
                          onClick={() => openEdit(p)}
                          className="inline-flex items-center gap-1 text-blue-700 hover:underline text-xs font-medium"
                        >
                          <Pencil className="w-3 h-3" />
                          Editar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-16 text-center text-gray-500 px-4">
              Não foi possível carregar os produtos. Verifique a conexão e tente de novo.
            </div>
          )}
        </section>

        {schema && (!schema.imagemUrl || !schema.estado) && (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            {!schema.imagemUrl && (
              <span>
                O banco ainda não expõe coluna de imagem reconhecida (ex.: ImagemUrl). Rode{' '}
                <code className="bg-amber-100 px-1 rounded">scripts/produtos-admin-columns.sql</code> para habilitar URLs de imagem.{' '}
              </span>
            )}
            {!schema.estado && (
              <span>
                Sem coluna de status no banco (ex.: <strong>Estado</strong> ou <strong>Ativo</strong>). O script SQL
                pode adicionar o campo <strong>Estado</strong>.
              </span>
            )}
          </p>
        )}
      </main>

      {modalOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/40 overflow-y-auto overscroll-contain"
          role="presentation"
          onClick={() => !saving && setModalOpen(false)}
        >
          <div
            className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl max-w-md w-full border border-[#E6E1CF] border-b-0 sm:border-b p-5 sm:p-6 space-y-4 my-0 sm:my-auto max-h-[min(92vh,640px)] overflow-y-auto"
            role="dialog"
            aria-modal="true"
            aria-labelledby="produto-modal-titulo"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="produto-modal-titulo" className="text-lg font-semibold text-[#1F1312]">
              {editing ? `Editar #${editing.id}` : 'Novo produto'}
            </h2>
            <div className="rounded-xl border border-[#E6E1CF] bg-[#FAF9F6] p-4 space-y-3">
                {!schema?.imagemUrl ? (
                  <p className="text-xs text-amber-900 bg-amber-100/80 border border-amber-200 rounded-lg px-2.5 py-2 leading-snug">
                    Não encontramos coluna de imagem na tabela <strong>Produtos</strong> (ou ela tem outro nome).
                    Rode <code className="rounded bg-white/80 px-1">scripts/produtos-admin-columns.sql</code> para
                    criar <strong>ImagemUrl</strong>. Enquanto isso você pode usar a URL abaixo só como rascunho; ao
                    salvar, a imagem <strong>não será gravada</strong> no banco até existir a coluna.
                  </p>
                ) : null}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-[#5C534D]">
                    Foto do produto
                  </span>
                  {resolveProductImageSrc(formImagem) ? (
                    <button
                      type="button"
                      onClick={() => setLightboxUrl(resolveProductImageSrc(formImagem)!)}
                      className="text-xs text-blue-700 hover:underline"
                    >
                      Ampliar
                    </button>
                  ) : null}
                </div>
                <div className="flex flex-col items-center gap-3">
                  <ProductPhoto
                    src={formImagem}
                    alt={formNome || 'Pré-visualização'}
                    variant="preview"
                  />
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="sr-only"
                    onChange={(e) => void handlePickImage(e.target.files)}
                  />
                  <div className="flex flex-wrap items-center justify-center gap-2 w-full">
                    <button
                      type="button"
                      disabled={uploadingImage || saving}
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#E6E1CF] bg-white px-3 py-2 text-sm font-medium text-[#1F1312] hover:bg-[#F5F3ED] disabled:opacity-50"
                    >
                      {uploadingImage ? (
                        <Loader2 className="h-4 w-4 animate-spin shrink-0" aria-hidden />
                      ) : (
                        <Upload className="h-4 w-4 shrink-0" aria-hidden />
                      )}
                      {uploadingImage ? 'Enviando…' : 'Enviar do dispositivo'}
                    </button>
                    {formImagem.trim() ? (
                      <button
                        type="button"
                        disabled={uploadingImage || saving}
                        onClick={() => setFormImagem('')}
                        className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
                      >
                        <X className="h-4 w-4 shrink-0" aria-hidden />
                        Remover
                      </button>
                    ) : null}
                  </div>
                  <div className="w-full">
                    <label className="text-xs text-gray-500">Ou cole a URL da imagem</label>
                    <input
                      className="mt-1 w-full border border-[#E6E1CF] rounded-lg px-3 py-2 text-sm bg-white"
                      value={formImagem}
                      onChange={(e) => setFormImagem(e.target.value)}
                      placeholder="/uploads/products/… ou https://…"
                    />
                  </div>
                </div>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500">Nome</label>
                <input
                  className="mt-1 w-full border border-[#E6E1CF] rounded-lg px-3 py-2 text-sm"
                  value={formNome}
                  onChange={(e) => setFormNome(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500">Preço (R$)</label>
                  <input
                    className="mt-1 w-full border border-[#E6E1CF] rounded-lg px-3 py-2 text-sm"
                    value={formPreco}
                    onChange={(e) => setFormPreco(e.target.value)}
                    placeholder="19,90"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Estoque</label>
                  <input
                    type="number"
                    min={0}
                    className="mt-1 w-full border border-[#E6E1CF] rounded-lg px-3 py-2 text-sm"
                    value={formEstoque}
                    onChange={(e) => setFormEstoque(e.target.value)}
                  />
                </div>
              </div>
              {schema?.estado && (
                <div>
                  <label className="text-xs text-gray-500">Status</label>
                  {schema.estadoIsBit ? (
                    <div
                      className="mt-1 flex rounded-xl border border-[#E0DBD2] bg-[#EFEBE4]/90 p-1 shadow-inner"
                      role="group"
                      aria-label="Status do produto"
                    >
                      {(['Ativo', 'Inativo'] as const).map((v) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setFormEstado(v)}
                          className={statusSegmentBtn(formEstado === v)}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <input
                      className="mt-1 w-full border border-[#E6E1CF] rounded-lg px-3 py-2 text-sm"
                      value={formEstado}
                      onChange={(e) => setFormEstado(e.target.value)}
                    />
                  )}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 rounded-lg border border-[#E6E1CF] text-sm"
                disabled={saving}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSubmitForm}
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-[#1F1312] text-white text-sm font-semibold disabled:opacity-50 inline-flex items-center gap-2"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {lightboxUrl ? (
        <div
          className="fixed inset-0 z-[120] flex flex-col bg-black/90 p-4 sm:p-8"
          role="dialog"
          aria-modal="true"
          aria-label="Foto ampliada"
        >
          <div className="flex justify-end mb-2 shrink-0">
            <button
              type="button"
              onClick={() => setLightboxUrl(null)}
              className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
              aria-label="Fechar"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
          <div
            className="flex flex-1 min-h-0 w-full cursor-zoom-out items-center justify-center"
            onClick={() => setLightboxUrl(null)}
          >
            <div className="max-h-full max-w-full p-2" onClick={(e) => e.stopPropagation()}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={lightboxUrl}
                alt=""
                className="max-h-[85vh] max-w-full object-contain rounded-lg shadow-2xl"
              />
            </div>
          </div>
          <p className="text-center text-xs text-white/60 pb-2 shrink-0">
            Clique fora da imagem para fechar
          </p>
        </div>
      ) : null}
    </div>
  );
}
