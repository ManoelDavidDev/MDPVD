import React, { useCallback, useEffect, useState } from 'react';
import {
  BookOpen,
  Copy,
  Database,
  Download,
  FileCode2,
  RotateCcw,
  Save,
  ShieldAlert,
} from 'lucide-react';
import { apiRequest, getBackupDownloadUrl } from '../api';
import {
  PERMISSIONS,
  formatDateTime,
  type AuditLogEntity,
  type BackupEntry,
  type CashRegisterEntity,
  type JavaReferenceFile,
  type SystemSettings,
  type UserEntity,
} from '../types';

interface SettingsEngineeringViewProps {
  user: UserEntity;
  settings: SystemSettings;
  onSettingsUpdated: (s: SystemSettings) => void;
  onRegisterUpdated: (reg: CashRegisterEntity | null) => void;
  onNotify: (type: 'success' | 'error', message: string) => void;
}

export const SettingsEngineeringView: React.FC<SettingsEngineeringViewProps> = ({
  user,
  settings,
  onSettingsUpdated,
  onRegisterUpdated,
  onNotify,
}) => {
  const [subTab, setSubTab] = useState<'fiscal' | 'backup' | 'auditoria' | 'engenharia'>(
    'fiscal'
  );
  const [formSettings, setFormSettings] = useState<SystemSettings>(settings);
  const [savingSettings, setSavingSettings] = useState(false);

  // Backups
  const [backups, setBackups] = useState<BackupEntry[]>([]);
  const [backupLabel, setBackupLabel] = useState('fechamento_diario');
  const [creatingBackup, setCreatingBackup] = useState(false);
  const [confirmRestoreFile, setConfirmRestoreFile] = useState<string | null>(null);

  // Audit logs
  const [auditLogs, setAuditLogs] = useState<AuditLogEntity[]>([]);
  const [auditFilter, setAuditFilter] = useState('');

  // JavaFX Blueprint
  const [javaFiles, setJavaFiles] = useState<JavaReferenceFile[]>([]);
  const [selectedJavaIdx, setSelectedJavaIdx] = useState(0);

  const canManageFiscal = user.permissions.includes(PERMISSIONS.FISCAL_MANAGE);
  const canManageBackup = user.permissions.includes(PERMISSIONS.BACKUP_MANAGE);
  const canViewAudit = user.permissions.includes(PERMISSIONS.AUDIT_VIEW);

  useEffect(() => {
    setFormSettings(settings);
  }, [settings]);

  const loadSettingsExtras = useCallback(async () => {
    try {
      const res = await apiRequest<{
        settings: SystemSettings;
        javafxBlueprint: JavaReferenceFile[];
      }>('/api/settings');
      setJavaFiles(res.javafxBlueprint);
    } catch {
      // ignore
    }
  }, []);

  const loadBackups = useCallback(async () => {
    if (!canManageBackup) return;
    try {
      const res = await apiRequest<{ backups: BackupEntry[] }>('/api/backups');
      setBackups(res.backups);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Erro ao listar backups.');
    }
  }, [canManageBackup, onNotify]);

  const loadAudit = useCallback(async () => {
    if (!canViewAudit) return;
    try {
      const res = await apiRequest<{ logs: AuditLogEntity[] }>('/api/audit-logs');
      setAuditLogs(res.logs);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Erro ao carregar auditoria.');
    }
  }, [canViewAudit, onNotify]);

  useEffect(() => {
    loadSettingsExtras();
  }, [loadSettingsExtras]);

  useEffect(() => {
    if (subTab === 'backup') loadBackups();
    if (subTab === 'auditoria') loadAudit();
  }, [subTab, loadBackups, loadAudit]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      const res = await apiRequest<{ settings: SystemSettings }>('/api/settings', {
        method: 'PUT',
        body: JSON.stringify(formSettings),
      });
      onSettingsUpdated(res.settings);
      onNotify('success', 'Configurações comerciais e fiscais salvas.');
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Erro ao salvar.');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleCreateBackup = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingBackup(true);
    try {
      const res = await apiRequest<{ backups: BackupEntry[] }>('/api/backups', {
        method: 'POST',
        body: JSON.stringify({ label: backupLabel }),
      });
      setBackups(res.backups);
      onNotify('success', 'Backup consistente SQLite (VACUUM INTO) criado com sucesso.');
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Erro ao criar backup.');
    } finally {
      setCreatingBackup(false);
    }
  };

  const handleConfirmRestore = async () => {
    if (!confirmRestoreFile) return;
    try {
      const res = await apiRequest<{
        openRegister: CashRegisterEntity | null;
        backups: BackupEntry[];
      }>('/api/backups/restore', {
        method: 'POST',
        body: JSON.stringify({ filename: confirmRestoreFile }),
      });
      setConfirmRestoreFile(null);
      setBackups(res.backups);
      onRegisterUpdated(res.openRegister);
      onNotify(
        'success',
        'Banco de dados SQLite restaurado com sucesso (cópia pré-restauração preservada).'
      );
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Falha na restauração.');
    }
  };

  const handleCopyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      onNotify('success', 'Código copiado para a área de transferência.');
    } catch {
      onNotify('error', 'Não foi possível copiar automaticamente.');
    }
  };

  const filteredLogs = auditLogs.filter((l) => {
    const q = auditFilter.trim().toLowerCase();
    if (!q) return true;
    return (
      l.action.toLowerCase().includes(q) ||
      l.userNameSnapshot.toLowerCase().includes(q) ||
      l.details.toLowerCase().includes(q) ||
      l.entityId.toLowerCase().includes(q)
    );
  });

  return (
    <div className="mx-auto max-w-[1440px] px-6 py-6 space-y-6">
      {/* Sub-navigation */}
      <div className="flex flex-wrap items-center gap-6 border-b border-[#D9CCB8] pb-3">
        <button
          type="button"
          onClick={() => setSubTab('fiscal')}
          className={`pb-2 text-sm transition-colors whitespace-nowrap ${
            subTab === 'fiscal'
              ? 'border-b-2 border-[#C87952] font-semibold text-[#39332D]'
              : 'text-[#5E4A38] hover:text-[#39332D]'
          }`}
        >
          Emissão Fiscal (NFC-e / SEFAZ)
        </button>
        <button
          type="button"
          onClick={() => setSubTab('backup')}
          className={`pb-2 text-sm transition-colors whitespace-nowrap ${
            subTab === 'backup'
              ? 'border-b-2 border-[#C87952] font-semibold text-[#39332D]'
              : 'text-[#5E4A38] hover:text-[#39332D]'
          }`}
        >
          Backup & Recuperação SQLite
        </button>
        <button
          type="button"
          onClick={() => setSubTab('auditoria')}
          className={`pb-2 text-sm transition-colors whitespace-nowrap ${
            subTab === 'auditoria'
              ? 'border-b-2 border-[#C87952] font-semibold text-[#39332D]'
              : 'text-[#5E4A38] hover:text-[#39332D]'
          }`}
        >
          Trilha de Auditoria (AuditLog)
        </button>
        <button
          type="button"
          onClick={() => setSubTab('engenharia')}
          className={`pb-2 text-sm transition-colors whitespace-nowrap ${
            subTab === 'engenharia'
              ? 'border-b-2 border-[#C87952] font-semibold text-[#39332D]'
              : 'text-[#5E4A38] hover:text-[#39332D]'
          }`}
        >
          Arquitetura & Projeto JavaFX (Engenharia)
        </button>
      </div>

      {/* TAB 1: FISCAL & COMMERCIAL SETTINGS */}
      {subTab === 'fiscal' && (
        <form
          onSubmit={handleSaveSettings}
          className="grid grid-cols-1 gap-6 lg:grid-cols-12"
        >
          <div className="lg:col-span-7 rounded-lg border border-[#D9CCB8] bg-[#FAF7F2] p-6 space-y-4">
            <h2 className="text-base font-bold text-[#39332D]">
              Dados do Estabelecimento Emitente
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-[#39332D]">
                  Razão Social
                </label>
                <input
                  type="text"
                  disabled={!canManageFiscal}
                  value={formSettings.companyName}
                  onChange={(e) =>
                    setFormSettings({ ...formSettings, companyName: e.target.value })
                  }
                  className="mt-1 w-full rounded border border-[#D9CCB8] bg-white px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#39332D]">
                  Nome Fantasia
                </label>
                <input
                  type="text"
                  disabled={!canManageFiscal}
                  value={formSettings.tradeName}
                  onChange={(e) =>
                    setFormSettings({ ...formSettings, tradeName: e.target.value })
                  }
                  className="mt-1 w-full rounded border border-[#D9CCB8] bg-white px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#39332D]">
                  Identificação do Terminal PDV
                </label>
                <input
                  type="text"
                  disabled={!canManageFiscal}
                  value={formSettings.terminalName}
                  onChange={(e) =>
                    setFormSettings({ ...formSettings, terminalName: e.target.value })
                  }
                  className="mt-1 w-full rounded border border-[#D9CCB8] bg-white px-3 py-2 font-mono text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#39332D]">CNPJ</label>
                <input
                  type="text"
                  disabled={!canManageFiscal}
                  value={formSettings.cnpj}
                  onChange={(e) =>
                    setFormSettings({ ...formSettings, cnpj: e.target.value })
                  }
                  className="mt-1 w-full rounded border border-[#D9CCB8] bg-white px-3 py-2 font-mono text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#39332D]">
                  Inscrição Estadual (IE)
                </label>
                <input
                  type="text"
                  disabled={!canManageFiscal}
                  value={formSettings.ie}
                  onChange={(e) =>
                    setFormSettings({ ...formSettings, ie: e.target.value })
                  }
                  className="mt-1 w-full rounded border border-[#D9CCB8] bg-white px-3 py-2 font-mono text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#39332D]">
                  Limite de Desconto sem Supervisor (%)
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  disabled={!canManageFiscal}
                  value={formSettings.maxOperatorDiscountPercent}
                  onChange={(e) =>
                    setFormSettings({
                      ...formSettings,
                      maxOperatorDiscountPercent: Number(e.target.value),
                    })
                  }
                  className="mt-1 w-full rounded border border-[#D9CCB8] bg-white px-3 py-2 font-mono text-xs"
                />
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 rounded-lg border border-[#D9CCB8] bg-[#FAF7F2] p-6 space-y-4">
            <h2 className="text-base font-bold text-[#39332D]">
              Homologação Fiscal NFC-e & SEFAZ (RF08)
            </h2>

            <div>
              <label className="block text-xs font-semibold text-[#39332D]">
                Modalidade de Emissão no PDV
              </label>
              <select
                disabled={!canManageFiscal}
                value={formSettings.fiscalMode}
                onChange={(e) =>
                  setFormSettings({
                    ...formSettings,
                    fiscalMode: e.target.value as SystemSettings['fiscalMode'],
                  })
                }
                className="mt-1 w-full rounded border border-[#D9CCB8] bg-white px-3 py-2 text-xs"
              >
                <option value="NFCe_65">
                  NFC-e Modelo 65 (Documento Fiscal Eletrônico SEFAZ)
                </option>
                <option value="COMPROVANTE_NAO_FISCAL">
                  Comprovante Comercial Não Fiscal (Sem Validade Fiscal)
                </option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#39332D]">
                  Ambiente SEFAZ
                </label>
                <select
                  disabled={!canManageFiscal}
                  value={formSettings.fiscalEnvironment}
                  onChange={(e) =>
                    setFormSettings({
                      ...formSettings,
                      fiscalEnvironment: e.target
                        .value as SystemSettings['fiscalEnvironment'],
                    })
                  }
                  className="mt-1 w-full rounded border border-[#D9CCB8] bg-white px-3 py-2 text-xs"
                >
                  <option value="HOMOLOGACAO">Homologação (tpAmb=2)</option>
                  <option value="PRODUCAO">Produção (tpAmb=1)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#39332D]">
                  Comunicação SEFAZ
                </label>
                <select
                  disabled={!canManageFiscal}
                  value={formSettings.sefazConnectivity}
                  onChange={(e) =>
                    setFormSettings({
                      ...formSettings,
                      sefazConnectivity: e.target
                        .value as SystemSettings['sefazConnectivity'],
                    })
                  }
                  className="mt-1 w-full rounded border border-[#D9CCB8] bg-white px-3 py-2 text-xs"
                >
                  <option value="ONLINE">Online (Autorização Síncrona 100)</option>
                  <option value="OFFLINE_CONTINGENCY">
                    Contingência Offline (tpEmis=9)
                  </option>
                  <option value="SIMULATE_REJECTION">
                    Simular Rejeição Cadastral (cStat=539)
                  </option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#39332D]">
                  Série NFC-e
                </label>
                <input
                  type="number"
                  min="1"
                  disabled={!canManageFiscal}
                  value={formSettings.nfceSeries}
                  onChange={(e) =>
                    setFormSettings({
                      ...formSettings,
                      nfceSeries: Number(e.target.value),
                    })
                  }
                  className="mt-1 w-full rounded border border-[#D9CCB8] bg-white px-3 py-2 font-mono text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#39332D]">
                  Próximo Nº
                </label>
                <input
                  type="number"
                  min="1"
                  disabled={!canManageFiscal}
                  value={formSettings.nextNfceNumber}
                  onChange={(e) =>
                    setFormSettings({
                      ...formSettings,
                      nextNfceNumber: Number(e.target.value),
                    })
                  }
                  className="mt-1 w-full rounded border border-[#D9CCB8] bg-white px-3 py-2 font-mono text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#39332D]">
                  ID CSC
                </label>
                <input
                  type="text"
                  disabled={!canManageFiscal}
                  value={formSettings.cscId}
                  onChange={(e) =>
                    setFormSettings({ ...formSettings, cscId: e.target.value })
                  }
                  className="mt-1 w-full rounded border border-[#D9CCB8] bg-white px-3 py-2 font-mono text-xs"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#39332D]">
                Token CSC (Código de Segurança do Contribuinte)
              </label>
              <input
                type="text"
                disabled={!canManageFiscal}
                value={formSettings.cscToken}
                onChange={(e) =>
                  setFormSettings({ ...formSettings, cscToken: e.target.value })
                }
                className="mt-1 w-full rounded border border-[#D9CCB8] bg-white px-3 py-2 font-mono text-xs"
              />
            </div>

            <label className="inline-flex items-center gap-2 text-xs font-medium text-[#39332D]">
              <input
                type="checkbox"
                disabled={!canManageFiscal}
                checked={formSettings.certificateConfigured}
                onChange={(e) =>
                  setFormSettings({
                    ...formSettings,
                    certificateConfigured: e.target.checked,
                  })
                }
              />
              Certificado Digital ICP-Brasil A1 (.pfx) instalado e válido
            </label>

            {canManageFiscal && (
              <button
                type="submit"
                disabled={savingSettings}
                className="flex w-full items-center justify-center gap-2 rounded bg-[#A65F3F] px-5 py-2.5 text-xs font-bold text-[#FAF7F2] hover:bg-[#8C4D30]"
              >
                <Save className="h-4 w-4" />
                {savingSettings ? 'Salvando...' : 'Salvar Parâmetros'}
              </button>
            )}
          </div>
        </form>
      )}

      {/* TAB 2: SQLITE BACKUP & RESTORE */}
      {subTab === 'backup' && (
        <div className="space-y-6">
          {!canManageBackup ? (
            <div className="rounded-lg border border-[#D9CCB8] bg-[#FAF7F2] p-8 text-center text-xs text-[#5E4A38]">
              Apenas o Administrador possui permissão para gerar ou restaurar cópias do
              banco de dados SQLite.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              <form
                onSubmit={handleCreateBackup}
                className="lg:col-span-4 rounded-lg border border-[#D9CCB8] bg-[#FAF7F2] p-5 space-y-4 h-fit"
              >
                <div className="flex items-center gap-2 border-b border-[#D9CCB8] pb-2.5">
                  <Database className="h-4 w-4 text-[#A65F3F]" />
                  <h2 className="text-sm font-bold text-[#39332D]">
                    Gerar Cópia Segura SQLite
                  </h2>
                </div>
                <p className="text-xs text-[#5E4A38]">
                  Utiliza o comando atômico <code className="font-mono">VACUUM INTO</code>{' '}
                  do SQLite para criar um arquivo <code className="font-mono">.sqlite</code>{' '}
                  íntegro mesmo com o modo WAL ativo, sem corromper transações.
                </p>
                <div>
                  <label className="block text-xs font-semibold text-[#39332D]">
                    Identificador do Backup
                  </label>
                  <input
                    type="text"
                    value={backupLabel}
                    onChange={(e) => setBackupLabel(e.target.value)}
                    className="mt-1 w-full rounded border border-[#D9CCB8] bg-white px-3 py-2 font-mono text-xs"
                  />
                </div>
                <button
                  type="submit"
                  disabled={creatingBackup}
                  className="w-full rounded bg-[#A65F3F] px-4 py-2.5 text-xs font-bold text-[#FAF7F2] hover:bg-[#8C4D30]"
                >
                  {creatingBackup ? 'Gerando Backup...' : 'Criar Backup Agora'}
                </button>
              </form>

              <div className="lg:col-span-8 rounded-lg border border-[#D9CCB8] bg-[#FAF7F2] overflow-x-auto">
                <div className="border-b border-[#D9CCB8] px-5 py-3.5">
                  <h2 className="text-sm font-semibold text-[#39332D]">
                    Pontos de Recuperação Locais ({backups.length})
                  </h2>
                </div>
                <table className="w-full border-collapse text-left text-xs">
                  <thead className="bg-[#E8DCC8] text-[#39332D]">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Arquivo SQLite</th>
                      <th className="px-4 py-3 font-semibold">Data / Hora</th>
                      <th className="px-4 py-3 text-right font-semibold">Tamanho</th>
                      <th className="px-4 py-3 text-right font-semibold">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E8DCC8]">
                    {backups.length === 0 ? (
                      <tr>
                        <td
                          colSpan={4}
                          className="px-4 py-8 text-center text-[#5E4A38]"
                        >
                          Nenhum backup gerado ainda. Clique em "Criar Backup Agora".
                        </td>
                      </tr>
                    ) : (
                      backups.map((b) => (
                        <tr key={b.filename} className="hover:bg-[#F5F0E6]">
                          <td className="px-4 py-3 font-mono font-semibold text-[#39332D]">
                            {b.filename}
                          </td>
                          <td className="px-4 py-3 font-mono tabular-nums text-[#5E4A38]">
                            {formatDateTime(b.createdAt)}
                          </td>
                          <td className="px-4 py-3 text-right font-mono tabular-nums text-[#5E4A38]">
                            {(b.sizeBytes / 1024).toFixed(1)} KB
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="inline-flex items-center gap-2">
                              <a
                                href={getBackupDownloadUrl(b.filename)}
                                download={b.filename}
                                className="inline-flex items-center gap-1 rounded border border-[#D9CCB8] bg-white px-2.5 py-1 text-xs font-medium text-[#39332D] hover:bg-[#E8DCC8]"
                              >
                                <Download className="h-3.5 w-3.5" />
                                Baixar .sqlite
                              </a>
                              <button
                                type="button"
                                onClick={() => setConfirmRestoreFile(b.filename)}
                                className="inline-flex items-center gap-1 rounded border border-[#A65F3F] px-2.5 py-1 text-xs font-medium text-[#A65F3F] hover:bg-[#A65F3F] hover:text-white"
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                                Restaurar
                              </button>
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
        </div>
      )}

      {/* TAB 3: AUDIT LOG (RF10) */}
      {subTab === 'auditoria' && (
        <div className="space-y-4">
          {!canViewAudit ? (
            <div className="rounded-lg border border-[#D9CCB8] bg-[#FAF7F2] p-8 text-center text-xs text-[#5E4A38]">
              Permissão insuficiente para consultar registros de auditoria.
            </div>
          ) : (
            <>
              <div className="rounded-lg border border-[#D9CCB8] bg-[#FAF7F2] p-4">
                <input
                  type="text"
                  value={auditFilter}
                  onChange={(e) => setAuditFilter(e.target.value)}
                  placeholder="Filtrar auditoria por ação (ex: LOGIN, SALE, PRICE_CHANGE, CASH_CLOSE), operador ou entidade..."
                  className="w-full rounded border border-[#D9CCB8] bg-white px-3.5 py-2 text-xs text-[#39332D] outline-none focus:border-[#C87952]"
                />
              </div>

              <div className="rounded-lg border border-[#D9CCB8] bg-[#FAF7F2] overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs">
                  <thead className="bg-[#E8DCC8] text-[#39332D]">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Data / Horário</th>
                      <th className="px-4 py-3 font-semibold">Operador</th>
                      <th className="px-4 py-3 font-semibold">Operação</th>
                      <th className="px-4 py-3 font-semibold">Entidade</th>
                      <th className="px-4 py-3 font-semibold">Detalhes Registrados</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E8DCC8]">
                    {filteredLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-[#F5F0E6]">
                        <td className="px-4 py-2.5 font-mono text-[11px] tabular-nums text-[#5E4A38] whitespace-nowrap">
                          {formatDateTime(log.createdAt)}
                        </td>
                        <td className="px-4 py-2.5 font-medium text-[#39332D] whitespace-nowrap">
                          {log.userNameSnapshot}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-[11px] font-semibold text-[#A65F3F] whitespace-nowrap">
                          {log.action}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-[11px] text-[#5E4A38] whitespace-nowrap">
                          {log.entityType} #{log.entityId}
                        </td>
                        <td className="px-4 py-2.5 text-[#39332D]">{log.details}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* TAB 4: SOFTWARE ENGINEERING & JAVAFX NATIVE BLUEPRINT */}
      {subTab === 'engenharia' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="rounded-lg border border-[#D9CCB8] bg-[#FAF7F2] p-5 space-y-2">
              <div className="flex items-center gap-2 text-sm font-bold text-[#39332D]">
                <BookOpen className="h-4 w-4 text-[#A65F3F]" />
                <span>1. Arquitetura em 4 Camadas (SOLID)</span>
              </div>
              <p className="text-xs leading-relaxed text-[#5E4A38]">
                <strong>Presentation:</strong> Telas FXML/Controllers apenas orquestram
                eventos visuais.
                <br />
                <strong>Application:</strong> Casos de uso transacionais, autorização RBAC
                e orquestração de auditoria.
                <br />
                <strong>Domain:</strong> Entidades ricas e <code>PricingEngine</code> puro
                testável isoladamente com JUnit 5.
                <br />
                <strong>Infrastructure:</strong> SQLite em modo WAL, Flyway, BCrypt e
                adaptador SEFAZ NFC-e.
              </p>
            </div>

            <div className="rounded-lg border border-[#D9CCB8] bg-[#FAF7F2] p-5 space-y-2">
              <div className="flex items-center gap-2 text-sm font-bold text-[#39332D]">
                <Database className="h-4 w-4 text-[#A65F3F]" />
                <span>2. Decisão Técnica: JDBC + Flyway vs JPA</span>
              </div>
              <p className="text-xs leading-relaxed text-[#5E4A38]">
                No SQLite local em PDV, <strong>JDBC puro + HikariCP (pool=1) + Flyway</strong>{' '}
                supera Spring Data JPA/Hibernate: inicialização instantânea (&lt;1s em
                máquinas modestas), zero problemas de dialeto SQLite em DDL, controle
                explícito de transações ACID e ausência de <code>SQLITE_BUSY</code> graças
                ao modo <code>WAL</code>. Para operação multi-terminal futura, migra-se a
                infraestrutura para PostgreSQL central + sincronismo local.
              </p>
            </div>

            <div className="rounded-lg border border-[#D9CCB8] bg-[#FAF7F2] p-5 space-y-2">
              <div className="flex items-center gap-2 text-sm font-bold text-[#39332D]">
                <FileCode2 className="h-4 w-4 text-[#A65F3F]" />
                <span>3. Empacotamento Windows (jpackage)</span>
              </div>
              <p className="text-xs leading-relaxed text-[#5E4A38]">
                Utilizando o <code>jpackage</code> oficial do JDK 21 LTS com{' '}
                <code>jlink</code>, o MDPDV gera um instalador nativo{' '}
                <code>MDPDV-1.0.0.msi</code> contendo um runtime Java enxuto embutido,
                atalho na Área de Trabalho e banco persistido em{' '}
                <code>%LOCALAPPDATA%\MDPDV\data\mdpdv.sqlite</code>, dispensando JDK ou
                IDE na máquina do comerciante.
              </p>
            </div>
          </div>

          {/* Interactive Java 21 + JavaFX Reference Code Explorer */}
          {javaFiles.length > 0 && (
            <div className="rounded-lg border border-[#D9CCB8] bg-[#FAF7F2] overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#D9CCB8] bg-[#E8DCC8] px-5 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  {javaFiles.map((file, idx) => (
                    <button
                      key={file.path}
                      type="button"
                      onClick={() => setSelectedJavaIdx(idx)}
                      className={`rounded px-3 py-1.5 font-mono text-xs transition-colors whitespace-nowrap ${
                        selectedJavaIdx === idx
                          ? 'bg-[#39332D] font-semibold text-[#FAF7F2]'
                          : 'bg-[#FAF7F2] text-[#39332D] hover:bg-[#F5F0E6]'
                      }`}
                    >
                      {file.path.split('/').pop()}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    handleCopyCode(javaFiles[selectedJavaIdx]?.content ?? '')
                  }
                  className="inline-flex items-center gap-1.5 rounded bg-[#A65F3F] px-3 py-1.5 text-xs font-semibold text-[#FAF7F2] hover:bg-[#8C4D30]"
                >
                  <Copy className="h-3.5 w-3.5" />
                  Copiar Arquivo
                </button>
              </div>

              <div className="border-b border-[#D9CCB8] px-5 py-2.5 text-xs text-[#5E4A38]">
                <strong className="font-mono text-[#39332D]">
                  {javaFiles[selectedJavaIdx]?.path}
                </strong>{' '}
                — {javaFiles[selectedJavaIdx]?.description}
              </div>

              <pre className="max-h-[460px] overflow-auto bg-[#39332D] p-5 font-mono text-xs leading-relaxed text-[#F5F0E6]">
                {javaFiles[selectedJavaIdx]?.content}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Confirm Restore Modal */}
      {confirmRestoreFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#39332D]/55 p-4">
          <div className="w-full max-w-md rounded-lg border border-[#D9CCB8] bg-[#FAF7F2] p-6 space-y-4">
            <div className="flex items-center gap-2 text-base font-bold text-[#39332D]">
              <ShieldAlert className="h-5 w-5 text-[#A65F3F]" />
              <span>Confirmar Restauração de Dados</span>
            </div>
            <p className="text-xs text-[#5E4A38]">
              Deseja restaurar o banco SQLite a partir do arquivo{' '}
              <strong className="font-mono text-[#39332D]">{confirmRestoreFile}</strong>?
              O sistema salvará automaticamente um snapshot de segurança do estado atual
              antes de concluir a recuperação.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmRestoreFile(null)}
                className="rounded border border-[#D9CCB8] px-4 py-2 text-xs font-medium text-[#39332D]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmRestore}
                className="rounded bg-[#A65F3F] px-4 py-2 text-xs font-semibold text-[#FAF7F2] hover:bg-[#8C4D30]"
              >
                Confirmar Restauração
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
