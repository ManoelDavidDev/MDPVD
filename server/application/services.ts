import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import {
  PERMISSIONS,
  type AuditLogEntity,
  type CashMovementEntity,
  type CashRegisterEntity,
  type CategoryEntity,
  type FiscalDocumentEntity,
  type PaymentEntity,
  type PaymentMethod,
  type PermissionCode,
  type ProductEntity,
  type PromotionEntity,
  type PromotionType,
  type RoleEntity,
  type SaleEntity,
  type SaleItemEntity,
  type StockMovementEntity,
  type StockMovementType,
  type SystemSettings,
  type UserEntity,
} from '../domain/models.ts';
import { evaluateCartPricing, roundMoney } from '../domain/pricingEngine.ts';
import {
  DB_FILE_PATH,
  getBackupDirectory,
  getDb,
  reloadDbConnection,
} from '../infrastructure/database.ts';
import { buildFiscalEmission } from '../infrastructure/fiscalBuilder.ts';

export class DomainError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(message: string, statusCode = 400, code = 'DOMAIN_RULE_VIOLATION') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

export interface AuthorizerCredentials {
  username?: string;
  password?: string;
}

// Active Desktop Operator Sessions (Token -> User ID)
const activeSessions = new Map<string, { userId: number; createdAt: string }>();

