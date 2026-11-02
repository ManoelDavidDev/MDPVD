import React, { useState } from 'react';
import { Lock, LogIn } from 'lucide-react';

interface LoginViewProps {
  onLogin: (username: string, password: string) => Promise<void>;
}

const DEMO_ACCOUNTS = [
  { label: 'Administrador', user: 'admin', pass: 'admin123' },
  { label: 'Gerente', user: 'gerente', pass: 'gerente123' },
  { label: 'Supervisor', user: 'supervisor', pass: 'super123' },
  { label: 'Operador de Caixa', user: 'operador', pass: 'caixa123' },
];

export const LoginView: React.FC<LoginViewProps> = ({ onLogin }) => {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin123');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await onLogin(username, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha na autenticação.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickFill = async (user: string, pass: string) => {
    setUsername(user);
    setPassword(pass);
    setError(null);
    setLoading(true);
    try {
      await onLogin(user, pass);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha na autenticação.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#F5F0E6] px-6 py-12 text-[#39332D]">
      <div className="w-full max-w-md rounded-lg border border-[#D9CCB8] bg-[#FAF7F2] p-8">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-[#39332D]">MDPDV</h1>
          <p className="mt-1.5 text-sm text-[#5E4A38]">
            Ponto de Venda e Gestão Comercial Local
          </p>
        </div>

        {error && (
          <div className="mb-5 rounded border border-[#A65F3F] bg-[#E8DCC8]/70 px-4 py-3 text-xs font-medium text-[#39332D]">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="mdpdv-username"
              className="block text-xs font-semibold text-[#39332D]"
            >
              Operador (Usuário)
            </label>
            <input
              id="mdpdv-username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className="mt-1.5 w-full rounded border border-[#D9CCB8] bg-white px-3.5 py-2.5 text-sm text-[#39332D] outline-none focus:border-[#C87952]"
              placeholder="Ex: operador"
            />
          </div>

          <div>
            <label
              htmlFor="mdpdv-password"
              className="block text-xs font-semibold text-[#39332D]"
            >
              Senha de Acesso
            </label>
            <input
              id="mdpdv-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="mt-1.5 w-full rounded border border-[#D9CCB8] bg-white px-3.5 py-2.5 text-sm text-[#39332D] outline-none focus:border-[#C87952]"
              placeholder="Digite sua senha"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded bg-[#A65F3F] px-4 py-2.5 text-sm font-semibold text-[#FAF7F2] transition-colors hover:bg-[#8C4D30] disabled:opacity-60"
          >
            <LogIn className="h-4 w-4" />
            {loading ? 'Autenticando...' : 'Entrar no Terminal'}
          </button>
        </form>

        <div className="mt-7 border-t border-[#D9CCB8] pt-5">
          <div className="flex items-center gap-1.5 text-xs font-medium text-[#5E4A38]">
            <Lock className="h-3.5 w-3.5" />
            <span>Perfis locais para validação de permissões (BCrypt):</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {DEMO_ACCOUNTS.map((acc) => (
              <button
                key={acc.user}
                type="button"
                disabled={loading}
                onClick={() => handleQuickFill(acc.user, acc.pass)}
                className="rounded border border-[#D9CCB8] bg-[#F5F0E6] px-3 py-2 text-left text-xs font-medium text-[#39332D] transition-colors hover:border-[#C87952] hover:bg-[#E8DCC8] whitespace-nowrap truncate"
              >
                {acc.label} ({acc.user})
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
