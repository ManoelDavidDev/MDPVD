import React, { useCallback, useEffect, useState } from 'react';
import { Download, Filter } from 'lucide-react';
import { apiRequest } from '../api';
import {
  PAYMENT_LABELS,
  PERMISSIONS,
  formatCurrency,
  type CategoryEntity,
  type PaymentMethod,
  type UserEntity,
} from '../types';

interface ReportsViewProps {
  user: UserEntity;
  onNotify: (type: 'success' | 'error', message: string) => void;
}

interface SeriesPoint {
  period: string;
  sales_count: number;
  revenue: number;
  profit: number;
}

interface ProductPerfRow {
  productId: number;
  name: string;
  sku: string;
  categoryName: string;
  quantitySold: number;
  revenue: number;
  cost: number;
  profit: number;
  marginPercent?: number;
}

interface ReportResponse {
  summary: {
    grossRevenue: number;
    totalDiscounts: number;
    netRevenue: number;
    totalCost: number;
    grossProfit: number;
    marginPercent: number;
    averageTicket: number;
    completedSalesCount: number;
    cancelledSalesCount: number;
    cancelledAmount: number;
    physicalCashInDrawer: number;
    hasOpenRegister: boolean;
  };
  dailySeries: SeriesPoint[];
  weeklySeries: SeriesPoint[];
  monthlySeries: SeriesPoint[];
  salesByPayment: Array<{ method: PaymentMethod; count: number; amount: number }>;
  topSellingProducts: ProductPerfRow[];
  topProfitableProducts: ProductPerfRow[];
  cashFlowMovements: Array<{ type: 'SUPPLY' | 'BLEED'; count: number; total: number }>;
}

