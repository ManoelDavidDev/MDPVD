import React from 'react';
import {
  formatCurrency,
  formatDateTime,
  type CashRegisterEntity,
  type NavigationTab,
  type UserEntity,
} from '../types';

interface HomeViewProps {
  openRegister: CashRegisterEntity | null;
  user: UserEntity;
  onRequestOpenCashModal: () => void;
  onNavigate: (tab: NavigationTab) => void;
}

export const HomeView: React.FC<HomeViewProps> = ({
  openRegister,
  user,
  onRequestOpenCashModal,
  onNavigate,
}) => {
  if (!openRegister) {
    // Exact implementation of Section 7.1 — Clean, uncluttered initial workspace
    return (
      <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center px-6 py-12">
        <div className="w-full max-w-lg rounded-lg border border-[#D9CCB8] bg-[#FAF7F2] px-10 py-14 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-[#39332D]">
            CAIXA LIVRE
          </h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-[#5E4A38]">
            Nenhuma operação em andamento. O caixa está disponível para uso.
          </p>
          <div className="mt-8">
            <button
              type="button"
              onClick={onRequestOpenCashModal}
              className="rounded bg-[#A65F3F] px-8 py-3 text-sm font-semibold tracking-wide text-[#FAF7F2] transition-colors hover:bg-[#8C4D30] whitespace-nowrap"
            >
              ABRIR CAIXA
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center px-6 py-12">
      <div className="w-full max-w-xl rounded-lg border border-[#D9CCB8] bg-[#FAF7F2] px-10 py-12 text-center">
        <div className="text-xs font-medium text-[#5E4A38]">
          {openRegister.terminalName} · Turno {openRegister.code}
        </div>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-[#39332D]">
          CAIXA ABERTO
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-[#5E4A38]">
          Operação ativa iniciada em {formatDateTime(openRegister.openedAt)} por{' '}
          <span className="font-medium text-[#39332D]">
            {openRegister.openedByName || user.fullName}
          </span>
          . Saldo físico esperado na gaveta:{' '}
          <span className="font-mono font-semibold text-[#39332D] tabular-nums">
            {formatCurrency(openRegister.expectedCashBalance)}
          </span>
          .
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => onNavigate('vendas')}
            className="rounded bg-[#A65F3F] px-7 py-3 text-sm font-semibold text-[#FAF7F2] transition-colors hover:bg-[#8C4D30] whitespace-nowrap"
          >
            IR PARA VENDAS (PDV)
          </button>
          <button
            type="button"
            onClick={() => onNavigate('caixa')}
            className="rounded border border-[#80664C] bg-transparent px-5 py-3 text-sm font-medium text-[#39332D] transition-colors hover:bg-[#E8DCC8] whitespace-nowrap"
          >
            Conferir / Fechar Caixa
          </button>
        </div>
      </div>
    </div>
  );
};
