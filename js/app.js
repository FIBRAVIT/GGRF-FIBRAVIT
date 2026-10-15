// ============================================
// APP PRINCIPAL — PADRÃO FIBRAVIT
// Navegação, DRE, Balanço, Fluxo, Indicadores, IA
// Everest Consultoria em Gestão Empresarial
// ============================================

import { db } from './firebase-config.js';
import {
  doc, setDoc, getDoc, collection, getDocs
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ============================================
// INICIALIZAÇÃO
// ============================================
window.initApp = function () {
  atualizarData();
  configurarNavegacao();
  configurarUploads();
  navegarPara('dashboard');
};

// ============================================
// DATA ATUAL
// ============================================
function atualizarData() {
  const agora = new Date();
  const opts  = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  const dataStr = agora.toLocaleDateString('pt-BR', opts);
  const el = document.getElementById('dashData');
  if (el) el.textContent = '📅 ' + dataStr;
}

// ============================================
// NAVEGAÇÃO HORIZONTAL
// ============================================
function configurarNavegacao() {
  document.querySelectorAll('.ni[data-module]').forEach(btn => {
    btn.addEventListener('click', () => {
      navegarPara(btn.dataset.module);
    });
  });
}

function navegarPara(modulo) {
  // Remove active de todos os botões e páginas
  document.querySelectorAll('.ni').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.pg').forEach(p => p.classList.remove('active'));

  // Ativa botão e página
  const btn = document.querySelector(`.ni[data-module="${modulo}"]`);
  const pg  = document.getElementById(`pg-${modulo}`);

  if (btn) btn.classList.add('active');
  if (pg)  pg.classList.add('active');

  // Ações por módulo
  if (modulo === 'usuarios')       window.carregarUsuarios();
  if (modulo === 'indicadores')    carregarIndicadores();
  if (modulo === 'dre')            verificarDadosDRE();
  if (modulo === 'orcamento')      { document.getElementById('orcamentoEmpty')?.style && (document.getElementById('orcamentoEmpty').style.display = 'none'); window.carregarOrcamento && window.carregarOrcamento(); }
  if (modulo === 'provisionamento') { document.getElementById('provEmpty')?.style && (document.getElementById('provEmpty').style.display = 'none'); window.carregarProvisao && window.carregarProvisao(); }
}

// ============================================
// CONFIGURAR TODOS OS UPLOADS
// ============================================
function configurarUploads() {
  // DRE
  const dreInput = document.getElementById('dreFileInput');
  if (dreInput) dreInput.addEventListener('change', e => {
    if (e.target.files[0]) processarArquivo(e.target.files[0], 'dre');
  });

  // Balanço
  const bpInput = document.getElementById('bpFileInput');
  if (bpInput) bpInput.addEventListener('change', e => {
    if (e.target.files[0]) processarArquivo(e.target.files[0], 'bp');
  });

  // Drag & Drop em todas as upload-box
  document.querySelectorAll('.upload-box').forEach(box => {
    box.addEventListener('dragover', e => { e.preventDefault(); box.classList.add('dragover'); });
    box.addEventListener('dragleave', () => box.classList.remove('dragover'));
    box.addEventListener('drop', e => {
      e.preventDefault();
      box.classList.remove('dragover');
      const file    = e.dataTransfer.files[0];
      const input   = box.querySelector('input[type="file"]');
      if (file && input) {
        const tipo = input.id.replace('FileInput', '');
        processarArquivo(file, tipo);
      }
    });
  });

  // Filtros DRE
  ['dreCC','dreMes','dreAno','dreVisao'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', verificarDadosDRE);
  });
}

// ============================================
// PROCESSAR ARQUIVO EXCEL
// ============================================
async function processarArquivo(file, tipo) {
  if (!file.name.match(/\.(xlsx|xls)$/i)) {
    showToast('❌ Formato inválido. Use .xlsx ou .xls', 'error');
    return;
  }

  mostrarStatus(tipo, 'loading', `⏳ Lendo arquivo: ${file.name}...`);

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data     = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheet    = workbook.Sheets[workbook.SheetNames[0]];
      const rows     = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

      if (tipo === 'dre') await salvarDRE(rows, file.name);
      if (tipo === 'bp')  await salvarBP(rows, file.name);

    } catch (err) {
      mostrarStatus(tipo, 'error', `❌ Erro ao ler arquivo: ${err.message}`);
    }
  };
  reader.readAsArrayBuffer(file);
}

