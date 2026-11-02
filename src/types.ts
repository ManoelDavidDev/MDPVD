export const PERMISSIONS = {
  POS_SELL: 'POS_SELL',
  POS_DISCOUNT_HIGH: 'POS_DISCOUNT_HIGH',
  POS_CANCEL_SALE: 'POS_CANCEL_SALE',
  CASH_OPEN: 'CASH_OPEN',
  CASH_CLOSE: 'CASH_CLOSE',
  CASH_MOVEMENT: 'CASH_MOVEMENT',
  CASH_REVERSE: 'CASH_REVERSE',
  PRODUCT_MANAGE: 'PRODUCT_MANAGE',
  PROMOTION_MANAGE: 'PROMOTION_MANAGE',
  STOCK_ADJUST: 'STOCK_ADJUST',
  FISCAL_MANAGE: 'FISCAL_MANAGE',
  REPORT_VIEW: 'REPORT_VIEW',
  USER_MANAGE: 'USER_MANAGE',
  BACKUP_MANAGE: 'BACKUP_MANAGE',
  AUDIT_VIEW: 'AUDIT_VIEW',
} as const;

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const PERMISSION_LABELS: Record<PermissionCode, string> = {
  POS_SELL: 'Registrar vendas no PDV',
  POS_DISCOUNT_HIGH: 'Autorizar descontos acima do limite',
  POS_CANCEL_SALE: 'Cancelar vendas finalizadas',
  CASH_OPEN: 'Abrir caixa',
  CASH_CLOSE: 'Fechar e conferir caixa',
  CASH_MOVEMENT: 'Registrar sangria e suprimento',
  CASH_REVERSE: 'Estornar movimentações financeiras',
  PRODUCT_MANAGE: 'Cadastrar e alterar produtos e preços',
  PROMOTION_MANAGE: 'Gerenciar promoções e combos',
  STOCK_ADJUST: 'Entradas, ajustes e baixas de estoque',
  FISCAL_MANAGE: 'Configurar emissão fiscal e SEFAZ',
  REPORT_VIEW: 'Visualizar relatórios e gráficos gerenciais',
  USER_MANAGE: 'Gerenciar usuários e permissões',
  BACKUP_MANAGE: 'Executar backup e restauração SQLite',
  AUDIT_VIEW: 'Consultar registros de auditoria',
};

export type NavigationTab =
  | 'inicio'
  | 'vendas'
  | 'produtos'
  | 'estoque'
  | 'caixa'
  | 'movimentacoes'
  | 'relatorios'
  | 'usuarios'
  | 'configuracoes';

export type PaymentMethod = 'DINHEIRO' | 'PIX' | 'DEBITO' | 'CREDITO' | 'VALE';

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  DINHEIRO: 'Dinheiro',
  PIX: 'PIX',
  DEBITO: 'Cartão de Débito',
  CREDITO: 'Cartão de Crédito',
  VALE: 'Vale / Convênio',
};

export type PromotionType =
  | 'UNIT_PROMO'
  | 'PERCENTAGE'
  | 'QUANTITY_FIXED'
  | 'BUY_X_PAY_Y'
  | 'COMBO';

export const PROMOTION_TYPE_LABELS: Record<PromotionType, string> = {
  QUANTITY_FIXED: 'Preço Fixo por Quantidade (Pack)',
  BUY_X_PAY_Y: 'Leve Mais, Pague Menos (Leve X Pague Y)',
  PERCENTAGE: 'Desconto Percentual (%)',
  UNIT_PROMO: 'Preço Unitário Promocional',
  COMBO: 'Combo Comercial (2 Produtos)',
};

export interface UserEntity {
  id: number;
  username: string;
  fullName: string;
  roleId: number;
  roleCode: string;
  roleName: string;
  active: boolean;
  locked: boolean;
  failedAttempts: number;
  lastLoginAt: string | null;
  createdAt: string;
  permissions: PermissionCode[];
}

export interface RoleEntity {
  id: number;
  code: string;
  name: string;
  description: string;
  permissions: PermissionCode[];
}

export interface CategoryEntity {
  id: number;
  name: string;
  description: string;
  ncmDefault: string;
  active: boolean;
}

