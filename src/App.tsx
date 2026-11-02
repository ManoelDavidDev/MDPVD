import React, { useCallback, useEffect, useState } from 'react';
import { LogOut, X } from 'lucide-react';
import {
  apiRequest,
  getStoredToken,
  hasExplicitlyLoggedOut,
  markExplicitLogout,
  setStoredToken,
} from './api';
import {
  formatCurrency,
  type CashRegisterEntity,
  type NavigationTab,
  type SystemSettings,
  type UserEntity,
} from './types';
import { CashMovementsView } from './views/CashMovementsView';
import { CashRegisterView } from './views/CashRegisterView';
import { HomeView } from './views/HomeView';
import { LoginView } from './views/LoginView';
import { ProductsPromotionsView } from './views/ProductsPromotionsView';
import { ReportsView } from './views/ReportsView';
import { SalesPosView } from './views/SalesPosView';
import { SettingsEngineeringView } from './views/SettingsEngineeringView';
import { StockView } from './views/StockView';
import { UsersPermissionsView } from './views/UsersPermissionsView';

const NAV_ITEMS: Array<{ id: NavigationTab; label: string }> = [
  { id: 'inicio', label: 'Início' },
  { id: 'vendas', label: 'Vendas' },
  { id: 'produtos', label: 'Produtos' },
  { id: 'estoque', label: 'Estoque' },
  { id: 'caixa', label: 'Caixa' },
  { id: 'movimentacoes', label: 'Sangria / Suprimento' },
  { id: 'relatorios', label: 'Relatórios' },
  { id: 'usuarios', label: 'Usuários' },
  { id: 'configuracoes', label: 'Configurações' },
];

const FALLBACK_SETTINGS: SystemSettings = {
  companyName: 'MERCADO E EMPÓRIO DUNA LTDA',
  tradeName: 'Empório Duna',
  cnpj: '42.819.370/0001-64',
  ie: '148.920.331.114',
  address: 'Av. Sete de Setembro, 1420 — Centro',
  cityUf: 'Ribeirão Preto - SP',
  terminalName: 'CAIXA-01',
  fiscalMode: 'NFCe_65',
  fiscalEnvironment: 'HOMOLOGACAO',
  sefazConnectivity: 'ONLINE',
  cscId: '000001',
  cscToken: '',
  certificateConfigured: true,
  certificateSubject: '',
  nfceSeries: 1,
  nextNfceNumber: 1005,
  maxOperatorDiscountPercent: 5,
};

