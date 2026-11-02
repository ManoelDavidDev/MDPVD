import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ArrowDownUp, Plus, X } from 'lucide-react';
import { apiRequest } from '../api';
import {
  PERMISSIONS,
  formatCurrency,
  formatDateTime,
  type ProductEntity,
  type StockMovementEntity,
  type UserEntity,
} from '../types';

interface StockViewProps {
  user: UserEntity;
  onNotify: (type: 'success' | 'error', message: string) => void;
}

const MOVEMENT_TYPE_LABELS: Record<StockMovementEntity['type'], string> = {
  ENTRY: 'Entrada de Mercadoria',
  SALE_EXIT: 'Baixa por Venda Confirmada',
  SALE_CANCEL_RETURN: 'Retorno por Cancelamento de Venda',
  ADJUSTMENT: 'Ajuste de Inventário',
  LOSS_DAMAGE: 'Baixa por Perda / Avaria',
};

export const StockView: React.FC<StockViewProps> = ({ user, onNotify }) => {
  const [products, setProducts] = useState<ProductEntity[]>([]);
  const [lowStock, setLowStock] = useState<ProductEntity[]>([]);
  const [movements, setMovements] = useState<StockMovementEntity[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterProductId, setFilterProductId] = useState<string>('');

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<number>(0);
  const [movType, setMovType] = useState<'ENTRY' | 'ADJUSTMENT' | 'LOSS_DAMAGE'>('ENTRY');
  const [direction, setDirection] = useState<'IN' | 'OUT'>('IN');
  const [quantity, setQuantity] = useState('12');
  const [unitCost, setUnitCost] = useState('');
  const [reason, setReason] = useState('');
  const [referenceId, setReferenceId] = useState('');
  const [authUser, setAuthUser] = useState('');
  const [authPass, setAuthPass] = useState('');
  const [saving, setSaving] = useState(false);

  const needsSupervisorAuth = !user.permissions.includes(PERMISSIONS.STOCK_ADJUST);

  const loadStock = useCallback(async () => {
    setLoading(true);
    try {
      const url = filterProductId
        ? `/api/stock?productId=${encodeURIComponent(filterProductId)}`
        : '/api/stock';
      const res = await apiRequest<{
        products: ProductEntity[];
        lowStockProducts: ProductEntity[];
        movements: StockMovementEntity[];
      }>(url);
      setProducts(res.products);
      setLowStock(res.lowStockProducts);
      setMovements(res.movements);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Erro ao consultar estoque.');
    } finally {
      setLoading(false);
    }
  }, [filterProductId, onNotify]);

  useEffect(() => {
    loadStock();
  }, [loadStock]);

  const openMovementDialog = (
    product?: ProductEntity,
    presetType: 'ENTRY' | 'ADJUSTMENT' | 'LOSS_DAMAGE' = 'ENTRY'
  ) => {
    const target = product ?? products[0];
    setSelectedProductId(target?.id ?? 0);
    setMovType(presetType);
    setDirection('IN');
    setQuantity('12');
    setUnitCost(target ? String(target.costPrice) : '');
    setReason('');
    setReferenceId('');
    setShowModal(true);
  };

  const handleSubmitMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiRequest('/api/stock/movements', {
        method: 'POST',
        body: JSON.stringify({
          productId: selectedProductId,
          type: movType,
          direction,
          quantity: parseFloat(quantity.replace(',', '.')) || 0,
          unitCost: unitCost ? parseFloat(unitCost.replace(',', '.')) : undefined,
          reason,
          referenceId: referenceId || undefined,
          authorizer: needsSupervisorAuth
            ? { username: authUser, password: authPass }
            : undefined,
        }),
      });
      setShowModal(false);
      await loadStock();
      onNotify('success', 'Movimentação de estoque registrada com sucesso.');
    } catch (err) {
      onNotify(
        'error',
        err instanceof Error ? err.message : 'Erro ao movimentar estoque.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1440px] px-6 py-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#D9CCB8] pb-3">
        <div>
          <h1 className="text-lg font-bold text-[#39332D]">
            Controle de Estoque e Kardex
          </h1>
          <p className="text-xs text-[#5E4A38]">
            Entradas de mercadorias, baixas automáticas pós-venda, perdas/avarias e
            alertas de reposição.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => openMovementDialog(undefined, 'ENTRY')}
            className="inline-flex items-center gap-1.5 rounded bg-[#A65F3F] px-4 py-2 text-xs font-semibold text-[#FAF7F2] hover:bg-[#8C4D30] whitespace-nowrap"
          >
            <Plus className="h-4 w-4" />
            Entrada de Mercadoria
          </button>
          <button
            type="button"
            onClick={() => openMovementDialog(undefined, 'ADJUSTMENT')}
            className="inline-flex items-center gap-1.5 rounded border border-[#80664C] bg-[#FAF7F2] px-4 py-2 text-xs font-medium text-[#39332D] hover:bg-[#E8DCC8] whitespace-nowrap"
          >
            <ArrowDownUp className="h-4 w-4" />
            Ajuste / Perda
          </button>
        </div>
      </div>

      {/* Low Stock Replenishment Alerts (RF07) */}
      {lowStock.length > 0 && (
        <div className="rounded-lg border border-[#C87952] bg-[#FAF7F2] p-4">
          <div className="flex items-center gap-2 text-xs font-bold text-[#39332D]">
            <AlertTriangle className="h-4 w-4 text-[#A65F3F]" />
            <span>
              Alertas de Reposição ({lowStock.length} produtos atingiram ou estão abaixo
              do estoque mínimo)
            </span>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {lowStock.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded border border-[#D9CCB8] bg-[#F5F0E6] px-3.5 py-2.5 text-xs"
              >
                <div>
                  <div className="font-semibold text-[#39332D]">{p.name}</div>
                  <div className="font-mono text-[11px] tabular-nums text-[#5E4A38]">
                    Saldo atual: <strong className="text-[#A65F3F]">{p.stockQuantity} {p.unit}</strong> · Mínimo: {p.minStock} {p.unit}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => openMovementDialog(p, 'ENTRY')}
                  className="rounded bg-[#A65F3F] px-2.5 py-1.5 text-[11px] font-semibold text-[#FAF7F2] hover:bg-[#8C4D30] whitespace-nowrap shrink-0"
                >
                  Repor
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Current Inventory Balance + Movement History */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-5 rounded-lg border border-[#D9CCB8] bg-[#FAF7F2] overflow-hidden">
          <div className="border-b border-[#D9CCB8] px-4 py-3">
            <h2 className="text-sm font-semibold text-[#39332D]">
              Posição Atual de Estoque
            </h2>
          </div>
          <div className="max-h-[520px] overflow-y-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead className="sticky top-0 bg-[#E8DCC8] text-[#39332D]">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Produto</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Saldo</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Mín.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8DCC8]">
                {products.map((p) => {
                  const low = p.stockQuantity <= p.minStock;
                  return (
                    <tr
                      key={p.id}
                      onClick={() =>
                        setFilterProductId(
                          filterProductId === String(p.id) ? '' : String(p.id)
                        )
                      }
                      className={`cursor-pointer transition-colors hover:bg-[#F5F0E6] ${
                        filterProductId === String(p.id) ? 'bg-[#E8DCC8]/60' : ''
                      }`}
                    >
                      <td className="px-4 py-2.5">
                        <div className="font-medium text-[#39332D]">{p.name}</div>
                        <div className="font-mono text-[11px] text-[#5E4A38]">{p.sku}</div>
                      </td>
                      <td
                        className={`px-4 py-2.5 text-right font-mono font-semibold tabular-nums ${
                          low ? 'text-[#A65F3F]' : 'text-[#39332D]'
                        }`}
                      >
                        {p.stockQuantity} {p.unit}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[#5E4A38]">
                        {p.minStock}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="lg:col-span-7 rounded-lg border border-[#D9CCB8] bg-[#FAF7F2] overflow-hidden">
          <div className="flex items-center justify-between border-b border-[#D9CCB8] px-4 py-3">
            <h2 className="text-sm font-semibold text-[#39332D]">
              Histórico Auditável de Movimentações
            </h2>
            {filterProductId && (
              <button
                type="button"
                onClick={() => setFilterProductId('')}
                className="text-xs font-medium text-[#A65F3F] hover:underline"
              >
                Exibir todos os produtos
              </button>
            )}
          </div>

          <div className="max-h-[520px] overflow-y-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead className="sticky top-0 bg-[#E8DCC8] text-[#39332D]">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Data / Hora</th>
                  <th className="px-4 py-2.5 font-semibold">Produto / Operação</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Qtd.</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Saldo Final</th>
                  <th className="px-4 py-2.5 font-semibold">Responsável</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8DCC8]">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-[#5E4A38]">
                      Carregando movimentações...
                    </td>
                  </tr>
                ) : (
                  movements.map((m) => {
                    const isPositive = m.newStock >= m.previousStock;
                    return (
                      <tr key={m.id} className="hover:bg-[#F5F0E6]">
                        <td className="px-4 py-2.5 font-mono text-[11px] tabular-nums text-[#5E4A38]">
                          {formatDateTime(m.createdAt)}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="font-semibold text-[#39332D]">
                            {m.productName}
                          </div>
                          <div className="text-[11px] text-[#5E4A38]">
                            {MOVEMENT_TYPE_LABELS[m.type]} — {m.reason}
                            {m.referenceId ? ` (${m.referenceId})` : ''}
                          </div>
                        </td>
                        <td
                          className={`px-4 py-2.5 text-right font-mono font-semibold tabular-nums ${
                            isPositive ? 'text-[#39332D]' : 'text-[#A65F3F]'
                          }`}
                        >
                          {isPositive ? '+' : '-'}
                          {m.quantity}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[#39332D]">
                          {m.newStock}
                        </td>
                        <td className="px-4 py-2.5 text-[11px] text-[#5E4A38]">
                          {m.userName}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Stock Movement Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#39332D]/55 p-4">
          <form
            onSubmit={handleSubmitMovement}
            className="w-full max-w-lg rounded-lg border border-[#D9CCB8] bg-[#FAF7F2] p-6 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-[#D9CCB8] pb-3">
              <h3 className="text-base font-bold text-[#39332D]">
                Registrar Movimentação de Estoque
              </h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="p-1 text-[#5E4A38] hover:text-[#39332D]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#39332D]">Produto</label>
              <select
                value={selectedProductId}
                onChange={(e) => {
                  const pid = Number(e.target.value);
                  setSelectedProductId(pid);
                  const found = products.find((p) => p.id === pid);
                  if (found) setUnitCost(String(found.costPrice));
                }}
                className="mt-1 w-full rounded border border-[#D9CCB8] bg-white px-3 py-2 text-xs"
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.sku} — {p.name} (Saldo atual: {p.stockQuantity} {p.unit})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#39332D]">
                  Tipo de Operação
                </label>
                <select
                  value={movType}
                  onChange={(e) =>
                    setMovType(e.target.value as 'ENTRY' | 'ADJUSTMENT' | 'LOSS_DAMAGE')
                  }
                  className="mt-1 w-full rounded border border-[#D9CCB8] bg-white px-3 py-2 text-xs"
                >
                  <option value="ENTRY">Entrada de Mercadoria (Compra/NF)</option>
                  <option value="ADJUSTMENT">Ajuste de Inventário</option>
                  <option value="LOSS_DAMAGE">Baixa por Perda ou Avaria</option>
                </select>
              </div>

              {movType === 'ADJUSTMENT' ? (
                <div>
                  <label className="block text-xs font-semibold text-[#39332D]">
                    Sentido do Ajuste
                  </label>
                  <select
                    value={direction}
                    onChange={(e) => setDirection(e.target.value as 'IN' | 'OUT')}
                    className="mt-1 w-full rounded border border-[#D9CCB8] bg-white px-3 py-2 text-xs"
                  >
                    <option value="IN">Entrada (+ Soma ao saldo)</option>
                    <option value="OUT">Saída (- Subtrai do saldo)</option>
                  </select>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-semibold text-[#39332D]">
                    Documento / NF Referência
                  </label>
                  <input
                    type="text"
                    value={referenceId}
                    onChange={(e) => setReferenceId(e.target.value)}
                    placeholder="Ex: NF-45890"
                    className="mt-1 w-full rounded border border-[#D9CCB8] bg-white px-3 py-2 font-mono text-xs"
                  />
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#39332D]">
                  Quantidade
                </label>
                <input
                  type="number"
                  min="0.01"
                  step="any"
                  required
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="mt-1 w-full rounded border border-[#D9CCB8] bg-white px-3 py-2 font-mono text-xs tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#39332D]">
                  Custo Unitário (R$) {movType === 'ENTRY' && '(Atualiza custo)'}
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={unitCost}
                  onChange={(e) => setUnitCost(e.target.value)}
                  placeholder={formatCurrency(0)}
                  className="mt-1 w-full rounded border border-[#D9CCB8] bg-white px-3 py-2 font-mono text-xs tabular-nums"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#39332D]">
                Motivo / Justificativa Obrigatória
              </label>
              <input
                type="text"
                required
                minLength={5}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ex: Reposição semanal fornecedor / Avaria de embalagem"
                className="mt-1 w-full rounded border border-[#D9CCB8] bg-white px-3 py-2 text-xs"
              />
            </div>

            {needsSupervisorAuth && (
              <div className="rounded border border-[#C87952] bg-[#F5F0E6] p-3 space-y-2">
                <div className="text-xs font-semibold text-[#39332D]">
                  Autorização de Supervisor / Gerente necessária:
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    required
                    value={authUser}
                    onChange={(e) => setAuthUser(e.target.value)}
                    placeholder="Usuário autorizador"
                    className="rounded border border-[#D9CCB8] bg-white px-2.5 py-1.5 text-xs"
                  />
                  <input
                    type="password"
                    required
                    value={authPass}
                    onChange={(e) => setAuthPass(e.target.value)}
                    placeholder="Senha"
                    className="rounded border border-[#D9CCB8] bg-white px-2.5 py-1.5 text-xs"
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 border-t border-[#D9CCB8] pt-4">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="rounded border border-[#D9CCB8] px-4 py-2 text-xs font-medium text-[#39332D] hover:bg-[#E8DCC8]"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded bg-[#A65F3F] px-5 py-2 text-xs font-semibold text-[#FAF7F2] hover:bg-[#8C4D30]"
              >
                {saving ? 'Registrando...' : 'Confirmar Movimentação'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
