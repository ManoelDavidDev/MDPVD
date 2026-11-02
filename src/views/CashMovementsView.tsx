import React, { useCallback, useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { apiRequest } from '../api';
import {
  PERMISSIONS,
  formatCurrency,
  formatDateTime,
  type CashMovementEntity,
  type CashRegisterEntity,
  type UserEntity,
} from '../types';

interface CashMovementsViewProps {
  user: UserEntity;
  openRegister: CashRegisterEntity | null;
  onRequestOpenCashModal: () => void;
  onRegisterUpdated: (reg: CashRegisterEntity | null) => void;
  onNotify: (type: 'success' | 'error', message: string) => void;
}

const MOV_LABELS: Record<CashMovementEntity['type'], string> = {
  OPENING: 'Abertura de Caixa',
  SUPPLY: 'Suprimento (Entrada)',
  BLEED: 'Sangria (Retirada)',
  REVERSAL: 'Estorno Auditado',
};

export const CashMovementsView: React.FC<CashMovementsViewProps> = ({
  user,
  openRegister,
  onRequestOpenCashModal,
  onRegisterUpdated,
  onNotify,
}) => {
  const [movements, setMovements] = useState<CashMovementEntity[]>([]);
  const [type, setType] = useState<'BLEED' | 'SUPPLY'>('BLEED');
  const [amountStr, setAmountStr] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  // Reversal modal
  const [reversingMov, setReversingMov] = useState<CashMovementEntity | null>(null);
  const [revReason, setRevReason] = useState('');
  const [revAuthUser, setRevAuthUser] = useState('');
  const [revAuthPass, setRevAuthPass] = useState('');
  const [revBusy, setRevBusy] = useState(false);

  const needsReverseAuth = !user.permissions.includes(PERMISSIONS.CASH_REVERSE);

  const loadMovements = useCallback(async () => {
    try {
      const res = await apiRequest<{
        openRegister: CashRegisterEntity | null;
        allMovements: CashMovementEntity[];
      }>('/api/cash-registers');
      onRegisterUpdated(res.openRegister);
      setMovements(res.allMovements);
    } catch (err) {
      onNotify(
        'error',
        err instanceof Error ? err.message : 'Erro ao consultar movimentações.'
      );
    }
  }, [onNotify, onRegisterUpdated]);

  useEffect(() => {
    loadMovements();
  }, [loadMovements]);

  const handleCreateMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const amount = parseFloat(amountStr.replace(',', '.')) || 0;
      const res = await apiRequest<{
        register: CashRegisterEntity;
        movement: CashMovementEntity;
      }>('/api/cash-movements', {
        method: 'POST',
        body: JSON.stringify({
          type,
          amount,
          reason,
        }),
      });
      onRegisterUpdated(res.register);
      setAmountStr('');
      setReason('');
      await loadMovements();
      onNotify(
        'success',
        `${type === 'BLEED' ? 'Sangria' : 'Suprimento'} de ${formatCurrency(
          amount
        )} registrado.`
      );
    } catch (err) {
      onNotify(
        'error',
        err instanceof Error ? err.message : 'Falha ao registrar movimentação.'
      );
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmReverse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reversingMov) return;
    setRevBusy(true);
    try {
      const res = await apiRequest<{ register: CashRegisterEntity }>(
        `/api/cash-movements/${reversingMov.id}/reverse`,
        {
          method: 'POST',
          body: JSON.stringify({
            reason: revReason,
            authorizer: needsReverseAuth
              ? { username: revAuthUser, password: revAuthPass }
              : undefined,
          }),
        }
      );
      onRegisterUpdated(res.register);
      setReversingMov(null);
      setRevReason('');
      setRevAuthUser('');
      setRevAuthPass('');
      await loadMovements();
      onNotify('success', 'Estorno financeiro registrado com trilha de auditoria.');
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Erro ao estornar.');
    } finally {
      setRevBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1440px] px-6 py-6 space-y-6">
      <div className="border-b border-[#D9CCB8] pb-3">
        <h1 className="text-lg font-bold text-[#39332D]">
          Sangria e Suprimento de Caixa
        </h1>
        <p className="text-xs text-[#5E4A38]">
          Movimentações financeiras nunca são apagadas definitivamente; eventuais
          correções são realizadas mediante estorno autorizado e auditado.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Form */}
        <div className="lg:col-span-4 rounded-lg border border-[#D9CCB8] bg-[#FAF7F2] p-5 h-fit">
          {!openRegister ? (
            <div className="py-6 text-center space-y-3">
              <div className="text-sm font-semibold text-[#39332D]">
                Caixa Fechado
              </div>
              <p className="text-xs text-[#5E4A38]">
                Abra um turno de caixa para registrar sangrias ou suprimentos.
              </p>
              <button
                type="button"
                onClick={onRequestOpenCashModal}
                className="rounded bg-[#A65F3F] px-5 py-2 text-xs font-semibold text-[#FAF7F2] hover:bg-[#8C4D30]"
              >
                ABRIR CAIXA
              </button>
            </div>
          ) : (
            <form onSubmit={handleCreateMovement} className="space-y-4">
              <div className="flex items-center justify-between border-b border-[#D9CCB8] pb-2.5">
                <h2 className="text-sm font-bold text-[#39332D]">
                  Nova Movimentação ({openRegister.code})
                </h2>
                <span className="font-mono text-xs font-semibold tabular-nums text-[#5E4A38]">
                  Disponível: {formatCurrency(openRegister.expectedCashBalance)}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 rounded bg-[#E8DCC8] p-1">
                <button
                  type="button"
                  onClick={() => setType('BLEED')}
                  className={`rounded py-2 text-xs font-semibold transition-colors ${
                    type === 'BLEED'
                      ? 'bg-[#FAF7F2] text-[#39332D]'
                      : 'text-[#5E4A38] hover:text-[#39332D]'
                  }`}
                >
                  Sangria (Retirada)
                </button>
                <button
                  type="button"
                  onClick={() => setType('SUPPLY')}
                  className={`rounded py-2 text-xs font-semibold transition-colors ${
                    type === 'SUPPLY'
                      ? 'bg-[#FAF7F2] text-[#39332D]'
                      : 'text-[#5E4A38] hover:text-[#39332D]'
                  }`}
                >
                  Suprimento (Entrada)
                </button>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#39332D]">
                  Valor em Dinheiro (R$) *
                </label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  value={amountStr}
                  onChange={(e) => setAmountStr(e.target.value)}
                  placeholder="0,00"
                  className="mt-1 w-full rounded border border-[#D9CCB8] bg-white px-3 py-2 font-mono text-sm tabular-nums outline-none focus:border-[#C87952]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#39332D]">
                  Motivo Obrigatório *
                </label>
                <textarea
                  required
                  minLength={5}
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={
                    type === 'BLEED'
                      ? 'Ex: Recolhimento de cédulas para cofre central'
                      : 'Ex: Reforço de moedas para troco no caixa'
                  }
                  className="mt-1 w-full rounded border border-[#D9CCB8] bg-white p-2.5 text-xs text-[#39332D] outline-none focus:border-[#C87952]"
                />
              </div>

              <button
                type="submit"
                disabled={busy}
                className="w-full rounded bg-[#A65F3F] px-4 py-2.5 text-xs font-bold text-[#FAF7F2] hover:bg-[#8C4D30] disabled:opacity-50"
              >
                {busy
                  ? 'Registrando...'
                  : type === 'BLEED'
                    ? 'Registrar Sangria'
                    : 'Registrar Suprimento'}
              </button>
            </form>
          )}
        </div>

        {/* Immutable History */}
        <div className="lg:col-span-8 rounded-lg border border-[#D9CCB8] bg-[#FAF7F2] overflow-x-auto">
          <div className="border-b border-[#D9CCB8] px-5 py-3.5">
            <h2 className="text-sm font-semibold text-[#39332D]">
              Histórico Imutável de Movimentações de Caixa
            </h2>
          </div>

          <table className="w-full border-collapse text-left text-xs">
            <thead className="bg-[#E8DCC8] text-[#39332D]">
              <tr>
                <th className="px-4 py-3 font-semibold">ID / Data</th>
                <th className="px-4 py-3 font-semibold">Tipo</th>
                <th className="px-4 py-3 font-semibold">Motivo & Responsável</th>
                <th className="px-4 py-3 text-right font-semibold">Valor</th>
                <th className="px-4 py-3 text-right font-semibold">Correção</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8DCC8]">
              {movements.map((m) => {
                const canReverse =
                  openRegister &&
                  m.cashRegisterId === openRegister.id &&
                  m.status === 'ACTIVE' &&
                  (m.type === 'BLEED' || m.type === 'SUPPLY');
                return (
                  <tr key={m.id} className="hover:bg-[#F5F0E6]">
                    <td className="px-4 py-3 font-mono text-[11px] tabular-nums text-[#5E4A38]">
                      <div className="font-semibold text-[#39332D]">#{m.id}</div>
                      <div>{formatDateTime(m.createdAt)}</div>
                    </td>
                    <td className="px-4 py-3 text-[#39332D]">
                      <div className="font-medium">{MOV_LABELS[m.type]}</div>
                      {m.status === 'REVERSED' && (
                        <div className="text-[11px] text-[#A65F3F]">Estornada</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-[#39332D]">{m.reason}</div>
                      <div className="text-[11px] text-[#5E4A38]">
                        Operador: {m.userName}
                        {m.authorizedByName ? ` · Autorizado: ${m.authorizedByName}` : ''}
                      </div>
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-mono font-semibold tabular-nums ${
                        m.status === 'REVERSED'
                          ? 'text-[#80664C] line-through'
                          : m.type === 'BLEED'
                            ? 'text-[#A65F3F]'
                            : 'text-[#39332D]'
                      }`}
                    >
                      {m.type === 'BLEED' ? '- ' : ''}
                      {formatCurrency(m.amount)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {canReverse && (
                        <button
                          type="button"
                          onClick={() => setReversingMov(m)}
                          className="inline-flex items-center gap-1 rounded border border-[#80664C] bg-white px-2.5 py-1 text-xs font-medium text-[#39332D] hover:bg-[#E8DCC8] whitespace-nowrap"
                        >
                          <RotateCcw className="h-3 w-3" />
                          Estornar
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

      {/* Reversal Modal */}
      {reversingMov && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#39332D]/55 p-4">
          <form
            onSubmit={handleConfirmReverse}
            className="w-full max-w-md rounded-lg border border-[#D9CCB8] bg-[#FAF7F2] p-6 space-y-4"
          >
            <h3 className="text-base font-bold text-[#39332D]">
              Estornar Movimentação #{reversingMov.id}
            </h3>
            <p className="text-xs text-[#5E4A38]">
              Valor original:{' '}
              <strong className="font-mono">{formatCurrency(reversingMov.amount)}</strong> (
              {MOV_LABELS[reversingMov.type]}). O registro original permanecerá visível
              como estornado e um lançamento compensatório de auditoria será criado.
            </p>

            <div>
              <label className="block text-xs font-semibold text-[#39332D]">
                Motivo do Estorno *
              </label>
              <input
                type="text"
                required
                minLength={5}
                value={revReason}
                onChange={(e) => setRevReason(e.target.value)}
                placeholder="Ex: Erro de digitação no valor lançado"
                className="mt-1 w-full rounded border border-[#D9CCB8] bg-white px-3 py-2 text-xs"
              />
            </div>

            {needsReverseAuth && (
              <div className="rounded border border-[#C87952] bg-[#F5F0E6] p-3 space-y-2">
                <div className="text-xs font-semibold text-[#39332D]">
                  Credenciais do Supervisor / Gerente:
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    required
                    value={revAuthUser}
                    onChange={(e) => setRevAuthUser(e.target.value)}
                    placeholder="Usuário"
                    className="rounded border border-[#D9CCB8] bg-white px-2.5 py-1.5 text-xs"
                  />
                  <input
                    type="password"
                    required
                    value={revAuthPass}
                    onChange={(e) => setRevAuthPass(e.target.value)}
                    placeholder="Senha"
                    className="rounded border border-[#D9CCB8] bg-white px-2.5 py-1.5 text-xs"
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setReversingMov(null)}
                className="rounded border border-[#D9CCB8] px-4 py-2 text-xs font-medium text-[#39332D] hover:bg-[#E8DCC8]"
              >
                Voltar
              </button>
              <button
                type="submit"
                disabled={revBusy}
                className="rounded bg-[#A65F3F] px-4 py-2 text-xs font-semibold text-[#FAF7F2] hover:bg-[#8C4D30]"
              >
                {revBusy ? 'Estornando...' : 'Confirmar Estorno'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
