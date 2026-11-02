import React, { useState } from 'react';
import { Download, Printer, RefreshCw, X } from 'lucide-react';
import {
  PAYMENT_LABELS,
  formatAccessKey,
  formatCurrency,
  formatDateTime,
  type SaleEntity,
  type SystemSettings,
} from '../types';

interface ReceiptModalProps {
  sale: SaleEntity;
  settings: SystemSettings;
  onClose: () => void;
  onRetransmitFiscal?: (saleId: number) => Promise<void>;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({
  sale,
  settings,
  onClose,
  onRetransmitFiscal,
}) => {
  const [tab, setTab] = useState<'danfe' | 'xml'>('danfe');
  const [transmitting, setTransmitting] = useState(false);

  const doc = sale.fiscalDocument;
  const isFiscalAuthorized = doc?.status === 'AUTHORIZED';
  const isNonFiscal = doc?.model === 'COMPROVANTE_NAO_FISCAL' || doc?.status === 'NON_FISCAL';
  const canRetransmit =
    sale.status === 'COMPLETED' &&
    doc &&
    (doc.status === 'CONTINGENCY_OFFLINE' || doc.status === 'REJECTED');

  const handleDownloadXml = () => {
    if (!doc?.xmlContent) return;
    const blob = new Blob([doc.xmlContent], { type: 'application/xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `NFCe_${doc.accessKey || sale.saleNumber}.xml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleRetransmit = async () => {
    if (!onRetransmitFiscal) return;
    setTransmitting(true);
    try {
      await onRetransmitFiscal(sale.id);
    } finally {
      setTransmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#39332D]/55 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-lg border border-[#D9CCB8] bg-[#FAF7F2] shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#D9CCB8] px-6 py-4">
          <div>
            <h3 className="text-base font-semibold text-[#39332D]">
              {isNonFiscal
                ? `Comprovante Comercial — ${sale.saleNumber}`
                : `Documento Fiscal NFC-e — ${sale.saleNumber}`}
            </h3>
            <p className="mt-0.5 text-xs text-[#5E4A38]">
              Status Fiscal:{' '}
              <span className="font-medium text-[#39332D]">
                {doc?.status === 'AUTHORIZED' && 'Autorizada pela SEFAZ'}
                {doc?.status === 'CONTINGENCY_OFFLINE' && 'Emitida em Contingência Offline'}
                {doc?.status === 'REJECTED' && 'Rejeitada pela SEFAZ (Sem Valor Fiscal)'}
                {doc?.status === 'CANCELLED' && 'Cancelada na SEFAZ'}
                {isNonFiscal && 'Comprovante Comercial Não Fiscal'}
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1.5 text-[#5E4A38] hover:bg-[#E8DCC8] hover:text-[#39332D]"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Sub-bar */}
        <div className="flex items-center justify-between border-b border-[#D9CCB8] bg-[#F5F0E6] px-6 py-2.5">
          <div className="flex items-center gap-4 text-xs font-medium">
            <button
              type="button"
              onClick={() => setTab('danfe')}
              className={`pb-1 transition-colors whitespace-nowrap shrink-0 ${
                tab === 'danfe'
                  ? 'border-b-2 border-[#C87952] font-semibold text-[#39332D]'
                  : 'text-[#5E4A38] hover:text-[#39332D]'
              }`}
            >
              Cupom / DANFE 80mm
            </button>
            {doc?.xmlContent && (
              <button
                type="button"
                onClick={() => setTab('xml')}
                className={`pb-1 transition-colors whitespace-nowrap shrink-0 ${
                  tab === 'xml'
                    ? 'border-b-2 border-[#C87952] font-semibold text-[#39332D]'
                    : 'text-[#5E4A38] hover:text-[#39332D]'
                }`}
              >
                XML NF-e 4.00
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {canRetransmit && onRetransmitFiscal && (
              <button
                type="button"
                disabled={transmitting}
                onClick={handleRetransmit}
                className="inline-flex items-center gap-1.5 rounded border border-[#80664C] bg-[#FAF7F2] px-3 py-1.5 text-xs font-medium text-[#39332D] hover:bg-[#E8DCC8] disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${transmitting ? 'animate-spin' : ''}`} />
                Transmitir à SEFAZ
              </button>
            )}
            {doc?.xmlContent && (
              <button
                type="button"
                onClick={handleDownloadXml}
                className="inline-flex items-center gap-1.5 rounded border border-[#D9CCB8] bg-[#FAF7F2] px-3 py-1.5 text-xs font-medium text-[#39332D] hover:bg-[#E8DCC8] whitespace-nowrap shrink-0"
              >
                <Download className="h-3.5 w-3.5" />
                Baixar XML
              </button>
            )}
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded bg-[#A65F3F] px-3.5 py-1.5 text-xs font-semibold text-[#FAF7F2] hover:bg-[#8C4D30] whitespace-nowrap shrink-0"
            >
              <Printer className="h-3.5 w-3.5" />
              Imprimir Cupom
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {tab === 'danfe' ? (
            <div
              id="mdpdv-printable-receipt"
              className="mx-auto max-w-md rounded border border-[#D9CCB8] bg-white p-6 font-mono text-xs text-[#26221E]"
            >
              <div className="text-center">
                <div className="text-sm font-bold">{settings.tradeName}</div>
                <div className="mt-0.5 text-[11px]">{settings.companyName}</div>
                <div className="text-[11px]">
                  CNPJ: {settings.cnpj} · IE: {settings.ie}
                </div>
                <div className="text-[11px]">
                  {settings.address} — {settings.cityUf}
                </div>
              </div>

              <div className="my-3 border-t border-dashed border-[#80664C] pt-2 text-center font-semibold">
                {isNonFiscal ? (
                  <span>COMPROVANTE COMERCIAL NÃO FISCAL</span>
                ) : (
                  <span>
                    DANFE NFC-e — Documento Auxiliar da Nota Fiscal de Consumidor Eletrônica
                  </span>
                )}
              </div>

              {!isFiscalAuthorized && !isNonFiscal && (
                <div className="mb-3 border border-[#A65F3F] bg-[#F5F0E6] p-2 text-center text-[11px] font-semibold text-[#39332D]">
                  {doc?.status === 'REJECTED' &&
                    'DOCUMENTO REJEITADO PELA SEFAZ — SEM VALOR FISCAL'}
                  {doc?.status === 'CONTINGENCY_OFFLINE' &&
                    'EMITIDA EM CONTINGÊNCIA OFFLINE — PENDENTE DE AUTORIZAÇÃO SEFAZ'}
                  {doc?.status === 'CANCELLED' && 'DOCUMENTO FISCAL CANCELADO'}
                </div>
              )}

              {doc?.environment === 'HOMOLOGACAO' && !isNonFiscal && (
                <div className="mb-3 text-center text-[11px] font-semibold">
                  EMITIDA EM AMBIENTE DE HOMOLOGAÇÃO — SEM VALOR FISCAL
                </div>
              )}

              <div className="border-t border-dashed border-[#80664C] py-2">
                <div className="flex justify-between font-semibold">
                  <span>ITEM / DESCRIÇÃO</span>
                  <span>TOTAL</span>
                </div>
                <div className="mt-1.5 space-y-1.5">
                  {(sale.items ?? []).map((item, index) => (
                    <div key={item.id}>
                      <div className="flex justify-between">
                        <span className="pr-2">
                          {String(index + 1).padStart(2, '0')} {item.skuSnapshot} {item.productNameSnapshot}
                        </span>
                      </div>
                      <div className="flex justify-between text-[11px] text-[#5E4A38] tabular-nums">
                        <span>
                          {item.quantity} {item.unitSnapshot} x {formatCurrency(item.unitPriceSnapshot)}
                          {item.promoAppliedName ? ` (${item.promoAppliedName})` : ''}
                        </span>
                        <span className="font-semibold text-[#26221E]">
                          {formatCurrency(item.lineTotal)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-1 border-t border-dashed border-[#80664C] py-2 tabular-nums">
                <div className="flex justify-between">
                  <span>Qtd. total de itens</span>
                  <span>{(sale.items ?? []).length}</span>
                </div>
                <div className="flex justify-between">
                  <span>Subtotal bruto</span>
                  <span>{formatCurrency(sale.subtotal)}</span>
                </div>
                {sale.promoDiscountTotal > 0 && (
                  <div className="flex justify-between">
                    <span>Descontos promocionais</span>
                    <span>- {formatCurrency(sale.promoDiscountTotal)}</span>
                  </div>
                )}
                {sale.manualDiscountTotal > 0 && (
                  <div className="flex justify-between">
                    <span>Desconto comercial autorizado</span>
                    <span>- {formatCurrency(sale.manualDiscountTotal)}</span>
                  </div>
                )}
                <div className="flex justify-between pt-1 text-sm font-bold">
                  <span>VALOR A PAGAR</span>
                  <span>{formatCurrency(sale.totalAmount)}</span>
                </div>
              </div>

              <div className="space-y-1 border-t border-dashed border-[#80664C] py-2 tabular-nums">
                <div className="font-semibold">FORMA DE PAGAMENTO</div>
                {(sale.payments ?? []).map((p) => (
                  <div key={p.id} className="flex justify-between">
                    <span>{PAYMENT_LABELS[p.method] ?? p.method}</span>
                    <span>{formatCurrency(p.tenderedAmount)}</span>
                  </div>
                ))}
                {sale.changeAmount > 0 && (
                  <div className="flex justify-between font-semibold">
                    <span>Troco em Dinheiro</span>
                    <span>{formatCurrency(sale.changeAmount)}</span>
                  </div>
                )}
              </div>

              <div className="space-y-1 border-t border-dashed border-[#80664C] pt-2 text-[11px]">
                <div>
                  Consumidor:{' '}
                  {sale.customerCpf
                    ? `CPF ${sale.customerCpf}${sale.customerName ? ` — ${sale.customerName}` : ''}`
                    : 'CONSUMIDOR NÃO IDENTIFICADO'}
                </div>
                <div>
                  Venda: {sale.saleNumber} · Emissão: {formatDateTime(sale.createdAt)}
                </div>
                <div>Operador: {sale.operatorName}</div>
                {doc && !isNonFiscal && (
                  <div className="mt-2 border-t border-dashed border-[#80664C] pt-2 text-center">
                    <div className="font-semibold">
                      NFC-e nº {doc.number} · Série {doc.series}
                    </div>
                    {doc.accessKey && (
                      <div className="mt-1 break-all text-[10px]">
                        Chave de Acesso:
                        <br />
                        {formatAccessKey(doc.accessKey)}
                      </div>
                    )}
                    <div className="mt-1 text-[10px]">
                      {doc.protocolNumber
                        ? `Protocolo de Autorização: ${doc.protocolNumber}`
                        : doc.sefazMessage}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <pre className="max-h-[60vh] overflow-auto rounded border border-[#D9CCB8] bg-[#39332D] p-4 font-mono text-xs text-[#F5F0E6]">
              {doc?.xmlContent || 'XML não disponível para comprovante não fiscal.'}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
};