export function writeAuditLog(params: {
  userId: number | null;
  userName: string;
  action: string;
  entityType: string;
  entityId: string;
  details: string;
}): void {
  const db = getDb();
  const settings = getSystemSettings();
  db.prepare(`
    INSERT INTO audit_logs (user_id, user_name_snapshot, action, entity_type, entity_id, details, terminal_name, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    params.userId,
    params.userName,
    params.action,
    params.entityType,
    params.entityId,
    params.details,
    settings.terminalName || 'CAIXA-01',
    new Date().toISOString()
  );
}

export function getSystemSettings(): SystemSettings {
  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM system_settings').all() as Array<{
    key: string;
    value: string;
  }>;
  const map: Record<string, unknown> = {};
  for (const r of rows) {
    try {
      map[r.key] = JSON.parse(r.value);
    } catch {
      map[r.key] = r.value;
    }
  }
  return {
    companyName: String(map.companyName ?? 'MERCADO E EMPÓRIO DUNA LTDA'),
    tradeName: String(map.tradeName ?? 'Empório Duna'),
    cnpj: String(map.cnpj ?? '42.819.370/0001-64'),
    ie: String(map.ie ?? '148.920.331.114'),
    address: String(map.address ?? 'Av. Sete de Setembro, 1420 — Centro'),
    cityUf: String(map.cityUf ?? 'Ribeirão Preto - SP'),
    terminalName: String(map.terminalName ?? 'CAIXA-01'),
    fiscalMode:
      map.fiscalMode === 'COMPROVANTE_NAO_FISCAL' ? 'COMPROVANTE_NAO_FISCAL' : 'NFCe_65',
    fiscalEnvironment: map.fiscalEnvironment === 'PRODUCAO' ? 'PRODUCAO' : 'HOMOLOGACAO',
    sefazConnectivity:
      map.sefazConnectivity === 'OFFLINE_CONTINGENCY' ||
      map.sefazConnectivity === 'SIMULATE_REJECTION'
        ? map.sefazConnectivity
        : 'ONLINE',
    cscId: String(map.cscId ?? '000001'),
    cscToken: String(map.cscToken ?? ''),
    certificateConfigured: Boolean(map.certificateConfigured ?? true),
    certificateSubject: String(map.certificateSubject ?? ''),
    nfceSeries: Number(map.nfceSeries ?? 1),
    nextNfceNumber: Number(map.nextNfceNumber ?? 1005),
    maxOperatorDiscountPercent: Number(map.maxOperatorDiscountPercent ?? 5),
  };
}

export function updateSystemSettings(
  actor: UserEntity,
  partial: Partial<SystemSettings>
): SystemSettings {
  requirePermission(actor, PERMISSIONS.FISCAL_MANAGE);
  const db = getDb();
  const current = getSystemSettings();
  const merged: SystemSettings = { ...current, ...partial };

  const upsert = db.prepare(`
    INSERT INTO system_settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `);

  const tx = db.transaction(() => {
    for (const [k, v] of Object.entries(merged)) {
      upsert.run(k, JSON.stringify(v));
    }
    writeAuditLog({
      userId: actor.id,
      userName: actor.fullName,
      action: 'SETTINGS_UPDATE',
      entityType: 'SystemSettings',
      entityId: 'GLOBAL',
      details: `Configurações atualizadas (Modo: ${merged.fiscalMode}, Ambiente: ${merged.fiscalEnvironment}, Conectividade SEFAZ: ${merged.sefazConnectivity}).`,
    });
  });
  tx();
  return getSystemSettings();
}

export function getUserById(userId: number): UserEntity | null {
  const db = getDb();
  const row = db
    .prepare(
      `
      SELECT u.*, r.code as role_code, r.name as role_name
      FROM users u
      JOIN roles r ON r.id = u.role_id
      WHERE u.id = ?
    `
    )
    .get(userId) as Record<string, unknown> | undefined;

  if (!row) return null;

  const permRows = db
    .prepare(
      `
      SELECT p.code
      FROM permissions p
      JOIN role_permissions rp ON rp.permission_id = p.id
      WHERE rp.role_id = ?
    `
    )
    .all(Number(row.role_id)) as Array<{ code: PermissionCode }>;

  return {
    id: Number(row.id),
    username: String(row.username),
    fullName: String(row.full_name),
    roleId: Number(row.role_id),
    roleCode: String(row.role_code),
    roleName: String(row.role_name),
    active: Number(row.active) === 1,
    locked: Number(row.locked) === 1,
    failedAttempts: Number(row.failed_attempts),
    lastLoginAt: row.last_login_at ? String(row.last_login_at) : null,
    createdAt: String(row.created_at),
    permissions: permRows.map((p) => p.code),
  };
}

export function authenticateUser(username: string, password: string): {
  token: string;
  user: UserEntity;
} {
  const db = getDb();
  const cleanUser = username.trim().toLowerCase();
  const row = db
    .prepare('SELECT * FROM users WHERE LOWER(username) = ?')
    .get(cleanUser) as Record<string, unknown> | undefined;

  if (!row) {
    writeAuditLog({
      userId: null,
      userName: cleanUser || 'desconhecido',
      action: 'LOGIN_FAILED',
      entityType: 'User',
      entityId: cleanUser || 'unknown',
      details: 'Tentativa de login com usuário inexistente.',
    });
    throw new DomainError('Usuário ou senha inválidos.', 401, 'AUTH_INVALID');
  }

  const userId = Number(row.id);
  const fullName = String(row.full_name);

  if (Number(row.active) !== 1) {
    throw new DomainError(
      'Este usuário está desativado. Contate o Administrador.',
      403,
      'USER_INACTIVE'
    );
  }

  if (Number(row.locked) === 1) {
    throw new DomainError(
      'Conta bloqueada por segurança. Solicite o desbloqueio ao Administrador.',
      403,
      'USER_LOCKED'
    );
  }

  const valid = bcrypt.compareSync(password, String(row.password_hash));
  if (!valid) {
    const nextFails = Number(row.failed_attempts) + 1;
    const shouldLock = nextFails >= 5 ? 1 : 0;
    db.prepare(
      'UPDATE users SET failed_attempts = ?, locked = ? WHERE id = ?'
    ).run(nextFails, shouldLock, userId);

    writeAuditLog({
      userId,
      userName: fullName,
      action: shouldLock ? 'USER_AUTO_LOCKED' : 'LOGIN_FAILED',
      entityType: 'User',
      entityId: String(userId),
      details: shouldLock
        ? 'Conta bloqueada automaticamente após 5 tentativas de senha inválidas.'
        : `Senha incorreta (${nextFails}/5 tentativas).`,
    });

    throw new DomainError(
      shouldLock
        ? 'Conta bloqueada após 5 tentativas inválidas.'
        : 'Usuário ou senha inválidos.',
      401,
      'AUTH_INVALID'
    );
  }

  const nowIso = new Date().toISOString();
  db.prepare(
    'UPDATE users SET failed_attempts = 0, last_login_at = ? WHERE id = ?'
  ).run(nowIso, userId);

  const user = getUserById(userId)!;
  const token = crypto.randomBytes(24).toString('hex');
  activeSessions.set(token, { userId: user.id, createdAt: nowIso });

  writeAuditLog({
    userId: user.id,
    userName: user.fullName,
    action: 'LOGIN',
    entityType: 'User',
    entityId: String(user.id),
    details: `Operador autenticado com perfil ${user.roleName}.`,
  });

  return { token, user };
}

export function bootstrapSession(): { token: string; user: UserEntity } {
  const db = getDb();
  const adminRow = db
    .prepare('SELECT id FROM users WHERE active = 1 AND locked = 0 ORDER BY id ASC LIMIT 1')
    .get() as { id: number } | undefined;

  if (!adminRow) {
    throw new DomainError('Nenhum usuário ativo disponível.', 500);
  }
  const user = getUserById(adminRow.id)!;
  const token = crypto.randomBytes(24).toString('hex');
  activeSessions.set(token, { userId: user.id, createdAt: new Date().toISOString() });
  return { token, user };
}

export function getSessionUser(token: string | undefined): UserEntity | null {
  if (!token) return null;
  const sess = activeSessions.get(token);
  if (!sess) return null;
  const user = getUserById(sess.userId);
  if (!user || !user.active || user.locked) {
    activeSessions.delete(token);
    return null;
  }
  return user;
}

export function logoutSession(token: string | undefined): void {
  if (!token) return;
  const user = getSessionUser(token);
  if (user) {
    writeAuditLog({
      userId: user.id,
      userName: user.fullName,
      action: 'LOGOUT',
      entityType: 'User',
      entityId: String(user.id),
      details: 'Sessão encerrada pelo operador.',
    });
  }
  activeSessions.delete(token);
}

export function requirePermission(user: UserEntity, perm: PermissionCode): void {
  if (!user.permissions.includes(perm)) {
    throw new DomainError(
      `Permissão insuficiente (${perm}). Esta operação requer perfil autorizado.`,
      403,
      'PERMISSION_DENIED'
    );
  }
}

/**
 * Validates either that the current operator holds `perm` OR that valid
 * Supervisor/Manager/Admin credentials were supplied inline.
 * Returns the authorizing UserEntity (either the actor or the supervisor).
 */
export function resolveAuthorization(
  actor: UserEntity,
  perm: PermissionCode,
  authorizer?: AuthorizerCredentials
): UserEntity {
  if (actor.permissions.includes(perm)) {
    return actor;
  }

  if (!authorizer?.username || !authorizer?.password) {
    throw new DomainError(
      `Operação restrita (${perm}). Informe credenciais de um Supervisor, Gerente ou Administrador para autorizar.`,
      403,
      'AUTHORIZATION_REQUIRED'
    );
  }

  const db = getDb();
  const supRow = db
    .prepare('SELECT * FROM users WHERE LOWER(username) = ?')
    .get(authorizer.username.trim().toLowerCase()) as Record<string, unknown> | undefined;

  if (!supRow || Number(supRow.active) !== 1 || Number(supRow.locked) === 1) {
    throw new DomainError('Credenciais de autorização inválidas ou usuário inativo.', 403, 'AUTH_INVALID');
  }

  const valid = bcrypt.compareSync(authorizer.password, String(supRow.password_hash));
  if (!valid) {
    throw new DomainError('Senha do autorizador inválida.', 403, 'AUTH_INVALID');
  }

  const supUser = getUserById(Number(supRow.id))!;
  if (!supUser.permissions.includes(perm)) {
    throw new DomainError(
      `O usuário informado (${supUser.fullName} - ${supUser.roleName}) também não possui a permissão ${perm}.`,
      403,
      'PERMISSION_DENIED'
    );
  }

  return supUser;
}

// ============================================================================
// USERS & ROLES (RF01)
// ============================================================================

export function listUsers(): UserEntity[] {
  const db = getDb();
  const ids = db.prepare('SELECT id FROM users ORDER BY id ASC').all() as Array<{ id: number }>;
  return ids.map((r) => getUserById(r.id)!).filter(Boolean);
}

export function listRoles(): RoleEntity[] {
  const db = getDb();
  const roles = db.prepare('SELECT * FROM roles ORDER BY id ASC').all() as Array<
    Record<string, unknown>
  >;
  return roles.map((r) => {
    const perms = db
      .prepare(
        `
        SELECT p.code FROM permissions p
        JOIN role_permissions rp ON rp.permission_id = p.id
        WHERE rp.role_id = ?
      `
      )
      .all(Number(r.id)) as Array<{ code: PermissionCode }>;
    return {
      id: Number(r.id),
      code: String(r.code),
      name: String(r.name),
      description: String(r.description),
      permissions: perms.map((p) => p.code),
    };
  });
}

export function createUser(
  actor: UserEntity,
  payload: { username: string; fullName: string; password: string; roleId: number }
): UserEntity {
  requirePermission(actor, PERMISSIONS.USER_MANAGE);
  const username = payload.username.trim().toLowerCase();
  const fullName = payload.fullName.trim();
  if (username.length < 3 || fullName.length < 3) {
    throw new DomainError('Informe usuário (mín. 3 caracteres) e nome completo.');
  }
  if (!payload.password || payload.password.length < 6) {
    throw new DomainError('A senha deve possuir no mínimo 6 caracteres.');
  }

  const db = getDb();
  const existing = db
    .prepare('SELECT id FROM users WHERE LOWER(username) = ?')
    .get(username);
  if (existing) {
    throw new DomainError('Já existe um operador cadastrado com este nome de usuário.');
  }

  const hash = bcrypt.hashSync(payload.password, 10);
  const nowIso = new Date().toISOString();
  const info = db
    .prepare(
      `
      INSERT INTO users (username, full_name, password_hash, role_id, active, locked, failed_attempts, created_at)
      VALUES (?, ?, ?, ?, 1, 0, 0, ?)
    `
    )
    .run(username, fullName, hash, payload.roleId, nowIso);

  const created = getUserById(Number(info.lastInsertRowid))!;
  writeAuditLog({
    userId: actor.id,
    userName: actor.fullName,
    action: 'USER_CREATE',
    entityType: 'User',
    entityId: String(created.id),
    details: `Criado operador "${created.fullName}" (@${created.username}) com perfil ${created.roleName}.`,
  });
  return created;
}

export function updateUserStatus(
  actor: UserEntity,
  targetUserId: number,
  updates: { active?: boolean; locked?: boolean; roleId?: number }
): UserEntity {
  requirePermission(actor, PERMISSIONS.USER_MANAGE);
  if (actor.id === targetUserId && updates.active === false) {
    throw new DomainError('Não é permitido desativar o próprio usuário autenticado.');
  }

  const db = getDb();
  const current = getUserById(targetUserId);
  if (!current) throw new DomainError('Usuário não encontrado.', 404);

  const nextActive = updates.active !== undefined ? (updates.active ? 1 : 0) : current.active ? 1 : 0;
  const nextLocked = updates.locked !== undefined ? (updates.locked ? 1 : 0) : current.locked ? 1 : 0;
  const nextRoleId = updates.roleId ?? current.roleId;

  db.prepare(
    `
    UPDATE users
    SET active = ?, locked = ?, failed_attempts = CASE WHEN ? = 0 THEN 0 ELSE failed_attempts END, role_id = ?
    WHERE id = ?
  `
  ).run(nextActive, nextLocked, nextLocked, nextRoleId, targetUserId);

  const updated = getUserById(targetUserId)!;
  writeAuditLog({
    userId: actor.id,
    userName: actor.fullName,
    action: 'USER_UPDATE_STATUS',
    entityType: 'User',
    entityId: String(targetUserId),
    details: `Usuário @${updated.username}: ativo=${updated.active}, bloqueado=${updated.locked}, perfil=${updated.roleName}.`,
  });
  return updated;
}

export function changeUserPassword(
  actor: UserEntity,
  targetUserId: number,
  newPassword: string,
  currentPassword?: string
): void {
  if (!newPassword || newPassword.length < 6) {
    throw new DomainError('A nova senha deve conter no mínimo 6 caracteres.');
  }

  const db = getDb();
  if (actor.id !== targetUserId) {
    requirePermission(actor, PERMISSIONS.USER_MANAGE);
  } else if (currentPassword !== undefined) {
    const row = db
      .prepare('SELECT password_hash FROM users WHERE id = ?')
      .get(actor.id) as { password_hash: string } | undefined;
    if (!row || !bcrypt.compareSync(currentPassword, row.password_hash)) {
      throw new DomainError('A senha atual informada está incorreta.');
    }
  }

  const target = getUserById(targetUserId);
  if (!target) throw new DomainError('Usuário não encontrado.', 404);

  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare(
    'UPDATE users SET password_hash = ?, locked = 0, failed_attempts = 0 WHERE id = ?'
  ).run(hash, targetUserId);

  writeAuditLog({
    userId: actor.id,
    userName: actor.fullName,
    action: 'PASSWORD_CHANGE',
    entityType: 'User',
    entityId: String(targetUserId),
    details: `Senha redefinida para o usuário @${target.username}.`,
  });
}

export function updateRolePermissions(
  actor: UserEntity,
  roleId: number,
  permissions: PermissionCode[]
): RoleEntity[] {
  requirePermission(actor, PERMISSIONS.USER_MANAGE);
  const db = getDb();
  const roleRow = db.prepare('SELECT * FROM roles WHERE id = ?').get(roleId) as
    | { id: number; code: string; name: string }
    | undefined;
  if (!roleRow) throw new DomainError('Perfil não encontrado.', 404);
  if (roleRow.code === 'ADMIN' && !permissions.includes(PERMISSIONS.USER_MANAGE)) {
    throw new DomainError('O perfil Administrador deve manter a permissão de gestão de usuários.');
  }

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM role_permissions WHERE role_id = ?').run(roleId);
    const getPerm = db.prepare('SELECT id FROM permissions WHERE code = ?');
    const ins = db.prepare('INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)');
    for (const code of permissions) {
      const p = getPerm.get(code) as { id: number } | undefined;
      if (p) ins.run(roleId, p.id);
    }
    writeAuditLog({
      userId: actor.id,
      userName: actor.fullName,
      action: 'ROLE_PERMISSIONS_UPDATE',
      entityType: 'Role',
      entityId: String(roleId),
      details: `Permissões do perfil ${roleRow.name} atualizadas (${permissions.length} permissões ativas).`,
    });
  });
  tx();
  return listRoles();
}

// ============================================================================
// PRODUCTS, CATEGORIES & PROMOTIONS (RF02 & RF03)
// ============================================================================

export function listCategories(): CategoryEntity[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM categories ORDER BY name ASC').all() as Array<
    Record<string, unknown>
  >;
  return rows.map((r) => ({
    id: Number(r.id),
    name: String(r.name),
    description: String(r.description),
    ncmDefault: String(r.ncm_default),
    active: Number(r.active) === 1,
  }));
}

export function createCategory(
  actor: UserEntity,
  payload: { name: string; description?: string; ncmDefault?: string }
): CategoryEntity {
  requirePermission(actor, PERMISSIONS.PRODUCT_MANAGE);
  const name = payload.name.trim();
  if (!name) throw new DomainError('Informe o nome da categoria.');
  const db = getDb();
  const info = db
    .prepare(
      'INSERT INTO categories (name, description, ncm_default, active) VALUES (?, ?, ?, 1)'
    )
    .run(name, (payload.description ?? '').trim(), (payload.ncmDefault ?? '21069090').trim());

  writeAuditLog({
    userId: actor.id,
    userName: actor.fullName,
    action: 'CATEGORY_CREATE',
    entityType: 'Category',
    entityId: String(info.lastInsertRowid),
    details: `Categoria "${name}" cadastrada.`,
  });

  return listCategories().find((c) => c.id === Number(info.lastInsertRowid))!;
}

function mapProductRow(r: Record<string, unknown>): ProductEntity {
  return {
    id: Number(r.id),
    sku: String(r.sku),
    barcode: String(r.barcode),
    name: String(r.name),
    description: String(r.description ?? ''),
    categoryId: Number(r.category_id),
    categoryName: r.category_name ? String(r.category_name) : undefined,
    unit: String(r.unit),
    costPrice: Number(r.cost_price),
    salePrice: Number(r.sale_price),
    promotionalPrice: r.promotional_price !== null ? Number(r.promotional_price) : null,
    stockQuantity: Number(r.stock_quantity),
    minStock: Number(r.min_stock),
    ncm: String(r.ncm),
    cfop: String(r.cfop),
    active: Number(r.active) === 1,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

export function listProducts(params?: {
  search?: string;
  categoryId?: number;
  onlyActive?: boolean;
}): ProductEntity[] {
  const db = getDb();
  const clauses: string[] = ['1=1'];
  const args: unknown[] = [];

  if (params?.onlyActive) {
    clauses.push('p.active = 1');
  }
  if (params?.categoryId) {
    clauses.push('p.category_id = ?');
    args.push(params.categoryId);
  }
  if (params?.search && params.search.trim()) {
    const term = `%${params.search.trim()}%`;
    clauses.push('(p.name LIKE ? OR p.sku LIKE ? OR p.barcode LIKE ?)');
    args.push(term, term, term);
  }

  const rows = db
    .prepare(
      `
      SELECT p.*, c.name as category_name
      FROM products p
      JOIN categories c ON c.id = p.category_id
      WHERE ${clauses.join(' AND ')}
      ORDER BY p.name ASC
    `
    )
    .all(...args) as Array<Record<string, unknown>>;

  return rows.map(mapProductRow);
}

export function saveProduct(
  actor: UserEntity,
  payload: {
    id?: number;
    sku: string;
    barcode: string;
    name: string;
    description?: string;
    categoryId: number;
    unit: string;
    costPrice: number;
    salePrice: number;
    promotionalPrice?: number | null;
    stockQuantity?: number;
    minStock: number;
    ncm?: string;
    cfop?: string;
    active: boolean;
  }
): ProductEntity {
  requirePermission(actor, PERMISSIONS.PRODUCT_MANAGE);

  const sku = payload.sku.trim().toUpperCase();
  const barcode = payload.barcode.trim();
  const name = payload.name.trim();
  if (!sku || !barcode || !name) {
    throw new DomainError('Nome, SKU e Código de Barras são obrigatórios.');
  }
  if (payload.salePrice <= 0 || payload.costPrice < 0) {
    throw new DomainError('Preço de venda deve ser maior que zero e custo não pode ser negativo.');
  }
  if (
    payload.promotionalPrice !== null &&
    payload.promotionalPrice !== undefined &&
    payload.promotionalPrice >= payload.salePrice
  ) {
    throw new DomainError('O preço promocional deve ser inferior ao preço unitário normal.');
  }

  const db = getDb();
  const nowIso = new Date().toISOString();

  const dup = db
    .prepare(
      'SELECT id FROM products WHERE (UPPER(sku) = ? OR barcode = ?) AND id != ?'
    )
    .get(sku, barcode, payload.id ?? -1);
  if (dup) {
    throw new DomainError('Já existe outro produto cadastrado com este SKU ou Código de Barras.');
  }

  let productId = payload.id ?? 0;

  const tx = db.transaction(() => {
    if (payload.id) {
      const existingRow = db
        .prepare('SELECT * FROM products WHERE id = ?')
        .get(payload.id) as Record<string, unknown> | undefined;
      if (!existingRow) throw new DomainError('Produto não encontrado.', 404);

      const oldSale = Number(existingRow.sale_price);
      const oldCost = Number(existingRow.cost_price);

      db.prepare(
        `
        UPDATE products
        SET sku = ?, barcode = ?, name = ?, description = ?, category_id = ?, unit = ?,
            cost_price = ?, sale_price = ?, promotional_price = ?, min_stock = ?,
            ncm = ?, cfop = ?, active = ?, updated_at = ?
        WHERE id = ?
      `
      ).run(
        sku,
        barcode,
        name,
        (payload.description ?? '').trim(),
        payload.categoryId,
        payload.unit.trim().toUpperCase() || 'UN',
        roundMoney(payload.costPrice),
        roundMoney(payload.salePrice),
        payload.promotionalPrice ? roundMoney(payload.promotionalPrice) : null,
        Math.max(0, payload.minStock),
        (payload.ncm ?? '21069090').trim(),
        (payload.cfop ?? '5102').trim(),
        payload.active ? 1 : 0,
        nowIso,
        payload.id
      );

      if (oldSale !== roundMoney(payload.salePrice) || oldCost !== roundMoney(payload.costPrice)) {
        writeAuditLog({
          userId: actor.id,
          userName: actor.fullName,
          action: 'PRICE_CHANGE',
          entityType: 'Product',
          entityId: String(payload.id),
          details: `Alteração de preço em "${name}" (${sku}): Venda R$ ${oldSale.toFixed(2)} -> R$ ${roundMoney(payload.salePrice).toFixed(2)} | Custo R$ ${oldCost.toFixed(2)} -> R$ ${roundMoney(payload.costPrice).toFixed(2)}.`,
        });
      } else {
        writeAuditLog({
          userId: actor.id,
          userName: actor.fullName,
          action: 'PRODUCT_UPDATE',
          entityType: 'Product',
          entityId: String(payload.id),
          details: `Cadastro do produto "${name}" (${sku}) atualizado.`,
        });
      }
    } else {
      const initialStock = Math.max(0, payload.stockQuantity ?? 0);
      const info = db
        .prepare(
          `
          INSERT INTO products (
            sku, barcode, name, description, category_id, unit,
            cost_price, sale_price, promotional_price, stock_quantity, min_stock,
            ncm, cfop, active, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
        )
        .run(
          sku,
          barcode,
          name,
          (payload.description ?? '').trim(),
          payload.categoryId,
          payload.unit.trim().toUpperCase() || 'UN',
          roundMoney(payload.costPrice),
          roundMoney(payload.salePrice),
          payload.promotionalPrice ? roundMoney(payload.promotionalPrice) : null,
          initialStock,
          Math.max(0, payload.minStock),
          (payload.ncm ?? '21069090').trim(),
          (payload.cfop ?? '5102').trim(),
          payload.active ? 1 : 0,
          nowIso,
          nowIso
        );
      productId = Number(info.lastInsertRowid);

      if (initialStock > 0) {
        db.prepare(
          `
          INSERT INTO stock_movements (
            product_id, type, quantity, previous_stock, new_stock, unit_cost, reason, reference_id, user_id, created_at
          ) VALUES (?, 'ENTRY', ?, 0, ?, ?, 'Saldo inicial no cadastro do produto', 'CAD-INICIAL', ?, ?)
        `
        ).run(productId, initialStock, initialStock, roundMoney(payload.costPrice), actor.id, nowIso);
      }

      writeAuditLog({
        userId: actor.id,
        userName: actor.fullName,
        action: 'PRODUCT_CREATE',
        entityType: 'Product',
        entityId: String(productId),
        details: `Novo produto "${name}" (${sku}) cadastrado a R$ ${roundMoney(payload.salePrice).toFixed(2)} com estoque inicial ${initialStock}.`,
      });
    }
  });

  tx();
  return listProducts().find((p) => p.id === productId)!;
}

