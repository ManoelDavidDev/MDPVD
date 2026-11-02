import type {
  FiscalModel,
  FiscalStatus,
  PaymentEntity,
  SaleEntity,
  SaleItemEntity,
  SystemSettings,
} from '../domain/models.ts';

function digitsOnly(str: string): string {
  return str.replace(/\D/g, '');
}

function computeMod11CheckDigit(key43: string): string {
  let weight = 2;
  let sum = 0;
  for (let i = key43.length - 1; i >= 0; i--) {
    sum += Number(key43[i]) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const remainder = sum % 11;
  const dv = remainder === 0 || remainder === 1 ? 0 : 11 - remainder;
  return String(dv);
}

/**
 * Generates an authentic 44-digit Brazilian NFC-e / NF-e Access Key (Chave de Acesso)
 */
export function generateAccessKey(params: {
  ufCode?: string;
  issuedAt: Date;
  cnpj: string;
  model: '65' | '55';
  series: number;
  number: number;
  tpEmis: '1' | '9';
}): string {
  const cUF = (params.ufCode ?? '35').padStart(2, '0'); // 35 = SP default
  const yy = String(params.issuedAt.getFullYear()).slice(-2);
  const mm = String(params.issuedAt.getMonth() + 1).padStart(2, '0');
  const aamm = `${yy}${mm}`;
  const cnpjDigits = digitsOnly(params.cnpj).padStart(14, '0').slice(0, 14);
  const mod = params.model;
  const serie = String(params.series).padStart(3, '0').slice(-3);
  const nNF = String(params.number).padStart(9, '0').slice(-9);
  const tpEmis = params.tpEmis;
  const cNF = String((params.number * 7919 + 104729) % 100000000).padStart(8, '0');

  const key43 = `${cUF}${aamm}${cnpjDigits}${mod}${serie}${nNF}${tpEmis}${cNF}`;
  const cDV = computeMod11CheckDigit(key43);
  return `${key43}${cDV}`;
}

function mapPaymentCodeSefaz(method: PaymentEntity['method']): string {
  switch (method) {
    case 'DINHEIRO':
      return '01';
    case 'CREDITO':
      return '03';
    case 'DEBITO':
      return '04';
    case 'VALE':
      return '10';
    case 'PIX':
      return '17';
    default:
      return '99';
  }
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export interface BuiltFiscalEmission {
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
}

export function buildFiscalEmission(params: {
  sale: Omit<SaleEntity, 'id' | 'items' | 'payments' | 'fiscalDocument'> & { id: number };
  items: SaleItemEntity[];
  payments: PaymentEntity[];
  settings: SystemSettings;
  nfceNumber: number;
}): BuiltFiscalEmission {
  const { sale, items, payments, settings, nfceNumber } = params;
  const issuedDate = new Date(sale.createdAt);

  // Non-fiscal commercial receipt mode (explicitly distinguished per RF08)
  if (settings.fiscalMode === 'COMPROVANTE_NAO_FISCAL') {
    return {
      model: 'COMPROVANTE_NAO_FISCAL',
      series: 0,
      number: sale.id,
      accessKey: null,
      environment: settings.fiscalEnvironment,
      status: 'NON_FISCAL',
      protocolNumber: null,
      sefazMessage:
        'Comprovante Comercial Não Fiscal emitido localmente (sem valor fiscal perante a SEFAZ).',
      xmlContent: null,
      qrCodeUrl: null,
    };
  }

  // Production guard: require A1 Digital Certificate and CSC token
  if (
    settings.fiscalEnvironment === 'PRODUCAO' &&
    (!settings.certificateConfigured || !settings.cscToken.trim())
  ) {
    return {
      model: 'NFCe_65',
      series: settings.nfceSeries,
      number: nfceNumber,
      accessKey: null,
      environment: 'PRODUCAO',
      status: 'REJECTED',
      protocolNumber: null,
      sefazMessage:
        'Rejeição Local: Certificado Digital A1 ou Token CSC não configurados para ambiente de Produção.',
      xmlContent: null,
      qrCodeUrl: null,
    };
  }

  const isOffline = settings.sefazConnectivity === 'OFFLINE_CONTINGENCY';
  const isRejectedSim = settings.sefazConnectivity === 'SIMULATE_REJECTION';
  const tpEmis: '1' | '9' = isOffline ? '9' : '1';
  const tpAmb = settings.fiscalEnvironment === 'PRODUCAO' ? '1' : '2';

  const accessKey = generateAccessKey({
    issuedAt: issuedDate,
    cnpj: settings.cnpj,
    model: '65',
    series: settings.nfceSeries,
    number: nfceNumber,
    tpEmis,
  });

  const qrCodeUrl = `https://www.homologacao.nfce.fazenda.sp.gov.br/qrcode?p=${accessKey}|2|${tpAmb}|${settings.cscId || '000001'}`;

  const detXml = items
    .map((item, idx) => {
      const totalDiscount = Number(
        (item.promoDiscountAmount + item.manualDiscountShare).toFixed(2)
      );
      const grossProd = Number((item.quantity * item.unitPriceSnapshot).toFixed(2));
      return `    <det nItem="${idx + 1}">
      <prod>
        <cProd>${escapeXml(item.skuSnapshot)}</cProd>
        <cEAN>${escapeXml(item.barcodeSnapshot || 'SEM GTIN')}</cEAN>
        <xProd>${escapeXml(
          tpAmb === '2' && idx === 0
            ? 'NOTA FISCAL EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL'
            : item.productNameSnapshot
        )}</xProd>
        <NCM>22030000</NCM>
        <CFOP>5102</CFOP>
        <uCom>${escapeXml(item.unitSnapshot)}</uCom>
        <qCom>${item.quantity.toFixed(4)}</qCom>
        <vUnCom>${item.unitPriceSnapshot.toFixed(2)}</vUnCom>
        <vProd>${grossProd.toFixed(2)}</vProd>
        ${totalDiscount > 0 ? `<vDesc>${totalDiscount.toFixed(2)}</vDesc>` : ''}
        <indTot>1</indTot>
      </prod>
      <imposto>
        <ICMS>
          <ICMSSN102>
            <orig>0</orig>
            <CSOSN>102</CSOSN>
          </ICMSSN102>
        </ICMS>
      </imposto>
    </det>`;
    })
    .join('\n');

  const pagXml = payments
    .map(
      (p) => `      <detPag>
        <tPag>${mapPaymentCodeSefaz(p.method)}</tPag>
        <vPag>${p.tenderedAmount.toFixed(2)}</vPag>
      </detPag>`
    )
    .join('\n');

  const totalDiscount = Number(
    (sale.promoDiscountTotal + sale.manualDiscountTotal).toFixed(2)
  );

  let status: FiscalStatus = 'AUTHORIZED';
  let protocolNumber: string | null = `135${issuedDate.getFullYear()}${String(
    nfceNumber
  ).padStart(8, '0')}`;
  let sefazMessage = '100 - Autorizado o uso da NF-e (NFC-e Modelo 65)';

  if (isRejectedSim) {
    status = 'REJECTED';
    protocolNumber = null;
    sefazMessage =
      '539 - Rejeição SEFAZ Simulada (Homologação): Falha de validação cadastral NCM/CEST.';
  } else if (isOffline) {
    status = 'CONTINGENCY_OFFLINE';
    protocolNumber = null;
    sefazMessage =
      'Emitida em Contingência Offline (tpEmis=9). Pendente de transmissão à SEFAZ em até 24h.';
  }

  const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe">
  <NFe>
    <infNFe Id="NFe${accessKey}" versao="4.00">
      <ide>
        <cUF>35</cUF>
        <natOp>VENDA AO CONSUMIDOR</natOp>
        <mod>65</mod>
        <serie>${settings.nfceSeries}</serie>
        <nNF>${nfceNumber}</nNF>
        <dhEmi>${issuedDate.toISOString()}</dhEmi>
        <tpNF>1</tpNF>
        <idDest>1</idDest>
        <tpImp>4</tpImp>
        <tpEmis>${tpEmis}</tpEmis>
        <tpAmb>${tpAmb}</tpAmb>
        <finNFe>1</finNFe>
        <indFinal>1</indFinal>
        <indPres>1</indPres>
      </ide>
      <emit>
        <CNPJ>${digitsOnly(settings.cnpj)}</CNPJ>
        <xNome>${escapeXml(settings.companyName)}</xNome>
        <xFant>${escapeXml(settings.tradeName)}</xFant>
        <IE>${digitsOnly(settings.ie)}</IE>
        <CRT>1</CRT>
      </emit>
      ${
        sale.customerCpf
          ? `<dest><CPF>${digitsOnly(sale.customerCpf)}</CPF>${
              sale.customerName ? `<xNome>${escapeXml(sale.customerName)}</xNome>` : ''
            }</dest>`
          : ''
      }
${detXml}
      <total>
        <ICMSTot>
          <vProd>${sale.subtotal.toFixed(2)}</vProd>
          <vDesc>${totalDiscount.toFixed(2)}</vDesc>
          <vNF>${sale.totalAmount.toFixed(2)}</vNF>
        </ICMSTot>
      </total>
      <pag>
${pagXml}
        <vTroco>${sale.changeAmount.toFixed(2)}</vTroco>
      </pag>
    </infNFe>
    <infNFeSupl>
      <qrCode>${escapeXml(qrCodeUrl)}</qrCode>
    </infNFeSupl>
  </NFe>
  ${
    protocolNumber
      ? `<protNFe versao="4.00">
    <infProt>
      <tpAmb>${tpAmb}</tpAmb>
      <chNFe>${accessKey}</chNFe>
      <dhRecbto>${issuedDate.toISOString()}</dhRecbto>
      <nProt>${protocolNumber}</nProt>
      <cStat>100</cStat>
      <xMotivo>Autorizado o uso da NF-e</xMotivo>
    </infProt>
  </protNFe>`
      : ''
  }
</nfeProc>`;

  return {
    model: 'NFCe_65',
    series: settings.nfceSeries,
    number: nfceNumber,
    accessKey,
    environment: settings.fiscalEnvironment,
    status,
    protocolNumber,
    sefazMessage,
    xmlContent,
    qrCodeUrl,
  };
}
