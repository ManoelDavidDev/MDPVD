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

export type PromotionType =
  | 'UNIT_PROMO'
  | 'PERCENTAGE'
  | 'QUANTITY_FIXED'
  | 'BUY_X_PAY_Y'
  | 'COMBO';

export type PaymentMethod = 'DINHEIRO' | 'PIX' | 'DEBITO' | 'CREDITO' | 'VALE';

export type CashRegisterStatus = 'OPEN' | 'CLOSED';

export type CashMovementType = 'OPENING' | 'SUPPLY' | 'BLEED' | 'REVERSAL';

export type StockMovementType =
  | 'ENTRY'
  | 'SALE_EXIT'
  | 'SALE_CANCEL_RETURN'
  | 'ADJUSTMENT'
  | 'LOSS_DAMAGE';

export type FiscalModel = 'NFCe_65' | 'NFe_55' | 'COMPROVANTE_NAO_FISCAL';

export type FiscalStatus =
  | 'AUTHORIZED'
  | 'REJECTED'
  | 'CONTINGENCY_OFFLINE'
  | 'CANCELLED'
  | 'NON_FISCAL';

export interface RoleEntity {
  id: number;
  code: string;
  name: string;
  description: string;
  permissions: PermissionCode[];
}

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
  status: CashRegisterStatus;
}

export interface CashMovementEntity {
  id: number;
  cashRegisterId: number;
  type: CashMovementType;
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
  model: FiscalModel;
  series: number;
  number: number;
  accessKey: string | null;
  environment: 'HOMOLOGACAO' | 'PRODUCAO';
  status: FiscalStatus;
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
  type: StockMovementType;
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
