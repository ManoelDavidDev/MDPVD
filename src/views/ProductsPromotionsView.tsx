import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Edit2, Plus, Search, X } from 'lucide-react';
import { apiRequest } from '../api';
import {
  PERMISSIONS,
  PROMOTION_TYPE_LABELS,
  formatCurrency,
  type CategoryEntity,
  type ProductEntity,
  type PromotionEntity,
  type PromotionType,
  type UserEntity,
} from '../types';

interface ProductsPromotionsViewProps {
  user: UserEntity;
  onNotify: (type: 'success' | 'error', message: string) => void;
}

export const ProductsPromotionsView: React.FC<ProductsPromotionsViewProps> = ({
  user,
  onNotify,
}) => {
  const [subTab, setSubTab] = useState<'produtos' | 'promocoes' | 'categorias'>(
    'produtos'
  );
  const [products, setProducts] = useState<ProductEntity[]>([]);
  const [categories, setCategories] = useState<CategoryEntity[]>([]);
  const [promotions, setPromotions] = useState<PromotionEntity[]>([]);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [loading, setLoading] = useState(true);

  // Product modal state
  const [editingProduct, setEditingProduct] = useState<Partial<ProductEntity> | null>(
    null
  );
  const [savingProduct, setSavingProduct] = useState(false);

  // Promotion modal state
  const [editingPromo, setEditingPromo] = useState<Partial<PromotionEntity> | null>(null);
  const [savingPromo, setSavingPromo] = useState(false);

  // Category form
  const [catName, setCatName] = useState('');
  const [catDesc, setCatDesc] = useState('');
  const [catNcm, setCatNcm] = useState('21069090');

  const canManageProducts = user.permissions.includes(PERMISSIONS.PRODUCT_MANAGE);
  const canManagePromos = user.permissions.includes(PERMISSIONS.PROMOTION_MANAGE);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{
        products: ProductEntity[];
        categories: CategoryEntity[];
        promotions: PromotionEntity[];
      }>('/api/catalog');
      setProducts(res.products);
      setCategories(res.categories);
      setPromotions(res.promotions);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Erro ao carregar catálogo.');
    } finally {
      setLoading(false);
    }
  }, [onNotify]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (categoryFilter && String(p.categoryId) !== categoryFilter) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.barcode.includes(q)
      );
    });
  }, [products, search, categoryFilter]);

  const openNewProductModal = () => {
    setEditingProduct({
      sku: `PRD-0${products.length + 1}`,
      barcode: `78900000${String(1000 + products.length + 1)}`,
      name: '',
      description: '',
      categoryId: categories[0]?.id ?? 1,
      unit: 'UN',
      costPrice: 0,
      salePrice: 0,
      promotionalPrice: null,
      stockQuantity: 0,
      minStock: 5,
      ncm: '21069090',
      cfop: '5102',
      active: true,
    });
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;
    setSavingProduct(true);
    try {
      await apiRequest('/api/products', {
        method: 'POST',
        body: JSON.stringify(editingProduct),
      });
      setEditingProduct(null);
      await loadData();
      onNotify('success', 'Produto salvo com sucesso.');
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Erro ao salvar produto.');
    } finally {
      setSavingProduct(false);
    }
  };

  const openNewPromoModal = () => {
    setEditingPromo({
      name: '',
      description: '',
      type: 'QUANTITY_FIXED',
      productId: products[0]?.id ?? 1,
      comboProductId: products[1]?.id ?? null,
      comboQty: 1,
      minQuantity: 12,
      promoValue: 42,
      startDate: '2026-01-01',
      endDate: '2027-12-31',
      active: true,
    });
  };

  const handleSavePromotion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPromo) return;
    setSavingPromo(true);
    try {
      await apiRequest('/api/promotions', {
        method: 'POST',
        body: JSON.stringify(editingPromo),
      });
      setEditingPromo(null);
      await loadData();
      onNotify('success', 'Regra promocional salva com sucesso.');
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Erro ao salvar promoção.');
    } finally {
      setSavingPromo(false);
    }
  };

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/categories', {
        method: 'POST',
        body: JSON.stringify({
          name: catName,
          description: catDesc,
          ncmDefault: catNcm,
        }),
      });
      setCatName('');
      setCatDesc('');
      await loadData();
      onNotify('success', 'Categoria cadastrada.');
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Erro ao criar categoria.');
    }
  };

  return (
    <div className="mx-auto max-w-[1440px] px-6 py-6 space-y-6">
      {/* Sub-navigation */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#D9CCB8] pb-3">
        <div className="flex items-center gap-6">
          <button
            type="button"
            onClick={() => setSubTab('produtos')}
            className={`pb-2 text-sm transition-colors whitespace-nowrap shrink-0 ${
              subTab === 'produtos'
                ? 'border-b-2 border-[#C87952] font-semibold text-[#39332D]'
                : 'text-[#5E4A38] hover:text-[#39332D]'
            }`}
          >
            Catálogo de Produtos ({products.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('promocoes')}
            className={`pb-2 text-sm transition-colors whitespace-nowrap shrink-0 ${
              subTab === 'promocoes'
                ? 'border-b-2 border-[#C87952] font-semibold text-[#39332D]'
                : 'text-[#5E4A38] hover:text-[#39332D]'
            }`}
          >
            Precificação & Promoções ({promotions.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('categorias')}
            className={`pb-2 text-sm transition-colors whitespace-nowrap shrink-0 ${
              subTab === 'categorias'
                ? 'border-b-2 border-[#C87952] font-semibold text-[#39332D]'
                : 'text-[#5E4A38] hover:text-[#39332D]'
            }`}
          >
            Categorias ({categories.length})
          </button>
        </div>

        <div>
          {subTab === 'produtos' && canManageProducts && (
            <button
              type="button"
              onClick={openNewProductModal}
              className="inline-flex items-center gap-1.5 rounded bg-[#A65F3F] px-4 py-2 text-xs font-semibold text-[#FAF7F2] hover:bg-[#8C4D30] whitespace-nowrap"
            >
              <Plus className="h-4 w-4" />
              Novo Produto
            </button>
          )}
          {subTab === 'promocoes' && canManagePromos && (
            <button
              type="button"
              onClick={openNewPromoModal}
              className="inline-flex items-center gap-1.5 rounded bg-[#A65F3F] px-4 py-2 text-xs font-semibold text-[#FAF7F2] hover:bg-[#8C4D30] whitespace-nowrap"
            >
              <Plus className="h-4 w-4" />
              Nova Regra Promocional
            </button>
          )}
        </div>
      </div>

      {/* TAB 1: PRODUCTS */}
      {subTab === 'produtos' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-12 rounded-lg border border-[#D9CCB8] bg-[#FAF7F2] p-4">
            <div className="sm:col-span-8 relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[#80664C]" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Pesquisar por Nome, SKU ou Código de Barras EAN..."
                className="w-full rounded border border-[#D9CCB8] bg-white py-2 pl-9 pr-3 text-sm text-[#39332D] outline-none focus:border-[#C87952]"
              />
            </div>
            <div className="sm:col-span-4">
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="w-full rounded border border-[#D9CCB8] bg-white px-3 py-2 text-sm text-[#39332D] outline-none focus:border-[#C87952]"
              >
                <option value="">Todas as categorias</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="rounded-lg border border-[#D9CCB8] bg-[#FAF7F2] overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead className="bg-[#E8DCC8] text-[#39332D]">
                <tr>
                  <th className="px-4 py-3 font-semibold">SKU / EAN</th>
                  <th className="px-4 py-3 font-semibold">Produto & Categoria</th>
                  <th className="px-4 py-3 text-right font-semibold">Custo</th>
                  <th className="px-4 py-3 text-right font-semibold">Preço Venda</th>
                  <th className="px-4 py-3 text-right font-semibold">Margem</th>
                  <th className="px-4 py-3 text-right font-semibold">Estoque / Mín.</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 text-right font-semibold">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8DCC8]">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-[#5E4A38]">
                      Carregando produtos...
                    </td>
                  </tr>
                ) : (
                  filteredProducts.map((p) => {
                    const effectivePrice = p.promotionalPrice ?? p.salePrice;
                    const marginPct =
                      effectivePrice > 0
                        ? ((effectivePrice - p.costPrice) / effectivePrice) * 100
                        : 0;
                    const isLowStock = p.active && p.stockQuantity <= p.minStock;
                    return (
                      <tr key={p.id} className="hover:bg-[#F5F0E6]">
                        <td className="px-4 py-3 font-mono tabular-nums text-[#5E4A38]">
                          <div className="font-semibold text-[#39332D]">{p.sku}</div>
                          <div>{p.barcode}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-[#39332D]">{p.name}</div>
                          <div className="text-[11px] text-[#5E4A38]">
                            {p.categoryName} · Unid.: {p.unit} · NCM {p.ncm}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-[#5E4A38]">
                          {formatCurrency(p.costPrice)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums">
                          <div className="font-semibold text-[#39332D]">
                            {formatCurrency(p.salePrice)}
                          </div>
                          {p.promotionalPrice && (
                            <div className="text-[11px] font-medium text-[#A65F3F]">
                              Oferta: {formatCurrency(p.promotionalPrice)}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-[#39332D]">
                          {marginPct.toFixed(1)}%
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums">
                          <span
                            className={
                              isLowStock
                                ? 'font-bold text-[#A65F3F]'
                                : 'text-[#39332D]'
                            }
                          >
                            {p.stockQuantity} {p.unit}
                          </span>
                          <span className="text-[#5E4A38]"> / mín. {p.minStock}</span>
                        </td>
                        <td className="px-4 py-3 text-[#5E4A38]">
                          {p.active ? 'Ativo' : 'Inativo'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {canManageProducts ? (
                            <button
                              type="button"
                              onClick={() => setEditingProduct({ ...p })}
                              className="inline-flex items-center gap-1 rounded border border-[#D9CCB8] bg-white px-2.5 py-1 text-xs font-medium text-[#39332D] hover:bg-[#E8DCC8]"
                            >
                              <Edit2 className="h-3 w-3" />
                              Editar
                            </button>
                          ) : (
                            <span className="text-[11px] text-[#80664C]">Somente leitura</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: PROMOTIONS (RF03) */}
      {subTab === 'promocoes' && (
        <div className="space-y-4">
          <div className="rounded-lg border border-[#D9CCB8] bg-[#FAF7F2] p-4 text-xs text-[#5E4A38]">
            <strong className="text-[#39332D]">
              Motor de Precificação Inteligente (RF03):
            </strong>{' '}
            O MDPDV avalia automaticamente todas as promoções vigentes e aplica a melhor
            condição comercial para o cliente sem duplicar descontos sobre o mesmo item.
          </div>

          <div className="rounded-lg border border-[#D9CCB8] bg-[#FAF7F2] overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead className="bg-[#E8DCC8] text-[#39332D]">
                <tr>
                  <th className="px-4 py-3 font-semibold">Promoção</th>
                  <th className="px-4 py-3 font-semibold">Modalidade</th>
                  <th className="px-4 py-3 font-semibold">Produto(s)</th>
                  <th className="px-4 py-3 text-right font-semibold">Regra / Gatilho</th>
                  <th className="px-4 py-3 font-semibold">Vigência</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 text-right font-semibold">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8DCC8]">
                {promotions.map((pr) => (
                  <tr key={pr.id} className="hover:bg-[#F5F0E6]">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-[#39332D]">{pr.name}</div>
                      <div className="text-[11px] text-[#5E4A38]">{pr.description}</div>
                    </td>
                    <td className="px-4 py-3 text-[#5E4A38]">
                      {PROMOTION_TYPE_LABELS[pr.type]}
                    </td>
                    <td className="px-4 py-3 text-[#39332D]">
                      {pr.productName}
                      {pr.comboProductName ? ` + ${pr.comboProductName}` : ''}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-[#39332D]">
                      {pr.type === 'QUANTITY_FIXED' &&
                        `${pr.minQuantity} un = ${formatCurrency(pr.promoValue)}`}
                      {pr.type === 'BUY_X_PAY_Y' &&
                        `Leve ${pr.minQuantity} Pague ${pr.promoValue}`}
                      {pr.type === 'PERCENTAGE' &&
                        `Mín. ${pr.minQuantity} un -> -${pr.promoValue}%`}
                      {pr.type === 'UNIT_PROMO' &&
                        `Mín. ${pr.minQuantity} un -> ${formatCurrency(pr.promoValue)}/un`}
                      {pr.type === 'COMBO' &&
                        `Combo = ${formatCurrency(pr.promoValue)}`}
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] tabular-nums text-[#5E4A38]">
                      {pr.startDate || 'Início imediato'} até {pr.endDate || 'Indeterminado'}
                    </td>
                    <td className="px-4 py-3 text-[#5E4A38]">
                      {pr.active ? 'Vigente' : 'Pausada'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {canManagePromos && (
                        <button
                          type="button"
                          onClick={() => setEditingPromo({ ...pr })}
                          className="inline-flex items-center gap-1 rounded border border-[#D9CCB8] bg-white px-2.5 py-1 text-xs font-medium text-[#39332D] hover:bg-[#E8DCC8]"
                        >
                          <Edit2 className="h-3 w-3" />
                          Editar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: CATEGORIES */}
      {subTab === 'categorias' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="lg:col-span-7 rounded-lg border border-[#D9CCB8] bg-[#FAF7F2] overflow-hidden">
            <table className="w-full border-collapse text-left text-xs">
              <thead className="bg-[#E8DCC8] text-[#39332D]">
                <tr>
                  <th className="px-4 py-3 font-semibold">Categoria</th>
                  <th className="px-4 py-3 font-semibold">Descrição</th>
                  <th className="px-4 py-3 font-mono font-semibold">NCM Padrão</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8DCC8]">
                {categories.map((c) => (
                  <tr key={c.id}>
                    <td className="px-4 py-3 font-semibold text-[#39332D]">{c.name}</td>
                    <td className="px-4 py-3 text-[#5E4A38]">{c.description}</td>
                    <td className="px-4 py-3 font-mono tabular-nums text-[#5E4A38]">
                      {c.ncmDefault}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {canManageProducts && (
            <form
              onSubmit={handleCreateCategory}
              className="lg:col-span-5 rounded-lg border border-[#D9CCB8] bg-[#FAF7F2] p-5 space-y-4 h-fit"
            >
              <h3 className="text-sm font-bold text-[#39332D]">Cadastrar Categoria</h3>
              <div>
                <label className="block text-xs font-semibold text-[#39332D]">
                  Nome da Categoria
                </label>
                <input
                  type="text"
                  required
                  value={catName}
                  onChange={(e) => setCatName(e.target.value)}
                  className="mt-1 w-full rounded border border-[#D9CCB8] bg-white px-3 py-2 text-xs"
                  placeholder="Ex: Hortifruti"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#39332D]">
                  Descrição
                </label>
                <input
                  type="text"
                  value={catDesc}
                  onChange={(e) => setCatDesc(e.target.value)}
                  className="mt-1 w-full rounded border border-[#D9CCB8] bg-white px-3 py-2 text-xs"
                  placeholder="Frutas, verduras e legumes frescos"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#39332D]">
                  NCM Fiscal Padrão
                </label>
                <input
                  type="text"
                  value={catNcm}
                  onChange={(e) => setCatNcm(e.target.value)}
                  className="mt-1 w-full rounded border border-[#D9CCB8] bg-white px-3 py-2 font-mono text-xs"
                />
              </div>
              <button
                type="submit"
                className="w-full rounded bg-[#A65F3F] px-4 py-2.5 text-xs font-semibold text-[#FAF7F2] hover:bg-[#8C4D30]"
              >
                Salvar Categoria
              </button>
            </form>
          )}
        </div>
      )}

      {/* PRODUCT MODAL */}
      {editingProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#39332D]/55 p-4">
          <form
            onSubmit={handleSaveProduct}
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-[#D9CCB8] bg-[#FAF7F2] p-6 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-[#D9CCB8] pb-3">
              <h3 className="text-base font-bold text-[#39332D]">
                {editingProduct.id ? 'Editar Produto' : 'Novo Produto'}
              </h3>
              <button
                type="button"
                onClick={() => setEditingProduct(null)}
                className="p-1 text-[#5E4A38] hover:text-[#39332D]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="block text-xs font-semibold text-[#39332D]">SKU</label>
                <input
                  type="text"
                  required
                  value={editingProduct.sku ?? ''}
                  onChange={(e) =>
                    setEditingProduct({ ...editingProduct, sku: e.target.value })
                  }
                  className="mt-1 w-full rounded border border-[#D9CCB8] bg-white px-3 py-2 font-mono text-xs"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-[#39332D]">
                  Código de Barras (EAN / GTIN)
                </label>
                <input
                  type="text"
                  required
                  value={editingProduct.barcode ?? ''}
                  onChange={(e) =>
                    setEditingProduct({ ...editingProduct, barcode: e.target.value })
                  }
                  className="mt-1 w-full rounded border border-[#D9CCB8] bg-white px-3 py-2 font-mono text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-[#39332D]">
                  Nome Comercial
                </label>
                <input
                  type="text"
                  required
                  value={editingProduct.name ?? ''}
                  onChange={(e) =>
                    setEditingProduct({ ...editingProduct, name: e.target.value })
                  }
                  className="mt-1 w-full rounded border border-[#D9CCB8] bg-white px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#39332D]">
                  Categoria
                </label>
                <select
                  value={editingProduct.categoryId ?? ''}
                  onChange={(e) =>
                    setEditingProduct({
                      ...editingProduct,
                      categoryId: Number(e.target.value),
                    })
                  }
                  className="mt-1 w-full rounded border border-[#D9CCB8] bg-white px-3 py-2 text-xs"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#39332D]">
                Descrição Complementar
              </label>
              <input
                type="text"
                value={editingProduct.description ?? ''}
                onChange={(e) =>
                  setEditingProduct({ ...editingProduct, description: e.target.value })
                }
                className="mt-1 w-full rounded border border-[#D9CCB8] bg-white px-3 py-2 text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <label className="block text-xs font-semibold text-[#39332D]">
                  Unidade
                </label>
                <select
                  value={editingProduct.unit ?? 'UN'}
                  onChange={(e) =>
                    setEditingProduct({ ...editingProduct, unit: e.target.value })
                  }
                  className="mt-1 w-full rounded border border-[#D9CCB8] bg-white px-3 py-2 text-xs"
                >
                  <option value="UN">UN</option>
                  <option value="KG">KG</option>
                  <option value="LT">LT</option>
                  <option value="CX">CX</option>
                  <option value="PCT">PCT</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#39332D]">
                  Preço de Custo (R$)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={editingProduct.costPrice ?? 0}
                  onChange={(e) =>
                    setEditingProduct({
                      ...editingProduct,
                      costPrice: parseFloat(e.target.value) || 0,
                    })
                  }
                  className="mt-1 w-full rounded border border-[#D9CCB8] bg-white px-3 py-2 font-mono text-xs tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#39332D]">
                  Preço de Venda (R$)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={editingProduct.salePrice ?? 0}
                  onChange={(e) =>
                    setEditingProduct({
                      ...editingProduct,
                      salePrice: parseFloat(e.target.value) || 0,
                    })
                  }
                  className="mt-1 w-full rounded border border-[#D9CCB8] bg-white px-3 py-2 font-mono text-xs tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#39332D]">
                  Preço Promocional (R$)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={editingProduct.promotionalPrice ?? ''}
                  onChange={(e) =>
                    setEditingProduct({
                      ...editingProduct,
                      promotionalPrice: e.target.value
                        ? parseFloat(e.target.value)
                        : null,
                    })
                  }
                  placeholder="Opcional"
                  className="mt-1 w-full rounded border border-[#D9CCB8] bg-white px-3 py-2 font-mono text-xs tabular-nums"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {!editingProduct.id && (
                <div>
                  <label className="block text-xs font-semibold text-[#39332D]">
                    Estoque Inicial
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={editingProduct.stockQuantity ?? 0}
                    onChange={(e) =>
                      setEditingProduct({
                        ...editingProduct,
                        stockQuantity: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="mt-1 w-full rounded border border-[#D9CCB8] bg-white px-3 py-2 font-mono text-xs tabular-nums"
                  />
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-[#39332D]">
                  Estoque Mínimo
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={editingProduct.minStock ?? 0}
                  onChange={(e) =>
                    setEditingProduct({
                      ...editingProduct,
                      minStock: parseFloat(e.target.value) || 0,
                    })
                  }
                  className="mt-1 w-full rounded border border-[#D9CCB8] bg-white px-3 py-2 font-mono text-xs tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#39332D]">NCM</label>
                <input
                  type="text"
                  value={editingProduct.ncm ?? '21069090'}
                  onChange={(e) =>
                    setEditingProduct({ ...editingProduct, ncm: e.target.value })
                  }
                  className="mt-1 w-full rounded border border-[#D9CCB8] bg-white px-3 py-2 font-mono text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#39332D]">CFOP</label>
                <input
                  type="text"
                  value={editingProduct.cfop ?? '5102'}
                  onChange={(e) =>
                    setEditingProduct({ ...editingProduct, cfop: e.target.value })
                  }
                  className="mt-1 w-full rounded border border-[#D9CCB8] bg-white px-3 py-2 font-mono text-xs"
                />
              </div>
            </div>

            <label className="inline-flex items-center gap-2 text-xs font-medium text-[#39332D]">
              <input
                type="checkbox"
                checked={editingProduct.active ?? true}
                onChange={(e) =>
                  setEditingProduct({ ...editingProduct, active: e.target.checked })
                }
              />
              Produto ativo disponível para venda no PDV
            </label>

            <div className="flex justify-end gap-2 border-t border-[#D9CCB8] pt-4">
              <button
                type="button"
                onClick={() => setEditingProduct(null)}
                className="rounded border border-[#D9CCB8] px-4 py-2 text-xs font-medium text-[#39332D] hover:bg-[#E8DCC8]"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={savingProduct}
                className="rounded bg-[#A65F3F] px-5 py-2 text-xs font-semibold text-[#FAF7F2] hover:bg-[#8C4D30] disabled:opacity-50"
              >
                {savingProduct ? 'Salvando...' : 'Salvar Produto'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* PROMOTION MODAL */}
      {editingPromo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#39332D]/55 p-4">
          <form
            onSubmit={handleSavePromotion}
            className="w-full max-w-xl rounded-lg border border-[#D9CCB8] bg-[#FAF7F2] p-6 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-[#D9CCB8] pb-3">
              <h3 className="text-base font-bold text-[#39332D]">
                {editingPromo.id ? 'Editar Regra Promocional' : 'Nova Regra Promocional'}
              </h3>
              <button
                type="button"
                onClick={() => setEditingPromo(null)}
                className="p-1 text-[#5E4A38] hover:text-[#39332D]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#39332D]">
                Nome da Promoção
              </label>
              <input
                type="text"
                required
                value={editingPromo.name ?? ''}
                onChange={(e) =>
                  setEditingPromo({ ...editingPromo, name: e.target.value })
                }
                placeholder="Ex: Pack 12 Cervejas por R$ 42,00"
                className="mt-1 w-full rounded border border-[#D9CCB8] bg-white px-3 py-2 text-xs"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-[#39332D]">
                  Tipo de Promoção
                </label>
                <select
                  value={editingPromo.type ?? 'QUANTITY_FIXED'}
                  onChange={(e) =>
                    setEditingPromo({
                      ...editingPromo,
                      type: e.target.value as PromotionType,
                    })
                  }
                  className="mt-1 w-full rounded border border-[#D9CCB8] bg-white px-3 py-2 text-xs"
                >
                  {Object.entries(PROMOTION_TYPE_LABELS).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#39332D]">
                  Produto Principal
                </label>
                <select
                  value={editingPromo.productId ?? ''}
                  onChange={(e) =>
                    setEditingPromo({
                      ...editingPromo,
                      productId: Number(e.target.value),
                    })
                  }
                  className="mt-1 w-full rounded border border-[#D9CCB8] bg-white px-3 py-2 text-xs"
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({formatCurrency(p.salePrice)})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {editingPromo.type === 'COMBO' && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-[#39332D]">
                    Segundo Produto do Combo
                  </label>
                  <select
                    value={editingPromo.comboProductId ?? ''}
                    onChange={(e) =>
                      setEditingPromo({
                        ...editingPromo,
                        comboProductId: Number(e.target.value),
                      })
                    }
                    className="mt-1 w-full rounded border border-[#D9CCB8] bg-white px-3 py-2 text-xs"
                  >
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({formatCurrency(p.salePrice)})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#39332D]">
                    Qtd. Item 2
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={editingPromo.comboQty ?? 1}
                    onChange={(e) =>
                      setEditingPromo({
                        ...editingPromo,
                        comboQty: parseFloat(e.target.value) || 1,
                      })
                    }
                    className="mt-1 w-full rounded border border-[#D9CCB8] bg-white px-3 py-2 font-mono text-xs"
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#39332D]">
                  {editingPromo.type === 'BUY_X_PAY_Y'
                    ? 'Quantidade Levada (X)'
                    : 'Quantidade Mínima / Pack'}
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  value={editingPromo.minQuantity ?? 1}
                  onChange={(e) =>
                    setEditingPromo({
                      ...editingPromo,
                      minQuantity: parseFloat(e.target.value) || 1,
                    })
                  }
                  className="mt-1 w-full rounded border border-[#D9CCB8] bg-white px-3 py-2 font-mono text-xs tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#39332D]">
                  {editingPromo.type === 'QUANTITY_FIXED' && 'Valor Total do Pack (R$)'}
                  {editingPromo.type === 'BUY_X_PAY_Y' && 'Quantidade Paga (Y)'}
                  {editingPromo.type === 'PERCENTAGE' && 'Percentual de Desconto (%)'}
                  {editingPromo.type === 'UNIT_PROMO' && 'Novo Preço Unitário (R$)'}
                  {editingPromo.type === 'COMBO' && 'Preço Fechado do Combo (R$)'}
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={editingPromo.promoValue ?? 0}
                  onChange={(e) =>
                    setEditingPromo({
                      ...editingPromo,
                      promoValue: parseFloat(e.target.value) || 0,
                    })
                  }
                  className="mt-1 w-full rounded border border-[#D9CCB8] bg-white px-3 py-2 font-mono text-xs tabular-nums"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#39332D]">
                  Data Inicial
                </label>
                <input
                  type="date"
                  value={editingPromo.startDate ?? ''}
                  onChange={(e) =>
                    setEditingPromo({ ...editingPromo, startDate: e.target.value })
                  }
                  className="mt-1 w-full rounded border border-[#D9CCB8] bg-white px-3 py-2 font-mono text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#39332D]">
                  Data Final
                </label>
                <input
                  type="date"
                  value={editingPromo.endDate ?? ''}
                  onChange={(e) =>
                    setEditingPromo({ ...editingPromo, endDate: e.target.value })
                  }
                  className="mt-1 w-full rounded border border-[#D9CCB8] bg-white px-3 py-2 font-mono text-xs"
                />
              </div>
            </div>

            <label className="inline-flex items-center gap-2 text-xs font-medium text-[#39332D]">
              <input
                type="checkbox"
                checked={editingPromo.active ?? true}
                onChange={(e) =>
                  setEditingPromo({ ...editingPromo, active: e.target.checked })
                }
              />
              Promoção ativa para cálculo automático no PDV
            </label>

            <div className="flex justify-end gap-2 border-t border-[#D9CCB8] pt-4">
              <button
                type="button"
                onClick={() => setEditingPromo(null)}
                className="rounded border border-[#D9CCB8] px-4 py-2 text-xs font-medium text-[#39332D] hover:bg-[#E8DCC8]"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={savingPromo}
                className="rounded bg-[#A65F3F] px-5 py-2 text-xs font-semibold text-[#FAF7F2] hover:bg-[#8C4D30]"
              >
                {savingPromo ? 'Salvando...' : 'Salvar Promoção'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