export function listPromotions(): PromotionEntity[] {
  const db = getDb();
  const rows = db
    .prepare(
      `
      SELECT pr.*, p1.name as product_name, p2.name as combo_product_name
      FROM promotions pr
      JOIN products p1 ON p1.id = pr.product_id
      LEFT JOIN products p2 ON p2.id = pr.combo_product_id
      ORDER BY pr.active DESC, pr.id DESC
    `
    )
    .all() as Array<Record<string, unknown>>;

  return rows.map((r) => ({
    id: Number(r.id),
    name: String(r.name),
    description: String(r.description ?? ''),
    type: String(r.type) as PromotionType,
    productId: Number(r.product_id),
    productName: String(r.product_name),
    comboProductId: r.combo_product_id !== null ? Number(r.combo_product_id) : null,
    comboProductName: r.combo_product_name ? String(r.combo_product_name) : null,
    comboQty: r.combo_qty !== null ? Number(r.combo_qty) : null,
    minQuantity: Number(r.min_quantity),
    promoValue: Number(r.promo_value),
    startDate: r.start_date ? String(r.start_date) : null,
    endDate: r.end_date ? String(r.end_date) : null,
    active: Number(r.active) === 1,
    createdAt: String(r.created_at),
  }));
}

export function savePromotion(
  actor: UserEntity,
  payload: {
    id?: number;
    name: string;
    description?: string;
    type: PromotionType;
    productId: number;
    comboProductId?: number | null;
    comboQty?: number | null;
    minQuantity: number;
    promoValue: number;
    startDate?: string | null;
    endDate?: string | null;
    active: boolean;
  }
): PromotionEntity {
  requirePermission(actor, PERMISSIONS.PROMOTION_MANAGE);
  if (!payload.name.trim()) throw new DomainError('Informe o nome comercial da promoção.');
  if (payload.minQuantity <= 0 || payload.promoValue <= 0) {
    throw new DomainError('Quantidade mínima e valor promocional devem ser maiores que zero.');
  }
  if (payload.type === 'BUY_X_PAY_Y' && payload.promoValue >= payload.minQuantity) {
    throw new DomainError('Na promoção Leve X Pague Y, a quantidade paga deve ser menor que a quantidade levada.');
  }
  if (payload.type === 'COMBO' && !payload.comboProductId) {
    throw new DomainError('Selecione o segundo produto que compõe o combo comercial.');
  }

  const db = getDb();
  const nowIso = new Date().toISOString();
  let promoId = payload.id ?? 0;

  if (payload.id) {
    db.prepare(
      `
      UPDATE promotions
      SET name = ?, description = ?, type = ?, product_id = ?, combo_product_id = ?,
          combo_qty = ?, min_quantity = ?, promo_value = ?, start_date = ?, end_date = ?, active = ?
      WHERE id = ?
    `
    ).run(
      payload.name.trim(),
      (payload.description ?? '').trim(),
      payload.type,
      payload.productId,
      payload.type === 'COMBO' ? payload.comboProductId ?? null : null,
      payload.type === 'COMBO' ? payload.comboQty ?? 1 : null,
      payload.minQuantity,
      payload.promoValue,
      payload.startDate || null,
      payload.endDate || null,
      payload.active ? 1 : 0,
      payload.id
    );
  } else {
    const info = db
      .prepare(
        `
        INSERT INTO promotions (
          name, description, type, product_id, combo_product_id, combo_qty,
          min_quantity, promo_value, start_date, end_date, active, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      )
      .run(
        payload.name.trim(),
        (payload.description ?? '').trim(),
        payload.type,
        payload.productId,
        payload.type === 'COMBO' ? payload.comboProductId ?? null : null,
        payload.type === 'COMBO' ? payload.comboQty ?? 1 : null,
        payload.minQuantity,
        payload.promoValue,
        payload.startDate || null,
        payload.endDate || null,
        payload.active ? 1 : 0,
        nowIso
      );
    promoId = Number(info.lastInsertRowid);
  }

  writeAuditLog({
    userId: actor.id,
    userName: actor.fullName,
    action: payload.id ? 'PROMOTION_UPDATE' : 'PROMOTION_CREATE',
    entityType: 'Promotion',
    entityId: String(promoId),
    details: `Promoção "${payload.name.trim()}" (${payload.type}) salva.`,
  });

  return listPromotions().find((p) => p.id === promoId)!;
}

export function previewCart(
  items: Array<{ productId: number; quantity: number }>,
  manualDiscount: number = 0
) {
  const allProducts = listProducts({ onlyActive: true });
  const map = new Map<number, ProductEntity>();
  for (const p of allProducts) map.set(p.id, p);
  const promos = listPromotions();
  return evaluateCartPricing(items, map, promos, manualDiscount, new Date());
}

// ============================================================================
// CASH REGISTER & SANGRIA / SUPRIMENTO (RF05 & RF06)
// ============================================================================

export function recalculateRegisterSummary(registerId: number): CashRegisterEntity {
  const db = getDb();
  const regRow = db
    .prepare(
      `
      SELECT cr.*, u1.full_name as opened_by_name, u2.full_name as closed_by_name
      FROM cash_registers cr
      JOIN users u1 ON u1.id = cr.opened_by_user_id
      LEFT JOIN users u2 ON u2.id = cr.closed_by_user_id
      WHERE cr.id = ?
    `
    )
    .get(registerId) as Record<string, unknown> | undefined;

  if (!regRow) throw new DomainError('Caixa não localizado.', 404);

  // Sum completed sales payments grouped by method (note: amount = net applied to sale, so cash excludes change returned!)
  const payTotals = db
    .prepare(
      `
      SELECT p.method, COALESCE(SUM(p.amount), 0) as net_amount
      FROM payments p
      JOIN sales s ON s.id = p.sale_id
      WHERE s.cash_register_id = ? AND s.status = 'COMPLETED'
      GROUP BY p.method
    `
    )
    .all(registerId) as Array<{ method: PaymentMethod; net_amount: number }>;

  let cashSales = 0;
  let pixSales = 0;
  let debitSales = 0;
  let creditSales = 0;
  let valeSales = 0;

  for (const pt of payTotals) {
    if (pt.method === 'DINHEIRO') cashSales = roundMoney(pt.net_amount);
    else if (pt.method === 'PIX') pixSales = roundMoney(pt.net_amount);
    else if (pt.method === 'DEBITO') debitSales = roundMoney(pt.net_amount);
    else if (pt.method === 'CREDITO') creditSales = roundMoney(pt.net_amount);
    else if (pt.method === 'VALE') valeSales = roundMoney(pt.net_amount);
  }

  // Sum active supplies & bleeds (reversed movements are ignored in physical balance while preserved in history)
  const movTotals = db
    .prepare(
      `
      SELECT type, COALESCE(SUM(amount), 0) as total
      FROM cash_movements
      WHERE cash_register_id = ? AND status = 'ACTIVE' AND type IN ('SUPPLY', 'BLEED')
      GROUP BY type
    `
    )
    .all(registerId) as Array<{ type: string; total: number }>;

  let totalSupply = 0;
  let totalBleed = 0;
  for (const mt of movTotals) {
    if (mt.type === 'SUPPLY') totalSupply = roundMoney(mt.total);
    if (mt.type === 'BLEED') totalBleed = roundMoney(mt.total);
  }

  const openingBalance = roundMoney(Number(regRow.opening_balance));
  // CRITICAL RF05 RULE: Expected physical cash in drawer ONLY includes opening cash + net cash sales + supplies - bleeds!
  const expectedCashBalance = roundMoney(
    openingBalance + cashSales + totalSupply - totalBleed
  );

  if (String(regRow.status) === 'OPEN') {
    db.prepare(
      `
      UPDATE cash_registers
      SET expected_cash_balance = ?,
          total_cash_sales = ?,
          total_pix_sales = ?,
          total_debit_sales = ?,
          total_credit_sales = ?,
          total_vale_sales = ?,
          total_supply = ?,
          total_bleed = ?
      WHERE id = ?
    `
    ).run(
      expectedCashBalance,
      cashSales,
      pixSales,
      debitSales,
      creditSales,
      valeSales,
      totalSupply,
      totalBleed,
      registerId
    );
  }

  const refreshed = db
    .prepare(
      `
      SELECT cr.*, u1.full_name as opened_by_name, u2.full_name as closed_by_name
      FROM cash_registers cr
      JOIN users u1 ON u1.id = cr.opened_by_user_id
      LEFT JOIN users u2 ON u2.id = cr.closed_by_user_id
      WHERE cr.id = ?
    `
    )
    .get(registerId) as Record<string, unknown>;

  return mapCashRegisterRow(refreshed);
}

function mapCashRegisterRow(r: Record<string, unknown>): CashRegisterEntity {
  return {
    id: Number(r.id),
    code: String(r.code),
    terminalName: String(r.terminal_name),
    openedByUserId: Number(r.opened_by_user_id),
    openedByName: r.opened_by_name ? String(r.opened_by_name) : undefined,
    closedByUserId: r.closed_by_user_id !== null ? Number(r.closed_by_user_id) : null,
    closedByName: r.closed_by_name ? String(r.closed_by_name) : null,
    openedAt: String(r.opened_at),
    closedAt: r.closed_at ? String(r.closed_at) : null,
    openingBalance: Number(r.opening_balance),
    expectedCashBalance: Number(r.expected_cash_balance),
    countedCashBalance:
      r.counted_cash_balance !== null ? Number(r.counted_cash_balance) : null,
    differenceAmount:
      r.difference_amount !== null ? Number(r.difference_amount) : null,
    totalCashSales: Number(r.total_cash_sales),
    totalPixSales: Number(r.total_pix_sales),
    totalDebitSales: Number(r.total_debit_sales),
    totalCreditSales: Number(r.total_credit_sales),
    totalValeSales: Number(r.total_vale_sales),
    totalSupply: Number(r.total_supply),
    totalBleed: Number(r.total_bleed),
    closingNotes: r.closing_notes ? String(r.closing_notes) : null,
    status: String(r.status) as 'OPEN' | 'CLOSED',
  };
}

export function getOpenCashRegister(): CashRegisterEntity | null {
  const db = getDb();
  const row = db
    .prepare("SELECT id FROM cash_registers WHERE status = 'OPEN' ORDER BY id DESC LIMIT 1")
    .get() as { id: number } | undefined;
  if (!row) return null;
  return recalculateRegisterSummary(row.id);
}

export function listCashRegisters(): CashRegisterEntity[] {
  const db = getDb();
  const rows = db
    .prepare(
      `
      SELECT cr.*, u1.full_name as opened_by_name, u2.full_name as closed_by_name
      FROM cash_registers cr
      JOIN users u1 ON u1.id = cr.opened_by_user_id
      LEFT JOIN users u2 ON u2.id = cr.closed_by_user_id
      ORDER BY cr.id DESC
      LIMIT 50
    `
    )
    .all() as Array<Record<string, unknown>>;
  return rows.map(mapCashRegisterRow);
}

export function listCashMovements(registerId?: number): CashMovementEntity[] {
  const db = getDb();
  const sql = `
    SELECT cm.*, u1.full_name as user_name, u2.full_name as authorized_by_name
    FROM cash_movements cm
    JOIN users u1 ON u1.id = cm.user_id
    LEFT JOIN users u2 ON u2.id = cm.authorized_by_user_id
    ${registerId ? 'WHERE cm.cash_register_id = ?' : ''}
    ORDER BY cm.id DESC
    LIMIT 200
  `;
  const rows = (
    registerId ? db.prepare(sql).all(registerId) : db.prepare(sql).all()
  ) as Array<Record<string, unknown>>;

  return rows.map((r) => ({
    id: Number(r.id),
    cashRegisterId: Number(r.cash_register_id),
    type: String(r.type) as CashMovementEntity['type'],
    amount: Number(r.amount),
    reason: String(r.reason),
    userId: Number(r.user_id),
    userName: String(r.user_name),
    authorizedByUserId:
      r.authorized_by_user_id !== null ? Number(r.authorized_by_user_id) : null,
    authorizedByName: r.authorized_by_name ? String(r.authorized_by_name) : null,
    referenceMovementId:
      r.reference_movement_id !== null ? Number(r.reference_movement_id) : null,
    status: String(r.status) as 'ACTIVE' | 'REVERSED',
    createdAt: String(r.created_at),
  }));
}

export function openCashRegister(
  actor: UserEntity,
  openingBalance: number,
  notes?: string
): CashRegisterEntity {
  requirePermission(actor, PERMISSIONS.CASH_OPEN);
  if (openingBalance < 0 || Number.isNaN(openingBalance)) {
    throw new DomainError('O valor inicial de abertura não pode ser negativo.');
  }

  const existing = getOpenCashRegister();
  if (existing) {
    throw new DomainError(`Já existe um caixa aberto (${existing.code}).`);
  }

  const db = getDb();
  const settings = getSystemSettings();
  const nowIso = new Date().toISOString();
  const nextSeq =
    ((db.prepare('SELECT COUNT(*) as cnt FROM cash_registers').get() as { cnt: number })
      .cnt ?? 0) + 1;
  const code = `CX-${new Date().getFullYear()}-${String(nextSeq).padStart(4, '0')}`;
  const cleanBalance = roundMoney(openingBalance);

  let regId = 0;
  const tx = db.transaction(() => {
    const info = db
      .prepare(
        `
        INSERT INTO cash_registers (
          code, terminal_name, opened_by_user_id, opened_at,
          opening_balance, expected_cash_balance, status
        ) VALUES (?, ?, ?, ?, ?, ?, 'OPEN')
      `
      )
      .run(
        code,
        settings.terminalName || 'CAIXA-01',
        actor.id,
        nowIso,
        cleanBalance,
        cleanBalance
      );
    regId = Number(info.lastInsertRowid);

    db.prepare(
      `
      INSERT INTO cash_movements (
        cash_register_id, type, amount, reason, user_id, status, created_at
      ) VALUES (?, 'OPENING', ?, ?, ?, 'ACTIVE', ?)
    `
    ).run(
      regId,
      cleanBalance,
      notes?.trim() || 'Suprimento inicial de abertura de caixa (fundo de troco)',
      actor.id,
      nowIso
    );

    writeAuditLog({
      userId: actor.id,
      userName: actor.fullName,
      action: 'CASH_OPEN',
      entityType: 'CashRegister',
      entityId: code,
      details: `Caixa ${code} aberto com fundo inicial de R$ ${cleanBalance.toFixed(2)}.`,
    });
  });

  tx();
  return recalculateRegisterSummary(regId);
}

export function createCashMovement(
  actor: UserEntity,
  payload: {
    type: 'SUPPLY' | 'BLEED';
    amount: number;
    reason: string;
    authorizer?: AuthorizerCredentials;
  }
): { register: CashRegisterEntity; movement: CashMovementEntity } {
  requirePermission(actor, PERMISSIONS.CASH_MOVEMENT);
  const openReg = getOpenCashRegister();
  if (!openReg) {
    throw new DomainError(
      'Não há caixa aberto. Abra o caixa antes de registrar sangria ou suprimento.'
    );
  }

  const amount = roundMoney(payload.amount);
  const reason = payload.reason.trim();
  if (amount <= 0) {
    throw new DomainError('O valor da movimentação deve ser maior que zero.');
  }
  if (reason.length < 5) {
    throw new DomainError('O motivo é obrigatório (mínimo de 5 caracteres).');
  }

  if (payload.type === 'BLEED' && amount > openReg.expectedCashBalance) {
    throw new DomainError(
      `Saldo em dinheiro insuficiente na gaveta para esta sangria. Disponível em espécie: R$ ${openReg.expectedCashBalance.toFixed(2)}.`
    );
  }

  // Optional supervisor authorization if provided or if bleed exceeds R$ 500
  let authorizedById: number | null = null;
  if (payload.type === 'BLEED' && amount > 500 && !actor.permissions.includes(PERMISSIONS.CASH_REVERSE)) {
    const authUser = resolveAuthorization(actor, PERMISSIONS.CASH_REVERSE, payload.authorizer);
    authorizedById = authUser.id;
  } else if (actor.permissions.includes(PERMISSIONS.CASH_REVERSE)) {
    authorizedById = actor.id;
  }

  const db = getDb();
  const nowIso = new Date().toISOString();
  let movId = 0;

  const tx = db.transaction(() => {
    const info = db
      .prepare(
        `
        INSERT INTO cash_movements (
          cash_register_id, type, amount, reason, user_id, authorized_by_user_id, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', ?)
      `
      )
      .run(openReg.id, payload.type, amount, reason, actor.id, authorizedById, nowIso);
    movId = Number(info.lastInsertRowid);

    writeAuditLog({
      userId: actor.id,
      userName: actor.fullName,
      action: payload.type === 'BLEED' ? 'CASH_BLEED' : 'CASH_SUPPLY',
      entityType: 'CashMovement',
      entityId: String(movId),
      details: `${payload.type === 'BLEED' ? 'Sangria' : 'Suprimento'} de R$ ${amount.toFixed(2)} no caixa ${openReg.code}. Motivo: ${reason}`,
    });
  });

  tx();
  const updatedReg = recalculateRegisterSummary(openReg.id);
  const movement = listCashMovements(openReg.id).find((m) => m.id === movId)!;
  return { register: updatedReg, movement };
}

export function reverseCashMovement(
  actor: UserEntity,
  movementId: number,
  reason: string,
  authorizer?: AuthorizerCredentials
): { register: CashRegisterEntity; reversal: CashMovementEntity } {
  const authUser = resolveAuthorization(actor, PERMISSIONS.CASH_REVERSE, authorizer);
  const cleanReason = reason.trim();
  if (cleanReason.length < 5) {
    throw new DomainError('Informe o motivo obrigatório do estorno (mín. 5 caracteres).');
  }

  const openReg = getOpenCashRegister();
  if (!openReg) {
    throw new DomainError('Somente movimentações de um caixa aberto podem ser estornadas.');
  }

  const db = getDb();
  const orig = db
    .prepare('SELECT * FROM cash_movements WHERE id = ?')
    .get(movementId) as Record<string, unknown> | undefined;

  if (!orig) throw new DomainError('Movimentação não encontrada.', 404);
  if (Number(orig.cash_register_id) !== openReg.id) {
    throw new DomainError('Esta movimentação pertence a um caixa já encerrado.');
  }
  if (String(orig.status) === 'REVERSED' || String(orig.type) === 'OPENING' || String(orig.type) === 'REVERSAL') {
    throw new DomainError('Esta movimentação não pode ser estornada.');
  }

  // If reversing a SUPPLY, verify enough cash remains in drawer
  if (String(orig.type) === 'SUPPLY' && Number(orig.amount) > openReg.expectedCashBalance) {
    throw new DomainError(
      'Saldo físico atual em caixa é menor que o suprimento a estornar.'
    );
  }

  const nowIso = new Date().toISOString();
  let revId = 0;

  const tx = db.transaction(() => {
    // RF06: Never delete financial movements; mark REVERSED and record an explicit REVERSAL audit trail!
    db.prepare("UPDATE cash_movements SET status = 'REVERSED' WHERE id = ?").run(
      movementId
    );
    const info = db
      .prepare(
        `
        INSERT INTO cash_movements (
          cash_register_id, type, amount, reason, user_id, authorized_by_user_id, reference_movement_id, status, created_at
        ) VALUES (?, 'REVERSAL', ?, ?, ?, ?, ?, 'ACTIVE', ?)
      `
      )
      .run(
        openReg.id,
        Number(orig.amount),
        `Estorno da mov. #${movementId} (${orig.type}): ${cleanReason}`,
        actor.id,
        authUser.id,
        movementId,
        nowIso
      );
    revId = Number(info.lastInsertRowid);

    writeAuditLog({
      userId: actor.id,
      userName: actor.fullName,
      action: 'CASH_MOVEMENT_REVERSAL',
      entityType: 'CashMovement',
      entityId: String(movementId),
      details: `Estorno autorizado por ${authUser.fullName} para mov. #${movementId} (R$ ${Number(orig.amount).toFixed(2)}). Motivo: ${cleanReason}`,
    });
  });

  tx();
  const updatedReg = recalculateRegisterSummary(openReg.id);
  const reversal = listCashMovements(openReg.id).find((m) => m.id === revId)!;
  return { register: updatedReg, reversal };
}