// ============================================
// ============================================
// MÓDULO DRE
// ============================================
// ============================================

function chaveDRE(cc, mes, ano) { return `dre_${cc}_${mes}_${ano}`; }

function verificarDadosDRE() {
  const cc  = document.getElementById('dreCC')?.value  || 'geral';
  const mes = document.getElementById('dreMes')?.value || '10';
  const ano = document.getElementById('dreAno')?.value || '2026';
  carregarDRE(cc, mes, ano);
}

async function salvarDRE(rows, nomeArquivo) {
  const cc  = document.getElementById('dreCC').value;
  const mes = document.getElementById('dreMes').value;
  const ano = document.getElementById('dreAno').value;

  mostrarStatus('dre', 'loading', '⏳ Processando DRE...');

  const estrutura = [
    { id: 'receita_bruta',        label: 'Receita Operacional Bruta',     tipo: 'entrada'  },
    { id: 'impostos_receita',     label: 'Impostos da Receita Bruta',     tipo: 'deducao'  },
    { id: 'receita_liquida',      label: 'Receita Operacional Líquida',   tipo: 'subtotal' },
    { id: 'custos',               label: 'Custos',                        tipo: 'deducao'  },
    { id: 'depreciacoes',         label: 'Depreciações – Fábr.',          tipo: 'deducao'  },
    { id: 'despesas',             label: 'Despesas',                      tipo: 'deducao'  },
    { id: 'ebitda',               label: 'Resultado Operacional (EBITDA)', tipo: 'subtotal' },
    { id: 'investimentos',        label: 'Investimentos',                 tipo: 'deducao'  },
    { id: 'amortizacoes',         label: 'Amortizações',                  tipo: 'deducao'  },
    { id: 'resultado_liquido_op', label: 'Resultado Líquido Operacional', tipo: 'subtotal' },
    { id: 'receitas_financeiras', label: 'Receitas Financeiras',          tipo: 'entrada'  },
    { id: 'despesas_financeiras', label: 'Despesas Financeiras',          tipo: 'deducao'  },
    { id: 'resultado_final',      label: 'Resultado Final',               tipo: 'total'    }
  ];

  const linhas = estrutura.map(linha => {
    let previsto = 0, realizado = 0;
    for (const row of rows) {
      const desc = normalizar(String(row[0] || ''));
      const lbl  = normalizar(linha.label);
      if (desc && (desc.includes(lbl.substring(0,8)) || lbl.includes(desc.substring(0,8)))) {
        previsto  = toNum(row[1]);
        realizado = toNum(row[2]);
        break;
      }
    }
    const varPct = previsto !== 0 ? ((realizado / previsto) * 100).toFixed(2) : null;
    return { ...linha, previsto, realizado, varPct };
  });

  try {
    // SUBSTITUI dados do mesmo CC/Mês/Ano
    await setDoc(doc(db, 'dre', chaveDRE(cc, mes, ano)), {
      cc, mes, ano, nomeArquivo, linhas,
      atualizadoEm:  new Date().toISOString(),
      atualizadoPor: window.currentUser?.uid || 'sistema'
    });

    mostrarStatus('dre', 'success',
      `✅ DRE importado com sucesso! &nbsp;|&nbsp; CC: <strong>${cc.toUpperCase()}</strong> &nbsp;|&nbsp; ` +
      `Período: <strong>${nomeMes(mes)}/${ano}</strong><br>` +
      `<small>⚠️ Dados anteriores do mesmo período foram substituídos</small>`
    );

    setTimeout(() => carregarDRE(cc, mes, ano), 900);

  } catch (err) {
    mostrarStatus('dre', 'error', `❌ Erro ao salvar: ${err.message}`);
  }
}

async function carregarDRE(cc, mes, ano) {
  try {
    const snap = await getDoc(doc(db, 'dre', chaveDRE(cc, mes, ano)));
    if (!snap.exists()) {
      document.getElementById('dreUploadSection').style.display = '';
      document.getElementById('dreTableSection').style.display  = 'none';
      return;
    }
    renderDRE(snap.data());
  } catch (err) {
    showToast('Erro ao carregar DRE', 'error');
  }
}