export const ReportsView: React.FC<ReportsViewProps> = ({ user, onNotify }) => {
  const [periodView, setPeriodView] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [operatorId, setOperatorId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');

  const [categories, setCategories] = useState<CategoryEntity[]>([]);
  const [operators, setOperators] = useState<UserEntity[]>([]);
  const [report, setReport] = useState<ReportResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const canViewReports = user.permissions.includes(PERMISSIONS.REPORT_VIEW);

  useEffect(() => {
    if (!canViewReports) return;
    Promise.all([
      apiRequest<{ categories: CategoryEntity[] }>('/api/catalog'),
      apiRequest<{ users: UserEntity[] }>('/api/users'),
    ])
      .then(([catRes, userRes]) => {
        setCategories(catRes.categories);
        setOperators(userRes.users);
      })
      .catch(() => {});
  }, [canViewReports]);

  const loadReports = useCallback(async () => {
    if (!canViewReports) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (startDate) qs.set('startDate', startDate);
      if (endDate) qs.set('endDate', endDate);
      if (categoryId) qs.set('categoryId', categoryId);
      if (operatorId) qs.set('operatorId', operatorId);
      if (paymentMethod) qs.set('paymentMethod', paymentMethod);

      const res = await apiRequest<ReportResponse>(`/api/reports?${qs.toString()}`);
      setReport(res);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Erro ao gerar relatórios.');
    } finally {
      setLoading(false);
    }
  }, [
    canViewReports,
    startDate,
    endDate,
    categoryId,
    operatorId,
    paymentMethod,
    onNotify,
  ]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const handleExportCsv = () => {
    if (!report) return;
    const rows = [
      ['SKU', 'Produto', 'Categoria', 'Qtd Vendida', 'Faturamento (R$)', 'Custo CMV (R$)', 'Lucro Bruto (R$)'],
      ...report.topProfitableProducts.map((p) => [
        p.sku,
        `"${p.name.replace(/"/g, '""')}"`,
        `"${p.categoryName}"`,
        String(p.quantitySold),
        p.revenue.toFixed(2),
        p.cost.toFixed(2),
        p.profit.toFixed(2),
      ]),
    ];
    const csv = rows.map((r) => r.join(';')).join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio_mdpdv_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!canViewReports) {
    return (
      <div className="mx-auto my-12 max-w-lg rounded-lg border border-[#D9CCB8] bg-[#FAF7F2] p-10 text-center">
        <h2 className="text-lg font-bold text-[#39332D]">Acesso Restrito</h2>
        <p className="mt-2 text-xs text-[#5E4A38]">
          O perfil atual ({user.roleName}) não possui permissão para visualizar relatórios
          financeiros e margens de lucro. Autentique-se como Supervisor, Gerente ou
          Administrador.
        </p>
      </div>
    );
  }

  const activeSeries =
    periodView === 'daily'
      ? report?.dailySeries ?? []
      : periodView === 'weekly'
        ? report?.weeklySeries ?? []
        : report?.monthlySeries ?? [];

  const maxRevenue = Math.max(1, ...activeSeries.map((s) => s.revenue));
  const totalPaymentsAmount = Math.max(
    1,
    (report?.salesByPayment ?? []).reduce((acc, p) => acc + p.amount, 0)
  );

  return (
    <div className="mx-auto max-w-[1440px] px-6 py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#D9CCB8] pb-3">
        <div>
          <h1 className="text-lg font-bold text-[#39332D]">
            Relatórios Financeiros e Gráficos Gerenciais
          </h1>
          <p className="text-xs text-[#5E4A38]">
            Indicadores calculados em tempo real sobre o banco SQLite diferenciando
            Faturamento, Lucro, Margem e Saldo Físico de Caixa.
          </p>
        </div>

        <button
          type="button"
          disabled={!report}
          onClick={handleExportCsv}
          className="inline-flex items-center gap-1.5 rounded border border-[#80664C] bg-[#FAF7F2] px-4 py-2 text-xs font-semibold text-[#39332D] hover:bg-[#E8DCC8] whitespace-nowrap"
        >
          <Download className="h-3.5 w-3.5" />
          Exportar CSV
        </button>
      </div>

      {/* Filter Bar */}
      <div className="rounded-lg border border-[#D9CCB8] bg-[#FAF7F2] p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[#39332D]">
            <Filter className="h-3.5 w-3.5 text-[#80664C]" />
            <span>Filtros Analíticos</span>
          </div>
          {(startDate || endDate || categoryId || operatorId || paymentMethod) && (
            <button
              type="button"
              onClick={() => {
                setStartDate('');
                setEndDate('');
                setCategoryId('');
                setOperatorId('');
                setPaymentMethod('');
              }}
              className="text-xs font-medium text-[#A65F3F] hover:underline"
            >
              Limpar Filtros
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label className="block text-[11px] font-medium text-[#5E4A38]">
              Data Inicial
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="mt-1 w-full rounded border border-[#D9CCB8] bg-white px-2.5 py-1.5 font-mono text-xs"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-[#5E4A38]">
              Data Final
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="mt-1 w-full rounded border border-[#D9CCB8] bg-white px-2.5 py-1.5 font-mono text-xs"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-[#5E4A38]">
              Categoria
            </label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="mt-1 w-full rounded border border-[#D9CCB8] bg-white px-2.5 py-1.5 text-xs"
            >
              <option value="">Todas</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-[#5E4A38]">
              Operador
            </label>
            <select
              value={operatorId}
              onChange={(e) => setOperatorId(e.target.value)}
              className="mt-1 w-full rounded border border-[#D9CCB8] bg-white px-2.5 py-1.5 text-xs"
            >
              <option value="">Todos</option>
              {operators.map((op) => (
                <option key={op.id} value={op.id}>
                  {op.fullName}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-[#5E4A38]">
              Forma de Pagamento
            </label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="mt-1 w-full rounded border border-[#D9CCB8] bg-white px-2.5 py-1.5 text-xs"
            >
              <option value="">Todas</option>
              {Object.entries(PAYMENT_LABELS).map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {loading || !report ? (
        <div className="rounded-lg border border-[#D9CCB8] bg-[#FAF7F2] p-12 text-center text-sm text-[#5E4A38]">
          Consolidando métricas gerenciais do SQLite...
        </div>
      ) : (
        <>
          {/* Distinct Financial KPI Strip (RF09: Faturamento vs Lucro vs Margem vs Ticket vs Saldo de Caixa) */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <div className="rounded-lg border border-[#D9CCB8] bg-[#FAF7F2] p-4">
              <div className="text-xs font-medium text-[#5E4A38]">
                Faturamento Líquido
              </div>
              <div className="mt-1 font-mono text-xl font-bold tabular-nums text-[#39332D]">
                {formatCurrency(report.summary.netRevenue)}
              </div>
              <div className="mt-1 text-[11px] text-[#5E4A38]">
                {report.summary.completedSalesCount} vendas · Desc.:{' '}
                {formatCurrency(report.summary.totalDiscounts)}
              </div>
            </div>

            <div className="rounded-lg border border-[#D9CCB8] bg-[#FAF7F2] p-4">
              <div className="text-xs font-medium text-[#5E4A38]">
                Lucro Bruto (Fatur. − CMV)
              </div>
              <div className="mt-1 font-mono text-xl font-bold tabular-nums text-[#39332D]">
                {formatCurrency(report.summary.grossProfit)}
              </div>
              <div className="mt-1 text-[11px] text-[#5E4A38]">
                CMV apurado: {formatCurrency(report.summary.totalCost)}
              </div>
            </div>

            <div className="rounded-lg border border-[#D9CCB8] bg-[#FAF7F2] p-4">
              <div className="text-xs font-medium text-[#5E4A38]">
                Margem Comercial Real
              </div>
              <div className="mt-1 font-mono text-xl font-bold tabular-nums text-[#39332D]">
                {report.summary.marginPercent.toFixed(1)}%
              </div>
              <div className="mt-1 text-[11px] text-[#5E4A38]">
                Relação Lucro / Faturamento
              </div>
            </div>

            <div className="rounded-lg border border-[#D9CCB8] bg-[#FAF7F2] p-4">
              <div className="text-xs font-medium text-[#5E4A38]">Ticket Médio</div>
              <div className="mt-1 font-mono text-xl font-bold tabular-nums text-[#39332D]">
                {formatCurrency(report.summary.averageTicket)}
              </div>
              <div className="mt-1 text-[11px] text-[#5E4A38]">
                Cancelamentos: {report.summary.cancelledSalesCount} (
                {formatCurrency(report.summary.cancelledAmount)})
              </div>
            </div>

            <div className="rounded-lg border border-[#D9CCB8] bg-[#FAF7F2] p-4">
              <div className="text-xs font-medium text-[#5E4A38]">
                Saldo Físico na Gaveta
              </div>
              <div className="mt-1 font-mono text-xl font-bold tabular-nums text-[#A65F3F]">
                {formatCurrency(report.summary.physicalCashInDrawer)}
              </div>
              <div className="mt-1 text-[11px] text-[#5E4A38]">
                {report.summary.hasOpenRegister
                  ? 'Dinheiro disponível no turno atual'
                  : 'Nenhum turno aberto agora'}
              </div>
            </div>
          </div>

          {/* Charts Grid */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Revenue vs Profit Period Chart */}
            <div className="lg:col-span-7 rounded-lg border border-[#D9CCB8] bg-[#FAF7F2] p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#D9CCB8] pb-3">
                <div>
                  <h2 className="text-sm font-bold text-[#39332D]">
                    Evolução de Faturamento e Lucro por Período
                  </h2>
                  <p className="text-[11px] text-[#5E4A38]">
                    Barra Terracota: Faturamento Líquido · Barra Marrom: Lucro Real
                  </p>
                </div>

                <div className="flex items-center gap-1 rounded bg-[#E8DCC8] p-1">
                  {(['daily', 'weekly', 'monthly'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setPeriodView(mode)}
                      className={`rounded px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                        periodView === mode
                          ? 'bg-[#FAF7F2] font-semibold text-[#39332D]'
                          : 'text-[#5E4A38] hover:text-[#39332D]'
                      }`}
                    >
                      {mode === 'daily' && 'Diário'}
                      {mode === 'weekly' && 'Semanal'}
                      {mode === 'monthly' && 'Mensal'}
                    </button>
                  ))}
                </div>
              </div>

              {activeSeries.length === 0 ? (
                <div className="py-12 text-center text-xs text-[#5E4A38]">
                  Nenhuma venda concluída no filtro selecionado.
                </div>
              ) : (
                <div className="pt-2">
                  <svg
                    viewBox={`0 0 ${Math.max(480, activeSeries.length * 110)} 220`}
                    className="h-56 w-full overflow-visible"
                    role="img"
                    aria-label="Gráfico de Faturamento e Lucro"
                  >
                    {[0, 0.25, 0.5, 0.75, 1].map((step) => {
                      const y = 175 - step * 145;
                      return (
                        <g key={step}>
                          <line
                            x1={48}
                            x2={Math.max(460, activeSeries.length * 110 - 16)}
                            y1={y}
                            y2={y}
                            stroke="#E8DCC8"
                            strokeDasharray="3 3"
                          />
                          <text
                            x={42}
                            y={y + 4}
                            textAnchor="end"
                            className="fill-[#5E4A38] font-mono text-[10px]"
                          >
                            {Math.round(maxRevenue * step)}
                          </text>
                        </g>
                      );
                    })}

                    {activeSeries.map((pt, idx) => {
                      const groupX = 72 + idx * 100;
                      const revH = Math.max(4, (pt.revenue / maxRevenue) * 145);
                      const profH = Math.max(2, (Math.max(0, pt.profit) / maxRevenue) * 145);
                      return (
                        <g key={pt.period}>
                          <rect
                            x={groupX}
                            y={175 - revH}
                            width={26}
                            height={revH}
                            rx={3}
                            fill="#C87952"
                          />
                          <rect
                            x={groupX + 30}
                            y={175 - profH}
                            width={26}
                            height={profH}
                            rx={3}
                            fill="#80664C"
                          />
                          <text
                            x={groupX + 28}
                            y={195}
                            textAnchor="middle"
                            className="fill-[#39332D] font-mono text-[10px]"
                          >
                            {pt.period}
                          </text>
                          <text
                            x={groupX + 13}
                            y={170 - revH}
                            textAnchor="middle"
                            className="fill-[#39332D] font-mono text-[9px] font-semibold"
                          >
                            {formatCurrency(pt.revenue)}
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                </div>
              )}
            </div>

            {/* Sales by Payment Method Chart */}
            <div className="lg:col-span-5 rounded-lg border border-[#D9CCB8] bg-[#FAF7F2] p-5 space-y-4">
              <div className="border-b border-[#D9CCB8] pb-3">
                <h2 className="text-sm font-bold text-[#39332D]">
                  Vendas por Forma de Pagamento
                </h2>
                <p className="text-[11px] text-[#5E4A38]">
                  Participação financeira líquida em cada modalidade
                </p>
              </div>

              <div className="space-y-3.5 pt-1">
                {report.salesByPayment.length === 0 ? (
                  <div className="py-8 text-center text-xs text-[#5E4A38]">
                    Sem pagamentos registrados no período.
                  </div>
                ) : (
                  report.salesByPayment.map((pm) => {
                    const pct = (pm.amount / totalPaymentsAmount) * 100;
                    return (
                      <div key={pm.method} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-[#39332D]">
                            {PAYMENT_LABELS[pm.method] ?? pm.method}{' '}
                            <span className="font-normal text-[#5E4A38]">
                              ({pm.count} op.)
                            </span>
                          </span>
                          <span className="font-mono font-semibold tabular-nums text-[#39332D]">
                            {formatCurrency(pm.amount)} ({pct.toFixed(1)}%)
                          </span>
                        </div>
                        <div className="h-2.5 w-full overflow-hidden rounded bg-[#E8DCC8]">
                          <div
                            className="h-full rounded bg-[#A65F3F]"
                            style={{ width: `${Math.max(3, pct)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="border-t border-[#D9CCB8] pt-3 text-xs text-[#5E4A38]">
                <div className="font-semibold text-[#39332D]">
                  Consolidado de Sangrias e Suprimentos Ativos:
                </div>
                <div className="mt-1.5 flex justify-between font-mono tabular-nums">
                  <span>
                    Suprimentos:{' '}
                    {formatCurrency(
                      report.cashFlowMovements.find((m) => m.type === 'SUPPLY')?.total ??
                        0
                    )}
                  </span>
                  <span>
                    Sangrias:{' '}
                    {formatCurrency(
                      report.cashFlowMovements.find((m) => m.type === 'BLEED')?.total ?? 0
                    )}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Product Ranking Tables */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Best Selling */}
            <div className="rounded-lg border border-[#D9CCB8] bg-[#FAF7F2] overflow-hidden">
              <div className="border-b border-[#D9CCB8] px-4 py-3">
                <h2 className="text-sm font-bold text-[#39332D]">
                  Produtos Mais Vendidos (Volume)
                </h2>
              </div>
              <table className="w-full border-collapse text-left text-xs">
                <thead className="bg-[#E8DCC8] text-[#39332D]">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">Produto</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Qtd.</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Faturamento</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E8DCC8]">
                  {report.topSellingProducts.map((p) => (
                    <tr key={p.productId} className="hover:bg-[#F5F0E6]">
                      <td className="px-4 py-2.5">
                        <div className="font-medium text-[#39332D]">{p.name}</div>
                        <div className="font-mono text-[11px] text-[#5E4A38]">
                          {p.sku} · {p.categoryName}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono font-semibold tabular-nums text-[#39332D]">
                        {p.quantitySold}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[#39332D]">
                        {formatCurrency(p.revenue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Most Profitable */}
            <div className="rounded-lg border border-[#D9CCB8] bg-[#FAF7F2] overflow-hidden">
              <div className="border-b border-[#D9CCB8] px-4 py-3">
                <h2 className="text-sm font-bold text-[#39332D]">
                  Produtos Mais Lucrativos (Lucro Real & Margem)
                </h2>
              </div>
              <table className="w-full border-collapse text-left text-xs">
                <thead className="bg-[#E8DCC8] text-[#39332D]">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">Produto</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Lucro</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Margem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E8DCC8]">
                  {report.topProfitableProducts.map((p) => (
                    <tr key={p.productId} className="hover:bg-[#F5F0E6]">
                      <td className="px-4 py-2.5">
                        <div className="font-medium text-[#39332D]">{p.name}</div>
                        <div className="font-mono text-[11px] text-[#5E4A38]">
                          CMV: {formatCurrency(p.cost)} · Fat.: {formatCurrency(p.revenue)}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono font-semibold tabular-nums text-[#39332D]">
                        {formatCurrency(p.profit)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[#5E4A38]">
                        {(p.marginPercent ?? 0).toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
