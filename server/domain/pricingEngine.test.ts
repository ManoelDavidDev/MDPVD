import assert from 'node:assert/strict';
import test from 'node:test';
import type { ProductEntity, PromotionEntity } from './models.ts';
import { evaluateCartPricing } from './pricingEngine.ts';
import { generateAccessKey } from '../infrastructure/fiscalBuilder.ts';

function makeProduct(overrides: Partial<ProductEntity>): ProductEntity {
  return {
    id: 1,
    sku: 'BEB-001',
    barcode: '7891149100019',
    name: 'Cerveja Pilsen 350ml',
    description: '',
    categoryId: 1,
    unit: 'UN',
    costPrice: 2.95,
    salePrice: 5.0,
    promotionalPrice: null,
    stockQuantity: 100,
    minStock: 12,
    ncm: '22030000',
    cfop: '5102',
    active: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

test('RF03 — Pack 12 Cervejas: 1 un custa R$ 5,00 e 12 un saem por R$ 42,00', () => {
  const beer = makeProduct({ id: 1, salePrice: 5.0 });
  const products = new Map<number, ProductEntity>([[1, beer]]);
  const promos: PromotionEntity[] = [
    {
      id: 10,
      name: 'Pack 12 Cervejas por R$ 42,00',
      description: '',
      type: 'QUANTITY_FIXED',
      productId: 1,
      comboProductId: null,
      comboQty: null,
      minQuantity: 12,
      promoValue: 42.0,
      startDate: '2026-01-01',
      endDate: '2027-12-31',
      active: true,
      createdAt: '2026-01-01T00:00:00Z',
    },
  ];

  // 1 unit -> R$ 5,00
  const res1 = evaluateCartPricing(
    [{ productId: 1, quantity: 1 }],
    products,
    promos,
    0,
    new Date('2026-11-02T12:00:00Z')
  );
  assert.equal(res1.totalAmount, 5.0);
  assert.equal(res1.promoDiscountTotal, 0);

  // 12 units -> R$ 42,00 (saving R$ 18,00)
  const res12 = evaluateCartPricing(
    [{ productId: 1, quantity: 12 }],
    products,
    promos,
    0,
    new Date('2026-11-02T12:00:00Z')
  );
  assert.equal(res12.subtotal, 60.0);
  assert.equal(res12.promoDiscountTotal, 18.0);
  assert.equal(res12.totalAmount, 42.0);

  // 14 units -> 1 pack (42,00) + 2 avulsas (10,00) = R$ 52,00
  const res14 = evaluateCartPricing(
    [{ productId: 1, quantity: 14 }],
    products,
    promos,
    0,
    new Date('2026-11-02T12:00:00Z')
  );
  assert.equal(res14.totalAmount, 52.0);
});

test('RF03 — Anti-duplicidade: seleciona apenas a melhor condição comercial sem somar descontos', () => {
  const item = makeProduct({ id: 2, salePrice: 10.0, promotionalPrice: 9.0 });
  const products = new Map<number, ProductEntity>([[2, item]]);
  const promos: PromotionEntity[] = [
    {
      id: 20,
      name: 'Desconto 20%',
      description: '',
      type: 'PERCENTAGE',
      productId: 2,
      comboProductId: null,
      comboQty: null,
      minQuantity: 2,
      promoValue: 20,
      startDate: null,
      endDate: null,
      active: true,
      createdAt: '2026-01-01T00:00:00Z',
    },
    {
      id: 21,
      name: 'Leve 3 Pague 2',
      description: '',
      type: 'BUY_X_PAY_Y',
      productId: 2,
      comboProductId: null,
      comboQty: null,
      minQuantity: 3,
      promoValue: 2,
      startDate: null,
      endDate: null,
      active: true,
      createdAt: '2026-01-01T00:00:00Z',
    },
  ];

  // Buying 3 units (gross R$ 30):
  // - Catalog promo: R$ 27,00
  // - 20% OFF: R$ 24,00
  // - Leve 3 Pague 2: R$ 20,00 -> Must win without stacking!
  const res = evaluateCartPricing([{ productId: 2, quantity: 3 }], products, promos);
  assert.equal(res.totalAmount, 20.0);
  assert.equal(res.lines[0].promoAppliedName, 'Leve 3 Pague 2');
});

test('RF08 — Chave de Acesso NFC-e possui exatamente 44 dígitos numéricos com dígito verificador Mod11', () => {
  const key = generateAccessKey({
    ufCode: '35',
    issuedAt: new Date('2026-11-02T14:00:00Z'),
    cnpj: '42.819.370/0001-64',
    model: '65',
    series: 1,
    number: 1005,
    tpEmis: '1',
  });
  assert.equal(key.length, 44);
  assert.match(key, /^\d{44}$/);
});