async function renderDRE(dados) {
  document.getElementById('dreUploadSection').style.display = 'none';
  document.getElementById('dreTableSection').style.display  = '';

  document.getElementById('drePeriodoLabel').textContent =
    `${dados.cc.toUpperCase()} — ${nomeMes(dados.mes)}/${dados.ano} | Atualizado: ${fmtDataHora(dados.atualizadoEm)}`;

  // Busca provisionamento do mesmo período
  let provLinhas = {};
  try {
    const snapProv = await getDoc(doc(db, 'orcamento_prov', `prov_${dados.cc}_${dados.mes}_${dados.ano}`));
    if (snapProv.exists()) provLinhas = snapProv.data().linhas || {};
  } catch(e) {}

  // Busca orçamento estático do mesmo período
  let orcLinhas = {};
  try {
    const snapOrc = await getDoc(doc(db, 'orcamento', `orc_${dados.cc}_${dados.mes}_${dados.ano}`));
    if (snapOrc.exists()) orcLinhas = snapOrc.data().linhas || {};
  } catch(e) {}

  // Mapa DRE label → chave do orçamento
  const dreToOrcKey = {
    'Receita Operacional Bruta':     'RECEITA OPERACIONAL',
    'Receitas Financeiras':          'RECEITA NAO OPERACIONAL',
    'Impostos da Receita Bruta':     'IMPOSTOS',
    'Custos':                        'DESPESA OPERACIONAL',
    'Despesas':                      'DESPESA NÃO OPERACIONAL',
    'Investimentos':                 'INVESTIMENTOS',
    'Amortizações':                  'AMORTIZAÇÃO'
  };

  // Calcula totais do orçamento por grupo DRE
  function totalOrcPorDRE(dreKey) {
    if (typeof PLANO_CONTAS === 'undefined') return 0;
    return PLANO_CONTAS
      .filter(c => c.dre === dreKey)
      .reduce((sum, c) => sum + (parseFloat(orcLinhas[c.codigo]) || 0), 0);
  }

  function totalProvPorDRE(dreKey) {
    if (typeof PLANO_CONTAS === 'undefined') return 0;
    return PLANO_CONTAS
      .filter(c => c.dre === dreKey)
      .reduce((sum, c) => sum + (parseFloat(provLinhas[c.codigo]) || 0), 0);
  }

  // Atualiza cabeçalho da tabela para 5 colunas
  const thead = document.querySelector('#dreTable thead tr');
  if (thead) {
    thead.innerHTML = `
      <th>Descrição</th>
      <th class="text-right">Orçado (R$)</th>
      <th class="text-right">Provisionado (R$)</th>
      <th class="text-right">Realizado (R$)</th>
      <th class="text-right">Var %</th>
    `;
  }

  const tbody = document.getElementById('dreTableBody');
  tbody.innerHTML = '';

  dados.linhas.forEach(l => {
    const tr = document.createElement('tr');
    if (l.tipo === 'subtotal') tr.classList.add('subtotal');
    if (l.tipo === 'total')    tr.classList.add('total-row');

    // Busca orçado e provisionado pelo grupo DRE
    const dreKey   = dreToOrcKey[l.label] || '';
    const orcado   = dreKey ? totalOrcPorDRE(dreKey)  : l.previsto;
    const provisto = dreKey ? totalProvPorDRE(dreKey) : 0;

    // Var% realizado vs orçado
    let varHtml = '—';
    if (l.varPct !== null) {
      const v   = parseFloat(l.varPct);
      const cls = classVar(l.tipo, v);
      const ico = (v > 100 && l.tipo === 'deducao') ? ' ⬆' : '';
      varHtml   = `<span class="${cls}">${v.toFixed(2)}%${ico}</span>`;
    }

    // Var% realizado vs orçado (quando tem orçamento)
    let varOrcHtml = varHtml;
    if (orcado > 0 && l.realizado !== undefined) {
      const vOrc = ((l.realizado / orcado) * 100);
      const cls  = classVar(l.tipo, vOrc);
      const ico  = (vOrc > 100 && l.tipo === 'deducao') ? ' ⬆' : '';
      varOrcHtml = `<span class="${cls}">${vOrc.toFixed(2)}%${ico}</span>`;
    }

    tr.innerHTML = `
      <td>${l.label}</td>
      <td class="text-right" style="color:#1e40af;font-weight:600">${orcado > 0 ? fmtMoeda(orcado) : fmtMoeda(l.previsto)}</td>
      <td class="text-right" style="color:#92400e;font-weight:600">${provisto > 0 ? fmtMoeda(provisto) : '—'}</td>
      <td class="text-right">${fmtMoeda(l.realizado)}</td>
      <td class="text-right">${varOrcHtml}</td>
    `;
    tbody.appendChild(tr);
  });
}