export function closeCashRegister(
  actor: UserEntity,
  countedCashBalance: number,
  closingNotes?: string
): CashRegisterEntity {
  requirePermission(actor, PERMISSIONS.CASH_CLOSE);
  const openReg = getOpenCashRegister();
  if (!openReg) {
    throw new DomainError('Não há caixa aberto para encerrar.');
  }
  if (
    countedCashBalance === null ||
    countedCashBalance === undefined ||
    Number.isNaN(countedCashBalance) ||
    countedCashBalance < 0
  ) {
    throw new DomainError(
      'A conferência física dos valores em dinheiro é obrigatória para o fechamento do caixa.'
    );
  }

  const counted = roundMoney(countedCashBalance);
  const difference = roundMoney(counted - openReg.expectedCashBalance);
  const nowIso = new Date().toISOString();
  const db = getDb();

  const tx = db.transaction(() => {
    db.prepare(
      `
      UPDATE cash_registers
      SET closed_by_user_id = ?,
          closed_at = ?,
          counted_cash_balance = ?,
          difference_amount = ?,
          closing_notes = ?,
          status = 'CLOSED'
      WHERE id = ?
    `
    ).run(
      actor.id,
      nowIso,
      counted,
      difference,
      closingNotes?.trim() || null,
      openReg.id
    );

    writeAuditLog({
      userId: actor.id,
      userName: actor.fullName,
      action: 'CASH_CLOSE',
      entityType: 'CashRegister',
      entityId: openReg.code,
      details: `Fechamento do caixa ${openReg.code}. Esperado em dinheiro: R$ ${openReg.expectedCashBalance.toFixed(2)} | Contado: R$ ${counted.toFixed(2)} | Diferença: R$ ${difference.toFixed(2)}.`,
    });
  });

  tx();
  return recalculateRegisterSummary(openReg.id);
}