export default function App() {
  const [initializing, setInitializing] = useState(true);
  const [user, setUser] = useState<UserEntity | null>(null);
  const [openRegister, setOpenRegister] = useState<CashRegisterEntity | null>(null);
  const [settings, setSettings] = useState<SystemSettings>(FALLBACK_SETTINGS);
  const [activeTab, setActiveTab] = useState<NavigationTab>('inicio');

  // Open Cash Register Modal
  const [showOpenCashModal, setShowOpenCashModal] = useState(false);
  const [openingBalanceStr, setOpeningBalanceStr] = useState('150.00');
  const [openingNotes, setOpeningNotes] = useState('');
  const [openingBusy, setOpeningBusy] = useState(false);

  // Toast feedback
  const [notification, setNotification] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const handleNotify = useCallback(
    (type: 'success' | 'error', message: string) => {
      setNotification({ type, message });
    },
    []
  );

  useEffect(() => {
    if (!notification) return;
    const timer = window.setTimeout(() => setNotification(null), 4500);
    return () => window.clearTimeout(timer);
  }, [notification]);

  // Initialize session
  useEffect(() => {
    let mounted = true;
    async function init() {
      try {
        const existingToken = getStoredToken();
        if (existingToken) {
          const me = await apiRequest<{
            user: UserEntity;
            openRegister: CashRegisterEntity | null;
            settings: SystemSettings;
          }>('/api/auth/me');
          if (mounted) {
            setUser(me.user);
            setOpenRegister(me.openRegister);
            setSettings(me.settings);
            setInitializing(false);
          }
          return;
        }

        if (!hasExplicitlyLoggedOut()) {
          const boot = await apiRequest<{
            token: string;
            user: UserEntity;
            openRegister: CashRegisterEntity | null;
            settings: SystemSettings;
          }>('/api/auth/bootstrap', { method: 'POST' });
          setStoredToken(boot.token);
          if (mounted) {
            setUser(boot.user);
            setOpenRegister(boot.openRegister);
            setSettings(boot.settings);
          }
        }
      } catch {
        setStoredToken(null);
      } finally {
        if (mounted) setInitializing(false);
      }
    }
    init();
    return () => {
      mounted = false;
    };
  }, []);

  const handleLogin = async (username: string, password: string) => {
    const res = await apiRequest<{
      token: string;
      user: UserEntity;
      openRegister: CashRegisterEntity | null;
      settings: SystemSettings;
    }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    setStoredToken(res.token);
    setUser(res.user);
    setOpenRegister(res.openRegister);
    setSettings(res.settings);
    setActiveTab('inicio');
  };

  const handleLogout = async () => {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore network error on logout
    }
    markExplicitLogout();
    setUser(null);
  };

  const handleConfirmOpenCash = async (e: React.FormEvent) => {
    e.preventDefault();
    setOpeningBusy(true);
    try {
      const openingBalance = parseFloat(openingBalanceStr.replace(',', '.')) || 0;
      const res = await apiRequest<{ register: CashRegisterEntity }>(
        '/api/cash-registers/open',
        {
          method: 'POST',
          body: JSON.stringify({
            openingBalance,
            notes: openingNotes || undefined,
          }),
        }
      );
      setOpenRegister(res.register);
      setShowOpenCashModal(false);
      setOpeningNotes('');
      handleNotify(
        'success',
        `Caixa ${res.register.code} aberto com fundo inicial de ${formatCurrency(
          res.register.openingBalance
        )}.`
      );
    } catch (err) {
      handleNotify(
        'error',
        err instanceof Error ? err.message : 'Não foi possível abrir o caixa.'
      );
    } finally {
      setOpeningBusy(false);
    }
  };

  if (initializing) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F5F0E6] text-sm font-medium text-[#5E4A38]">
        Inicializando banco de dados local SQLite do MDPDV...
      </div>
    );
  }

  if (!user) {
    return <LoginView onLogin={handleLogin} />;
  }

  const firstName = user.fullName.split(' ')[0];

  return (
    <div className="min-h-screen bg-[#F5F0E6] text-[#39332D] flex flex-col">
      {/* Top Desktop Navigation Bar — Clean 3-Zone Contract */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-6 border-b border-[#D9CCB8] bg-[#FAF7F2] px-6">
        {/* Zone 1: Brand Wordmark */}
        <button
          type="button"
          onClick={() => setActiveTab('inicio')}
          className="font-display text-lg font-bold tracking-tight text-[#39332D] whitespace-nowrap shrink-0"
        >
          MDPDV
        </button>

        {/* Zone 2: Module Navigation Links (Clean single-line text links with active underline) */}
        <nav
          aria-label="Módulos do sistema"
          className="no-scrollbar flex items-center gap-5 overflow-x-auto"
        >
          {NAV_ITEMS.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`h-14 border-b-2 px-0.5 text-[13px] transition-colors whitespace-nowrap shrink-0 ${
                  isActive
                    ? 'border-[#C87952] font-semibold text-[#39332D]'
                    : 'border-transparent font-medium text-[#5E4A38] hover:text-[#39332D]'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Cash Status + Authenticated Operator + Logout */}
        <div className="flex items-center gap-3 text-xs whitespace-nowrap shrink-0">
          <span className="hidden xl:inline text-[#5E4A38]">
            {openRegister ? 'Caixa Aberto' : 'Caixa Livre'} · {firstName} ({user.roleName})
          </span>
          <button
            type="button"
            onClick={handleLogout}
            title={`Encerrar sessão de ${user.fullName} ou trocar operador`}
            className="inline-flex items-center gap-1.5 rounded border border-[#D9CCB8] bg-[#F5F0E6] px-3 py-1.5 text-xs font-medium text-[#39332D] transition-colors hover:border-[#80664C] hover:bg-[#E8DCC8] whitespace-nowrap shrink-0"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sair
          </button>
        </div>
      </header>

      {/* Notification Banner */}
      {notification && (
        <div className="mx-auto mt-4 w-full max-w-[1440px] px-6">
          <div
            role="status"
            className={`flex items-center justify-between rounded border px-4 py-2.5 text-xs font-medium ${
              notification.type === 'error'
                ? 'border-[#A65F3F] bg-[#E8DCC8] text-[#39332D]'
                : 'border-[#80664C] bg-[#FAF7F2] text-[#39332D]'
            }`}
          >
            <span>{notification.message}</span>
            <button
              type="button"
              onClick={() => setNotification(null)}
              className="ml-4 p-0.5 text-[#5E4A38] hover:text-[#39332D]"
              aria-label="Fechar mensagem"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Main Single-Window Workspace */}
      <main className="flex-1">
        {activeTab === 'inicio' && (
          <HomeView
            openRegister={openRegister}
            user={user}
            onRequestOpenCashModal={() => setShowOpenCashModal(true)}
            onNavigate={setActiveTab}
          />
        )}

        {activeTab === 'vendas' && (
          <SalesPosView
            user={user}
            openRegister={openRegister}
            settings={settings}
            onRequestOpenCashModal={() => setShowOpenCashModal(true)}
            onRegisterUpdated={setOpenRegister}
            onNotify={handleNotify}
          />
        )}

        {activeTab === 'produtos' && (
          <ProductsPromotionsView user={user} onNotify={handleNotify} />
        )}

        {activeTab === 'estoque' && (
          <StockView user={user} onNotify={handleNotify} />
        )}

        {activeTab === 'caixa' && (
          <CashRegisterView
            openRegister={openRegister}
            onRequestOpenCashModal={() => setShowOpenCashModal(true)}
            onRegisterUpdated={setOpenRegister}
            onNotify={handleNotify}
          />
        )}

        {activeTab === 'movimentacoes' && (
          <CashMovementsView
            user={user}
            openRegister={openRegister}
            onRequestOpenCashModal={() => setShowOpenCashModal(true)}
            onRegisterUpdated={setOpenRegister}
            onNotify={handleNotify}
          />
        )}

        {activeTab === 'relatorios' && (
          <ReportsView user={user} onNotify={handleNotify} />
        )}

        {activeTab === 'usuarios' && (
          <UsersPermissionsView currentUser={user} onNotify={handleNotify} />
        )}

        {activeTab === 'configuracoes' && (
          <SettingsEngineeringView
            user={user}
            settings={settings}
            onSettingsUpdated={setSettings}
            onRegisterUpdated={setOpenRegister}
            onNotify={handleNotify}
          />
        )}
      </main>

      {/* Open Cash Register Dialog */}
      {showOpenCashModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#39332D]/55 p-4">
          <form
            onSubmit={handleConfirmOpenCash}
            className="w-full max-w-md rounded-lg border border-[#D9CCB8] bg-[#FAF7F2] p-6 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-[#D9CCB8] pb-3">
              <h3 className="text-base font-bold text-[#39332D]">
                Abertura de Turno de Caixa
              </h3>
              <button
                type="button"
                onClick={() => setShowOpenCashModal(false)}
                className="p-1 text-[#5E4A38] hover:text-[#39332D]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="text-xs text-[#5E4A38]">
              Operador responsável:{' '}
              <strong className="text-[#39332D]">{user.fullName}</strong> · Terminal:{' '}
              <strong className="font-mono text-[#39332D]">
                {settings.terminalName}
              </strong>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#39332D]">
                Valor Inicial em Espécie — Fundo de Troco (R$) *
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                autoFocus
                value={openingBalanceStr}
                onChange={(e) => setOpeningBalanceStr(e.target.value)}
                className="mt-1.5 w-full rounded border border-[#D9CCB8] bg-white px-3.5 py-2.5 font-mono text-base font-semibold tabular-nums text-[#39332D] outline-none focus:border-[#C87952]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#39332D]">
                Observação (Opcional)
              </label>
              <input
                type="text"
                value={openingNotes}
                onChange={(e) => setOpeningNotes(e.target.value)}
                placeholder="Ex: Turno matutino — troco conferido"
                className="mt-1 w-full rounded border border-[#D9CCB8] bg-white px-3 py-2 text-xs text-[#39332D]"
              />
            </div>

            <div className="flex justify-end gap-2 border-t border-[#D9CCB8] pt-4">
              <button
                type="button"
                onClick={() => setShowOpenCashModal(false)}
                className="rounded border border-[#D9CCB8] px-4 py-2 text-xs font-medium text-[#39332D] hover:bg-[#E8DCC8]"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={openingBusy}
                className="rounded bg-[#A65F3F] px-6 py-2 text-xs font-bold text-[#FAF7F2] hover:bg-[#8C4D30] disabled:opacity-50"
              >
                {openingBusy ? 'Abrindo Caixa...' : 'Confirmar Abertura'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