function classVar(tipo, v) {
  if (tipo === 'entrada' || tipo === 'subtotal' || tipo === 'total')
    return v >= 100 ? 'var-positivo' : v >= 80 ? 'var-alerta' : 'var-negativo';
  return v <= 100 ? 'var-positivo' : v <= 120 ? 'var-alerta' : 'var-negativo';
}

window.showDreUpload = function () {
  document.getElementById('dreUploadSection').style.display = '';
  document.getElementById('dreTableSection').style.display  = 'none';
};

// ============================================
// ============================================
// MÓDULO BALANÇO PATRIMONIAL
// ============================================
// ============================================

async function salvarBP(rows, nomeArquivo) {
  const cc  = document.getElementById('bpCC').value;
  const mes = document.getElementById('bpMes').value;
  const ano = document.getElementById('bpAno').value;

  mostrarStatus('bp', 'loading', '⏳ Processando Balanço...');

  const c = {
    caixa:            buscar(rows, ['caixa']),
    clientes:         buscar(rows, ['clientes']),
    bancos:           buscar(rows, ['bancos']),
    aplicacoes:       buscar(rows, ['aplica']),
    estoque:          buscar(rows, ['estoque produto','almoxarifado']),
    creditosJudiciais:buscar(rows, ['creditos judiciais','judicial']),
    maquinas:         buscar(rows, ['maquinas','equipamentos','tanques']),
    veiculos:         buscar(rows, ['veiculos','fipe']),
    instalacoes:      buscar(rows, ['instalacoes']),
    estoqueImob:      buscar(rows, ['imobilizado','sanitario','trailer']),
    fornecedores:     buscar(rows, ['fornecedores']),
    impostosMun:      buscar(rows, ['impostos municipais']),
    previsaoImp:      buscar(rows, ['previsao de impostos']),
    emprestimos:      buscar(rows, ['emprestimos']),
    amortizacaoPC:    buscar(rows, ['amortizacao']),
    financiamentosPC: buscar(rows, ['financiamentos']),
    amortizacaoLP:    buscar(rows, ['amortizacao lp']),
    financiamentosLP: buscar(rows, ['financiamentos lp']),
    custasTrabalh:    buscar(rows, ['custas trabalhistas','trabalhistas']),
    pl:               buscar(rows, ['patrimonio liquido'])
  };

  c.totalAC      = c.caixa + c.clientes + c.bancos + c.aplicacoes + c.estoque;
  c.totalAP      = c.maquinas + c.veiculos + c.instalacoes + c.estoqueImob;
  c.totalAtivo   = c.totalAC + c.creditosJudiciais + c.totalAP;
  c.totalPC      = c.fornecedores + c.impostosMun + c.previsaoImp + c.emprestimos + c.amortizacaoPC + c.financiamentosPC;
  c.totalELP     = c.amortizacaoLP + c.financiamentosLP + c.custasTrabalh;
  c.totalPassivo = c.totalPC + c.totalELP + c.pl;

  // Índices de liquidez
  c.ilg  = c.totalPC + c.totalELP > 0 ? ((c.totalAC + c.creditosJudiciais) / (c.totalPC + c.totalELP)).toFixed(2) : '0.00';
  c.ilg2 = c.totalPassivo > 0 ? (c.totalAtivo / c.totalPassivo).toFixed(2) : '0.00';
  c.ilc  = c.totalPC > 0 ? (c.totalAC / c.totalPC).toFixed(2) : '0.00';
  c.ils  = c.totalPC > 0 ? ((c.totalAC - c.estoque) / c.totalPC).toFixed(2) : '0.00';
  c.ili  = c.totalPC > 0 ? ((c.caixa + c.bancos + c.aplicacoes) / c.totalPC).toFixed(2) : '0.00';

  try {
    await setDoc(doc(db, 'balanco', `bp_${cc}_${mes}_${ano}`), {
      cc, mes, ano, nomeArquivo, campos: c,
      atualizadoEm:  new Date().toISOString(),
      atualizadoPor: window.currentUser?.uid || 'sistema'
    });

    mostrarStatus('bp', 'success',
      `✅ Balanço importado! CC: <strong>${cc.toUpperCase()}</strong> | Período: <strong>${nomeMes(mes)}/${ano}</strong><br>` +
      `<small>⚠️ Dados anteriores do mesmo período foram substituídos</small>`
    );

    setTimeout(() => renderBP(c), 900);

  } catch (err) {
    mostrarStatus('bp', 'error', `❌ Erro: ${err.message}`);
  }
}