// ============================================================================
// SALES & FISCAL EMISSION (RF04, RF07, RF08)
// ============================================================================

export function getSaleById(saleId: number): SaleEntity | null {
  const db = getDb();
  const r = db
    .prepare(
      `
      SELECT s.*,
             u1.full_name as operator_name,
             u2.full_name as authorized_by_name,
             u3.full_name as cancelled_by_name
      FROM sales s
      JOIN users u1 ON u1.id = s.operator_user_id
      LEFT JOIN users u2 ON u2.id = s.authorized_by_user_id
      LEFT JOIN users u3 ON u3.id = s.cancelled_by_user_id
      WHERE s.id = ?
    `
    )
    .get(saleId) as Record<string, unknown> | undefined;

  if (!r) return null;

  const itemRows = db
    .prepare('SELECT * FROM sale_items WHERE sale_id = ? ORDER BY id ASC')
    .all(saleId) as Array<Record<string, unknown>>;

  const payRows = db
    .prepare('SELECT * FROM payments WHERE sale_id = ? ORDER BY id ASC')
    .all(saleId) as Array<Record<string, unknown>>;

  const fiscalRow = db
    .prepare('SELECT * FROM fiscal_documents WHERE sale_id = ?')
    .get(saleId) as Record<string, unknown> | undefined;

  return {
    id: Number(r.id),
    saleNumber: String(r.sale_number),
    idempotencyKey: String(r.idempotency_key),
    cashRegisterId: Number(r.cash_register_id),
    operatorUserId: Number(r.operator_user_id),
    operatorName: String(r.operator_name),
    authorizedByUserId:
      r.authorized_by_user_id !== null ? Number(r.authorized_by_user_id) : null,
    authorizedByName: r.authorized_by_name ? String(r.authorized_by_name) : null,
    customerCpf: r.customer_cpf ? String(r.customer_cpf) : null,
    customerName: r.customer_name ? String(r.customer_name) : null,
    subtotal: Number(r.subtotal),
    promoDiscountTotal: Number(r.promo_discount_total),
    manualDiscountTotal: Number(r.manual_discount_total),
    manualDiscountReason: r.manual_discount_reason
      ? String(r.manual_discount_reason)
      : null,
    totalAmount: Number(r.total_amount),
    changeAmount: Number(r.change_amount),
    status: String(r.status) as 'COMPLETED' | 'CANCELLED',
    cancelledByUserId:
      r.cancelled_by_user_id !== null ? Number(r.cancelled_by_user_id) : null,
    cancelledByName: r.cancelled_by_name ? String(r.cancelled_by_name) : null,
    cancelReason: r.cancel_reason ? String(r.cancel_reason) : null,
    cancelledAt: r.cancelled_at ? String(r.cancelled_at) : null,
    createdAt: String(r.created_at),
    items: itemRows.map((i) => ({
      id: Number(i.id),
      saleId: Number(i.sale_id),
      productId: Number(i.product_id),
      productNameSnapshot: String(i.product_name_snapshot),
      skuSnapshot: String(i.sku_snapshot),
      barcodeSnapshot: String(i.barcode_snapshot),
      unitSnapshot: String(i.unit_snapshot),
      quantity: Number(i.quantity),
      unitCostSnapshot: Number(i.unit_cost_snapshot),
      unitPriceSnapshot: Number(i.unit_price_snapshot),
      promoAppliedName: i.promo_applied_name ? String(i.promo_applied_name) : null,
      promoDiscountAmount: Number(i.promo_discount_amount),
      manualDiscountShare: Number(i.manual_discount_share),
      lineTotal: Number(i.line_total),
    })),
    payments: payRows.map((p) => ({
      id: Number(p.id),
      saleId: Number(p.sale_id),
      method: String(p.method) as PaymentMethod,
      amount: Number(p.amount),
      tenderedAmount: Number(p.tendered_amount),
      changeAmount: Number(p.change_amount),
      createdAt: String(p.created_at),
    })),
    fiscalDocument: fiscalRow ? mapFiscalRow(fiscalRow) : null,
  };
}

function mapFiscalRow(f: Record<string, unknown>): FiscalDocumentEntity {
  return {
    id: Number(f.id),
    saleId: Number(f.sale_id),
    model: String(f.model) as FiscalDocumentEntity['model'],
    series: Number(f.series),
    number: Number(f.number),
    accessKey: f.access_key ? String(f.access_key) : null,
    environment: String(f.environment) as 'HOMOLOGACAO' | 'PRODUCAO',
    status: String(f.status) as FiscalDocumentEntity['status'],
    protocolNumber: f.protocol_number ? String(f.protocol_number) : null,
    sefazMessage: String(f.sefaz_message),
    xmlContent: f.xml_content ? String(f.xml_content) : null,
    qrCodeUrl: f.qr_code_url ? String(f.qr_code_url) : null,
    issuedAt: String(f.issued_at),
    cancelledAt: f.cancelled_at ? String(f.cancelled_at) : null,
    cancelProtocol: f.cancel_protocol ? String(f.cancel_protocol) : null,
    cancelJustification: f.cancel_justification ? String(f.cancel_justification) : null,
  };
}

export function listSales(filters?: {
  cashRegisterId?: number;
  startDate?: string;
  endDate?: string;
  status?: string;
  limit?: number;
}): SaleEntity[] {
  const db = getDb();
  const clauses: string[] = ['1=1'];
  const args: unknown[] = [];

  if (filters?.cashRegisterId) {
    clauses.push('s.cash_register_id = ?');
    args.push(filters.cashRegisterId);
  }
  if (filters?.status) {
    clauses.push('s.status = ?');
    args.push(filters.status);
  }
  if (filters?.startDate) {
    clauses.push('s.created_at >= ?');
    args.push(`${filters.startDate}T00:00:00.000Z`);
  }
  if (filters?.endDate) {
    clauses.push('s.created_at <= ?');
    args.push(`${filters.endDate}T23:59:59.999Z`);
  }

  const limit = filters?.limit ?? 100;
  const ids = db
    .prepare(
      `SELECT s.id FROM sales s WHERE ${clauses.join(' AND ')} ORDER BY s.id DESC LIMIT ?`
    )
    .all(...args, limit) as Array<{ id: number }>;

  return ids.map((row) => getSaleById(row.id)!).filter(Boolean);
}

