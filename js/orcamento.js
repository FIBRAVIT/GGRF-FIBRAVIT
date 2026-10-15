// ============================================
// MÓDULO ORÇAMENTO — G.G.R.F
// Orçamento Estático + Provisionamento Mensal
// Everest Consultoria em Gestão Empresarial
// ============================================

import { db } from './firebase-config.js';
import {
  doc, setDoc, getDoc, collection, getDocs, query, where
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ============================================
// ORDEM DAS LINHAS DO DRE NO ORÇAMENTO
// ============================================
const DRE_ORDEM = [
  'RECEITA OPERACIONAL',
  'RECEITA NAO OPERACIONAL',
  'IMPOSTOS',
  'DESPESA OPERACIONAL',
  'DESPESA NÃO OPERACIONAL',
  'INVESTIMENTOS',
  'AMORTIZAÇÃO'
];

const DRE_LABELS = {
  'RECEITA OPERACIONAL':     '📈 RECEITA OPERACIONAL (Custos)',
  'RECEITA NAO OPERACIONAL': '💰 RECEITA NÃO OPERACIONAL',
  'IMPOSTOS':                '🧾 IMPOSTOS',
  'DESPESA OPERACIONAL':     '⚙️ CUSTOS (Despesa Operacional)',
  'DESPESA NÃO OPERACIONAL': '📋 DESPESAS (Despesa Não Operacional)',
  'INVESTIMENTOS':           '🏗️ INVESTIMENTOS',
  'AMORTIZAÇÃO':             '📉 AMORTIZAÇÃO'
};

const MESES = ['','Janeiro','Fevereiro','Março','Abril','Maio','Junho',
               'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

const CCS = ['geral','service','fibravit','es','pa','ma'];

// ============================================
// INICIALIZAR MÓDULO ORÇAMENTO
// ============================================
window.initOrcamento = function() {
  renderFiltrosOrcamento();
  renderFiltrosProvisao();
  carregarOrcamento();
};

// ============================================
// FILTROS — ORÇAMENTO ESTÁTICO
// ============================================
function renderFiltrosOrcamento() {
  document.getElementById('orcCC')?.addEventListener('change', carregarOrcamento);
  document.getElementById('orcMes')?.addEventListener('change', carregarOrcamento);
  document.getElementById('orcAno')?.addEventListener('change', carregarOrcamento);
}

function renderFiltrosProvisao() {
  document.getElementById('provCC')?.addEventListener('change', carregarProvisao);
  document.getElementById('provMes')?.addEventListener('change', carregarProvisao);
  document.getElementById('provAno')?.addEventListener('change', carregarProvisao);
}

// ============================================
// CHAVE ÚNICA FIREBASE
// ============================================
function chaveOrc(cc, mes, ano)  { return `orc_${cc}_${mes}_${ano}`; }
function chaveProv(cc, mes, ano) { return `prov_${cc}_${mes}_${ano}`; }

// ============================================
// CARREGAR ORÇAMENTO ESTÁTICO
// ============================================
async function carregarOrcamento() {
  const cc  = document.getElementById('orcCC')?.value  || 'geral';
  const mes = document.getElementById('orcMes')?.value || '01';
  const ano = document.getElementById('orcAno')?.value || '2026';

  const snap = await getDoc(doc(db, 'orcamento', chaveOrc(cc, mes, ano)));
  const dados = snap.exists() ? snap.data().linhas : null;

  renderTabelaOrcamento(cc, mes, ano, dados, 'orcamento');
}

// ============================================
// CARREGAR PROVISIONAMENTO
// ============================================
async function carregarProvisao() {
  const cc  = document.getElementById('provCC')?.value  || 'geral';
  const mes = document.getElementById('provMes')?.value || '01';
  const ano = document.getElementById('provAno')?.value || '2026';

  // Busca orçamento estático do mesmo período
  const snapOrc  = await getDoc(doc(db, 'orcamento', chaveOrc(cc, mes, ano)));
  const snapProv = await getDoc(doc(db, 'orcamento_prov', chaveProv(cc, mes, ano)));

  const dadosOrc  = snapOrc.exists()  ? snapOrc.data().linhas  : null;
  const dadosProv = snapProv.exists() ? snapProv.data().linhas : null;

  renderTabelaProvisao(cc, mes, ano, dadosOrc, dadosProv);
}

// ============================================
// RENDERIZAR TABELA DE ORÇAMENTO / PROVISIONAMENTO
// ============================================
function renderTabelaOrcamento(cc, mes, ano, dadosSalvos, tipo) {
  const container = document.getElementById(`${tipo}TableContainer`);
  if (!container) return;

  // Agrupa plano de contas por DRE → Conta Sintética → Conta Contábil
  const estrutura = montarEstrutura(dadosSalvos, null, tipo);

  let html = `
    <div class="table-header-bar">
      <span class="periodo-label">
        ${cc.toUpperCase()} — ${MESES[parseInt(mes)]}/${ano}
        ${tipo === 'orcamento' ? '| Orçamento Estático' : ''}
      </span>
      <div style="display:flex;gap:8px">
        <button class="btn btn-p btn-sm" onclick="salvarOrcamento('${tipo}')">
          💾 Salvar
        </button>
        <button class="btn btn-o btn-sm" onclick="exportarExcelOrc('${tipo}')">
          📊 Excel
        </button>
        <button class="btn btn-o btn-sm" onclick="exportarPDFOrc('${tipo}')">
          📄 PDF
        </button>
      </div>
    </div>
    <div class="table-responsive">
      <table class="financial-table" id="${tipo}Table">
        <thead>
          <tr>
            <th style="width:80px">Código</th>
            <th>Conta Contábil</th>
            <th class="text-right" style="width:160px">Valor Orçado (R$)</th>
          </tr>
        </thead>
        <tbody>
  `;

  DRE_ORDEM.forEach(dre => {
    if (!estrutura[dre]) return;

    // Linha do grupo DRE
    html += `
      <tr class="total-row">
        <td colspan="3">${DRE_LABELS[dre] || dre}</td>
      </tr>
    `;

    Object.entries(estrutura[dre]).forEach(([sint, contas]) => {
      // Linha da conta sintética
      html += `
        <tr class="subtotal">
          <td colspan="3" style="padding-left:20px">${sint}</td>
        </tr>
      `;

      contas.forEach(conta => {
        const val = dadosSalvos?.[conta.codigo] || '';
        html += `
          <tr>
            <td style="color:#64748b;font-size:11px">${conta.codigo}</td>
            <td style="padding-left:36px">${conta.conta_contabil}</td>
            <td class="text-right">
              <input type="number"
                id="${tipo}_${conta.codigo}"
                class="orc-input"
                value="${val}"
                placeholder="0,00"
                step="0.01"
                min="0"
                onchange="calcularTotaisOrc('${tipo}')"
              />
            </td>
          </tr>
        `;
      });

      // Subtotal da conta sintética
      html += `
        <tr style="background:#f8fafc">
          <td colspan="2" style="padding-left:20px;font-weight:700;color:#10243B;font-size:12px">
            Subtotal ${sint}
          </td>
          <td class="text-right" style="font-weight:700;color:#10243B" id="${tipo}_sub_${sint.replace(/[^a-zA-Z0-9]/g,'_')}">
            R$ 0,00
          </td>
        </tr>
      `;
    });

    // Total do grupo DRE
    html += `
      <tr class="subtotal">
        <td colspan="2">TOTAL ${DRE_LABELS[dre] || dre}</td>
        <td class="text-right" id="${tipo}_tot_${dre.replace(/[^a-zA-Z0-9]/g,'_')}">R$ 0,00</td>
      </tr>
    `;
  });

  html += `
        </tbody>
      </table>
    </div>
  `;

  container.innerHTML = html;
  container.style.display = '';

  // Adiciona CSS para inputs
  if (!document.getElementById('orc-input-style')) {
    const style = document.createElement('style');
    style.id = 'orc-input-style';
    style.textContent = `
      .orc-input {
        width: 140px; text-align: right;
        border: 1.5px solid #e2e8f0; border-radius: 6px;
        padding: 5px 8px; font-size: 12.5px;
        background: #F0F4F8; font-family: inherit;
        transition: all .2s; outline: none;
      }
      .orc-input:focus { border-color: #10243B; background: #fff; }
      .orc-input-prov {
        width: 140px; text-align: right;
        border: 1.5px solid #e2e8f0; border-radius: 6px;
        padding: 5px 8px; font-size: 12.5px;
        background: #fffbeb; font-family: inherit;
        transition: all .2s; outline: none;
      }
      .orc-input-prov:focus { border-color: #f59e0b; background: #fff; }
    `;
    document.head.appendChild(style);
  }

  calcularTotaisOrc(tipo);
}

// ============================================
// RENDERIZAR TABELA DE PROVISIONAMENTO (3 colunas)
// ============================================
function renderTabelaProvisao(cc, mes, ano, dadosOrc, dadosProv) {
  const container = document.getElementById('provTableContainer');
  if (!container) return;

  const estrutura = montarEstrutura(null, null, 'prov');

  let html = `
    <div class="table-header-bar">
      <span class="periodo-label">
        ${cc.toUpperCase()} — ${MESES[parseInt(mes)]}/${ano} | Provisionamento Mensal
      </span>
      <div style="display:flex;gap:8px">
        <button class="btn btn-p btn-sm" onclick="salvarOrcamento('prov')">
          💾 Salvar Provisionamento
        </button>
        <button class="btn btn-o btn-sm" onclick="exportarExcelOrc('prov')">
          📊 Excel
        </button>
        <button class="btn btn-o btn-sm" onclick="exportarPDFOrc('prov')">
          📄 PDF
        </button>
      </div>
    </div>
    <div class="table-responsive">
      <table class="financial-table" id="provTable">
        <thead>
          <tr>
            <th style="width:80px">Código</th>
            <th>Conta Contábil</th>
            <th class="text-right" style="width:150px">Orçado Fixo (R$)</th>
            <th class="text-right" style="width:150px">Provisionamento (R$)</th>
            <th class="text-right" style="width:130px">Diferença (R$)</th>
          </tr>
        </thead>
        <tbody>
  `;

  DRE_ORDEM.forEach(dre => {
    if (!estrutura[dre]) return;

    html += `
      <tr class="total-row">
        <td colspan="5">${DRE_LABELS[dre] || dre}</td>
      </tr>
    `;

    Object.entries(estrutura[dre]).forEach(([sint, contas]) => {
      html += `
        <tr class="subtotal">
          <td colspan="5" style="padding-left:20px">${sint}</td>
        </tr>
      `;

      contas.forEach(conta => {
        const valOrc  = dadosOrc?.[conta.codigo]  || 0;
        const valProv = dadosProv?.[conta.codigo] || '';
        const diff    = valProv !== '' ? (parseFloat(valProv) - parseFloat(valOrc || 0)) : 0;
        const diffCls = diff > 0 ? 'var-negativo' : diff < 0 ? 'var-positivo' : '';

        html += `
          <tr>
            <td style="color:#64748b;font-size:11px">${conta.codigo}</td>
            <td style="padding-left:36px">${conta.conta_contabil}</td>
            <td class="text-right" style="color:#64748b">${fmtMoeda(valOrc)}</td>
            <td class="text-right">
              <input type="number"
                id="prov_${conta.codigo}"
                class="orc-input-prov"
                value="${valProv}"
                placeholder="0,00"
                step="0.01"
                min="0"
                onchange="calcularTotaisOrc('prov')"
              />
            </td>
            <td class="text-right">
              <span class="${diffCls}" id="prov_diff_${conta.codigo}">
                ${valProv !== '' ? fmtMoeda(diff) : '—'}
              </span>
            </td>
          </tr>
        `;
      });

      html += `
        <tr style="background:#f8fafc">
          <td colspan="2" style="padding-left:20px;font-weight:700;color:#10243B;font-size:12px">
            Subtotal ${sint}
          </td>
          <td class="text-right" style="font-weight:700;color:#64748b" id="prov_suborc_${sint.replace(/[^a-zA-Z0-9]/g,'_')}">R$ 0,00</td>
          <td class="text-right" style="font-weight:700;color:#10243B" id="prov_subprov_${sint.replace(/[^a-zA-Z0-9]/g,'_')}">R$ 0,00</td>
          <td class="text-right" style="font-weight:700" id="prov_subdiff_${sint.replace(/[^a-zA-Z0-9]/g,'_')}">—</td>
        </tr>
      `;
    });

    html += `
      <tr class="subtotal">
        <td colspan="2">TOTAL ${DRE_LABELS[dre] || dre}</td>
        <td class="text-right" id="prov_totorc_${dre.replace(/[^a-zA-Z0-9]/g,'_')}">R$ 0,00</td>
        <td class="text-right" id="prov_totprov_${dre.replace(/[^a-zA-Z0-9]/g,'_')}">R$ 0,00</td>
        <td class="text-right" id="prov_totdiff_${dre.replace(/[^a-zA-Z0-9]/g,'_')}">—</td>
      </tr>
    `;
  });

  html += `</tbody></table></div>`;
  container.innerHTML = html;
  container.style.display = '';

  // Preenche valores do orçamento fixo nos inputs de diferença
  if (dadosOrc) {
    Object.entries(dadosOrc).forEach(([cod, val]) => {
      const el = document.getElementById(`prov_${cod}`);
      if (el && !el.value) {
        // Atualiza diferença
        const diff = 0 - parseFloat(val || 0);
        const diffEl = document.getElementById(`prov_diff_${cod}`);
        if (diffEl) diffEl.textContent = '—';
      }
    });
  }

  calcularTotaisOrc('prov');
}

// ============================================
// MONTAR ESTRUTURA DO PLANO DE CONTAS
// ============================================
function montarEstrutura(dadosSalvos, dadosProv, tipo) {
  const estrutura = {};

  if (typeof PLANO_CONTAS === 'undefined') return estrutura;

  PLANO_CONTAS.forEach(conta => {
    const dre  = conta.dre;
    const sint = conta.conta_sintetica;

    if (!estrutura[dre]) estrutura[dre] = {};
    if (!estrutura[dre][sint]) estrutura[dre][sint] = [];
    estrutura[dre][sint].push(conta);
  });

  return estrutura;
}

// ============================================
// CALCULAR TOTAIS
// ============================================
window.calcularTotaisOrc = function(tipo) {
  if (typeof PLANO_CONTAS === 'undefined') return;

  const estrutura = montarEstrutura(null, null, tipo);

  DRE_ORDEM.forEach(dre => {
    if (!estrutura[dre]) return;
    let totalDre = 0;
    let totalDreOrc = 0;

    Object.entries(estrutura[dre]).forEach(([sint, contas]) => {
      let subtotal = 0;
      let subtotalOrc = 0;

      contas.forEach(conta => {
        if (tipo === 'prov') {
          const elOrc  = document.getElementById(`orcamento_${conta.codigo}`);
          const elProv = document.getElementById(`prov_${conta.codigo}`);
          const valOrc  = parseFloat(elOrc?.value  || 0) || 0;
          const valProv = parseFloat(elProv?.value || 0) || 0;
          const diff = valProv - valOrc;

          subtotal    += valProv;
          subtotalOrc += valOrc;

          // Atualiza diferença por linha
          const diffEl = document.getElementById(`prov_diff_${conta.codigo}`);
          if (diffEl && elProv?.value !== '') {
            diffEl.textContent = fmtMoeda(diff);
            diffEl.className   = diff > 0 ? 'var-negativo' : diff < 0 ? 'var-positivo' : '';
          }
        } else {
          const el  = document.getElementById(`${tipo}_${conta.codigo}`);
          const val = parseFloat(el?.value || 0) || 0;
          subtotal += val;
        }
      });

      totalDre    += subtotal;
      totalDreOrc += subtotalOrc;

      const sintKey = sint.replace(/[^a-zA-Z0-9]/g,'_');

      if (tipo === 'prov') {
        const subOrcEl  = document.getElementById(`prov_suborc_${sintKey}`);
        const subProvEl = document.getElementById(`prov_subprov_${sintKey}`);
        const subDiffEl = document.getElementById(`prov_subdiff_${sintKey}`);
        if (subOrcEl)  subOrcEl.textContent  = fmtMoeda(subtotalOrc);
        if (subProvEl) subProvEl.textContent  = fmtMoeda(subtotal);
        if (subDiffEl) {
          const d = subtotal - subtotalOrc;
          subDiffEl.textContent = fmtMoeda(d);
          subDiffEl.className   = d > 0 ? 'var-negativo' : d < 0 ? 'var-positivo' : '';
        }
      } else {
        const subEl = document.getElementById(`${tipo}_sub_${sintKey}`);
        if (subEl) subEl.textContent = fmtMoeda(subtotal);
      }
    });

    const dreKey = dre.replace(/[^a-zA-Z0-9]/g,'_');

    if (tipo === 'prov') {
      const totOrcEl  = document.getElementById(`prov_totorc_${dreKey}`);
      const totProvEl = document.getElementById(`prov_totprov_${dreKey}`);
      const totDiffEl = document.getElementById(`prov_totdiff_${dreKey}`);
      if (totOrcEl)  totOrcEl.textContent  = fmtMoeda(totalDreOrc);
      if (totProvEl) totProvEl.textContent  = fmtMoeda(totalDre);
      if (totDiffEl) {
        const d = totalDre - totalDreOrc;
        totDiffEl.textContent = fmtMoeda(d);
        totDiffEl.className   = d > 0 ? 'var-negativo' : d < 0 ? 'var-positivo' : '';
      }
    } else {
      const totEl = document.getElementById(`${tipo}_tot_${dreKey}`);
      if (totEl) totEl.textContent = fmtMoeda(totalDre);
    }
  });
};

// ============================================
// SALVAR ORÇAMENTO / PROVISIONAMENTO
// ============================================
window.salvarOrcamento = async function(tipo) {
  const isOrc  = tipo === 'orcamento';
  const isProv = tipo === 'prov';

  const ccEl  = document.getElementById(isOrc ? 'orcCC'  : 'provCC');
  const mesEl = document.getElementById(isOrc ? 'orcMes' : 'provMes');
  const anoEl = document.getElementById(isOrc ? 'orcAno' : 'provAno');

  const cc  = ccEl?.value  || 'geral';
  const mes = mesEl?.value || '01';
  const ano = anoEl?.value || '2026';

  // Coleta todos os valores
  const linhas = {};
  if (typeof PLANO_CONTAS !== 'undefined') {
    PLANO_CONTAS.forEach(conta => {
      const prefix = isProv ? 'prov' : 'orcamento';
      const el = document.getElementById(`${prefix}_${conta.codigo}`);
      if (el && el.value !== '') {
        linhas[conta.codigo] = parseFloat(el.value) || 0;
      }
    });
  }

  try {
    const colecao = isProv ? 'orcamento_prov' : 'orcamento';
    const chave   = isProv ? chaveProv(cc, mes, ano) : chaveOrc(cc, mes, ano);

    await setDoc(doc(db, colecao, chave), {
      cc, mes, ano, linhas,
      tipo: isProv ? 'provisionamento' : 'estatico',
      atualizadoEm:  new Date().toISOString(),
      atualizadoPor: window.currentUser?.uid || 'sistema'
    });

    window.showToast(
      `✅ ${isProv ? 'Provisionamento' : 'Orçamento'} salvo! CC: ${cc.toUpperCase()} | ${MESES[parseInt(mes)]}/${ano}`,
      'success'
    );

  } catch (err) {
    window.showToast('❌ Erro ao salvar: ' + err.message, 'error');
  }
};

// ============================================
// EXPORTAR EXCEL
// ============================================
window.exportarExcelOrc = function(tipo) {
  const isOrc  = tipo === 'orcamento';
  const isProv = tipo === 'prov';

  const cc  = document.getElementById(isOrc ? 'orcCC'  : 'provCC')?.value  || 'geral';
  const mes = document.getElementById(isOrc ? 'orcMes' : 'provMes')?.value || '01';
  const ano = document.getElementById(isOrc ? 'orcAno' : 'provAno')?.value || '2026';

  const tableId = isProv ? 'provTable' : 'orcamentoTable';
  const table   = document.getElementById(tableId);
  if (!table) { window.showToast('⚠️ Nenhum dado para exportar', 'error'); return; }

  const wb  = XLSX.utils.book_new();
  const ws  = XLSX.utils.table_to_sheet(table);
  const nome = isProv ? 'Provisionamento' : 'Orcamento_Estatico';

  XLSX.utils.book_append_sheet(wb, ws, nome);
  XLSX.writeFile(wb, `GGRF_${nome}_${cc.toUpperCase()}_${mes}_${ano}.xlsx`);
  window.showToast('📊 Excel exportado com sucesso!', 'success');
};

// ============================================
// EXPORTAR PDF
// ============================================
window.exportarPDFOrc = function(tipo) {
  const isOrc  = tipo === 'orcamento';
  const isProv = tipo === 'prov';

  const cc  = document.getElementById(isOrc ? 'orcCC'  : 'provCC')?.value  || 'geral';
  const mes = document.getElementById(isOrc ? 'orcMes' : 'provMes')?.value || '01';
  const ano = document.getElementById(isOrc ? 'orcAno' : 'provAno')?.value || '2026';

  const tableId = isProv ? 'provTable' : 'orcamentoTable';
  const table   = document.getElementById(tableId);
  if (!table) { window.showToast('⚠️ Nenhum dado para exportar', 'error'); return; }

  const titulo = isProv
    ? `Provisionamento Mensal — ${cc.toUpperCase()} — ${MESES[parseInt(mes)]}/${ano}`
    : `Orçamento Estático — ${cc.toUpperCase()} — ${MESES[parseInt(mes)]}/${ano}`;

  const win = window.open('', '_blank');
  win.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8"/>
      <title>${titulo}</title>
      <style>
        body { font-family: 'Segoe UI', sans-serif; font-size: 11px; color: #2C2C2C; margin: 20px; }
        h1 { font-size: 14px; color: #10243B; margin-bottom: 4px; }
        h2 { font-size: 11px; color: #64748b; margin-bottom: 16px; font-weight: 400; }
        table { width: 100%; border-collapse: collapse; }
        th { background: #10243B; color: white; padding: 7px 10px; text-align: left; font-size: 10px; }
        th:last-child, td:last-child { text-align: right; }
        td { padding: 6px 10px; border-bottom: 1px solid #e2e8f0; }
        tr.total-row td { background: #10243B; color: white; font-weight: 700; }
        tr.subtotal td { background: #e8edf2; font-weight: 700; color: #10243B; }
        input { display: none; }
        .footer { margin-top: 20px; font-size: 9px; color: #94a3b8; text-align: center; }
        @media print { button { display: none; } }
      </style>
    </head>
    <body>
      <h1>G.G.R.F — Gestão Gerencial de Resultados Financeiros</h1>
      <h2>${titulo} | Grupo Fibravit</h2>
      ${table.outerHTML.replace(/<input[^>]*>/g, el => {
        const match = el.match(/value="([^"]*)"/);
        return match ? `<span>${fmtMoeda(parseFloat(match[1]) || 0)}</span>` : '<span>—</span>';
      })}
      <div class="footer">
        Gerado em ${new Date().toLocaleString('pt-BR')} | EVEREST CONSULTORIA em Gestão Empresarial
      </div>
      <script>window.onload = () => window.print();<\/script>
    </body>
    </html>
  `);
  win.document.close();
};

// ============================================
// UTILITÁRIOS
// ============================================
function fmtMoeda(v) {
  if (v === null || v === undefined || isNaN(v)) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}

// Expõe funções para uso externo
window.carregarOrcamento = carregarOrcamento;
window.carregarProvisao  = carregarProvisao;