function renderBP(c) {
  document.getElementById('bpUploadSection').style.display = 'none';
  document.getElementById('bpContent').style.display       = '';

  const mapa = {
    'bp-caixa': c.caixa, 'bp-clientes': c.clientes, 'bp-bancos': c.bancos,
    'bp-aplicacoes': c.aplicacoes, 'bp-estoque': c.estoque, 'bp-totalAC': c.totalAC,
    'bp-creditosJudiciais': c.creditosJudiciais, 'bp-maquinas': c.maquinas,
    'bp-veiculos': c.veiculos, 'bp-instalacoes': c.instalacoes,
    'bp-estoqueImob': c.estoqueImob, 'bp-totalAP': c.totalAP,
    'bp-totalAtivo': c.totalAtivo, 'bp-fornecedores': c.fornecedores,
    'bp-impostosMun': c.impostosMun, 'bp-previsaoImp': c.previsaoImp,
    'bp-emprestimos': c.emprestimos, 'bp-amortizacaoPC': c.amortizacaoPC,
    'bp-financiamentosPC': c.financiamentosPC, 'bp-totalPC': c.totalPC,
    'bp-amortizacaoLP': c.amortizacaoLP, 'bp-financiamentosLP': c.financiamentosLP,
    'bp-custasTrabalh': c.custasTrabalh, 'bp-totalELP': c.totalELP,
    'bp-pl': c.pl, 'bp-totalPassivo': c.totalPassivo
  };

  Object.entries(mapa).forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = fmtMoeda(val || 0);
  });

  // Índices
  [
    { id: 'ilg',  val: c.ilg,  ref: 1.0 },
    { id: 'ilg2', val: c.ilg2, ref: 1.0 },
    { id: 'ilc',  val: c.ilc,  ref: 1.5 },
    { id: 'ils',  val: c.ils,  ref: 1.0 },
    { id: 'ili',  val: c.ili,  ref: 0.2 }
  ].forEach(({ id, val, ref }) => {
    const v    = parseFloat(val);
    const card = document.getElementById(`liq-${id}`);
    const valEl= document.getElementById(`val-${id}`);
    const stEl = document.getElementById(`status-${id}`);
    if (!valEl) return;

    valEl.textContent = v.toFixed(2);
    card.classList.remove('status-ok','status-alerta','status-critico');

    if (v >= ref)        { card.classList.add('status-ok');      stEl.textContent = '🟢'; }
    else if (v >= ref*.7){ card.classList.add('status-alerta');  stEl.textContent = '🟡'; }
    else                 { card.classList.add('status-critico'); stEl.textContent = '🔴'; }
  });
}

// ============================================
// ============================================
// ============================================
// MÓDULO INDICADORES
// ============================================
// ============================================