export function completeSale(
  actor: UserEntity,
  payload: {
    idempotencyKey: string;
    items: Array<{ productId: number; quantity: number }>;
    manualDiscountAmount?: number;
    manualDiscountReason?: string;
    customerCpf?: string;
    customerName?: string;
    payments: Array<{ method: PaymentMethod; tenderedAmount: number }>;
    authorizer?: AuthorizerCredentials;
  }
): SaleEntity {
  requirePermission(actor, PERMISSIONS.POS_SELL);

  const db = getDb();

  // Rule 11: Prevent duplicate operations on network/UI retry
  if (payload.idempotencyKey) {
    const existingSale = db
      .prepare('SELECT id FROM sales WHERE idempotency_key = ?')
      .get(payload.idempotencyKey) as { id: number } | undefined;
    if (existingSale) {
      return getSaleById(existingSale.id)!;
    }
  }

  // Rule 11: Never allow sales without an open cash register
  const openReg = getOpenCashRegister();
  if (!openReg) {
    throw new DomainError(
      'Venda bloqueada: Não há caixa aberto. Realize a abertura do caixa antes de iniciar vendas.',
      400,
      'CASH_CLOSED'
    );
  }

  if (!payload.items || payload.items.length === 0) {
    throw new DomainError('Adicione ao menos um item ao carrinho para finalizar a venda.');
  }

  if (!payload.payments || payload.payments.length === 0) {
    throw new DomainError('Selecione ao menos uma forma de pagamento.');
  }

  const settings = getSystemSettings();
  const manualDiscount = roundMoney(Math.max(0, payload.manualDiscountAmount ?? 0));
  const evaluation = previewCart(payload.items, manualDiscount);

  if (evaluation.lines.length === 0 || evaluation.totalAmount <= 0) {
    throw new DomainError('O valor total da venda deve ser maior que zero.');
  }

  // Validate manual discount permission
  let authorizedByUserId: number | null = null;
  if (evaluation.manualDiscountTotal > 0) {
    const discountPercent =
      evaluation.netAfterPromos > 0
        ? (evaluation.manualDiscountTotal / evaluation.netAfterPromos) * 100
        : 0;
    if (discountPercent > settings.maxOperatorDiscountPercent) {
      const authUser = resolveAuthorization(
        actor,
        PERMISSIONS.POS_DISCOUNT_HIGH,
        payload.authorizer
      );
      authorizedByUserId = authUser.id;
    }
  }

  // Validate payments & change (split payments supported!)
  let nonCashSum = 0;
  let cashTenderedSum = 0;
  for (const p of payload.payments) {
    const val = roundMoney(p.tenderedAmount);
    if (val <= 0) {
      throw new DomainError('Todos os pagamentos informados devem ter valor maior que zero.');
    }
    if (p.method === 'DINHEIRO') {
      cashTenderedSum = roundMoney(cashTenderedSum + val);
    } else {
      nonCashSum = roundMoney(nonCashSum + val);
    }
  }

  if (nonCashSum > evaluation.totalAmount + 0.001) {
    throw new DomainError(
      'Pagamentos em PIX, Cartão ou Vale não podem exceder o valor total da venda (troco somente em Dinheiro).'
    );
  }

  const totalTendered = roundMoney(nonCashSum + cashTenderedSum);
  if (totalTendered + 0.001 < evaluation.totalAmount) {
    const missing = roundMoney(evaluation.totalAmount - totalTendered);
    throw new DomainError(
      `Valor pago insuficiente. Faltam R$ ${missing.toFixed(2)} para quitar a venda.`
    );
  }

  const changeAmount = roundMoney(Math.max(0, totalTendered - evaluation.totalAmount));
  let newSaleId = 0;

  // Execute atomic ACID transaction for Sale + Items + Payments + Stock Deduction + Fiscal Doc + Audit
  const saleTx = db.transaction(() => {
    const nowIso = new Date().toISOString();

    // Lock/verify fresh stock inside transaction (RF07: prevent negative stock on simultaneous operations)
    for (const line of evaluation.lines) {
      const freshProd = db
        .prepare('SELECT id, name, stock_quantity, active FROM products WHERE id = ?')
        .get(line.productId) as
        | { id: number; name: string; stock_quantity: number; active: number }
        | undefined;

      if (!freshProd || freshProd.active !== 1) {
        throw new DomainError(`O produto "${line.name}" está inativo ou indisponível.`);
      }
      if (freshProd.stock_quantity < line.quantity) {
        throw new DomainError(
          `Estoque insuficiente para "${line.name}". Disponível: ${freshProd.stock_quantity} ${line.unit}, solicitado: ${line.quantity} ${line.unit}.`
        );
      }
    }

    const seq =
      ((db.prepare('SELECT COUNT(*) as cnt FROM sales').get() as { cnt: number }).cnt ??
        0) + 1;
    const saleNumber = `VD-${new Date().getFullYear()}-${String(seq).padStart(4, '0')}`;
    const idemKey = payload.idempotencyKey || `sale-${crypto.randomUUID()}`;

    const saleRes = db
      .prepare(
        `
        INSERT INTO sales (
          sale_number, idempotency_key, cash_register_id, operator_user_id, authorized_by_user_id,
          customer_cpf, customer_name, subtotal, promo_discount_total, manual_discount_total,
          manual_discount_reason, total_amount, change_amount, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETED', ?)
      `
      )
      .run(
        saleNumber,
        idemKey,
        openReg.id,
        actor.id,
        authorizedByUserId,
        payload.customerCpf?.trim() || null,
        payload.customerName?.trim() || null,
        evaluation.subtotal,
        evaluation.promoDiscountTotal,
        evaluation.manualDiscountTotal,
        payload.manualDiscountReason?.trim() || null,
        evaluation.totalAmount,
        changeAmount,
        nowIso
      );
    newSaleId = Number(saleRes.lastInsertRowid);

    const insItem = db.prepare(`
      INSERT INTO sale_items (
        sale_id, product_id, product_name_snapshot, sku_snapshot, barcode_snapshot, unit_snapshot,
        quantity, unit_cost_snapshot, unit_price_snapshot, promo_applied_name,
        promo_discount_amount, manual_discount_share, line_total
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const updStock = db.prepare(
      'UPDATE products SET stock_quantity = ?, updated_at = ? WHERE id = ?'
    );
    const insStockMov = db.prepare(`
      INSERT INTO stock_movements (
        product_id, type, quantity, previous_stock, new_stock, unit_cost, reason, reference_id, user_id, created_at
      ) VALUES (?, 'SALE_EXIT', ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertedItems: SaleItemEntity[] = [];

    for (const line of evaluation.lines) {
      const itemRes = insItem.run(
        newSaleId,
        line.productId,
        line.name,
        line.sku,
        line.barcode,
        line.unit,
        line.quantity,
        line.unitCost,
        line.unitPrice,
        line.promoAppliedName,
        line.promoDiscountAmount,
        line.manualDiscountShare,
        line.finalLineTotal
      );

      const curStock = (
        db
          .prepare('SELECT stock_quantity FROM products WHERE id = ?')
          .get(line.productId) as { stock_quantity: number }
      ).stock_quantity;
      const nextStock = roundMoney(curStock - line.quantity);
      updStock.run(nextStock, nowIso, line.productId);
      insStockMov.run(
        line.productId,
        line.quantity,
        curStock,
        nextStock,
        line.unitCost,
        `Baixa automática de venda confirmada (${saleNumber})`,
        saleNumber,
        actor.id,
        nowIso
      );

      insertedItems.push({
        id: Number(itemRes.lastInsertRowid),
        saleId: newSaleId,
        productId: line.productId,
        productNameSnapshot: line.name,
        skuSnapshot: line.sku,
        barcodeSnapshot: line.barcode,
        unitSnapshot: line.unit,
        quantity: line.quantity,
        unitCostSnapshot: line.unitCost,
        unitPriceSnapshot: line.unitPrice,
        promoAppliedName: line.promoAppliedName,
        promoDiscountAmount: line.promoDiscountAmount,
        manualDiscountShare: line.manualDiscountShare,
        lineTotal: line.finalLineTotal,
      });
    }

    // Persist split payments distributing change to the last DINHEIRO entry
    const insPay = db.prepare(`
      INSERT INTO payments (sale_id, method, amount, tendered_amount, change_amount, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    let remainingChangeToAssign = changeAmount;
    const insertedPayments: PaymentEntity[] = [];

    // Reverse iterate or assign change to first/last cash payment
    for (let i = 0; i < payload.payments.length; i++) {
      const p = payload.payments[i];
      const tendered = roundMoney(p.tenderedAmount);
      let lineChange = 0;
      if (p.method === 'DINHEIRO' && remainingChangeToAssign > 0) {
        lineChange = Math.min(tendered, remainingChangeToAssign);
        remainingChangeToAssign = roundMoney(remainingChangeToAssign - lineChange);
      }
      const netApplied = roundMoney(tendered - lineChange);
      const pRes = insPay.run(newSaleId, p.method, netApplied, tendered, lineChange, nowIso);
      insertedPayments.push({
        id: Number(pRes.lastInsertRowid),
        saleId: newSaleId,
        method: p.method,
        amount: netApplied,
        tenderedAmount: tendered,
        changeAmount: lineChange,
        createdAt: nowIso,
      });
    }

    // Issue Fiscal Document (RF08)
    const nfceNumber = settings.nextNfceNumber;
    const fiscal = buildFiscalEmission({
      sale: {
        id: newSaleId,
        saleNumber,
        idempotencyKey: idemKey,
        cashRegisterId: openReg.id,
        operatorUserId: actor.id,
        authorizedByUserId,
        customerCpf: payload.customerCpf?.trim() || null,
        customerName: payload.customerName?.trim() || null,
        subtotal: evaluation.subtotal,
        promoDiscountTotal: evaluation.promoDiscountTotal,
        manualDiscountTotal: evaluation.manualDiscountTotal,
        manualDiscountReason: payload.manualDiscountReason?.trim() || null,
        totalAmount: evaluation.totalAmount,
        changeAmount,
        status: 'COMPLETED',
        cancelledByUserId: null,
        cancelReason: null,
        cancelledAt: null,
        createdAt: nowIso,
      },
      items: insertedItems,
      payments: insertedPayments,
      settings,
      nfceNumber,
    });

    db.prepare(
      `
      INSERT INTO fiscal_documents (
        sale_id, model, series, number, access_key, environment, status,
        protocol_number, sefaz_message, xml_content, qr_code_url, issued_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      newSaleId,
      fiscal.model,
      fiscal.series,
      fiscal.number,
      fiscal.accessKey,
      fiscal.environment,
      fiscal.status,
      fiscal.protocolNumber,
      fiscal.sefazMessage,
      fiscal.xmlContent,
      fiscal.qrCodeUrl,
      nowIso
    );

    if (fiscal.model === 'NFCe_65') {
      db.prepare(
        "INSERT INTO system_settings (key, value) VALUES ('nextNfceNumber', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
      ).run(JSON.stringify(nfceNumber + 1));
    }

    writeAuditLog({
      userId: actor.id,
      userName: actor.fullName,
      action: 'SALE_COMPLETED',
      entityType: 'Sale',
      entityId: saleNumber,
      details: `Venda ${saleNumber} finalizada: Total R$ ${evaluation.totalAmount.toFixed(2)} (Descontos promo: R$ ${evaluation.promoDiscountTotal.toFixed(2)}, Desconto manual: R$ ${evaluation.manualDiscountTotal.toFixed(2)}) | Doc Fiscal: ${fiscal.status}.`,
    });
  });

  saleTx();
  recalculateRegisterSummary(openReg.id);
  return getSaleById(newSaleId)!;
}

export function cancelSale(
  actor: UserEntity,
  saleId: number,
  reason: string,
  authorizer?: AuthorizerCredentials
): SaleEntity {
  const authUser = resolveAuthorization(actor, PERMISSIONS.POS_CANCEL_SALE, authorizer);
  const cleanReason = reason.trim();
  if (cleanReason.length < 15) {
    throw new DomainError(
      'A justificativa de cancelamento deve possuir no mínimo 15 caracteres (exigência fiscal SEFAZ).'
    );
  }

  const sale = getSaleById(saleId);
  if (!sale) throw new DomainError('Venda não encontrada.', 404);
  if (sale.status === 'CANCELLED') {
    throw new DomainError('Esta venda já se encontra cancelada.');
  }

  const db = getDb();
  const nowIso = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(
      `
      UPDATE sales
      SET status = 'CANCELLED',
          cancelled_by_user_id = ?,
          cancel_reason = ?,
          cancelled_at = ?
      WHERE id = ?
    `
    ).run(authUser.id, cleanReason, nowIso, saleId);

    // Return stock for each item
    const updStock = db.prepare(
      'UPDATE products SET stock_quantity = ?, updated_at = ? WHERE id = ?'
    );
    const insStockMov = db.prepare(`
      INSERT INTO stock_movements (
        product_id, type, quantity, previous_stock, new_stock, unit_cost, reason, reference_id, user_id, authorized_by_user_id, created_at
      ) VALUES (?, 'SALE_CANCEL_RETURN', ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const item of sale.items ?? []) {
      const cur = (
        db
          .prepare('SELECT stock_quantity FROM products WHERE id = ?')
          .get(item.productId) as { stock_quantity: number }
      ).stock_quantity;
      const next = roundMoney(cur + item.quantity);
      updStock.run(next, nowIso, item.productId);
      insStockMov.run(
        item.productId,
        item.quantity,
        cur,
        next,
        item.unitCostSnapshot,
        `Estorno de estoque por cancelamento da venda ${sale.saleNumber}: ${cleanReason}`,
        sale.saleNumber,
        actor.id,
        authUser.id,
        nowIso
      );
    }

    // Cancel Fiscal Document if present
    if (sale.fiscalDocument && sale.fiscalDocument.status !== 'NON_FISCAL') {
      const cancelProt = `135${new Date().getFullYear()}9${String(sale.id).padStart(7, '0')}`;
      db.prepare(
        `
        UPDATE fiscal_documents
        SET status = 'CANCELLED',
            cancelled_at = ?,
            cancel_protocol = ?,
            cancel_justification = ?,
            sefaz_message = '101 - Cancelamento de NF-e homologado (Evento 110111)'
        WHERE sale_id = ?
      `
      ).run(nowIso, cancelProt, cleanReason, saleId);
    }

    writeAuditLog({
      userId: actor.id,
      userName: actor.fullName,
      action: 'SALE_CANCELLED',
      entityType: 'Sale',
      entityId: sale.saleNumber,
      details: `Venda ${sale.saleNumber} (R$ ${sale.totalAmount.toFixed(2)}) cancelada com autorização de ${authUser.fullName}. Justificativa: ${cleanReason}`,
    });
  });

  tx();
  recalculateRegisterSummary(sale.cashRegisterId);
  return getSaleById(saleId)!;
}

export function retransmitFiscalDocument(
  actor: UserEntity,
  saleId: number
): SaleEntity {
  requirePermission(actor, PERMISSIONS.POS_SELL);
  const sale = getSaleById(saleId);
  if (!sale || !sale.fiscalDocument) {
    throw new DomainError('Documento fiscal não encontrado.', 404);
  }
  if (sale.status === 'CANCELLED') {
    throw new DomainError('Não é possível transmitir documento de uma venda cancelada.');
  }
  if (sale.fiscalDocument.status === 'AUTHORIZED') {
    return sale;
  }

  const settings = getSystemSettings();
  if (settings.sefazConnectivity !== 'ONLINE') {
    throw new DomainError(
      'Conectividade SEFAZ continua em modo Offline ou Simulação de Rejeição nas Configurações.'
    );
  }

  const rebuilt = buildFiscalEmission({
    sale,
    items: sale.items ?? [],
    payments: sale.payments ?? [],
    settings,
    nfceNumber: sale.fiscalDocument.number,
  });

  const db = getDb();
  db.prepare(
    `
    UPDATE fiscal_documents
    SET access_key = ?,
        status = ?,
        protocol_number = ?,
        sefaz_message = ?,
        xml_content = ?,
        qr_code_url = ?
    WHERE sale_id = ?
  `
  ).run(
    rebuilt.accessKey,
    rebuilt.status,
    rebuilt.protocolNumber,
    rebuilt.sefazMessage,
    rebuilt.xmlContent,
    rebuilt.qrCodeUrl,
    saleId
  );

  writeAuditLog({
    userId: actor.id,
    userName: actor.fullName,
    action: 'FISCAL_RETRANSMIT',
    entityType: 'FiscalDocument',
    entityId: sale.saleNumber,
    details: `Documento fiscal da venda ${sale.saleNumber} transmitido à SEFAZ: ${rebuilt.status} (Protocolo: ${rebuilt.protocolNumber ?? 'N/A'}).`,
  });

  return getSaleById(saleId)!;
}

// ============================================================================
// STOCK MANAGEMENT (RF07)
// ============================================================================

export function listStockMovements(productId?: number): StockMovementEntity[] {
  const db = getDb();
  const sql = `
    SELECT sm.*, p.name as product_name, p.sku as product_sku, p.unit as product_unit,
           u1.full_name as user_name, u2.full_name as authorized_by_name
    FROM stock_movements sm
    JOIN products p ON p.id = sm.product_id
    JOIN users u1 ON u1.id = sm.user_id
    LEFT JOIN users u2 ON u2.id = sm.authorized_by_user_id
    ${productId ? 'WHERE sm.product_id = ?' : ''}
    ORDER BY sm.id DESC
    LIMIT 200
  `;
  const rows = (
    productId ? db.prepare(sql).all(productId) : db.prepare(sql).all()
  ) as Array<Record<string, unknown>>;

  return rows.map((r) => ({
    id: Number(r.id),
    productId: Number(r.product_id),
    productName: String(r.product_name),
    productSku: String(r.product_sku),
    productUnit: String(r.product_unit),
    type: String(r.type) as StockMovementType,
    quantity: Number(r.quantity),
    previousStock: Number(r.previous_stock),
    newStock: Number(r.new_stock),
    unitCost: Number(r.unit_cost),
    reason: String(r.reason),
    referenceId: r.reference_id ? String(r.reference_id) : null,
    userId: Number(r.user_id),
    userName: String(r.user_name),
    authorizedByUserId:
      r.authorized_by_user_id !== null ? Number(r.authorized_by_user_id) : null,
    authorizedByName: r.authorized_by_name ? String(r.authorized_by_name) : null,
    createdAt: String(r.created_at),
  }));
}

export function recordManualStockMovement(
  actor: UserEntity,
  payload: {
    productId: number;
    type: 'ENTRY' | 'ADJUSTMENT' | 'LOSS_DAMAGE';
    direction?: 'IN' | 'OUT';
    quantity: number;
    unitCost?: number;
    reason: string;
    referenceId?: string;
    authorizer?: AuthorizerCredentials;
  }
): { product: ProductEntity; movement: StockMovementEntity } {
  const authUser = resolveAuthorization(actor, PERMISSIONS.STOCK_ADJUST, payload.authorizer);
  const qty = roundMoney(payload.quantity);
  const reason = payload.reason.trim();
  if (qty <= 0) throw new DomainError('A quantidade movimentada deve ser maior que zero.');
  if (reason.length < 5) {
    throw new DomainError('Informe o motivo detalhado da movimentação (mín. 5 caracteres).');
  }

  const db = getDb();
  const prod = db
    .prepare('SELECT * FROM products WHERE id = ?')
    .get(payload.productId) as Record<string, unknown> | undefined;
  if (!prod) throw new DomainError('Produto não encontrado.', 404);

  const prevStock = Number(prod.stock_quantity);
  const isAddition =
    payload.type === 'ENTRY' ||
    (payload.type === 'ADJUSTMENT' && payload.direction !== 'OUT');
  const nextStock = isAddition
    ? roundMoney(prevStock + qty)
    : roundMoney(prevStock - qty);

  if (nextStock < 0) {
    throw new DomainError(
      `Operação negada: o estoque não pode ficar negativo (Saldo atual: ${prevStock}, saída solicitada: ${qty}).`
    );
  }

  const unitCost =
    payload.unitCost !== undefined && payload.unitCost >= 0
      ? roundMoney(payload.unitCost)
      : Number(prod.cost_price);
  const nowIso = new Date().toISOString();
  let movId = 0;

  const tx = db.transaction(() => {
    db.prepare(
      'UPDATE products SET stock_quantity = ?, cost_price = ?, updated_at = ? WHERE id = ?'
    ).run(
      nextStock,
      payload.type === 'ENTRY' ? unitCost : Number(prod.cost_price),
      nowIso,
      payload.productId
    );

    const info = db
      .prepare(
        `
        INSERT INTO stock_movements (
          product_id, type, quantity, previous_stock, new_stock, unit_cost,
          reason, reference_id, user_id, authorized_by_user_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      )
      .run(
        payload.productId,
        payload.type,
        qty,
        prevStock,
        nextStock,
        unitCost,
        reason,
        payload.referenceId?.trim() || null,
        actor.id,
        authUser.id,
        nowIso
      );
    movId = Number(info.lastInsertRowid);

    writeAuditLog({
      userId: actor.id,
      userName: actor.fullName,
      action: `STOCK_${payload.type}`,
      entityType: 'Product',
      entityId: String(payload.productId),
      details: `Movimentação ${payload.type} em "${prod.name}": ${prevStock} -> ${nextStock} (${isAddition ? '+' : '-'}${qty}). Autorizado por ${authUser.fullName}. Motivo: ${reason}`,
    });
  });

  tx();
  const updatedProduct = listProducts().find((p) => p.id === payload.productId)!;
  const movement = listStockMovements(payload.productId).find((m) => m.id === movId)!;
  return { product: updatedProduct, movement };
}

// ============================================================================
// REPORTS & ANALYTICS (RF09)
// ============================================================================

export function getAnalyticalReports(
  actor: UserEntity,
  filters: {
    startDate?: string;
    endDate?: string;
    categoryId?: number;
    operatorId?: number;
    paymentMethod?: PaymentMethod;
  }
) {
  requirePermission(actor, PERMISSIONS.REPORT_VIEW);
  const db = getDb();

  const clauses: string[] = ['1=1'];
  const args: unknown[] = [];

  if (filters.startDate) {
    clauses.push('s.created_at >= ?');
    args.push(`${filters.startDate}T00:00:00.000Z`);
  }
  if (filters.endDate) {
    clauses.push('s.created_at <= ?');
    args.push(`${filters.endDate}T23:59:59.999Z`);
  }
  if (filters.operatorId) {
    clauses.push('s.operator_user_id = ?');
    args.push(filters.operatorId);
  }
  if (filters.paymentMethod) {
    clauses.push(
      'EXISTS (SELECT 1 FROM payments pm WHERE pm.sale_id = s.id AND pm.method = ?)'
    );
    args.push(filters.paymentMethod);
  }
  if (filters.categoryId) {
    clauses.push(
      'EXISTS (SELECT 1 FROM sale_items si JOIN products pr ON pr.id = si.product_id WHERE si.sale_id = s.id AND pr.category_id = ?)'
    );
    args.push(filters.categoryId);
  }

  const whereSql = clauses.join(' AND ');

  // 1. Revenue, Cost, Profit, Margin, Ticket Médio (strictly separated from physical cash balance!)
  const kpiRow = db
    .prepare(
      `
      SELECT
        COUNT(DISTINCT CASE WHEN s.status = 'COMPLETED' THEN s.id END) as completed_count,
        COUNT(DISTINCT CASE WHEN s.status = 'CANCELLED' THEN s.id END) as cancelled_count,
        COALESCE(SUM(CASE WHEN s.status = 'CANCELLED' THEN s.total_amount ELSE 0 END), 0) as cancelled_amount
      FROM sales s
      WHERE ${whereSql}
    `
    )
    .get(...args) as {
    completed_count: number;
    cancelled_count: number;
    cancelled_amount: number;
  };

  const itemClauses = [...clauses, "s.status = 'COMPLETED'"];
  const itemArgs = [...args];
  if (filters.categoryId) {
    itemClauses.push('pr.category_id = ?');
    itemArgs.push(filters.categoryId);
  }

  const itemFinancials = db
    .prepare(
      `
      SELECT
        COALESCE(SUM(si.line_total), 0) as net_revenue,
        COALESCE(SUM(si.quantity * si.unit_price_snapshot), 0) as gross_revenue,
        COALESCE(SUM(si.quantity * si.unit_cost_snapshot), 0) as total_cost,
        COALESCE(SUM(si.promo_discount_amount + si.manual_discount_share), 0) as total_discounts
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      JOIN products pr ON pr.id = si.product_id
      WHERE ${itemClauses.join(' AND ')}
    `
    )
    .get(...itemArgs) as {
    net_revenue: number;
    gross_revenue: number;
    total_cost: number;
    total_discounts: number;
  };

  const netRevenue = roundMoney(itemFinancials.net_revenue);
  const totalCost = roundMoney(itemFinancials.total_cost);
  const grossProfit = roundMoney(netRevenue - totalCost);
  const marginPercent =
    netRevenue > 0 ? roundMoney((grossProfit / netRevenue) * 100) : 0;
  const averageTicket =
    kpiRow.completed_count > 0
      ? roundMoney(netRevenue / kpiRow.completed_count)
      : 0;

  const openReg = getOpenCashRegister();
  const physicalCashInDrawer = openReg ? openReg.expectedCashBalance : 0;

  // 2. Daily, Weekly, Monthly Series
  const dailySeries = db
    .prepare(
      `
      SELECT
        substr(s.created_at, 1, 10) as period,
        COUNT(DISTINCT s.id) as sales_count,
        ROUND(SUM(si.line_total), 2) as revenue,
        ROUND(SUM(si.line_total - (si.quantity * si.unit_cost_snapshot)), 2) as profit
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      JOIN products pr ON pr.id = si.product_id
      WHERE ${itemClauses.join(' AND ')}
      GROUP BY substr(s.created_at, 1, 10)
      ORDER BY period ASC
    `
    )
    .all(...itemArgs);

  const weeklySeries = db
    .prepare(
      `
      SELECT
        strftime('%Y-S%W', s.created_at) as period,
        COUNT(DISTINCT s.id) as sales_count,
        ROUND(SUM(si.line_total), 2) as revenue,
        ROUND(SUM(si.line_total - (si.quantity * si.unit_cost_snapshot)), 2) as profit
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      JOIN products pr ON pr.id = si.product_id
      WHERE ${itemClauses.join(' AND ')}
      GROUP BY strftime('%Y-S%W', s.created_at)
      ORDER BY period ASC
    `
    )
    .all(...itemArgs);

  const monthlySeries = db
    .prepare(
      `
      SELECT
        substr(s.created_at, 1, 7) as period,
        COUNT(DISTINCT s.id) as sales_count,
        ROUND(SUM(si.line_total), 2) as revenue,
        ROUND(SUM(si.line_total - (si.quantity * si.unit_cost_snapshot)), 2) as profit
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      JOIN products pr ON pr.id = si.product_id
      WHERE ${itemClauses.join(' AND ')}
      GROUP BY substr(s.created_at, 1, 7)
      ORDER BY period ASC
    `
    )
    .all(...itemArgs);

  // 3. Payment Method Breakdown
  const salesByPayment = db
    .prepare(
      `
      SELECT
        pm.method,
        COUNT(pm.id) as count,
        ROUND(SUM(pm.amount), 2) as amount
      FROM payments pm
      JOIN sales s ON s.id = pm.sale_id
      WHERE ${whereSql} AND s.status = 'COMPLETED'
      GROUP BY pm.method
      ORDER BY amount DESC
    `
    )
    .all(...args);

  // 4. Top Best-Selling & Most Profitable Products
  const productPerformance = db
    .prepare(
      `
      SELECT
        si.product_id as productId,
        si.product_name_snapshot as name,
        si.sku_snapshot as sku,
        c.name as categoryName,
        ROUND(SUM(si.quantity), 2) as quantitySold,
        ROUND(SUM(si.line_total), 2) as revenue,
        ROUND(SUM(si.quantity * si.unit_cost_snapshot), 2) as cost,
        ROUND(SUM(si.line_total - (si.quantity * si.unit_cost_snapshot)), 2) as profit
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      JOIN products pr ON pr.id = si.product_id
      JOIN categories c ON c.id = pr.category_id
      WHERE ${itemClauses.join(' AND ')}
      GROUP BY si.product_id
      ORDER BY quantitySold DESC
    `
    )
    .all(...itemArgs) as Array<{
    productId: number;
    name: string;
    sku: string;
    categoryName: string;
    quantitySold: number;
    revenue: number;
    cost: number;
    profit: number;
  }>;

  const topSellingProducts = [...productPerformance]
    .sort((a, b) => b.quantitySold - a.quantitySold)
    .slice(0, 8);

  const topProfitableProducts = [...productPerformance]
    .sort((a, b) => b.profit - a.profit)
    .slice(0, 8)
    .map((p) => ({
      ...p,
      marginPercent: p.revenue > 0 ? roundMoney((p.profit / p.revenue) * 100) : 0,
    }));

  // 5. Sangria & Suprimento summary
  const cashFlowMovements = db
    .prepare(
      `
      SELECT
        type,
        COUNT(*) as count,
        ROUND(COALESCE(SUM(amount), 0), 2) as total
      FROM cash_movements
      WHERE status = 'ACTIVE' AND type IN ('SUPPLY', 'BLEED')
      GROUP BY type
    `
    )
    .all();

  return {
    summary: {
      grossRevenue: roundMoney(itemFinancials.gross_revenue),
      totalDiscounts: roundMoney(itemFinancials.total_discounts),
      netRevenue,
      totalCost,
      grossProfit,
      marginPercent,
      averageTicket,
      completedSalesCount: kpiRow.completed_count,
      cancelledSalesCount: kpiRow.cancelled_count,
      cancelledAmount: roundMoney(kpiRow.cancelled_amount),
      physicalCashInDrawer,
      hasOpenRegister: Boolean(openReg),
    },
    dailySeries,
    weeklySeries,
    monthlySeries,
    salesByPayment,
    topSellingProducts,
    topProfitableProducts,
    cashFlowMovements,
    cashRegistersHistory: listCashRegisters().slice(0, 15),
  };
}

// ============================================================================
// AUDIT LOG & SQLITE BACKUP / RESTORE (RF10 & Section 9)
// ============================================================================

export function listAuditLogs(actor: UserEntity, limit = 150): AuditLogEntity[] {
  requirePermission(actor, PERMISSIONS.AUDIT_VIEW);
  const db = getDb();
  const rows = db
    .prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT ?')
    .all(limit) as Array<Record<string, unknown>>;

  return rows.map((r) => ({
    id: Number(r.id),
    userId: r.user_id !== null ? Number(r.user_id) : null,
    userNameSnapshot: String(r.user_name_snapshot),
    action: String(r.action),
    entityType: String(r.entity_type),
    entityId: String(r.entity_id),
    details: String(r.details),
    terminalName: String(r.terminal_name),
    createdAt: String(r.created_at),
  }));
}

export interface BackupEntry {
  filename: string;
  sizeBytes: number;
  createdAt: string;
}

export function listBackups(actor: UserEntity): BackupEntry[] {
  requirePermission(actor, PERMISSIONS.BACKUP_MANAGE);
  const dir = getBackupDirectory();
  if (!fs.existsSync(dir)) return [];

  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sqlite'))
    .map((filename) => {
      const full = path.join(dir, filename);
      const stat = fs.statSync(full);
      return {
        filename,
        sizeBytes: stat.size,
        createdAt: stat.mtime.toISOString(),
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return files;
}

export function createDatabaseBackup(
  actor: UserEntity,
  label?: string
): BackupEntry {
  requirePermission(actor, PERMISSIONS.BACKUP_MANAGE);
  const db = getDb();
  const dir = getBackupDirectory();
  const safeLabel = (label ?? 'manual')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 24);
  const stamp = new Date()
    .toISOString()
    .replace(/[:.]/g, '-')
    .replace('T', '_')
    .slice(0, 19);
  const filename = `mdpdv_${stamp}_${safeLabel || 'backup'}.sqlite`;
  const targetPath = path.join(dir, filename);

  // SQLite atomic online backup using VACUUM INTO
  const escapedPath = targetPath.replace(/'/g, "''");
  db.exec(`VACUUM INTO '${escapedPath}'`);

  writeAuditLog({
    userId: actor.id,
    userName: actor.fullName,
    action: 'BACKUP_CREATE',
    entityType: 'Database',
    entityId: filename,
    details: `Backup consistente do banco SQLite gerado com sucesso (${filename}).`,
  });

  const stat = fs.statSync(targetPath);
  return {
    filename,
    sizeBytes: stat.size,
    createdAt: stat.mtime.toISOString(),
  };
}

export function restoreDatabaseBackup(
  actor: UserEntity,
  filename: string
): void {
  requirePermission(actor, PERMISSIONS.BACKUP_MANAGE);
  const cleanName = path.basename(filename);
  const sourcePath = path.join(getBackupDirectory(), cleanName);
  if (!fs.existsSync(sourcePath)) {
    throw new DomainError('Arquivo de backup não encontrado.', 404);
  }

  // Create automatic safety snapshot prior to restore
  createDatabaseBackup(actor, 'pre_restore');

  // Close current SQLite connection, replace file cleanly, and reopen
  const db = getDb();
  db.close();

  for (const suffix of ['', '-wal', '-shm']) {
    const p = `${DB_FILE_PATH}${suffix}`;
    if (fs.existsSync(p)) {
      fs.unlinkSync(p);
    }
  }

  fs.copyFileSync(sourcePath, DB_FILE_PATH);
  reloadDbConnection();

  writeAuditLog({
    userId: actor.id,
    userName: actor.fullName,
    action: 'BACKUP_RESTORE',
    entityType: 'Database',
    entityId: cleanName,
    details: `Banco de dados SQLite restaurado a partir do ponto "${cleanName}".`,
  });
}
