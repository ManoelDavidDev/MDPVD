import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { PERMISSIONS } from '../domain/models.ts';
import { buildFiscalEmission } from './fiscalBuilder.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const BACKUP_DIR = path.resolve(DATA_DIR, 'backups');
export const DB_FILE_PATH = path.resolve(DATA_DIR, 'mdpdv.sqlite');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

let dbInstance: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!dbInstance) {
    dbInstance = new Database(DB_FILE_PATH);
    dbInstance.pragma('journal_mode = WAL');
    dbInstance.pragma('foreign_keys = ON');
    dbInstance.pragma('busy_timeout = 5000');
    runMigrationsAndSeed(dbInstance);
  }
  return dbInstance;
}

export function reloadDbConnection(): Database.Database {
  if (dbInstance) {
    try {
      dbInstance.close();
    } catch {
      // ignore close errors on swap
    }
    dbInstance = null;
  }
  return getDb();
}

export function getBackupDirectory(): string {
  return BACKUP_DIR;
}

function runMigrationsAndSeed(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      description TEXT NOT NULL,
      installed_on TEXT NOT NULL
    );
  `);

  const hasV1 = db
    .prepare('SELECT version FROM schema_migrations WHERE version = ?')
    .get('V1__initial_mdpdv_schema');

  if (!hasV1) {
    const migrateTx = db.transaction(() => {
      db.exec(`
        -- 1. Role
        CREATE TABLE IF NOT EXISTS roles (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          code TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL,
          description TEXT NOT NULL
        );

        -- 2. Permission
        CREATE TABLE IF NOT EXISTS permissions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          code TEXT NOT NULL UNIQUE,
          description TEXT NOT NULL
        );

        -- N:N Role <-> Permission
        CREATE TABLE IF NOT EXISTS role_permissions (
          role_id INTEGER NOT NULL,
          permission_id INTEGER NOT NULL,
          PRIMARY KEY (role_id, permission_id),
          FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
          FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
        );

        -- 3. User
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT NOT NULL UNIQUE,
          full_name TEXT NOT NULL,
          password_hash TEXT NOT NULL,
          role_id INTEGER NOT NULL,
          active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
          locked INTEGER NOT NULL DEFAULT 0 CHECK (locked IN (0, 1)),
          failed_attempts INTEGER NOT NULL DEFAULT 0,
          last_login_at TEXT,
          created_at TEXT NOT NULL,
          FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE RESTRICT
        );

        -- 4. Category
        CREATE TABLE IF NOT EXISTS categories (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE,
          description TEXT NOT NULL DEFAULT '',
          ncm_default TEXT NOT NULL DEFAULT '21069090',
          active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
        );

        -- 5. Product
        CREATE TABLE IF NOT EXISTS products (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          sku TEXT NOT NULL UNIQUE,
          barcode TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          category_id INTEGER NOT NULL,
          unit TEXT NOT NULL DEFAULT 'UN',
          cost_price REAL NOT NULL CHECK (cost_price >= 0),
          sale_price REAL NOT NULL CHECK (sale_price > 0),
          promotional_price REAL CHECK (promotional_price IS NULL OR promotional_price > 0),
          stock_quantity REAL NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
          min_stock REAL NOT NULL DEFAULT 0 CHECK (min_stock >= 0),
          ncm TEXT NOT NULL DEFAULT '21069090',
          cfop TEXT NOT NULL DEFAULT '5102',
          active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT
        );

        -- 6. Promotion
        CREATE TABLE IF NOT EXISTS promotions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          type TEXT NOT NULL CHECK (type IN ('UNIT_PROMO', 'PERCENTAGE', 'QUANTITY_FIXED', 'BUY_X_PAY_Y', 'COMBO')),
          product_id INTEGER NOT NULL,
          combo_product_id INTEGER,
          combo_qty REAL,
          min_quantity REAL NOT NULL DEFAULT 1 CHECK (min_quantity > 0),
          promo_value REAL NOT NULL CHECK (promo_value > 0),
          start_date TEXT,
          end_date TEXT,
          active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
          created_at TEXT NOT NULL,
          FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
          FOREIGN KEY (combo_product_id) REFERENCES products(id) ON DELETE SET NULL
        );

        -- 7. CashRegister
        CREATE TABLE IF NOT EXISTS cash_registers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          code TEXT NOT NULL UNIQUE,
          terminal_name TEXT NOT NULL DEFAULT 'CAIXA-01',
          opened_by_user_id INTEGER NOT NULL,
          closed_by_user_id INTEGER,
          opened_at TEXT NOT NULL,
          closed_at TEXT,
          opening_balance REAL NOT NULL CHECK (opening_balance >= 0),
          expected_cash_balance REAL NOT NULL DEFAULT 0,
          counted_cash_balance REAL,
          difference_amount REAL,
          total_cash_sales REAL NOT NULL DEFAULT 0,
          total_pix_sales REAL NOT NULL DEFAULT 0,
          total_debit_sales REAL NOT NULL DEFAULT 0,
          total_credit_sales REAL NOT NULL DEFAULT 0,
          total_vale_sales REAL NOT NULL DEFAULT 0,
          total_supply REAL NOT NULL DEFAULT 0,
          total_bleed REAL NOT NULL DEFAULT 0,
          closing_notes TEXT,
          status TEXT NOT NULL CHECK (status IN ('OPEN', 'CLOSED')),
          FOREIGN KEY (opened_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
          FOREIGN KEY (closed_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
        );

        -- 8. CashMovement
        CREATE TABLE IF NOT EXISTS cash_movements (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          cash_register_id INTEGER NOT NULL,
          type TEXT NOT NULL CHECK (type IN ('OPENING', 'SUPPLY', 'BLEED', 'REVERSAL')),
          amount REAL NOT NULL CHECK (amount >= 0),
          reason TEXT NOT NULL,
          user_id INTEGER NOT NULL,
          authorized_by_user_id INTEGER,
          reference_movement_id INTEGER,
          status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'REVERSED')),
          created_at TEXT NOT NULL,
          FOREIGN KEY (cash_register_id) REFERENCES cash_registers(id) ON DELETE RESTRICT,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
          FOREIGN KEY (authorized_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
          FOREIGN KEY (reference_movement_id) REFERENCES cash_movements(id) ON DELETE RESTRICT
        );

        -- 9. Sale
        CREATE TABLE IF NOT EXISTS sales (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          sale_number TEXT NOT NULL UNIQUE,
          idempotency_key TEXT NOT NULL UNIQUE,
          cash_register_id INTEGER NOT NULL,
          operator_user_id INTEGER NOT NULL,
          authorized_by_user_id INTEGER,
          customer_cpf TEXT,
          customer_name TEXT,
          subtotal REAL NOT NULL CHECK (subtotal >= 0),
          promo_discount_total REAL NOT NULL DEFAULT 0 CHECK (promo_discount_total >= 0),
          manual_discount_total REAL NOT NULL DEFAULT 0 CHECK (manual_discount_total >= 0),
          manual_discount_reason TEXT,
          total_amount REAL NOT NULL CHECK (total_amount >= 0),
          change_amount REAL NOT NULL DEFAULT 0 CHECK (change_amount >= 0),
          status TEXT NOT NULL CHECK (status IN ('COMPLETED', 'CANCELLED')),
          cancelled_by_user_id INTEGER,
          cancel_reason TEXT,
          cancelled_at TEXT,
          created_at TEXT NOT NULL,
          FOREIGN KEY (cash_register_id) REFERENCES cash_registers(id) ON DELETE RESTRICT,
          FOREIGN KEY (operator_user_id) REFERENCES users(id) ON DELETE RESTRICT,
          FOREIGN KEY (authorized_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
          FOREIGN KEY (cancelled_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
        );

        -- 10. SaleItem
        CREATE TABLE IF NOT EXISTS sale_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          sale_id INTEGER NOT NULL,
          product_id INTEGER NOT NULL,
          product_name_snapshot TEXT NOT NULL,
          sku_snapshot TEXT NOT NULL,
          barcode_snapshot TEXT NOT NULL,
          unit_snapshot TEXT NOT NULL,
          quantity REAL NOT NULL CHECK (quantity > 0),
          unit_cost_snapshot REAL NOT NULL CHECK (unit_cost_snapshot >= 0),
          unit_price_snapshot REAL NOT NULL CHECK (unit_price_snapshot > 0),
          promo_applied_name TEXT,
          promo_discount_amount REAL NOT NULL DEFAULT 0,
          manual_discount_share REAL NOT NULL DEFAULT 0,
          line_total REAL NOT NULL CHECK (line_total >= 0),
          FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
          FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
        );

        -- 11. Payment
        CREATE TABLE IF NOT EXISTS payments (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          sale_id INTEGER NOT NULL,
          method TEXT NOT NULL CHECK (method IN ('DINHEIRO', 'PIX', 'DEBITO', 'CREDITO', 'VALE')),
          amount REAL NOT NULL CHECK (amount > 0),
          tendered_amount REAL NOT NULL CHECK (tendered_amount > 0),
          change_amount REAL NOT NULL DEFAULT 0 CHECK (change_amount >= 0),
          created_at TEXT NOT NULL,
          FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE
        );

        -- 12. StockMovement
        CREATE TABLE IF NOT EXISTS stock_movements (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          product_id INTEGER NOT NULL,
          type TEXT NOT NULL CHECK (type IN ('ENTRY', 'SALE_EXIT', 'SALE_CANCEL_RETURN', 'ADJUSTMENT', 'LOSS_DAMAGE')),
          quantity REAL NOT NULL CHECK (quantity > 0),
          previous_stock REAL NOT NULL,
          new_stock REAL NOT NULL,
          unit_cost REAL NOT NULL DEFAULT 0,
          reason TEXT NOT NULL,
          reference_id TEXT,
          user_id INTEGER NOT NULL,
          authorized_by_user_id INTEGER,
          created_at TEXT NOT NULL,
          FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
          FOREIGN KEY (authorized_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
        );

        -- 13. FiscalDocument
        CREATE TABLE IF NOT EXISTS fiscal_documents (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          sale_id INTEGER NOT NULL UNIQUE,
          model TEXT NOT NULL CHECK (model IN ('NFCe_65', 'NFe_55', 'COMPROVANTE_NAO_FISCAL')),
          series INTEGER NOT NULL DEFAULT 1,
          number INTEGER NOT NULL,
          access_key TEXT,
          environment TEXT NOT NULL CHECK (environment IN ('HOMOLOGACAO', 'PRODUCAO')),
          status TEXT NOT NULL CHECK (status IN ('AUTHORIZED', 'REJECTED', 'CONTINGENCY_OFFLINE', 'CANCELLED', 'NON_FISCAL')),
          protocol_number TEXT,
          sefaz_message TEXT NOT NULL,
          xml_content TEXT,
          qr_code_url TEXT,
          issued_at TEXT NOT NULL,
          cancelled_at TEXT,
          cancel_protocol TEXT,
          cancel_justification TEXT,
          FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE RESTRICT
        );

        -- 14. AuditLog
        CREATE TABLE IF NOT EXISTS audit_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER,
          user_name_snapshot TEXT NOT NULL,
          action TEXT NOT NULL,
          entity_type TEXT NOT NULL,
          entity_id TEXT NOT NULL,
          details TEXT NOT NULL,
          terminal_name TEXT NOT NULL DEFAULT 'CAIXA-01',
          created_at TEXT NOT NULL,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
        );

        -- System Settings (Key-Value JSON)
        CREATE TABLE IF NOT EXISTS system_settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );

        -- Performance & Lookup Indexes
        CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
        CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
        CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
        CREATE INDEX IF NOT EXISTS idx_sales_register ON sales(cash_register_id);
        CREATE INDEX IF NOT EXISTS idx_sales_created_at ON sales(created_at);
        CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);
        CREATE INDEX IF NOT EXISTS idx_payments_sale ON payments(sale_id);
        CREATE INDEX IF NOT EXISTS idx_cash_movements_register ON cash_movements(cash_register_id);
        CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id);
        CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
      `);

      db.prepare(
        'INSERT INTO schema_migrations (version, description, installed_on) VALUES (?, ?, ?)'
      ).run(
        'V1__initial_mdpdv_schema',
        'Modelagem completa MDPDV com 14 entidades, integridade referencial e índices',
        new Date().toISOString()
      );
    });

    migrateTx();
  }

  seedInitialDataIfNeeded(db);
}

function seedInitialDataIfNeeded(db: Database.Database): void {
  const roleCount = (
    db.prepare('SELECT COUNT(*) as cnt FROM roles').get() as { cnt: number }
  ).cnt;
  if (roleCount > 0) return;

  const seedTx = db.transaction(() => {
    const nowIso = new Date().toISOString();

    // 1. Insert Permissions
    const permDescriptions: Record<string, string> = {
      [PERMISSIONS.POS_SELL]: 'Registrar vendas no PDV',
      [PERMISSIONS.POS_DISCOUNT_HIGH]: 'Conceder descontos manuais acima do limite do operador',
      [PERMISSIONS.POS_CANCEL_SALE]: 'Cancelar vendas finalizadas',
      [PERMISSIONS.CASH_OPEN]: 'Abrir turno de caixa',
      [PERMISSIONS.CASH_CLOSE]: 'Realizar conferência e fechamento de caixa',
      [PERMISSIONS.CASH_MOVEMENT]: 'Registrar sangria e suprimento',
      [PERMISSIONS.CASH_REVERSE]: 'Estornar movimentações financeiras de caixa',
      [PERMISSIONS.PRODUCT_MANAGE]: 'Cadastrar e editar produtos, categorias e preços',
      [PERMISSIONS.PROMOTION_MANAGE]: 'Configurar promoções e combos comerciais',
      [PERMISSIONS.STOCK_ADJUST]: 'Realizar entradas, ajustes e baixas de perdas no estoque',
      [PERMISSIONS.FISCAL_MANAGE]: 'Gerenciar parâmetros fiscais SEFAZ e NFC-e',
      [PERMISSIONS.REPORT_VIEW]: 'Visualizar relatórios financeiros, margens e gráficos',
      [PERMISSIONS.USER_MANAGE]: 'Gerenciar usuários, bloqueios e perfis de acesso',
      [PERMISSIONS.BACKUP_MANAGE]: 'Executar backup e restauração do banco SQLite',
      [PERMISSIONS.AUDIT_VIEW]: 'Consultar trilha completa de auditoria',
    };

    const insertPerm = db.prepare(
      'INSERT INTO permissions (code, description) VALUES (?, ?)'
    );
    const permIdByCode = new Map<string, number>();
    for (const [code, desc] of Object.entries(permDescriptions)) {
      const info = insertPerm.run(code, desc);
      permIdByCode.set(code, Number(info.lastInsertRowid));
    }

    // 2. Insert Roles (RF01: Administrador, Gerente, Supervisor, Operador de caixa)
    const rolesDef = [
      {
        code: 'ADMIN',
        name: 'Administrador',
        description: 'Acesso integral ao sistema, segurança, usuários, fiscal e backups.',
        perms: Object.values(PERMISSIONS),
      },
      {
        code: 'GERENTE',
        name: 'Gerente',
        description: 'Gestão comercial completa, estoque, relatórios, promoções e autorizações.',
        perms: [
          PERMISSIONS.POS_SELL,
          PERMISSIONS.POS_DISCOUNT_HIGH,
          PERMISSIONS.POS_CANCEL_SALE,
          PERMISSIONS.CASH_OPEN,
          PERMISSIONS.CASH_CLOSE,
          PERMISSIONS.CASH_MOVEMENT,
          PERMISSIONS.CASH_REVERSE,
          PERMISSIONS.PRODUCT_MANAGE,
          PERMISSIONS.PROMOTION_MANAGE,
          PERMISSIONS.STOCK_ADJUST,
          PERMISSIONS.FISCAL_MANAGE,
          PERMISSIONS.REPORT_VIEW,
          PERMISSIONS.AUDIT_VIEW,
        ],
      },
      {
        code: 'SUPERVISOR',
        name: 'Supervisor',
        description: 'Supervisão de frente de caixa, autorizações de desconto, estorno e cancelamento.',
        perms: [
          PERMISSIONS.POS_SELL,
          PERMISSIONS.POS_DISCOUNT_HIGH,
          PERMISSIONS.POS_CANCEL_SALE,
          PERMISSIONS.CASH_OPEN,
          PERMISSIONS.CASH_CLOSE,
          PERMISSIONS.CASH_MOVEMENT,
          PERMISSIONS.CASH_REVERSE,
          PERMISSIONS.STOCK_ADJUST,
          PERMISSIONS.REPORT_VIEW,
        ],
      },
      {
        code: 'OPERADOR',
        name: 'Operador de Caixa',
        description: 'Operação ágil de PDV, abertura/fechamento de caixa e sangria/suprimento.',
        perms: [
          PERMISSIONS.POS_SELL,
          PERMISSIONS.CASH_OPEN,
          PERMISSIONS.CASH_CLOSE,
          PERMISSIONS.CASH_MOVEMENT,
        ],
      },
    ];

    const insertRole = db.prepare(
      'INSERT INTO roles (code, name, description) VALUES (?, ?, ?)'
    );
    const insertRolePerm = db.prepare(
      'INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)'
    );
    const roleIdByCode = new Map<string, number>();

    for (const r of rolesDef) {
      const info = insertRole.run(r.code, r.name, r.description);
      const roleId = Number(info.lastInsertRowid);
      roleIdByCode.set(r.code, roleId);
      for (const pCode of r.perms) {
        const permId = permIdByCode.get(pCode);
        if (permId) insertRolePerm.run(roleId, permId);
      }
    }

    // 3. Insert Users with real BCrypt hashes
    const insertUser = db.prepare(`
      INSERT INTO users (username, full_name, password_hash, role_id, active, locked, failed_attempts, last_login_at, created_at)
      VALUES (?, ?, ?, ?, 1, 0, 0, ?, ?)
    `);

    const adminId = Number(
      insertUser.run(
        'admin',
        'Carlos Eduardo Mendes',
        bcrypt.hashSync('admin123', 10),
        roleIdByCode.get('ADMIN')!,
        nowIso,
        nowIso
      ).lastInsertRowid
    );
    const managerId = Number(
      insertUser.run(
        'gerente',
        'Helena Ribeiro Costa',
        bcrypt.hashSync('gerente123', 10),
        roleIdByCode.get('GERENTE')!,
        nowIso,
        nowIso
      ).lastInsertRowid
    );
    const supervisorId = Number(
      insertUser.run(
        'supervisor',
        'Marcos Vinícius Alves',
        bcrypt.hashSync('super123', 10),
        roleIdByCode.get('SUPERVISOR')!,
        nowIso,
        nowIso
      ).lastInsertRowid
    );
    const operatorId = Number(
      insertUser.run(
        'operador',
        'Beatriz Nogueira Lima',
        bcrypt.hashSync('caixa123', 10),
        roleIdByCode.get('OPERADOR')!,
        nowIso,
        nowIso
      ).lastInsertRowid
    );

    // 4. Default System Settings
    const defaultSettings = {
      companyName: 'MERCADO E EMPÓRIO DUNA COMÉRCIO DE ALIMENTOS LTDA',
      tradeName: 'Empório Duna — Unidade Centro',
      cnpj: '42.819.370/0001-64',
      ie: '148.920.331.114',
      address: 'Av. Sete de Setembro, 1420 — Centro',
      cityUf: 'Ribeirão Preto - SP',
      terminalName: 'CAIXA-01',
      fiscalMode: 'NFCe_65',
      fiscalEnvironment: 'HOMOLOGACAO',
      sefazConnectivity: 'ONLINE',
      cscId: '000001',
      cscToken: 'HML-9A8B7C6D-MDPDV-SEFAZ-2026',
      certificateConfigured: true,
      certificateSubject: 'CN=MERCADO E EMPORIO DUNA LTDA:42819370000164 (ICP-Brasil A1)',
      nfceSeries: 1,
      nextNfceNumber: 1005,
      maxOperatorDiscountPercent: 5,
    };

    const insertSetting = db.prepare(
      'INSERT INTO system_settings (key, value) VALUES (?, ?)'
    );
    for (const [k, v] of Object.entries(defaultSettings)) {
      insertSetting.run(k, JSON.stringify(v));
    }

    // 5. Categories
    const categories = [
      ['Bebidas', 'Cervejas, águas, sucos e refrigerantes', '22030000'],
      ['Mercearia', 'Grãos, cafés, azeites e itens secos', '09012100'],
      ['Padaria & Confeitaria', 'Pães artesanais, biscoitos e bolos', '19059090'],
      ['Laticínios & Frios', 'Leites, queijos maturados e manteigas', '04069020'],
      ['Doces & Chocolates', 'Chocolates, barras e confeitaria fina', '18063210'],
      ['Limpeza & Utilidades', 'Higiene doméstica e cuidados diários', '34022000'],
    ];
    const insertCategory = db.prepare(
      'INSERT INTO categories (name, description, ncm_default, active) VALUES (?, ?, ?, 1)'
    );
    const catIds: number[] = [];
    for (const [name, desc, ncm] of categories) {
      catIds.push(Number(insertCategory.run(name, desc, ncm).lastInsertRowid));
    }

    // 6. Products (14 realistic Brazilian items)
    const productsSeed = [
      {
        sku: 'BEB-001',
        barcode: '7891149100019',
        name: 'Cerveja Pilsen Puro Malte Lata 350ml',
        description: 'Lata 350ml gelada — elegível à promoção Pack 12 por R$ 42,00',
        cat: catIds[0],
        unit: 'UN',
        cost: 2.95,
        sale: 5.0,
        promo: null,
        stock: 144,
        min: 36,
        ncm: '22030000',
      },
      {
        sku: 'BEB-002',
        barcode: '7894900011517',
        name: 'Refrigerante Guaraná Tradicional 2L',
        description: 'Garrafa PET 2 Litros',
        cat: catIds[0],
        unit: 'UN',
        cost: 5.8,
        sale: 9.5,
        promo: null,
        stock: 48,
        min: 15,
        ncm: '22021000',
      },
      {
        sku: 'BEB-003',
        barcode: '7896005800027',
        name: 'Água Mineral Sem Gás Fonte Natural 500ml',
        description: 'Garrafa individual 500ml',
        cat: catIds[0],
        unit: 'UN',
        cost: 1.1,
        sale: 3.0,
        promo: null,
        stock: 92,
        min: 24,
        ncm: '22011000',
      },
      {
        sku: 'MER-001',
        barcode: '7896089011358',
        name: 'Café Torrado e Moído Especial 500g',
        description: 'Torra média 100% Arábica — pacote a vácuo 500g',
        cat: catIds[1],
        unit: 'UN',
        cost: 14.2,
        sale: 22.9,
        promo: null,
        stock: 34,
        min: 10,
        ncm: '09012100',
      },
      {
        sku: 'MER-002',
        barcode: '7896006711155',
        name: 'Arroz Agulhinha Tipo 1 Selecionado 5kg',
        description: 'Fardo individual 5kg longo fino',
        cat: catIds[1],
        unit: 'UN',
        cost: 21.5,
        sale: 29.9,
        promo: 27.9,
        stock: 22,
        min: 10,
        ncm: '10063021',
      },
      {
        sku: 'MER-003',
        barcode: '5601012005004',
        name: 'Azeite de Oliva Extra Virgem 500ml',
        description: 'Acidez máxima 0,4% — vidro escuro 500ml',
        cat: catIds[1],
        unit: 'UN',
        cost: 34.0,
        sale: 49.9,
        promo: null,
        stock: 7, // Below minStock (10) -> triggers Stock Replenishment Alert!
        min: 10,
        ncm: '15091000',
      },
      {
        sku: 'PAD-001',
        barcode: '7898215150101',
        name: 'Biscoito Amanteigado Castanha-do-Pará 300g',
        description: 'Produção artesanal em lata/pacote 300g',
        cat: catIds[2],
        unit: 'UN',
        cost: 8.4,
        sale: 15.0,
        promo: null,
        stock: 28,
        min: 8,
        ncm: '19053100',
      },
      {
        sku: 'PAD-002',
        barcode: '7898215150224',
        name: 'Pão de Queijo Mineiro Congelado 400g',
        description: 'Receita tradicional com queijo meia cura',
        cat: catIds[2],
        unit: 'UN',
        cost: 9.8,
        sale: 16.9,
        promo: null,
        stock: 19,
        min: 8,
        ncm: '19012000',
      },
      {
        sku: 'LAT-001',
        barcode: '7891000100103',
        name: 'Leite UHT Integral 1 Litro',
        description: 'Caixa Tetra Pak 1L — desconto na caixa fechada com 12 un',
        cat: catIds[3],
        unit: 'UN',
        cost: 3.75,
        sale: 5.5,
        promo: null,
        stock: 76,
        min: 24,
        ncm: '04012010',
      },
      {
        sku: 'LAT-002',
        barcode: '7896259410128',
        name: 'Queijo Minas Meia Cura Peça 500g',
        description: 'Maturação controlada 15 dias',
        cat: catIds[3],
        unit: 'UN',
        cost: 22.0,
        sale: 35.9,
        promo: null,
        stock: 5, // Below minStock (8) -> triggers Stock Replenishment Alert!
        min: 8,
        ncm: '04069020',
      },
      {
        sku: 'DOC-001',
        barcode: '7891008100112',
        name: 'Chocolate Meio Amargo 60% Cacau 90g',
        description: 'Barra 90g — participa do Combo Pausa do Café',
        cat: catIds[4],
        unit: 'UN',
        cost: 6.1,
        sale: 10.9,
        promo: null,
        stock: 40,
        min: 12,
        ncm: '18063210',
      },
      {
        sku: 'LIM-001',
        barcode: '7891150056404',
        name: 'Lava-Roupas Líquido Concentrado 2L',
        description: 'Rende 40 lavagens',
        cat: catIds[5],
        unit: 'UN',
        cost: 16.5,
        sale: 26.9,
        promo: null,
        stock: 16,
        min: 6,
        ncm: '34022000',
      },
    ];

    const insertProduct = db.prepare(`
      INSERT INTO products (
        sku, barcode, name, description, category_id, unit,
        cost_price, sale_price, promotional_price, stock_quantity, min_stock,
        ncm, cfop, active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '5102', 1, ?, ?)
    `);
    const insertStockMov = db.prepare(`
      INSERT INTO stock_movements (
        product_id, type, quantity, previous_stock, new_stock, unit_cost, reason, reference_id, user_id, created_at
      ) VALUES (?, 'ENTRY', ?, 0, ?, ?, 'Saldo inicial de implantação do estoque', 'NF-ENT-001', ?, ?)
    `);

    const prodIdBySku = new Map<string, number>();
    for (const p of productsSeed) {
      const res = insertProduct.run(
        p.sku,
        p.barcode,
        p.name,
        p.description,
        p.cat,
        p.unit,
        p.cost,
        p.sale,
        p.promo,
        p.stock,
        p.min,
        p.ncm,
        nowIso,
        nowIso
      );
      const pid = Number(res.lastInsertRowid);
      prodIdBySku.set(p.sku, pid);
      insertStockMov.run(pid, p.stock, p.stock, p.cost, managerId, nowIso);
    }

    // 7. Promotions (RF03 including exact prompt example: 12 beers for R$ 42,00!)
    const insertPromo = db.prepare(`
      INSERT INTO promotions (
        name, description, type, product_id, combo_product_id, combo_qty,
        min_quantity, promo_value, start_date, end_date, active, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
    `);

    // Exact RF03 Prompt Rule: 1 un = R$ 5,00 | 12 un = R$ 42,00
    insertPromo.run(
      'Pack 12 Cervejas por R$ 42,00',
      'Leve 12 latas de Cerveja Pilsen 350ml e pague R$ 42,00 (R$ 3,50/un em vez de R$ 5,00/un)',
      'QUANTITY_FIXED',
      prodIdBySku.get('BEB-001')!,
      null,
      null,
      12,
      42.0,
      '2026-01-01',
      '2027-12-31',
      nowIso
    );

    // Caixa Fechada Leite 12L por R$ 54,00 (R$ 4,50/L em vez de R$ 5,50)
    insertPromo.run(
      'Caixa Fechada 12 Leites por R$ 54,00',
      'Na compra de 12 unidades de Leite UHT Integral 1L, o pacote sai por R$ 54,00',
      'QUANTITY_FIXED',
      prodIdBySku.get('LAT-001')!,
      null,
      null,
      12,
      54.0,
      '2026-01-01',
      '2027-12-31',
      nowIso
    );

    // Leve 3 Pague 2 em Água Mineral 500ml
    insertPromo.run(
      'Leve 3 Pague 2 — Água Mineral 500ml',
      'A cada 3 garrafas de Água Mineral 500ml, 1 unidade sai gratuita',
      'BUY_X_PAY_Y',
      prodIdBySku.get('BEB-003')!,
      null,
      null,
      3,
      2,
      '2026-01-01',
      '2027-12-31',
      nowIso
    );

    // Desconto Percentual 15% a partir de 2 Biscoitos Amanteigados
    insertPromo.run(
      '15% OFF em 2+ Biscoitos Amanteigados',
      'Desconto automático de 15% comprando 2 ou mais pacotes de Biscoito Amanteigado 300g',
      'PERCENTAGE',
      prodIdBySku.get('PAD-001')!,
      null,
      null,
      2,
      15,
      '2026-01-01',
      '2027-12-31',
      nowIso
    );

    // Combo Comercial: Café Especial 500g + Chocolate 60% 90g (R$ 33,80 -> R$ 28,90)
    insertPromo.run(
      'Combo Pausa do Café (Café + Chocolate)',
      '1 Café Torrado Especial 500g + 1 Chocolate 60% Cacau 90g por R$ 28,90',
      'COMBO',
      prodIdBySku.get('MER-001')!,
      prodIdBySku.get('DOC-001')!,
      1,
      1,
      28.9,
      '2026-01-01',
      '2027-12-31',
      nowIso
    );

    // 8. Seed 2 Historical CLOSED Cash Registers & 4 Completed Sales
    // IMPORTANT: Keep NO OPEN cash register initially so Tela Inicial displays "CAIXA LIVRE" per Section 7.1!
    const dayMinus2Open = new Date(Date.now() - 2 * 86400000 - 8 * 3600000).toISOString();
    const dayMinus2Sale1 = new Date(Date.now() - 2 * 86400000 - 6 * 3600000).toISOString();
    const dayMinus2Sale2 = new Date(Date.now() - 2 * 86400000 - 4 * 3600000).toISOString();
    const dayMinus2Close = new Date(Date.now() - 2 * 86400000 - 1 * 3600000).toISOString();

    const dayMinus1Open = new Date(Date.now() - 1 * 86400000 - 8 * 3600000).toISOString();
    const dayMinus1Sale1 = new Date(Date.now() - 1 * 86400000 - 5 * 3600000).toISOString();
    const dayMinus1Bleed = new Date(Date.now() - 1 * 86400000 - 3 * 3600000).toISOString();
    const dayMinus1Sale2 = new Date(Date.now() - 1 * 86400000 - 2 * 3600000).toISOString();
    const dayMinus1Close = new Date(Date.now() - 1 * 86400000 - 30 * 60000).toISOString();

    const insertReg = db.prepare(`
      INSERT INTO cash_registers (
        code, terminal_name, opened_by_user_id, closed_by_user_id, opened_at, closed_at,
        opening_balance, expected_cash_balance, counted_cash_balance, difference_amount,
        total_cash_sales, total_pix_sales, total_debit_sales, total_credit_sales, total_vale_sales,
        total_supply, total_bleed, closing_notes, status
      ) VALUES (?, 'CAIXA-01', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, 'CLOSED')
    `);

    const reg1Id = Number(
      insertReg.run(
        'CX-2026-0001',
        operatorId,
        operatorId,
        dayMinus2Open,
        dayMinus2Close,
        150.0,
        229.8, // 150 + 79.80 cash sales
        229.8,
        0.0,
        79.8,
        60.9,
        0,
        0,
        0,
        0,
        'Conferência de fechamento exata sem divergências.'
      ).lastInsertRowid
    );

    const reg2Id = Number(
      insertReg.run(
        'CX-2026-0002',
        operatorId,
        supervisorId,
        dayMinus1Open,
        dayMinus1Close,
        200.0,
        202.0, // 200 + 42.00 cash + 40.00 supply - 80.00 bleed
        202.0,
        0.0,
        42.0,
        54.0,
        65.8,
        79.7,
        40.0,
        80.0,
        'Turno encerrado após sangria para cofre central.'
      ).lastInsertRowid
    );

    const insertCashMov = db.prepare(`
      INSERT INTO cash_movements (
        cash_register_id, type, amount, reason, user_id, authorized_by_user_id, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', ?)
    `);

    insertCashMov.run(reg1Id, 'OPENING', 150.0, 'Fundo de troco inicial do turno', operatorId, null, dayMinus2Open);
    insertCashMov.run(reg2Id, 'OPENING', 200.0, 'Fundo de troco inicial do turno', operatorId, null, dayMinus1Open);
    insertCashMov.run(reg2Id, 'SUPPLY', 40.0, 'Reforço de moedas e cédulas de R$ 2 e R$ 5', operatorId, supervisorId, dayMinus1Sale1);
    insertCashMov.run(reg2Id, 'BLEED', 80.0, 'Sangria de segurança para cofre da gerência', operatorId, supervisorId, dayMinus1Bleed);

    // Helper to insert historical sale + items + payment + fiscal doc
    const insertSaleStmt = db.prepare(`
      INSERT INTO sales (
        sale_number, idempotency_key, cash_register_id, operator_user_id, customer_cpf,
        subtotal, promo_discount_total, manual_discount_total, total_amount, change_amount, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 'COMPLETED', ?)
    `);
    const insertSaleItemStmt = db.prepare(`
      INSERT INTO sale_items (
        sale_id, product_id, product_name_snapshot, sku_snapshot, barcode_snapshot, unit_snapshot,
        quantity, unit_cost_snapshot, unit_price_snapshot, promo_applied_name, promo_discount_amount, manual_discount_share, line_total
      ) VALUES (?, ?, ?, ?, ?, 'UN', ?, ?, ?, ?, ?, 0, ?)
    `);
    const insertPaymentStmt = db.prepare(`
      INSERT INTO payments (sale_id, method, amount, tendered_amount, change_amount, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const insertFiscalStmt = db.prepare(`
      INSERT INTO fiscal_documents (
        sale_id, model, series, number, access_key, environment, status, protocol_number, sefaz_message, xml_content, qr_code_url, issued_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const historicalSales = [
      {
        num: 'VD-2026-0001',
        regId: reg1Id,
        createdAt: dayMinus2Sale1,
        cpf: '31849201844',
        subtotal: 89.8,
        promoDisc: 10.0,
        total: 79.8,
        change: 20.2,
        method: 'DINHEIRO' as const,
        tendered: 100.0,
        nfce: 1001,
        lines: [
          {
            sku: 'MER-002',
            name: 'Arroz Agulhinha Tipo 1 Selecionado 5kg',
            barcode: '7896006711155',
            qty: 2,
            cost: 21.5,
            price: 29.9,
            promo: 'Preço Promocional',
            disc: 4.0,
            total: 55.8,
          },
          {
            sku: 'BEB-003',
            name: 'Água Mineral Sem Gás Fonte Natural 500ml',
            barcode: '7896005800027',
            qty: 10,
            cost: 1.1,
            price: 3.0,
            promo: 'Leve 3 Pague 2 — Água Mineral 500ml',
            disc: 6.0,
            total: 24.0,
          },
        ],
      },
      {
        num: 'VD-2026-0002',
        regId: reg1Id,
        createdAt: dayMinus2Sale2,
        cpf: null,
        subtotal: 65.8,
        promoDisc: 4.9,
        total: 60.9,
        change: 0,
        method: 'PIX' as const,
        tendered: 60.9,
        nfce: 1002,
        lines: [
          {
            sku: 'MER-001',
            name: 'Café Torrado e Moído Especial 500g',
            barcode: '7896089011358',
            qty: 1,
            cost: 14.2,
            price: 22.9,
            promo: 'Combo Pausa do Café (Café + Chocolate)',
            disc: 3.32,
            total: 19.58,
          },
          {
            sku: 'DOC-001',
            name: 'Chocolate Meio Amargo 60% Cacau 90g',
            barcode: '7891008100112',
            qty: 1,
            cost: 6.1,
            price: 10.9,
            promo: 'Combo Pausa do Café (Café + Chocolate)',
            disc: 1.58,
            total: 9.32,
          },
          {
            sku: 'PAD-002',
            name: 'Pão de Queijo Mineiro Congelado 400g',
            barcode: '7898215150224',
            qty: 2,
            cost: 9.8,
            price: 16.0,
            promo: null,
            disc: 0,
            total: 32.0,
          },
        ],
      },
      {
        num: 'VD-2026-0003',
        regId: reg2Id,
        createdAt: dayMinus1Sale1,
        cpf: '10928374655',
        subtotal: 126.0,
        promoDisc: 30.0,
        total: 96.0,
        change: 8.0,
        splitPayments: [
          { method: 'DINHEIRO' as const, amount: 42.0, tendered: 50.0, change: 8.0 },
          { method: 'PIX' as const, amount: 54.0, tendered: 54.0, change: 0 },
        ],
        nfce: 1003,
        lines: [
          {
            sku: 'BEB-001',
            name: 'Cerveja Pilsen Puro Malte Lata 350ml',
            barcode: '7891149100019',
            qty: 12,
            cost: 2.95,
            price: 5.0,
            promo: 'Pack 12 Cervejas por R$ 42,00',
            disc: 18.0,
            total: 42.0,
          },
          {
            sku: 'LAT-001',
            name: 'Leite UHT Integral 1 Litro',
            barcode: '7891000100103',
            qty: 12,
            cost: 3.75,
            price: 5.5,
            promo: 'Caixa Fechada 12 Leites por R$ 54,00',
            disc: 12.0,
            total: 54.0,
          },
        ],
      },
      {
        num: 'VD-2026-0004',
        regId: reg2Id,
        createdAt: dayMinus1Sale2,
        cpf: null,
        subtotal: 150.0,
        promoDisc: 4.5,
        total: 145.5,
        change: 0,
        splitPayments: [
          { method: 'DEBITO' as const, amount: 65.8, tendered: 65.8, change: 0 },
          { method: 'CREDITO' as const, amount: 79.7, tendered: 79.7, change: 0 },
        ],
        nfce: 1004,
        lines: [
          {
            sku: 'MER-003',
            name: 'Azeite de Oliva Extra Virgem 500ml',
            barcode: '5601012005004',
            qty: 1,
            cost: 34.0,
            price: 49.9,
            promo: null,
            disc: 0,
            total: 49.9,
          },
          {
            sku: 'LAT-002',
            name: 'Queijo Minas Meia Cura Peça 500g',
            barcode: '7896259410128',
            qty: 2,
            cost: 22.0,
            price: 35.05,
            promo: null,
            disc: 0,
            total: 70.1,
          },
          {
            sku: 'PAD-001',
            name: 'Biscoito Amanteigado Castanha-do-Pará 300g',
            barcode: '7898215150101',
            qty: 2,
            cost: 8.4,
            price: 15.0,
            promo: '15% OFF em 2+ Biscoitos Amanteigados',
            disc: 4.5,
            total: 25.5,
          },
        ],
      },
    ];

    for (const hs of historicalSales) {
      const saleInfo = insertSaleStmt.run(
        hs.num,
        `seed-${hs.num}`,
        hs.regId,
        operatorId,
        hs.cpf,
        hs.subtotal,
        hs.promoDisc,
        hs.total,
        hs.change,
        hs.createdAt
      );
      const saleId = Number(saleInfo.lastInsertRowid);

      const builtItems = hs.lines.map((l, idx) => {
        const pid = prodIdBySku.get(l.sku)!;
        insertSaleItemStmt.run(
          saleId,
          pid,
          l.name,
          l.sku,
          l.barcode,
          l.qty,
          l.cost,
          l.price,
          l.promo,
          l.disc,
          l.total
        );
        return {
          id: idx + 1,
          saleId,
          productId: pid,
          productNameSnapshot: l.name,
          skuSnapshot: l.sku,
          barcodeSnapshot: l.barcode,
          unitSnapshot: 'UN',
          quantity: l.qty,
          unitCostSnapshot: l.cost,
          unitPriceSnapshot: l.price,
          promoAppliedName: l.promo,
          promoDiscountAmount: l.disc,
          manualDiscountShare: 0,
          lineTotal: l.total,
        };
      });

      const paymentsList = hs.splitPayments
        ? hs.splitPayments
        : [
            {
              method: hs.method!,
              amount: hs.total,
              tendered: hs.tendered!,
              change: hs.change,
            },
          ];

      const builtPayments = paymentsList.map((p, idx) => {
        insertPaymentStmt.run(
          saleId,
          p.method,
          p.amount,
          p.tendered,
          p.change,
          hs.createdAt
        );
        return {
          id: idx + 1,
          saleId,
          method: p.method,
          amount: p.amount,
          tenderedAmount: p.tendered,
          changeAmount: p.change,
          createdAt: hs.createdAt,
        };
      });

      const fiscal = buildFiscalEmission({
        sale: {
          id: saleId,
          saleNumber: hs.num,
          idempotencyKey: `seed-${hs.num}`,
          cashRegisterId: hs.regId,
          operatorUserId: operatorId,
          authorizedByUserId: null,
          customerCpf: hs.cpf,
          customerName: null,
          subtotal: hs.subtotal,
          promoDiscountTotal: hs.promoDisc,
          manualDiscountTotal: 0,
          manualDiscountReason: null,
          totalAmount: hs.total,
          changeAmount: hs.change,
          status: 'COMPLETED',
          cancelledByUserId: null,
          cancelReason: null,
          cancelledAt: null,
          createdAt: hs.createdAt,
        },
        items: builtItems,
        payments: builtPayments,
        settings: defaultSettings as never,
        nfceNumber: hs.nfce,
      });

      insertFiscalStmt.run(
        saleId,
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
        hs.createdAt
      );
    }

    // 9. Audit Log entries
    const insertAudit = db.prepare(`
      INSERT INTO audit_logs (user_id, user_name_snapshot, action, entity_type, entity_id, details, terminal_name, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'CAIXA-01', ?)
    `);
    insertAudit.run(
      adminId,
      'Carlos Eduardo Mendes',
      'SYSTEM_SEED',
      'Database',
      'V1__initial_mdpdv_schema',
      'Banco SQLite inicializado com integridade referencial, perfis RBAC e catálogo base.',
      dayMinus2Open
    );
    insertAudit.run(
      operatorId,
      'Beatriz Nogueira Lima',
      'CASH_CLOSE',
      'CashRegister',
      'CX-2026-0001',
      'Caixa fechado com conferência física exata (R$ 229,80 em dinheiro).',
      dayMinus2Close
    );
    insertAudit.run(
      supervisorId,
      'Marcos Vinícius Alves',
      'CASH_BLEED_AUTH',
      'CashMovement',
      'CX-2026-0002',
      'Sangria de R$ 80,00 autorizada e conferida para cofre central.',
      dayMinus1Bleed
    );
    insertAudit.run(
      supervisorId,
      'Marcos Vinícius Alves',
      'CASH_CLOSE',
      'CashRegister',
      'CX-2026-0002',
      'Caixa fechado com conferência física exata (R$ 202,00 em dinheiro; R$ 199,50 em meios eletrônicos).',
      dayMinus1Close
    );
  });

  seedTx();
}
