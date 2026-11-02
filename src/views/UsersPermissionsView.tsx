import React, { useCallback, useEffect, useState } from 'react';
import { KeyRound, LockOpen, Plus, ShieldCheck, UserCheck, UserX } from 'lucide-react';
import { apiRequest } from '../api';
import {
  PERMISSIONS,
  PERMISSION_LABELS,
  formatDateTime,
  type PermissionCode,
  type RoleEntity,
  type UserEntity,
} from '../types';

interface UsersPermissionsViewProps {
  currentUser: UserEntity;
  onNotify: (type: 'success' | 'error', message: string) => void;
}

export const UsersPermissionsView: React.FC<UsersPermissionsViewProps> = ({
  currentUser,
  onNotify,
}) => {
  const [subTab, setSubTab] = useState<'usuarios' | 'permissoes' | 'minha_senha'>(
    'usuarios'
  );
  const [users, setUsers] = useState<UserEntity[]>([]);
  const [roles, setRoles] = useState<RoleEntity[]>([]);

  // New user form
  const [newUsername, setNewUsername] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRoleId, setNewRoleId] = useState<number>(4);

  // Password change modal/form
  const [resetTarget, setResetTarget] = useState<UserEntity | null>(null);
  const [resetPasswordVal, setResetPasswordVal] = useState('');

  // Own password
  const [curPass, setCurPass] = useState('');
  const [nextPass, setNextPass] = useState('');

  const canManageUsers = currentUser.permissions.includes(PERMISSIONS.USER_MANAGE);

  const loadUsers = useCallback(async () => {
    try {
      const res = await apiRequest<{ users: UserEntity[]; roles: RoleEntity[] }>(
        '/api/users'
      );
      setUsers(res.users);
      setRoles(res.roles);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Erro ao listar operadores.');
    }
  }, [onNotify]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/users', {
        method: 'POST',
        body: JSON.stringify({
          username: newUsername,
          fullName: newFullName,
          password: newPassword,
          roleId: newRoleId,
        }),
      });
      setNewUsername('');
      setNewFullName('');
      setNewPassword('');
      await loadUsers();
      onNotify('success', 'Operador cadastrado com hash BCrypt.');
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Erro ao criar usuário.');
    }
  };

  const handleToggleStatus = async (
    target: UserEntity,
    updates: { active?: boolean; locked?: boolean }
  ) => {
    try {
      await apiRequest(`/api/users/${target.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      });
      await loadUsers();
      onNotify('success', `Cadastro de @${target.username} atualizado.`);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Falha na atualização.');
    }
  };

  const handleAdminResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTarget) return;
    try {
      await apiRequest(`/api/users/${resetTarget.id}/password`, {
        method: 'POST',
        body: JSON.stringify({ newPassword: resetPasswordVal }),
      });
      setResetTarget(null);
      setResetPasswordVal('');
      onNotify('success', `Senha de @${resetTarget.username} redefinida.`);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Erro ao redefinir senha.');
    }
  };

  const handleOwnPasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest(`/api/users/${currentUser.id}/password`, {
        method: 'POST',
        body: JSON.stringify({
          currentPassword: curPass,
          newPassword: nextPass,
        }),
      });
      setCurPass('');
      setNextPass('');
      onNotify('success', 'Sua senha foi alterada com sucesso.');
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Erro ao alterar senha.');
    }
  };

  const handleToggleRolePermission = async (
    role: RoleEntity,
    permCode: PermissionCode
  ) => {
    if (!canManageUsers) return;
    const exists = role.permissions.includes(permCode);
    const updatedPerms = exists
      ? role.permissions.filter((p) => p !== permCode)
      : [...role.permissions, permCode];

    try {
      const res = await apiRequest<{ roles: RoleEntity[] }>(
        `/api/roles/${role.id}/permissions`,
        {
          method: 'PUT',
          body: JSON.stringify({ permissions: updatedPerms }),
        }
      );
      setRoles(res.roles);
      onNotify('success', `Permissões do perfil ${role.name} atualizadas.`);
    } catch (err) {
      onNotify(
        'error',
        err instanceof Error ? err.message : 'Não foi possível alterar permissão.'
      );
    }
  };

  return (
    <div className="mx-auto max-w-[1440px] px-6 py-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#D9CCB8] pb-3">
        <div className="flex items-center gap-6">
          <button
            type="button"
            onClick={() => setSubTab('usuarios')}
            className={`pb-2 text-sm transition-colors whitespace-nowrap ${
              subTab === 'usuarios'
                ? 'border-b-2 border-[#C87952] font-semibold text-[#39332D]'
                : 'text-[#5E4A38] hover:text-[#39332D]'
            }`}
          >
            Operadores Cadastrados ({users.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('permissoes')}
            className={`pb-2 text-sm transition-colors whitespace-nowrap ${
              subTab === 'permissoes'
                ? 'border-b-2 border-[#C87952] font-semibold text-[#39332D]'
                : 'text-[#5E4A38] hover:text-[#39332D]'
            }`}
          >
            Matriz de Permissões (RBAC)
          </button>
          <button
            type="button"
            onClick={() => setSubTab('minha_senha')}
            className={`pb-2 text-sm transition-colors whitespace-nowrap ${
              subTab === 'minha_senha'
                ? 'border-b-2 border-[#C87952] font-semibold text-[#39332D]'
                : 'text-[#5E4A38] hover:text-[#39332D]'
            }`}
          >
            Alterar Minha Senha
          </button>
        </div>
      </div>

      {/* TAB 1: USERS */}
      {subTab === 'usuarios' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="lg:col-span-8 rounded-lg border border-[#D9CCB8] bg-[#FAF7F2] overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead className="bg-[#E8DCC8] text-[#39332D]">
                <tr>
                  <th className="px-4 py-3 font-semibold">Operador</th>
                  <th className="px-4 py-3 font-semibold">Perfil</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Último Acesso</th>
                  <th className="px-4 py-3 text-right font-semibold">Gerenciar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8DCC8]">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-[#F5F0E6]">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-[#39332D]">{u.fullName}</div>
                      <div className="font-mono text-[11px] text-[#5E4A38]">
                        @{u.username}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[#39332D]">{u.roleName}</td>
                    <td className="px-4 py-3 text-[#5E4A38]">
                      {u.locked
                        ? 'Bloqueado por Segurança'
                        : u.active
                          ? 'Ativo'
                          : 'Desativado'}
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] tabular-nums text-[#5E4A38]">
                      {formatDateTime(u.lastLoginAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {canManageUsers ? (
                        <div className="inline-flex items-center gap-1.5">
                          {u.locked && (
                            <button
                              type="button"
                              onClick={() => handleToggleStatus(u, { locked: false })}
                              className="inline-flex items-center gap-1 rounded border border-[#80664C] bg-white px-2 py-1 text-[11px] text-[#39332D] hover:bg-[#E8DCC8]"
                            >
                              <LockOpen className="h-3 w-3" />
                              Desbloquear
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setResetTarget(u)}
                            className="inline-flex items-center gap-1 rounded border border-[#D9CCB8] bg-white px-2 py-1 text-[11px] text-[#39332D] hover:bg-[#E8DCC8]"
                          >
                            <KeyRound className="h-3 w-3" />
                            Senha
                          </button>
                          {u.id !== currentUser.id && (
                            <button
                              type="button"
                              onClick={() =>
                                handleToggleStatus(u, { active: !u.active })
                              }
                              className="inline-flex items-center gap-1 rounded border border-[#D9CCB8] bg-white px-2 py-1 text-[11px] text-[#39332D] hover:bg-[#E8DCC8]"
                            >
                              {u.active ? (
                                <>
                                  <UserX className="h-3 w-3 text-[#A65F3F]" />
                                  Desativar
                                </>
                              ) : (
                                <>
                                  <UserCheck className="h-3 w-3" />
                                  Reativar
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      ) : (
                        <span className="text-[11px] text-[#80664C]">Restrito</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {canManageUsers ? (
            <form
              onSubmit={handleCreateUser}
              className="lg:col-span-4 rounded-lg border border-[#D9CCB8] bg-[#FAF7F2] p-5 space-y-4 h-fit"
            >
              <div className="flex items-center gap-2 border-b border-[#D9CCB8] pb-2.5">
                <Plus className="h-4 w-4 text-[#A65F3F]" />
                <h3 className="text-sm font-bold text-[#39332D]">Novo Operador</h3>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#39332D]">
                  Nome Completo *
                </label>
                <input
                  type="text"
                  required
                  value={newFullName}
                  onChange={(e) => setNewFullName(e.target.value)}
                  className="mt-1 w-full rounded border border-[#D9CCB8] bg-white px-3 py-2 text-xs"
                  placeholder="Ex: Lucas Andrade"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#39332D]">
                  Usuário de Login *
                </label>
                <input
                  type="text"
                  required
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  className="mt-1 w-full rounded border border-[#D9CCB8] bg-white px-3 py-2 font-mono text-xs"
                  placeholder="Ex: lucas.caixa"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#39332D]">
                  Perfil de Acesso *
                </label>
                <select
                  value={newRoleId}
                  onChange={(e) => setNewRoleId(Number(e.target.value))}
                  className="mt-1 w-full rounded border border-[#D9CCB8] bg-white px-3 py-2 text-xs"
                >
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#39332D]">
                  Senha Inicial (mín. 6 caracteres) *
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="mt-1 w-full rounded border border-[#D9CCB8] bg-white px-3 py-2 text-xs"
                />
              </div>

              <button
                type="submit"
                className="w-full rounded bg-[#A65F3F] px-4 py-2.5 text-xs font-bold text-[#FAF7F2] hover:bg-[#8C4D30]"
              >
                Cadastrar Operador
              </button>
            </form>
          ) : (
            <div className="lg:col-span-4 rounded-lg border border-[#D9CCB8] bg-[#FAF7F2] p-5 h-fit text-xs text-[#5E4A38]">
              Apenas usuários com a permissão <strong>Gerenciar Usuários</strong> podem
              criar ou alterar contas de operadores.
            </div>
          )}
        </div>
      )}

      {/* TAB 2: PERMISSIONS MATRIX */}
      {subTab === 'permissoes' && (
        <div className="rounded-lg border border-[#D9CCB8] bg-[#FAF7F2] overflow-x-auto">
          <div className="flex items-center gap-2 border-b border-[#D9CCB8] px-5 py-3.5">
            <ShieldCheck className="h-4 w-4 text-[#A65F3F]" />
            <h2 className="text-sm font-bold text-[#39332D]">
              Controle Granular de Permissões por Operação (RBAC)
            </h2>
          </div>

          <table className="w-full border-collapse text-left text-xs">
            <thead className="bg-[#E8DCC8] text-[#39332D]">
              <tr>
                <th className="px-4 py-3 font-semibold">Operação do Sistema</th>
                {roles.map((r) => (
                  <th key={r.id} className="px-4 py-3 text-center font-semibold">
                    {r.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8DCC8]">
              {(Object.keys(PERMISSIONS) as PermissionCode[]).map((permCode) => (
                <tr key={permCode} className="hover:bg-[#F5F0E6]">
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-[#39332D]">
                      {PERMISSION_LABELS[permCode]}
                    </div>
                    <div className="font-mono text-[10px] text-[#5E4A38]">{permCode}</div>
                  </td>
                  {roles.map((role) => {
                    const checked = role.permissions.includes(permCode);
                    return (
                      <td key={role.id} className="px-4 py-2.5 text-center">
                        <input
                          type="checkbox"
                          disabled={!canManageUsers}
                          checked={checked}
                          onChange={() => handleToggleRolePermission(role, permCode)}
                          className="h-4 w-4 accent-[#A65F3F]"
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 3: OWN PASSWORD */}
      {subTab === 'minha_senha' && (
        <form
          onSubmit={handleOwnPasswordChange}
          className="max-w-md rounded-lg border border-[#D9CCB8] bg-[#FAF7F2] p-6 space-y-4"
        >
          <h3 className="text-sm font-bold text-[#39332D]">
            Alterar Senha de @{currentUser.username}
          </h3>
          <div>
            <label className="block text-xs font-semibold text-[#39332D]">
              Senha Atual
            </label>
            <input
              type="password"
              required
              value={curPass}
              onChange={(e) => setCurPass(e.target.value)}
              className="mt-1 w-full rounded border border-[#D9CCB8] bg-white px-3 py-2 text-xs"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#39332D]">
              Nova Senha (mín. 6 caracteres)
            </label>
            <input
              type="password"
              required
              minLength={6}
              value={nextPass}
              onChange={(e) => setNextPass(e.target.value)}
              className="mt-1 w-full rounded border border-[#D9CCB8] bg-white px-3 py-2 text-xs"
            />
          </div>
          <button
            type="submit"
            className="rounded bg-[#A65F3F] px-5 py-2.5 text-xs font-bold text-[#FAF7F2] hover:bg-[#8C4D30]"
          >
            Atualizar Senha
          </button>
        </form>
      )}

      {/* Password Reset Modal */}
      {resetTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#39332D]/55 p-4">
          <form
            onSubmit={handleAdminResetPassword}
            className="w-full max-w-sm rounded-lg border border-[#D9CCB8] bg-[#FAF7F2] p-6 space-y-4"
          >
            <h3 className="text-sm font-bold text-[#39332D]">
              Redefinir Senha — {resetTarget.fullName}
            </h3>
            <div>
              <label className="block text-xs font-semibold text-[#39332D]">
                Nova Senha Temporária
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={resetPasswordVal}
                onChange={(e) => setResetPasswordVal(e.target.value)}
                className="mt-1 w-full rounded border border-[#D9CCB8] bg-white px-3 py-2 text-xs"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setResetTarget(null)}
                className="rounded border border-[#D9CCB8] px-3 py-1.5 text-xs text-[#39332D]"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="rounded bg-[#A65F3F] px-4 py-1.5 text-xs font-semibold text-[#FAF7F2]"
              >
                Salvar Nova Senha
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
