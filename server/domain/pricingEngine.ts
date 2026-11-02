import type { ProductEntity, PromotionEntity } from './models.ts';

export interface CartEvaluationInputItem {
  productId: number;
  quantity: number;
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

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function isPromotionValidNow(promo: PromotionEntity, now: Date): boolean {
  if (!promo.active) return false;
  if (promo.startDate) {
    const start = new Date(promo.startDate);
    if (!Number.isNaN(start.getTime()) && now < start) return false;
  }
  if (promo.endDate) {
    const end = new Date(promo.endDate);
    // Include entire end day if date-only string
    if (promo.endDate.length === 10) {
      end.setHours(23, 59, 59, 999);
    }
    if (!Number.isNaN(end.getTime()) && now > end) return false;
  }
  return true;
}

/**
 * Pure Domain Pricing & Promotion Engine (RF03)
 *
 * Evaluates:
 * 1. Base unit price
 * 2. Product-level promotional price (promotionalPrice)
 * 3. Percentage promotion (PERCENTAGE)
 * 4. Fixed pack price by quantity (QUANTITY_FIXED) - e.g., 1 unit = R$ 5.00, 12 units = R$ 42.00
 * 5. Buy X Pay Y (BUY_X_PAY_Y) - e.g., Leve 3 Pague 2
 * 6. Commercial Combos (COMBO) - e.g., Buy Product A + Product B for fixed combo total
 *
 * Guarantees the single best commercial condition per item without stacking/duplicating discounts.
 */
export function evaluateCartPricing(
  items: CartEvaluationInputItem[],
  productsMap: Map<number, ProductEntity>,
  promotions: PromotionEntity[],
  manualDiscountInput: number = 0,
  now: Date = new Date()
): CartEvaluationResult {
  const validPromos = promotions.filter((p) => isPromotionValidNow(p, now));

  // Consolidate duplicate product lines if any
  const consolidated = new Map<number, number>();
  for (const item of items) {
    if (item.quantity <= 0) continue;
    consolidated.set(item.productId, (consolidated.get(item.productId) ?? 0) + item.quantity);
  }

  // First evaluate best single-product pricing per line
  interface CandidateChoice {
    netTotal: number;
    promoId: number | null;
    promoName: string | null;
  }

  const singleBestMap = new Map<number, CandidateChoice>();

  for (const [productId, quantity] of consolidated.entries()) {
    const product = productsMap.get(productId);
    if (!product) continue;

    const grossTotal = roundMoney(quantity * product.salePrice);
    let best: CandidateChoice = {
      netTotal: grossTotal,
      promoId: null,
      promoName: null,
    };

    // Candidate A: Product promotionalPrice field
    if (
      product.promotionalPrice !== null &&
      product.promotionalPrice > 0 &&
      product.promotionalPrice < product.salePrice
    ) {
      const candidateTotal = roundMoney(quantity * product.promotionalPrice);
      if (candidateTotal < best.netTotal) {
        best = {
          netTotal: candidateTotal,
          promoId: null,
          promoName: 'Preço Promocional',
        };
      }
    }

    // Candidate B: Active item-level promotions
    const productPromos = validPromos.filter(
      (p) => p.productId === productId && p.type !== 'COMBO'
    );

    for (const promo of productPromos) {
      if (quantity < promo.minQuantity) continue;

      let candidateTotal = grossTotal;

      if (promo.type === 'UNIT_PROMO') {
        candidateTotal = roundMoney(quantity * promo.promoValue);
      } else if (promo.type === 'PERCENTAGE') {
        const factor = Math.max(0, Math.min(100, promo.promoValue)) / 100;
        candidateTotal = roundMoney(grossTotal * (1 - factor));
      } else if (promo.type === 'QUANTITY_FIXED') {
        // Ex: 1 cerveja = R$ 5,00; 12 cervejas = R$ 42,00
        const packSize = Math.max(1, Math.floor(promo.minQuantity));
        const packs = Math.floor(quantity / packSize);
        const remainder = quantity % packSize;
        candidateTotal = roundMoney(packs * promo.promoValue + remainder * product.salePrice);
      } else if (promo.type === 'BUY_X_PAY_Y') {
        // Ex: Leve 3 Pague 2 -> minQuantity = 3, promoValue = 2 (paid units per group)
        const groupSize = Math.max(1, Math.floor(promo.minQuantity));
        const paidPerGroup = Math.max(1, Math.min(groupSize, Math.floor(promo.promoValue)));
        const groups = Math.floor(quantity / groupSize);
        const remainder = quantity % groupSize;
        const chargeableUnits = groups * paidPerGroup + remainder;
        candidateTotal = roundMoney(chargeableUnits * product.salePrice);
      }

      if (candidateTotal < best.netTotal) {
        best = {
          netTotal: candidateTotal,
          promoId: promo.id,
          promoName: promo.name,
        };
      }
    }

    singleBestMap.set(productId, best);
  }

  // Evaluate COMBO promotions without stacking discounts on items already getting a better deal
  const comboPromos = validPromos.filter(
    (p) => p.type === 'COMBO' && p.comboProductId !== null
  );

  for (const combo of comboPromos) {
    const prodA = productsMap.get(combo.productId);
    const prodB = combo.comboProductId ? productsMap.get(combo.comboProductId) : undefined;
    if (!prodA || !prodB) continue;

    const qtyA = consolidated.get(prodA.id) ?? 0;
    const qtyB = consolidated.get(prodB.id) ?? 0;
    const reqA = Math.max(1, combo.minQuantity || 1);
    const reqB = Math.max(1, combo.comboQty || 1);

    const possibleCombos = Math.min(Math.floor(qtyA / reqA), Math.floor(qtyB / reqB));
    if (possibleCombos <= 0) continue;

    const currentBestA = singleBestMap.get(prodA.id)!;
    const currentBestB = singleBestMap.get(prodB.id)!;
    const combinedCurrentBest = roundMoney(currentBestA.netTotal + currentBestB.netTotal);

    const remA = qtyA - possibleCombos * reqA;
    const remB = qtyB - possibleCombos * reqB;

    const grossPairPerCombo = reqA * prodA.salePrice + reqB * prodB.salePrice;
    const comboPackTotal = possibleCombos * combo.promoValue;
    const remainderTotalA = remA * prodA.salePrice;
    const remainderTotalB = remB * prodB.salePrice;
    const candidateCombined = roundMoney(comboPackTotal + remainderTotalA + remainderTotalB);

    // Apply combo ONLY if it strictly beats the sum of individual best promotions (anti-duplication)
    if (candidateCombined < combinedCurrentBest && grossPairPerCombo > 0) {
      const shareRatioA = (reqA * prodA.salePrice) / grossPairPerCombo;
      const comboShareA = roundMoney(comboPackTotal * shareRatioA + remainderTotalA);
      const comboShareB = roundMoney(candidateCombined - comboShareA);

      singleBestMap.set(prodA.id, {
        netTotal: comboShareA,
        promoId: combo.id,
        promoName: combo.name,
      });
      singleBestMap.set(prodB.id, {
        netTotal: comboShareB,
        promoId: combo.id,
        promoName: combo.name,
      });
    }
  }

  const lines: EvaluatedCartLine[] = [];
  let subtotal = 0;
  let promoDiscountTotal = 0;

  for (const [productId, quantity] of consolidated.entries()) {
    const product = productsMap.get(productId);
    if (!product) continue;

    const grossTotal = roundMoney(quantity * product.salePrice);
    const choice = singleBestMap.get(productId) ?? {
      netTotal: grossTotal,
      promoId: null,
      promoName: null,
    };
    const promoDiscountAmount = roundMoney(Math.max(0, grossTotal - choice.netTotal));

    subtotal = roundMoney(subtotal + grossTotal);
    promoDiscountTotal = roundMoney(promoDiscountTotal + promoDiscountAmount);

    lines.push({
      productId: product.id,
      sku: product.sku,
      barcode: product.barcode,
      name: product.name,
      unit: product.unit,
      quantity,
      unitCost: product.costPrice,
      unitPrice: product.salePrice,
      grossTotal,
      promoAppliedId: choice.promoId,
      promoAppliedName: promoDiscountAmount > 0 ? choice.promoName : null,
      promoDiscountAmount,
      netBeforeManualTotal: choice.netTotal,
      manualDiscountShare: 0,
      finalLineTotal: choice.netTotal,
      stockAvailable: product.stockQuantity,
    });
  }

  const netAfterPromos = roundMoney(subtotal - promoDiscountTotal);
  const clampedManual = roundMoney(Math.max(0, Math.min(netAfterPromos, manualDiscountInput)));

  if (clampedManual > 0 && netAfterPromos > 0 && lines.length > 0) {
    let distributed = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (i === lines.length - 1) {
        const share = roundMoney(clampedManual - distributed);
        line.manualDiscountShare = share;
        line.finalLineTotal = roundMoney(Math.max(0, line.netBeforeManualTotal - share));
      } else {
        const share = roundMoney(
          (line.netBeforeManualTotal / netAfterPromos) * clampedManual
        );
        distributed = roundMoney(distributed + share);
        line.manualDiscountShare = share;
        line.finalLineTotal = roundMoney(Math.max(0, line.netBeforeManualTotal - share));
      }
    }
  }

  const totalAmount = roundMoney(Math.max(0, netAfterPromos - clampedManual));

  return {
    lines,
    subtotal,
    promoDiscountTotal,
    netAfterPromos,
    manualDiscountTotal: clampedManual,
    totalAmount,
  };
}