export interface ProductEntity {
  id: number;
  sku: string;
  barcode: string;
  name: string;
  description: string;
  categoryId: number;
  categoryName?: string;
  unit: string;
  costPrice: number;
  salePrice: number;
  promotionalPrice: number | null;
  stockQuantity: number;
  minStock: number;
  ncm: string;
  cfop: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PromotionEntity {
  id: number;
  name: string;
  description: string;
  type: PromotionType;
  productId: number;
  productName?: string;
  comboProductId: number | null;
  comboProductName?: string | null;
  comboQty: number | null;
  minQuantity: number;
  promoValue: number;
  startDate: string | null;
  endDate: string | null;
  active: boolean;
  createdAt: string;
}

export interface EvaluatedCartLine {
  productId: number;
  sku: string;
  barcode: string;
  name: string;
  unit: string;
  quantity: number;
  unitCost: number;
  unitPrice: number;
  grossTotal: number;
  promoAppliedId: number | null;
  promoAppliedName: string | null;
  promoDiscountAmount: number;
  netBeforeManualTotal: number;
  manualDiscountShare: number;
  finalLineTotal: number;
  stockAvailable: number;
}

export interface CartEvaluationResult {
  lines: EvaluatedCartLine[];
  subtotal: number;
  promoDiscountTotal: number;
  netAfterPromos: number;
  manualDiscountTotal: number;
  totalAmount: number;
}

export interface CashRegisterEntity {
  id: number;
  code: string;
  terminalName: string;
  openedByUserId: number;
  openedByName?: string;
  closedByUserId: number | null;
  closedByName?: string | null;
  openedAt: string;
  closedAt: string | null;
  openingBalance: number;
  expectedCashBalance: number;
  countedCashBalance: number | null;
  differenceAmount: number | null;
  totalCashSales: number;
  totalPixSales: number;
  totalDebitSales: number;
  totalCreditSales: number;
  totalValeSales: number;
  totalSupply: number;
  totalBleed: number;
  closingNotes: string | null;
  status: 'OPEN' | 'CLOSED';
}

export interface CashMovementEntity {
  id: number;
  cashRegisterId: number;
  type: 'OPENING' | 'SUPPLY' | 'BLEED' | 'REVERSAL';
  amount: number;
  reason: string;
  userId: number;
  userName?: string;
  authorizedByUserId: number | null;
  authorizedByName?: string | null;
  referenceMovementId: number | null;
  status: 'ACTIVE' | 'REVERSED';
  createdAt: string;
}

export interface SaleItemEntity {
  id: number;
  saleId: number;
  productId: number;
  productNameSnapshot: string;
  skuSnapshot: string;
  barcodeSnapshot: string;
  unitSnapshot: string;
  quantity: number;
  unitCostSnapshot: number;
  unitPriceSnapshot: number;
  promoAppliedName: string | null;
  promoDiscountAmount: number;
  manualDiscountShare: number;
  lineTotal: number;
}

export interface PaymentEntity {
  id: number;
  saleId: number;
  method: PaymentMethod;
  amount: number;
  tenderedAmount: number;
  changeAmount: number;
  createdAt: string;
}

export interface FiscalDocumentEntity {
  id: number;
  saleId: number;
  model: 'NFCe_65' | 'NFe_55' | 'COMPROVANTE_NAO_FISCAL';
  series: number;
  number: number;
  accessKey: string | null;
  environment: 'HOMOLOGACAO' | 'PRODUCAO';
  status:
    | 'AUTHORIZED'
    | 'REJECTED'
    | 'CONTINGENCY_OFFLINE'
    | 'CANCELLED'
    | 'NON_FISCAL';
  protocolNumber: string | null;
  sefazMessage: string;
  xmlContent: string | null;
  qrCodeUrl: string | null;
  issuedAt: string;
  cancelledAt: string | null;
  cancelProtocol: string | null;
  cancelJustification: string | null;
}

export interface SaleEntity {
  id: number;
  saleNumber: string;
  idempotencyKey: string;
  cashRegisterId: number;
  operatorUserId: number;
  operatorName?: string;
  authorizedByUserId: number | null;
  authorizedByName?: string | null;
  customerCpf: string | null;
  customerName: string | null;
  subtotal: number;
  promoDiscountTotal: number;
  manualDiscountTotal: number;
  manualDiscountReason: string | null;
  totalAmount: number;
  changeAmount: number;
  status: 'COMPLETED' | 'CANCELLED';
  cancelledByUserId: number | null;
  cancelledByName?: string | null;
  cancelReason: string | null;
  cancelledAt: string | null;
  createdAt: string;
  items?: SaleItemEntity[];
  payments?: PaymentEntity[];
  fiscalDocument?: FiscalDocumentEntity | null;
}

export interface StockMovementEntity {
  id: number;
  productId: number;
  productName?: string;
  productSku?: string;
  productUnit?: string;
  type: 'ENTRY' | 'SALE_EXIT' | 'SALE_CANCEL_RETURN' | 'ADJUSTMENT' | 'LOSS_DAMAGE';
  quantity: number;
  previousStock: number;
  newStock: number;
  unitCost: number;
  reason: string;
  referenceId: string | null;
  userId: number;
  userName?: string;
  authorizedByUserId: number | null;
  authorizedByName?: string | null;
  createdAt: string;
}

export interface AuditLogEntity {
  id: number;
  userId: number | null;
  userNameSnapshot: string;
  action: string;
  entityType: string;
  entityId: string;
  details: string;
  terminalName: string;
  createdAt: string;
}

export interface SystemSettings {
  companyName: string;
  tradeName: string;
  cnpj: string;
  ie: string;
  address: string;
  cityUf: string;
  terminalName: string;
  fiscalMode: 'NFCe_65' | 'COMPROVANTE_NAO_FISCAL';
  fiscalEnvironment: 'HOMOLOGACAO' | 'PRODUCAO';
  sefazConnectivity: 'ONLINE' | 'OFFLINE_CONTINGENCY' | 'SIMULATE_REJECTION';
  cscId: string;
  cscToken: string;
  certificateConfigured: boolean;
  certificateSubject: string;
  nfceSeries: number;
  nextNfceNumber: number;
  maxOperatorDiscountPercent: number;
}

export interface BackupEntry {
  filename: string;
  sizeBytes: number;
  createdAt: string;
}

export interface JavaReferenceFile {
  path: string;
  language: string;
  description: string;
  content: string;
}

const brlFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

export function formatCurrency(value: number): string {
  return brlFormatter.format(Number.isFinite(value) ? value : 0);
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatAccessKey(key: string | null | undefined): string {
  if (!key) return '—';
  return key.replace(/(\d{4})(?=\d)/g, '$1 ');
}
