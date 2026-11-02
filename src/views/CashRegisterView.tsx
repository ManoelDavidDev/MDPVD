import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Lock, Printer } from 'lucide-react';
import { apiRequest } from '../api';
import {
  formatCurrency,
  formatDateTime,
  type CashRegisterEntity,
} from '../types';

interface CashRegisterViewProps {
  openRegister: CashRegisterEntity | null;
  onRequestOpenCashModal: () => void;
  onRegisterUpdated: (reg: CashRegisterEntity | null) => void;
  onNotify: (type: 'success' | 'error', message: string) => void;
}

export const CashRegisterView: React.FC<CashRegisterViewProps> = ({
  openRegister,
  onRequestOpenCashModal,
  onRegisterUpdated,
  onNotify,
}) => {
  const [registers, setRegisters] = useState<CashRegisterEntity[]>([]);
  const [countedCashStr, setCountedCashStr] = useState('');
  const [closingNotes, setClosingNotes] = useState('');
  const [closingBusy, setClosingBusy] = useState(false);
  const [selectedClosedReport, setSelectedClosedReport] =
    useState<CashRegisterEntity | null>(null);

  const loadRegisters = useCallback(async () => {
    try {
      const res = await apiRequest<{
        openRegister: CashRegisterEntity | null;
        registers: CashRegisterEntity[];
      }>('/api/cash-registers');
      onRegisterUpdated(res.openRegister);
      setRegisters(res.registers);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Erro ao consultar caixa.');
    }
  }, [onNotify, onRegisterUpdated]);

  useEffect(() => {
    loadRegisters();
  }, [loadRegisters]);

  const parsedCounted = parseFloat(countedCashStr.replace(',', '.'));
  const hasCountedValue = countedCashStr.trim() !== '' && Number.isFinite(parsedCounted);
  const liveDifference =
    openRegister && hasCountedValue
      ? Math.round((parsedCounted - openRegister.expectedCashBalance) * 100) / 100
      : null;

  const handleCloseRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!openRegister || !hasCountedValue) return;
    setClosingBusy(true);
    try {
      const res = await apiRequest<{ register: CashRegisterEntity }>(
        '/api/cash-registers/close',
        {
          method: 'POST',
          body: JSON.stringify({
            countedCashBalance: parsedCounted,
            closingNotes,
          }),
        }
      );
      onRegisterUpdated(null);
      setCountedCashStr('');
      setClosingNotes('');
      setSelectedClosedReport(res.register);
      await loadRegisters();
      onNotify(
        'success',
        `Caixa ${res.register.code} conferido e encerrado com sucesso.`
      );
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Falha ao fechar caixa.');
    } finally {
      setClosingBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1440px] px-6 py-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#D9CCB8] pb-3">
        <div>
          <h1 className="text-lg font-bold text-[#39332D]">
            Gestão de Caixa — Abertura, Conferência e Fechamento
          </h1>
          <p className="text-xs text-[#5E4A38]">
            O saldo físico esperado considera exclusivamente dinheiro em espécie (Abertura
            + Vendas em Dinheiro Líquidas + Suprimentos − Sangrias).
          </p>
        </div>

        {!openRegister && (
          <button
            type="button"
            onClick={onRequestOpenCashModal}
            className="rounded bg-[#A65F3F] px-5 py-2 text-xs font-semibold text-[#FAF7F2] hover:bg-[#8C4D30]"
          >
            ABRIR CAIXA
          </button>
        )}
      </div>

      {/* Current Open Register Panel */}
      {openRegister ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="lg:col-span-7 rounded-lg border border-[#D9CCB8] bg-[#FAF7F2] p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-[#D9CCB8] pb-3">
              <div>
                <h2 className="text-base font-bold text-[#39332D]">
                  Turno em Andamento — {openRegister.code}
                </h2>
                <p className="text-xs text-[#5E4A38]">
                  Aberto em {formatDateTime(openRegister.openedAt)} por{' '}
                  {openRegister.openedByName}
                </p>
              </div>
              <span className="text-xs font-semibold text-[#39332D]">
                {openRegister.terminalName}
              </span>
            </div>

            {/* Physical Drawer Cash vs Electronic Totals (RF05 Strict Separation) */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded border border-[#D9CCB8] bg-[#F5F0E6] p-4 space-y-2">
                <div className="text-xs font-bold text-[#39332D]">
                  Gaveta Física (Dinheiro em Espécie)
                </div>
                <div className="space-y-1 font-mono text-xs tabular-nums text-[#5E4A38]">
                  <div className="flex justify-between">
                    <span>(+) Valor Inicial (Abertura)</span>
                    <span>{formatCurrency(openRegister.openingBalance)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>(+) Vendas Líquidas em Dinheiro</span>
                    <span>{formatCurrency(openRegister.totalCashSales)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>(+) Suprimentos</span>
                    <span>{formatCurrency(openRegister.totalSupply)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>(−) Sangrias</span>
                    <span>- {formatCurrency(openRegister.totalBleed)}</span>
                  </div>
                  <div className="flex justify-between border-t border-[#D9CCB8] pt-2 text-sm font-bold text-[#39332D]">
                    <span>(=) Saldo Físico Esperado</span>
                    <span>{formatCurrency(openRegister.expectedCashBalance)}</span>
                  </div>
                </div>
              </div>

              <div className="rounded border border-[#D9CCB8] bg-[#F5F0E6] p-4 space-y-2">
                <div className="text-xs font-bold text-[#39332D]">
                  Meios Eletrônicos (Não Físicos)
                </div>
                <div className="space-y-1 font-mono text-xs tabular-nums text-[#5E4A38]">
                  <div className="flex justify-between">
                    <span>PIX</span>
                    <span>{formatCurrency(openRegister.totalPixSales)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Cartão de Débito</span>
                    <span>{formatCurrency(openRegister.totalDebitSales)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Cartão de Crédito</span>
                    <span>{formatCurrency(openRegister.totalCreditSales)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Vale / Convênio</span>
                    <span>{formatCurrency(openRegister.totalValeSales)}</span>
                  </div>
                  <div className="flex justify-between border-t border-[#D9CCB8] pt-2 text-sm font-bold text-[#39332D]">
                    <span>Total Eletrônico</span>
                    <span>
                      {formatCurrency(
                        openRegister.totalPixSales +
                          openRegister.totalDebitSales +
                          openRegister.totalCreditSales +
                          openRegister.totalValeSales
                      )}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Mandatory Closing Verification Form */}
          <form
            onSubmit={handleCloseRegister}
            className="lg:col-span-5 rounded-lg border border-[#D9CCB8] bg-[#FAF7F2] p-6 space-y-4"
          >
            <div className="border-b border-[#D9CCB8] pb-3">
              <h2 className="text-base font-bold text-[#39332D]">
                Conferência e Fechamento de Caixa
              </h2>
              <p className="mt-0.5 text-xs text-[#5E4A38]">
                Conte as cédulas e moedas físicas na gaveta e informe o valor apurado.
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-[#39332D]">
                  Valor Físico Contado em Dinheiro (R$) *
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setCountedCashStr(openRegister.expectedCashBalance.toFixed(2))
                  }
                  className="text-[11px] font-medium text-[#A65F3F] hover:underline"
                >
                  Preencher saldo esperado
                </button>
              </div>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={countedCashStr}
                onChange={(e) => setCountedCashStr(e.target.value)}
                placeholder="Informe a contagem física da gaveta"
                className="mt-1.5 w-full rounded border border-[#D9CCB8] bg-white px-3.5 py-2.5 font-mono text-sm font-semibold tabular-nums outline-none focus:border-[#C87952]"
              />
            </div>

            {liveDifference !== null && (
              <div className="rounded border border-[#D9CCB8] bg-[#F5F0E6] p-3 font-mono text-xs tabular-nums">
                <div className="flex justify-between">
                  <span>Saldo Esperado:</span>
                  <span>{formatCurrency(openRegister.expectedCashBalance)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Saldo Contado:</span>
                  <span>{formatCurrency(parsedCounted)}</span>
                </div>
                <div className="mt-1 flex justify-between border-t border-[#D9CCB8] pt-1 font-bold text-[#39332D]">
                  <span>Diferença Apurada:</span>
                  <span className={liveDifference < 0 ? 'text-[#A65F3F]' : ''}>
                    {liveDifference === 0
                      ? 'R$ 0,00 (Conferência Exata)'
                      : `${liveDifference > 0 ? '+' : ''}${formatCurrency(
                          liveDifference
                        )} (${liveDifference > 0 ? 'Sobra' : 'Quebra/Falta'})`}
                  </span>
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-[#39332D]">
                Observações da Conferência
              </label>
              <textarea
                rows={2}
                value={closingNotes}
                onChange={(e) => setClosingNotes(e.target.value)}
                placeholder="Justificativa de diferença ou observações do turno..."
                className="mt-1 w-full rounded border border-[#D9CCB8] bg-white p-2.5 text-xs"
              />
            </div>

            <button
              type="submit"
              disabled={closingBusy || !hasCountedValue}
              className="flex w-full items-center justify-center gap-2 rounded bg-[#A65F3F] px-5 py-2.5 text-xs font-bold text-[#FAF7F2] hover:bg-[#8C4D30] disabled:opacity-50"
            >
              <Lock className="h-4 w-4" />
              {closingBusy ? 'Consolidando Fechamento...' : 'CONFIRMAR E FECHAR CAIXA'}
            </button>
          </form>
        </div>
      ) : (
        <div className="rounded-lg border border-[#D9CCB8] bg-[#FAF7F2] p-8 text-center">
          <div className="text-sm font-semibold text-[#39332D]">
            Nenhum caixa aberto neste momento.
          </div>
          <p className="mt-1 text-xs text-[#5E4A38]">
            Consulte abaixo os relatórios consolidados de turnos anteriores ou abra um
            novo turno de caixa.
          </p>
        </div>
      )}

      {/* Closed Report Banner if just closed or inspected */}
      {selectedClosedReport && (
        <div
          id="mdpdv-printable-receipt"
          className="rounded-lg border border-[#C87952] bg-[#FAF7F2] p-6 space-y-3"
        >
          <div className="flex items-center justify-between border-b border-[#D9CCB8] pb-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-[#A65F3F]" />
              <h3 className="text-sm font-bold text-[#39332D]">
                Relatório Consolidado de Fechamento — {selectedClosedReport.code}
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 rounded bg-[#A65F3F] px-3 py-1.5 text-xs font-semibold text-[#FAF7F2] hover:bg-[#8C4D30]"
              >
                <Printer className="h-3.5 w-3.5" />
                Imprimir Fechamento
              </button>
              <button
                type="button"
                onClick={() => setSelectedClosedReport(null)}
                className="rounded border border-[#D9CCB8] px-3 py-1.5 text-xs text-[#39332D] hover:bg-[#E8DCC8]"
              >
                Ocultar
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 font-mono text-xs tabular-nums sm:grid-cols-4">
            <div>
              <div className="font-sans text-[#5E4A38]">Abertura</div>
              <div className="font-semibold text-[#39332D]">
                {formatCurrency(selectedClosedReport.openingBalance)}
              </div>
            </div>
            <div>
              <div className="font-sans text-[#5E4A38]">Esperado em Dinheiro</div>
              <div className="font-semibold text-[#39332D]">
                {formatCurrency(selectedClosedReport.expectedCashBalance)}
              </div>
            </div>
            <div>
              <div className="font-sans text-[#5E4A38]">Contado na Gaveta</div>
              <div className="font-semibold text-[#39332D]">
                {formatCurrency(selectedClosedReport.countedCashBalance ?? 0)}
              </div>
            </div>
            <div>
              <div className="font-sans text-[#5E4A38]">Diferença</div>
              <div className="font-bold text-[#39332D]">
                {formatCurrency(selectedClosedReport.differenceAmount ?? 0)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Historical Cash Registers */}
      <div className="rounded-lg border border-[#D9CCB8] bg-[#FAF7F2] overflow-x-auto">
        <div className="border-b border-[#D9CCB8] px-5 py-3.5">
          <h2 className="text-sm font-semibold text-[#39332D]">
            Histórico de Turnos de Caixa
          </h2>
        </div>
        <table className="w-full border-collapse text-left text-xs">
          <thead className="bg-[#E8DCC8] text-[#39332D]">
            <tr>
              <th className="px-4 py-3 font-semibold">Código</th>
              <th className="px-4 py-3 font-semibold">Abertura / Fechamento</th>
              <th className="px-4 py-3 font-semibold">Operador</th>
              <th className="px-4 py-3 text-right font-semibold">Esperado (Espécie)</th>
              <th className="px-4 py-3 text-right font-semibold">Contado</th>
              <th className="px-4 py-3 text-right font-semibold">Diferença</th>
              <th className="px-4 py-3 text-right font-semibold">Eletrônicos</th>
              <th className="px-4 py-3 text-right font-semibold">Relatório</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E8DCC8]">
            {registers.map((r) => {
              const elec =
                r.totalPixSales +
                r.totalDebitSales +
                r.totalCreditSales +
                r.totalValeSales;
              return (
                <tr key={r.id} className="hover:bg-[#F5F0E6]">
                  <td className="px-4 py-3 font-mono font-semibold text-[#39332D]">
                    {r.code}
                    <span className="ml-1.5 font-sans text-[11px] font-normal text-[#5E4A38]">
                      · {r.status === 'OPEN' ? 'Aberto' : 'Encerrado'}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-[11px] tabular-nums text-[#5E4A38]">
                    <div>Ab.: {formatDateTime(r.openedAt)}</div>
                    <div>Fc.: {formatDateTime(r.closedAt)}</div>
                  </td>
                  <td className="px-4 py-3 text-[#39332D]">{r.openedByName}</td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-[#39332D]">
                    {formatCurrency(r.expectedCashBalance)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-[#39332D]">
                    {r.countedCashBalance !== null
                      ? formatCurrency(r.countedCashBalance)
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums text-[#39332D]">
                    {r.differenceAmount !== null
                      ? formatCurrency(r.differenceAmount)
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-[#5E4A38]">
                    {formatCurrency(elec)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {r.status === 'CLOSED' && (
                      <button
                        type="button"
                        onClick={() => setSelectedClosedReport(r)}
                        className="rounded border border-[#D9CCB8] bg-white px-2.5 py-1 text-xs font-medium text-[#39332D] hover:bg-[#E8DCC8]"
                      >
                        Ver Resumo
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