async function carregarIndicadores() {
  const modulo = document.getElementById('pg-indicadores');
  const btnNovo = document.getElementById('btnNovoIndicador');

  if (window.currentUser?.perfil === 'admin') {
    if (btnNovo) btnNovo.style.display = '';
  }

  try {
    const snap = await getDocs(collection(db, 'indicadores'));
    if (snap.empty) return;

    const emptyState = modulo.querySelector('.empty-state');
    if (emptyState) emptyState.remove();

    const gridExistente = modulo.querySelector('.indicadores-grid');
    if (gridExistente) gridExistente.remove();

    const grid = document.createElement('div');
    grid.className = 'indicadores-grid';

    snap.forEach(docSnap => {
      const ind = docSnap.data();
      const varPct = ind.meta > 0 ? ((ind.realizado / ind.meta) * 100).toFixed(1) : null;
      const status = varPct >= 100 ? '🟢' : varPct >= 80 ? '🟡' : '🔴';

      const card = document.createElement('div');
      card.className = 'kpi';
      card.style.flexDirection = 'column';
      card.style.alignItems    = 'flex-start';
      card.style.gap           = '12px';
      card.innerHTML = `
        <div style="display:flex;justify-content:space-between;width:100%;align-items:center">
          <span style="font-size:14px;font-weight:800;color:#10243B">${ind.nome}</span>
          <span style="font-size:22px">${status}</span>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;width:100%">
          <div style="text-align:center;background:#F0F4F8;border-radius:8px;padding:8px">
            <div style="font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;margin-bottom:4px">META</div>
            <div style="font-size:15px;font-weight:800;color:#10243B">${fmtInd(ind.meta, ind.unidade)}</div>
          </div>
          <div style="text-align:center;background:#F0F4F8;border-radius:8px;padding:8px">
            <div style="font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;margin-bottom:4px">REALIZADO</div>
            <div style="font-size:15px;font-weight:800;color:#10243B">${fmtInd(ind.realizado || 0, ind.unidade)}</div>
          </div>
          <div style="text-align:center;background:#F0F4F8;border-radius:8px;padding:8px">
            <div style="font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;margin-bottom:4px">ANO ANT.</div>
            <div style="font-size:15px;font-weight:800;color:#94a3b8">${fmtInd(ind.anoAnterior || 0, ind.unidade)}</div>
          </div>
        </div>
        ${ind.diario ? '<span style="font-size:11px;color:#f59e0b;font-weight:600">⏱️ Acompanhamento Diário</span>' : ''}
      `;
      grid.appendChild(card);
    });

    modulo.querySelector('.card').after(grid);

  } catch (err) {
    showToast('Erro ao carregar indicadores', 'error');
  }
}

document.getElementById('formIndicador').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nome        = document.getElementById('indNome').value.trim();
  const unidade     = document.getElementById('indUnidade').value;
  const meta        = parseFloat(document.getElementById('indMeta').value) || 0;
  const anoAnterior = parseFloat(document.getElementById('indAnoAnterior').value) || 0;
  const diario      = document.getElementById('indDiario').checked;

  try {
    await setDoc(doc(db, 'indicadores', `ind_${Date.now()}`), {
      nome, unidade, meta, anoAnterior, diario, realizado: 0,
      criadoEm: new Date().toISOString()
    });
    showToast(`✅ Indicador "${nome}" criado!`, 'success');
    window.fecharModal('modalIndicador');
    document.getElementById('formIndicador').reset();
    carregarIndicadores();
  } catch (err) {
    showToast('Erro ao salvar: ' + err.message, 'error');
  }
});

// ============================================
// ============================================
// ANÁLISE IA — ChatGPT
// ============================================
// ============================================

window.gerarAnaliseIA = async function (modulo) {
  const apiKey = localStorage.getItem('openai_key');
  if (!apiKey) {
    showToast('⚙️ Configure a chave da API OpenAI em Configurações', 'error');
    navegarPara('configuracoes');
    return;
  }

  const ids = { dre: 'dreIAContent', balanco: 'balancoIAContent' };
  const el  = document.getElementById(ids[modulo]);
  if (!el) return;

  el.innerHTML = '<p class="ia-placeholder">⏳ Gerando análise com IA...</p>';

  try {
    const prompt = await montarPrompt(modulo);
    if (!prompt) {
      el.innerHTML = '<p class="ia-placeholder">⚠️ Importe os dados primeiro para gerar a análise</p>';
      return;
    }

    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `Você é um analista financeiro sênior especializado em gestão empresarial brasileira.
Analise os dados financeiros e gere insights objetivos com pontos críticos, tendências e recomendações práticas.
Use linguagem profissional e emojis para facilitar a leitura. Seja direto e objetivo.`
          },
          { role: 'user', content: prompt }
        ],
        max_tokens: 800, temperature: 0.7
      })
    });

    const data = await resp.json();
    if (data.error) throw new Error(data.error.message);

    el.innerHTML = `<div class="ia-text">${data.choices[0].message.content}</div>`;

  } catch (err) {
    el.innerHTML = `<p class="ia-placeholder" style="color:#ef4444">❌ Erro: ${err.message}</p>`;
  }
};

