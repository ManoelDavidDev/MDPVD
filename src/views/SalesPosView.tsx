import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Ban,
  CheckCircle2,
  FileText,
  Minus,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { apiRequest } from '../api';
import { ReceiptModal } from '../components/ReceiptModal';
import {
  PAYMENT_LABELS,
  PERMISSIONS,
  formatCurrency,
  formatDateTime,
  type CartEvaluationResult,
  type CashRegisterEntity,
  type PaymentMethod,
  type ProductEntity,
  type PromotionEntity,
  type SaleEntity,
  type SystemSettings,
  type UserEntity,
} from '../types';

interface SalesPosViewProps {
  user: UserEntity;
  openRegister: CashRegisterEntity | null;
  settings: SystemSettings;
  onRequestOpenCashModal: () => void;
  onRegisterUpdated: (reg: CashRegisterEntity | null) => void;
  onNotify: (type: 'success' | 'error', message: string) => void;
}

interface PaymentDraft {
  id: string;
  method: PaymentMethod;
  tenderedAmount: string;
}

export const SalesPosView: React.FC<SalesPosViewProps> = ({
  user,
  openRegister,
  settings,
  onRequestOpenCashModal,
  onRegisterUpdated,
  onNotify,
}) => {
  const [subTab, setSubTab] = useState<'pdv' | 'historico'>('pdv');
  const [products, setProducts] = useState<ProductEntity[]>([]);
  const [promotions, setPromotions] = useState<PromotionEntity[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [quickQty, setQuickQty] = useState('1');
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Cart items
  const [cartItems, setCartItems] = useState<Array<{ productId: number; quantity: number }>>(
    []
  );
  const [manualDiscountStr, setManualDiscountStr] = useState('');
  const [manualDiscountReason, setManualDiscountReason] = useState('');
  const [customerCpf, setCustomerCpf] = useState('');
  const [customerName, setCustomerName] = useState('');

  // Inline Supervisor Authorization for restricted discount
  const [authUsername, setAuthUsername] = useState('');
  const [authPassword, setAuthPassword] = useState('');

  // Split payments
  const [payments, setPayments] = useState<PaymentDraft[]>([
    { id: 'pay-1', method: 'DINHEIRO', tenderedAmount: '' },
  ]);

  const [evaluation, setEvaluation] = useState<CartEvaluationResult>({
    lines: [],
    subtotal: 0,
    promoDiscountTotal: 0,
    netAfterPromos: 0,
    manualDiscountTotal: 0,
    totalAmount: 0,
  });

  const [submittingSale, setSubmittingSale] = useState(false);
  const [receiptSale, setReceiptSale] = useState<SaleEntity | null>(null);

  // Sales History & Cancel state
  const [salesHistory, setSalesHistory] = useState<SaleEntity[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [cancellingSale, setCancellingSale] = useState<SaleEntity | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelAuthUser, setCancelAuthUser] = useState('');
  const [cancelAuthPass, setCancelAuthPass] = useState('');
  const [cancellingBusy, setCancellingBusy] = useState(false);

  const loadCatalog = useCallback(async () => {
    try {
      const res = await apiRequest<{
        products: ProductEntity[];
        promotions: PromotionEntity[];
      }>('/api/catalog?onlyActive=true');
      setProducts(res.products);
      setPromotions(res.promotions.filter((p) => p.active));
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Erro ao carregar produtos.');
    }
  }, [onNotify]);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await apiRequest<{ sales: SaleEntity[] }>('/api/sales');
      setSalesHistory(res.sales);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Erro ao carregar histórico.');
    } finally {
      setLoadingHistory(false);
    }
  }, [onNotify]);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    if (subTab === 'historico') {
      loadHistory();
    }
  }, [subTab, loadHistory]);

  // Evaluate Cart server-side whenever items or manual discount change
  const manualDiscountVal = useMemo(() => {
    const parsed = parseFloat(manualDiscountStr.replace(',', '.'));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }, [manualDiscountStr]);

  useEffect(() => {
    let active = true;
    if (cartItems.length === 0) {
      setEvaluation({
        lines: [],
        subtotal: 0,
        promoDiscountTotal: 0,
        netAfterPromos: 0,
        manualDiscountTotal: 0,
        totalAmount: 0,
      });
      return;
    }

    apiRequest<CartEvaluationResult>('/api/pos/evaluate-cart', {
      method: 'POST',
      body: JSON.stringify({
        items: cartItems,
        manualDiscount: manualDiscountVal,
      }),
    })
      .then((res) => {
        if (active) setEvaluation(res);
      })
      .catch(() => {
        // silent fallback
      });

    return () => {
      active = false;
    };
  }, [cartItems, manualDiscountVal]);

  // Keep single-payment default synced with total if user hasn't typed custom split yet
  const addProductToCart = (product: ProductEntity, addQty = 1) => {
    if (!openRegister) {
      onNotify(
        'error',
        'Não é permitido registrar itens sem caixa aberto. Abra o caixa primeiro.'
      );
      return;
    }
    const cleanQty = Math.max(1, addQty);
    setCartItems((prev) => {
      const existing = prev.find((i) => i.productId === product.id);
      const nextQty = (existing?.quantity ?? 0) + cleanQty;
      if (nextQty > product.stockQuantity) {
        onNotify(
          'error',
          `Estoque insuficiente para "${product.name}". Disponível: ${product.stockQuantity} ${product.unit}.`
        );
        return prev;
      }
      if (existing) {
        return prev.map((i) =>
          i.productId === product.id ? { ...i, quantity: nextQty } : i
        );
      }
      return [...prev, { productId: product.id, quantity: cleanQty }];
    });
  };

  const updateLineQuantity = (productId: number, nextQuantity: number) => {
    const prod = products.find((p) => p.id === productId);
    if (!prod) return;
    if (nextQuantity <= 0) {
      setCartItems((prev) => prev.filter((i) => i.productId !== productId));
      return;
    }
    if (nextQuantity > prod.stockQuantity) {
      onNotify(
        'error',
        `Estoque máximo disponível para "${prod.name}": ${prod.stockQuantity} ${prod.unit}.`
      );
      return;
    }
    setCartItems((prev) =>
      prev.map((i) => (i.productId === productId ? { ...i, quantity: nextQuantity } : i))
    );
  };

  const handleBarcodeOrSearchEnter = (e: React.FormEvent) => {
    e.preventDefault();
    const term = searchQuery.trim();
    if (!term) return;
    const qty = Math.max(1, parseFloat(quickQty.replace(',', '.')) || 1);

    // Exact barcode or SKU match adds directly like a laser scanner!
    const exact = products.find(
      (p) => p.barcode === term || p.sku.toLowerCase() === term.toLowerCase()
    );
    if (exact) {
      addProductToCart(exact, qty);
      setSearchQuery('');
      setQuickQty('1');
      return;
    }

    const filtered = filteredProducts;
    if (filtered.length === 1) {
      addProductToCart(filtered[0], qty);
      setSearchQuery('');
      setQuickQty('1');
    }
  };

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.barcode.includes(q)
    );
  }, [products, searchQuery]);

  // Check if manual discount exceeds operator permission
  const requiresDiscountAuth = useMemo(() => {
    if (evaluation.manualDiscountTotal <= 0 || evaluation.netAfterPromos <= 0) {
      return false;
    }
    const pct = (evaluation.manualDiscountTotal / evaluation.netAfterPromos) * 100;
    return (
      pct > settings.maxOperatorDiscountPercent &&
      !user.permissions.includes(PERMISSIONS.POS_DISCOUNT_HIGH)
    );
  }, [evaluation, settings.maxOperatorDiscountPercent, user.permissions]);

  // Payment math
  const parsedPayments = useMemo(() => {
    return payments.map((p) => {
      const val = parseFloat(p.tenderedAmount.replace(',', '.'));
      return {
        ...p,
        numericAmount: Number.isFinite(val) && val > 0 ? val : 0,
      };
    });
  }, [payments]);

  const totalTendered = useMemo(
    () => parsedPayments.reduce((acc, p) => acc + p.numericAmount, 0),
    [parsedPayments]
  );

  const remainingToPay = Math.max(
    0,
    Math.round((evaluation.totalAmount - totalTendered) * 100) / 100
  );
  const estimatedChange = Math.max(
    0,
    Math.round((totalTendered - evaluation.totalAmount) * 100) / 100
  );

  const handleSetExactRemaining = (paymentId: string) => {
    const othersSum = parsedPayments
      .filter((p) => p.id !== paymentId)
      .reduce((acc, p) => acc + p.numericAmount, 0);
    const needed = Math.max(
      0,
      Math.round((evaluation.totalAmount - othersSum) * 100) / 100
    );
    setPayments((prev) =>
      prev.map((p) =>
        p.id === paymentId ? { ...p, tenderedAmount: needed.toFixed(2) } : p
      )
    );
  };

  const handleAddPaymentSplit = () => {
    const othersSum = parsedPayments.reduce((acc, p) => acc + p.numericAmount, 0);
    const needed = Math.max(
      0,
      Math.round((evaluation.totalAmount - othersSum) * 100) / 100
    );
    setPayments((prev) => [
      ...prev,
      {
        id: `pay-${Date.now()}`,
        method: 'PIX',
        tenderedAmount: needed > 0 ? needed.toFixed(2) : '',
      },
    ]);
  };

  const handleClearSaleDraft = () => {
    setCartItems([]);
    setManualDiscountStr('');
    setManualDiscountReason('');
    setCustomerCpf('');
    setCustomerName('');
    setAuthUsername('');
    setAuthPassword('');
    setPayments([{ id: 'pay-1', method: 'DINHEIRO', tenderedAmount: '' }]);
  };

  const handleCompleteSale = async () => {
    if (cartItems.length === 0) return;

    // Auto-fill exact amount if user left the single payment input blank
    let effectivePayments = parsedPayments
      .filter((p) => p.numericAmount > 0)
      .map((p) => ({
        method: p.method,
        tenderedAmount: p.numericAmount,
      }));

    if (effectivePayments.length === 0 && payments.length === 1) {
      effectivePayments = [
        {
          method: payments[0].method,
          tenderedAmount: evaluation.totalAmount,
        },
      ];
    }

    setSubmittingSale(true);
    try {
      const idempotencyKey = `pos-${user.id}-${Date.now()}`;
      const res = await apiRequest<{
        sale: SaleEntity;
        openRegister: CashRegisterEntity | null;
      }>('/api/sales', {
        method: 'POST',
        body: JSON.stringify({
          idempotencyKey,
          items: cartItems,
          manualDiscountAmount: manualDiscountVal,
          manualDiscountReason: manualDiscountReason || undefined,
          customerCpf: customerCpf || undefined,
          customerName: customerName || undefined,
          payments: effectivePayments,
          authorizer: requiresDiscountAuth
            ? { username: authUsername, password: authPassword }
            : undefined,
        }),
      });

      onRegisterUpdated(res.openRegister);
      await loadCatalog();
      handleClearSaleDraft();
      setReceiptSale(res.sale);
      onNotify(
        'success',
        `Venda ${res.sale.saleNumber} confirmada com sucesso (${formatCurrency(
          res.sale.totalAmount
        )}).`
      );
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Falha ao finalizar venda.');
    } finally {
      setSubmittingSale(false);
    }
  };

  const handleConfirmCancelSale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancellingSale) return;
    setCancellingBusy(true);
    try {
      const needsSupervisor = !user.permissions.includes(PERMISSIONS.POS_CANCEL_SALE);
      const res = await apiRequest<{
        sale: SaleEntity;
        openRegister: CashRegisterEntity | null;
      }>(`/api/sales/${cancellingSale.id}/cancel`, {
        method: 'POST',
        body: JSON.stringify({
          reason: cancelReason,
          authorizer: needsSupervisor
            ? { username: cancelAuthUser, password: cancelAuthPass }
            : undefined,
        }),
      });
      onRegisterUpdated(res.openRegister);
      setCancellingSale(null);
      setCancelReason('');
      setCancelAuthUser('');
      setCancelAuthPass('');
      await Promise.all([loadHistory(), loadCatalog()]);
      onNotify('success', `Venda ${res.sale.saleNumber} cancelada e estoque recomposto.`);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Erro ao cancelar venda.');
    } finally {
      setCancellingBusy(false);
    }
  };

  const handleRetransmitFiscal = async (saleId: number) => {
    try {
      const res = await apiRequest<{ sale: SaleEntity }>(
        `/api/sales/${saleId}/retransmit-fiscal`,
        { method: 'POST' }
      );
      setReceiptSale(res.sale);
      if (subTab === 'historico') {
        await loadHistory();
      }
      onNotify('success', `Retransmissão fiscal concluída: ${res.sale.fiscalDocument?.sefazMessage}`);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Falha na transmissão SEFAZ.');
    }
  };

  return (
    <div className="mx-auto max-w-[1440px] px-6 py-6">
      {/* Sub-navigation header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-[#D9CCB8] pb-3">
        <div className="flex items-center gap-6">
          <button
            type="button"
            onClick={() => setSubTab('pdv')}
            className={`pb-2 text-sm transition-colors whitespace-nowrap shrink-0 ${
              subTab === 'pdv'
                ? 'border-b-2 border-[#C87952] font-semibold text-[#39332D]'
                : 'text-[#5E4A38] hover:text-[#39332D]'
            }`}
          >
            Frente de Caixa (PDV)
          </button>
          <button
            type="button"
            onClick={() => setSubTab('historico')}
            className={`pb-2 text-sm transition-colors whitespace-nowrap shrink-0 ${
              subTab === 'historico'
                ? 'border-b-2 border-[#C87952] font-semibold text-[#39332D]'
                : 'text-[#5E4A38] hover:text-[#39332D]'
            }`}
          >
            Histórico de Vendas e Cancelamentos
          </button>
        </div>

        <div className="text-xs text-[#5E4A38]">
          Operador: <span className="font-medium text-[#39332D]">{user.fullName}</span>
          {' · '}
          {openRegister ? (
            <span>
              Turno <strong className="text-[#39332D]">{openRegister.code}</strong>
            </span>
          ) : (
            <span className="font-semibold text-[#A65F3F]">Caixa Fechado</span>
          )}
        </div>
      </div>

      {subTab === 'pdv' ? (
        !openRegister ? (
          <div className="mx-auto my-12 max-w-lg rounded-lg border border-[#D9CCB8] bg-[#FAF7F2] p-10 text-center">
            <h2 className="text-xl font-bold text-[#39332D]">
              Operação Bloqueada — Caixa Fechado
            </h2>
            <p className="mt-2 text-sm text-[#5E4A38]">
              Conforme regra de negócio comercial, não é permitido iniciar ou registrar
              vendas sem um turno de caixa aberto e identificado.
            </p>
            <button
              type="button"
              onClick={onRequestOpenCashModal}
              className="mt-6 rounded bg-[#A65F3F] px-6 py-2.5 text-sm font-semibold text-[#FAF7F2] hover:bg-[#8C4D30]"
            >
              ABRIR CAIXA AGORA
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
            {/* Left Column: Barcode Scanner, Product Lookup & Active Promotions */}
            <div className="lg:col-span-7 space-y-5">
              <form
                onSubmit={handleBarcodeOrSearchEnter}
                className="rounded-lg border border-[#D9CCB8] bg-[#FAF7F2] p-4"
              >
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-[#39332D]">
                      Qtd.
                    </label>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={quickQty}
                      onChange={(e) => setQuickQty(e.target.value)}
                      className="mt-1 w-full rounded border border-[#D9CCB8] bg-white px-3 py-2 font-mono text-sm text-[#39332D] tabular-nums outline-none focus:border-[#C87952]"
                    />
                  </div>
                  <div className="sm:col-span-7">
                    <label className="block text-xs font-semibold text-[#39332D]">
                      Leitura de Código de Barras (EAN), SKU ou Nome
                    </label>
                    <div className="relative mt-1">
                      <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[#80664C]" />
                      <input
                        ref={searchInputRef}
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Bipe o código EAN (ex: 7891149100019) ou pesquise..."
                        className="w-full rounded border border-[#D9CCB8] bg-white py-2 pl-9 pr-3 text-sm text-[#39332D] outline-none focus:border-[#C87952]"
                      />
                    </div>
                  </div>
                  <div className="sm:col-span-3 flex items-end">
                    <button
                      type="submit"
                      className="w-full rounded bg-[#A65F3F] px-4 py-2 text-sm font-semibold text-[#FAF7F2] hover:bg-[#8C4D30] whitespace-nowrap"
                    >
                      Incluir Item
                    </button>
                  </div>
                </div>

                {promotions.length > 0 && (
                  <div className="mt-3 border-t border-[#E8DCC8] pt-2.5 text-xs text-[#5E4A38]">
                    <span className="font-semibold text-[#39332D]">
                      Condições automáticas vigentes:{' '}
                    </span>
                    {promotions.map((p, i) => (
                      <span key={p.id}>
                        {i > 0 ? ' · ' : ''}
                        {p.name}
                      </span>
                    ))}
                  </div>
                )}
              </form>

              {/* Product Grid / Dense Lookup Table */}
              <div className="rounded-lg border border-[#D9CCB8] bg-[#FAF7F2] overflow-hidden">
                <div className="flex items-center justify-between border-b border-[#D9CCB8] px-4 py-3">
                  <h2 className="text-sm font-semibold text-[#39332D]">
                    Catálogo Rápido de Produtos ({filteredProducts.length})
                  </h2>
                  <span className="text-xs text-[#5E4A38]">
                    Clique em um item para adicionar ao carrinho
                  </span>
                </div>

                <div className="max-h-[500px] overflow-y-auto">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead className="sticky top-0 bg-[#E8DCC8] text-[#39332D]">
                      <tr>
                        <th className="px-4 py-2.5 font-semibold">SKU / EAN</th>
                        <th className="px-4 py-2.5 font-semibold">Produto</th>
                        <th className="px-4 py-2.5 text-right font-semibold">Estoque</th>
                        <th className="px-4 py-2.5 text-right font-semibold">Preço Un.</th>
                        <th className="px-4 py-2.5 text-right font-semibold">Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E8DCC8]">
                      {filteredProducts.map((p) => {
                        const qtyNum = Math.max(
                          1,
                          parseFloat(quickQty.replace(',', '.')) || 1
                        );
                        const hasPackPromo = promotions.find(
                          (pr) => pr.productId === p.id && pr.type === 'QUANTITY_FIXED'
                        );
                        return (
                          <tr
                            key={p.id}
                            className="transition-colors hover:bg-[#F5F0E6]"
                          >
                            <td className="px-4 py-2.5 font-mono text-[11px] text-[#5E4A38] tabular-nums">
                              <div>{p.sku}</div>
                              <div>{p.barcode}</div>
                            </td>
                            <td className="px-4 py-2.5">
                              <div className="font-medium text-[#39332D]">{p.name}</div>
                              <div className="text-[11px] text-[#5E4A38]">
                                {p.categoryName}
                                {p.promotionalPrice
                                  ? ` · Oferta Un.: ${formatCurrency(p.promotionalPrice)}`
                                  : ''}
                                {hasPackPromo ? ` · ${hasPackPromo.name}` : ''}
                              </div>
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[#39332D]">
                              {p.stockQuantity} {p.unit}
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono font-semibold tabular-nums text-[#39332D]">
                              {formatCurrency(p.salePrice)}
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              <div className="inline-flex items-center gap-1.5">
                                {hasPackPromo && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      addProductToCart(p, hasPackPromo.minQuantity)
                                    }
                                    className="rounded border border-[#C87952] px-2 py-1 text-[11px] font-medium text-[#39332D] hover:bg-[#E8DCC8] whitespace-nowrap"
                                    title={`Adicionar ${hasPackPromo.minQuantity} unidades`}
                                  >
                                    +{hasPackPromo.minQuantity} un
                                  </button>
                                )}
                                <button
                                  type="button"
                                  disabled={p.stockQuantity <= 0}
                                  onClick={() => addProductToCart(p, qtyNum)}
                                  className="rounded bg-[#E8DCC8] px-2.5 py-1 text-xs font-semibold text-[#39332D] hover:bg-[#C87952] hover:text-white disabled:opacity-40 whitespace-nowrap"
                                >
                                  + Adicionar
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {filteredProducts.length === 0 && (
                        <tr>
                          <td
                            colSpan={5}
                            className="px-4 py-8 text-center text-sm text-[#5E4A38]"
                          >
                            Nenhum produto encontrado para "{searchQuery}".
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Right Column: Shopping Cart, Automatic Promotions, Split Payments & Checkout */}
            <div className="lg:col-span-5 rounded-lg border border-[#D9CCB8] bg-[#FAF7F2] p-5 space-y-5">
              <div className="flex items-center justify-between border-b border-[#D9CCB8] pb-3">
                <h2 className="text-base font-bold text-[#39332D]">
                  Cupom em Aberto ({evaluation.lines.length} itens)
                </h2>
                {cartItems.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearSaleDraft}
                    className="text-xs font-medium text-[#A65F3F] hover:underline whitespace-nowrap"
                  >
                    Limpar Carrinho
                  </button>
                )}
              </div>

              {/* Cart Lines */}
              {evaluation.lines.length === 0 ? (
                <div className="py-12 text-center text-sm text-[#5E4A38]">
                  Carrinho vazio. Bipe um código de barras ou selecione produtos no
                  catálogo ao lado.
                </div>
              ) : (
                <div className="max-h-64 space-y-2.5 overflow-y-auto pr-1">
                  {evaluation.lines.map((line) => (
                    <div
                      key={line.productId}
                      className="border-b border-[#E8DCC8] pb-2.5 text-xs"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-semibold text-[#39332D]">{line.name}</div>
                          <div className="font-mono text-[11px] text-[#5E4A38] tabular-nums">
                            {line.sku} · {formatCurrency(line.unitPrice)} / {line.unit}
                          </div>
                          {line.promoAppliedName && (
                            <div className="mt-0.5 text-[11px] font-medium text-[#A65F3F]">
                              Promoção aplicada: {line.promoAppliedName} (-
                              {formatCurrency(line.promoDiscountAmount)})
                            </div>
                          )}
                        </div>

                        <div className="text-right font-mono tabular-nums">
                          {line.promoDiscountAmount > 0 && (
                            <div className="text-[11px] text-[#80664C] line-through">
                              {formatCurrency(line.grossTotal)}
                            </div>
                          )}
                          <div className="text-sm font-bold text-[#39332D]">
                            {formatCurrency(line.finalLineTotal)}
                          </div>
                        </div>
                      </div>

                      <div className="mt-2 flex items-center justify-between">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              updateLineQuantity(line.productId, line.quantity - 1)
                            }
                            className="rounded border border-[#D9CCB8] bg-white p-1 text-[#39332D] hover:bg-[#E8DCC8]"
                            aria-label="Diminuir quantidade"
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <input
                            type="number"
                            min="1"
                            value={line.quantity}
                            onChange={(e) =>
                              updateLineQuantity(
                                line.productId,
                                parseInt(e.target.value, 10) || 1
                              )
                            }
                            className="w-14 rounded border border-[#D9CCB8] bg-white px-2 py-0.5 text-center font-mono text-xs tabular-nums"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              updateLineQuantity(line.productId, line.quantity + 1)
                            }
                            className="rounded border border-[#D9CCB8] bg-white p-1 text-[#39332D] hover:bg-[#E8DCC8]"
                            aria-label="Aumentar quantidade"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => updateLineQuantity(line.productId, 0)}
                          className="inline-flex items-center gap-1 text-[11px] text-[#5E4A38] hover:text-[#A65F3F]"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Remover
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Optional Manual Discount & CPF */}
              {evaluation.lines.length > 0 && (
                <>
                  <div className="grid grid-cols-2 gap-3 border-t border-[#D9CCB8] pt-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-[#39332D]">
                        Desconto Comercial (R$)
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={manualDiscountStr}
                        onChange={(e) => setManualDiscountStr(e.target.value)}
                        placeholder="0,00"
                        className="mt-1 w-full rounded border border-[#D9CCB8] bg-white px-2.5 py-1.5 font-mono text-xs tabular-nums outline-none focus:border-[#C87952]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-[#39332D]">
                        CPF na Nota (Opcional)
                      </label>
                      <input
                        type="text"
                        value={customerCpf}
                        onChange={(e) => setCustomerCpf(e.target.value)}
                        placeholder="000.000.000-00"
                        className="mt-1 w-full rounded border border-[#D9CCB8] bg-white px-2.5 py-1.5 font-mono text-xs tabular-nums outline-none focus:border-[#C87952]"
                      />
                    </div>
                  </div>

                  {requiresDiscountAuth && (
                    <div className="rounded border border-[#C87952] bg-[#F5F0E6] p-3 space-y-2">
                      <div className="text-xs font-semibold text-[#39332D]">
                        Desconto acima de {settings.maxOperatorDiscountPercent}% exige
                        autorização de Supervisor/Gerente:
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={authUsername}
                          onChange={(e) => setAuthUsername(e.target.value)}
                          placeholder="Usuário autorizador"
                          className="rounded border border-[#D9CCB8] bg-white px-2.5 py-1.5 text-xs"
                        />
                        <input
                          type="password"
                          value={authPassword}
                          onChange={(e) => setAuthPassword(e.target.value)}
                          placeholder="Senha autorizador"
                          className="rounded border border-[#D9CCB8] bg-white px-2.5 py-1.5 text-xs"
                        />
                      </div>
                    </div>
                  )}

                  {/* Financial Totals */}
                  <div className="space-y-1.5 rounded border border-[#D9CCB8] bg-[#F5F0E6] p-3.5 font-mono text-xs tabular-nums">
                    <div className="flex justify-between text-[#5E4A38]">
                      <span>Subtotal Bruto</span>
                      <span>{formatCurrency(evaluation.subtotal)}</span>
                    </div>
                    {evaluation.promoDiscountTotal > 0 && (
                      <div className="flex justify-between font-medium text-[#A65F3F]">
                        <span>Economia Promocional Automática</span>
                        <span>- {formatCurrency(evaluation.promoDiscountTotal)}</span>
                      </div>
                    )}
                    {evaluation.manualDiscountTotal > 0 && (
                      <div className="flex justify-between text-[#5E4A38]">
                        <span>Desconto Comercial</span>
                        <span>- {formatCurrency(evaluation.manualDiscountTotal)}</span>
                      </div>
                    )}
                    <div className="flex justify-between border-t border-[#D9CCB8] pt-2 text-base font-bold text-[#39332D]">
                      <span>TOTAL A PAGAR</span>
                      <span>{formatCurrency(evaluation.totalAmount)}</span>
                    </div>
                  </div>

                  {/* Split Payment Section */}
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-[#39332D]">
                        Formas de Pagamento (Suporta Pagamento Dividido)
                      </span>
                      <button
                        type="button"
                        onClick={handleAddPaymentSplit}
                        className="text-xs font-semibold text-[#A65F3F] hover:underline whitespace-nowrap"
                      >
                        + Dividir Pagamento
                      </button>
                    </div>

                    {payments.map((pay, idx) => (
                      <div key={pay.id} className="flex items-center gap-2">
                        <select
                          value={pay.method}
                          onChange={(e) =>
                            setPayments((prev) =>
                              prev.map((p) =>
                                p.id === pay.id
                                  ? { ...p, method: e.target.value as PaymentMethod }
                                  : p
                              )
                            )
                          }
                          className="w-40 rounded border border-[#D9CCB8] bg-white px-2.5 py-1.5 text-xs font-medium text-[#39332D]"
                        >
                          <option value="DINHEIRO">Dinheiro</option>
                          <option value="PIX">PIX</option>
                          <option value="DEBITO">Cartão Débito</option>
                          <option value="CREDITO">Cartão Crédito</option>
                          <option value="VALE">Vale / Convênio</option>
                        </select>

                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={pay.tenderedAmount}
                          onChange={(e) =>
                            setPayments((prev) =>
                              prev.map((p) =>
                                p.id === pay.id
                                  ? { ...p, tenderedAmount: e.target.value }
                                  : p
                              )
                            )
                          }
                          placeholder={
                            payments.length === 1
                              ? evaluation.totalAmount.toFixed(2)
                              : '0,00'
                          }
                          className="flex-1 rounded border border-[#D9CCB8] bg-white px-2.5 py-1.5 font-mono text-xs tabular-nums"
                        />

                        <button
                          type="button"
                          onClick={() => handleSetExactRemaining(pay.id)}
                          className="rounded border border-[#D9CCB8] bg-[#E8DCC8] px-2 py-1.5 text-[11px] font-medium text-[#39332D] hover:bg-[#D9CCB8] whitespace-nowrap"
                        >
                          Restante
                        </button>

                        {idx > 0 && (
                          <button
                            type="button"
                            onClick={() =>
                              setPayments((prev) => prev.filter((p) => p.id !== pay.id))
                            }
                            className="p-1 text-[#5E4A38] hover:text-[#A65F3F]"
                            aria-label="Remover parcela"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    ))}

                    {totalTendered > 0 && (
                      <div className="flex justify-between pt-1 font-mono text-xs tabular-nums">
                        {remainingToPay > 0 ? (
                          <span className="text-[#A65F3F]">
                            Falta receber: {formatCurrency(remainingToPay)}
                          </span>
                        ) : (
                          <span className="text-[#39332D]">
                            Recebido: {formatCurrency(totalTendered)}
                          </span>
                        )}
                        {estimatedChange > 0 && (
                          <span className="font-bold text-[#39332D]">
                            Troco: {formatCurrency(estimatedChange)}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    disabled={submittingSale}
                    onClick={handleCompleteSale}
                    className="flex w-full items-center justify-center gap-2 rounded bg-[#A65F3F] px-5 py-3 text-sm font-bold text-[#FAF7F2] transition-colors hover:bg-[#8C4D30] disabled:opacity-60"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    {submittingSale
                      ? 'Processando Venda e Documento Fiscal...'
                      : `FINALIZAR VENDA (${formatCurrency(evaluation.totalAmount)})`}
                  </button>
                </>
              )}
            </div>
          </div>
        )
      ) : (
        /* Sales History & Authorized Cancellation */
        <div className="rounded-lg border border-[#D9CCB8] bg-[#FAF7F2] overflow-hidden">
          <div className="flex items-center justify-between border-b border-[#D9CCB8] px-5 py-3.5">
            <h2 className="text-sm font-semibold text-[#39332D]">
              Histórico de Vendas Registradas
            </h2>
            <span className="text-xs text-[#5E4A38]">
              {salesHistory.length} operações listadas
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead className="bg-[#E8DCC8] text-[#39332D]">
                <tr>
                  <th className="px-4 py-3 font-semibold">Nº Venda</th>
                  <th className="px-4 py-3 font-semibold">Data / Horário</th>
                  <th className="px-4 py-3 font-semibold">Operador</th>
                  <th className="px-4 py-3 font-semibold">Pagamento</th>
                  <th className="px-4 py-3 font-semibold">Status Fiscal</th>
                  <th className="px-4 py-3 text-right font-semibold">Total</th>
                  <th className="px-4 py-3 text-right font-semibold">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8DCC8]">
                {loadingHistory ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-[#5E4A38]">
                      Carregando histórico de vendas...
                    </td>
                  </tr>
                ) : (
                  salesHistory.map((s) => (
                    <tr key={s.id} className="hover:bg-[#F5F0E6]">
                      <td className="px-4 py-3 font-mono font-semibold text-[#39332D]">
                        {s.saleNumber}
                        {s.status === 'CANCELLED' && (
                          <span className="ml-2 font-sans text-[11px] font-medium text-[#A65F3F]">
                            · Cancelada
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono tabular-nums text-[#5E4A38]">
                        {formatDateTime(s.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-[#39332D]">{s.operatorName}</td>
                      <td className="px-4 py-3 text-[#5E4A38]">
                        {(s.payments ?? [])
                          .map((p) => PAYMENT_LABELS[p.method] ?? p.method)
                          .join(' + ')}
                      </td>
                      <td className="px-4 py-3 text-[#5E4A38]">
                        {s.fiscalDocument?.status === 'AUTHORIZED' &&
                          `NFC-e #${s.fiscalDocument.number} Autorizada`}
                        {s.fiscalDocument?.status === 'CONTINGENCY_OFFLINE' &&
                          `NFC-e #${s.fiscalDocument.number} Contingência`}
                        {s.fiscalDocument?.status === 'REJECTED' &&
                          `NFC-e #${s.fiscalDocument.number} Rejeitada`}
                        {s.fiscalDocument?.status === 'CANCELLED' &&
                          `NFC-e #${s.fiscalDocument.number} Cancelada`}
                        {s.fiscalDocument?.status === 'NON_FISCAL' &&
                          'Comprovante Não Fiscal'}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums text-[#39332D]">
                        {formatCurrency(s.totalAmount)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setReceiptSale(s)}
                            className="inline-flex items-center gap-1 rounded border border-[#D9CCB8] bg-white px-2.5 py-1 text-xs font-medium text-[#39332D] hover:bg-[#E8DCC8] whitespace-nowrap"
                          >
                            <FileText className="h-3.5 w-3.5" />
                            Cupom / XML
                          </button>
                          {s.status === 'COMPLETED' && (
                            <button
                              type="button"
                              onClick={() => setCancellingSale(s)}
                              className="inline-flex items-center gap-1 rounded border border-[#A65F3F] px-2.5 py-1 text-xs font-medium text-[#A65F3F] hover:bg-[#A65F3F] hover:text-white whitespace-nowrap"
                            >
                              <Ban className="h-3.5 w-3.5" />
                              Cancelar
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Cancel Sale Modal */}
      {cancellingSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#39332D]/55 p-4">
          <form
            onSubmit={handleConfirmCancelSale}
            className="w-full max-w-md rounded-lg border border-[#D9CCB8] bg-[#FAF7F2] p-6 space-y-4"
          >
            <h3 className="text-base font-bold text-[#39332D]">
              Cancelar Venda {cancellingSale.saleNumber}
            </h3>
            <p className="text-xs text-[#5E4A38]">
              Valor: <strong className="font-mono">{formatCurrency(cancellingSale.totalAmount)}</strong>.
              O cancelamento estornará os itens ao estoque, cancelará o documento fiscal
              vinculado e registrará auditoria permanente.
            </p>

            <div>
              <label className="block text-xs font-semibold text-[#39332D]">
                Justificativa Obrigatória (mínimo 15 caracteres — padrão SEFAZ)
              </label>
              <textarea
                required
                minLength={15}
                rows={3}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Ex: Solicitação de cancelamento pelo cliente por erro na escolha dos itens"
                className="mt-1 w-full rounded border border-[#D9CCB8] bg-white p-2.5 text-xs text-[#39332D]"
              />
            </div>

            {!user.permissions.includes(PERMISSIONS.POS_CANCEL_SALE) && (
              <div className="rounded border border-[#C87952] bg-[#F5F0E6] p-3 space-y-2">
                <div className="text-xs font-semibold text-[#39332D]">
                  Credenciais do Supervisor / Gerente:
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    required
                    value={cancelAuthUser}
                    onChange={(e) => setCancelAuthUser(e.target.value)}
                    placeholder="Usuário (ex: supervisor)"
                    className="rounded border border-[#D9CCB8] bg-white px-2.5 py-1.5 text-xs"
                  />
                  <input
                    type="password"
                    required
                    value={cancelAuthPass}
                    onChange={(e) => setCancelAuthPass(e.target.value)}
                    placeholder="Senha"
                    className="rounded border border-[#D9CCB8] bg-white px-2.5 py-1.5 text-xs"
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCancellingSale(null)}
                className="rounded border border-[#D9CCB8] px-4 py-2 text-xs font-medium text-[#39332D] hover:bg-[#E8DCC8]"
              >
                Voltar
              </button>
              <button
                type="submit"
                disabled={cancellingBusy}
                className="rounded bg-[#A65F3F] px-4 py-2 text-xs font-semibold text-[#FAF7F2] hover:bg-[#8C4D30] disabled:opacity-50"
              >
                {cancellingBusy ? 'Cancelando...' : 'Confirmar Cancelamento'}
              </button>
            </div>
          </form>
        </div>
      )}

      {receiptSale && (
        <ReceiptModal
          sale={receiptSale}
          settings={settings}
          onClose={() => setReceiptSale(null)}
          onRetransmitFiscal={handleRetransmitFiscal}
        />
      )}
    </div>
  );
};