async function montarPrompt(modulo) {
  if (modulo === 'dre') {
    const cc  = document.getElementById('dreCC').value;
    const mes = document.getElementById('dreMes').value;
    const ano = document.getElementById('dreAno').value;
    const snap = await getDoc(doc(db, 'dre', chaveDRE(cc, mes, ano)));
    if (!snap.exists()) return null;
    const d = snap.data();
    let p = `DRE — CC: ${cc.toUpperCase()} | Período: ${nomeMes(mes)}/${ano}\n\n`;
    d.linhas.forEach(l => {
      p += `${l.label}: Previsto R$${l.previsto.toLocaleString('pt-BR')} | Realizado R$${l.realizado.toLocaleString('pt-BR')} | Var: ${l.varPct || 0}%\n`;
    });
    p += '\nGere análise: 1) Pontos positivos 2) Pontos de atenção 3) Recomendações práticas';
    return p;
  }

  if (modulo === 'balanco') {
    const cc  = document.getElementById('bpCC').value;
    const mes = document.getElementById('bpMes').value;
    const ano = document.getElementById('bpAno').value;
    const snap = await getDoc(doc(db, 'balanco', `bp_${cc}_${mes}_${ano}`));
    if (!snap.exists()) return null;
    const c = snap.data().campos;
    return `Balanço Patrimonial — CC: ${cc.toUpperCase()} | ${nomeMes(mes)}/${ano}
Total Ativo: R$${c.totalAtivo?.toLocaleString('pt-BR')} | Total Passivo: R$${c.totalPassivo?.toLocaleString('pt-BR')}
Índices: ILG=${c.ilg}(>1,0) | ILG2=${c.ilg2}(>1,0) | ILC=${c.ilc}(>1,5) | ILS=${c.ils}(>1,0) | ILI=${c.ili}(>0,2)
Gere análise: 1) Situação de liquidez 2) Riscos 3) Recomendações`;
  }
  return null;
}

// ============================================
// CONFIGURAÇÕES — API KEY
// ============================================
window.salvarAPIKey = function () {
  const key = document.getElementById('openaiKey').value.trim();
  if (!key.startsWith('sk-')) {
    showToast('❌ Chave inválida. Deve começar com sk-', 'error');
    return;
  }
  localStorage.setItem('openai_key', key);
  showToast('✅ Chave da API salva com sucesso!', 'success');
};

// Carrega chave salva
const savedKey = localStorage.getItem('openai_key');
if (savedKey) {
  const el = document.getElementById('openaiKey');
  if (el) el.value = savedKey;
}

// ============================================
// ============================================
// UTILITÁRIOS
// ============================================
// ============================================

function buscar(rows, termos) {
  for (const row of rows) {
    const desc = normalizar(String(row[0] || ''));
    for (const t of termos) {
      if (desc.includes(normalizar(t))) {
        for (let j = 1; j < row.length; j++) {
          const v = toNum(row[j]);
          if (v !== 0) return v;
        }
      }
    }
  }
  return 0;
}

function normalizar(str) {
  return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

function toNum(val) {
  return parseFloat(String(val || '0').replace(/[^\d,.-]/g, '').replace(',', '.')) || 0;
}

function mostrarStatus(tipo, classe, html) {
  if (tipo === 'dre') {
    const el = document.getElementById('dreUploadStatus');
    if (el) { el.style.display = ''; el.className = `upload-status ${classe}`; el.innerHTML = html; }
  } else {
    if (classe === 'success') showToast('✅ Dados importados com sucesso!', 'success');
    if (classe === 'error')   showToast('❌ Erro na importação', 'error');
  }
}

function fmtMoeda(v) {
  if (v === null || v === undefined || isNaN(v)) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}

function fmtInd(v, unidade) {
  if (unidade === 'R$') return fmtMoeda(v);
  if (unidade === '%')  return `${v.toFixed(1)}%`;
  return v.toLocaleString('pt-BR');
}

function fmtDataHora(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('pt-BR');
}

function nomeMes(num) {
  const m = ['','Janeiro','Fevereiro','Março','Abril','Maio','Junho',
              'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  return m[parseInt(num)] || num;
}

// ============================================
// TOAST GLOBAL
// ============================================
window.showToast = function (msg, tipo = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className   = `toast ${tipo}`;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3500);
};