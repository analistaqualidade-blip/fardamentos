import {
  escapeHtml,
  formatDateTime,
  formatIsoDateBR,
  getTodayIsoDate,
  addDaysIsoDate,
  getVencimentoInfo,
  renderStatusBadge,
  calcularGradeItens,
  formatGradeResumo,
  openModal,
  closeModal,
  confirmAction,
  showToast,
  refreshIcons,
  toDate
} from '../utils.js';
import { getState, registrarBoleto, confirmarPagamento } from '../store.js';

const viewState = {
  tab: 'faturamento', // 'faturamento' | 'cobrancas' | 'historico'
  unidadeFiltro: 'TODAS',
  situacaoFiltro: 'TODAS',
  busca: '',
  dataInicio: '',
  dataFim: ''
};

export function renderFinanceiroModule(container, { state, onOpenRaioX }) {
  const filaFaturamento = state.pedidos.filter((p) => p.status === 'AGUARDANDO_FATURAMENTO');
  const cobrancas = state.pedidos.filter((p) => p.status === 'AGUARDANDO_PAGAMENTO');
  const pagos = state.pedidos.filter((p) =>
    ['PAGO', 'EM_FABRICACAO', 'EM_TRANSITO', 'RECEBIDO_UNIDADE', 'CONCLUIDO'].includes(p.status)
  );

  const vencidosCount = cobrancas.filter((p) => getVencimentoInfo(p.financeiro?.dataVencimento).status === 'vencido').length;
  const hojeOuEmBreveCount = cobrancas.filter((p) => {
    const st = getVencimentoInfo(p.financeiro?.dataVencimento).status;
    return st === 'vence_hoje' || st === 'em_breve';
  }).length;

  container.innerHTML = `
    <div class="space-y-6">
      <div>
        <h2 class="text-xl font-bold text-gray-900">Módulo Financeiro &amp; Cobranças</h2>
        <p class="text-sm text-gray-600">Emita boletos das solicitações recebidas, monitore vencimentos e libere pedidos pagos para produção.</p>
      </div>

      <!-- KPIs Financeiros -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div class="bg-white rounded-xl border border-gray-200 p-4">
          <p class="text-xs font-medium text-gray-500">Fila de Faturamento</p>
          <p class="text-2xl font-bold text-gray-900 mt-1">${filaFaturamento.length}</p>
          <p class="text-xs text-gray-500 mt-1">${filaFaturamento.reduce((a, p) => a + (p.totalPecas || 0), 0)} peças aguardando boleto</p>
        </div>
        <div class="bg-white rounded-xl border border-gray-200 p-4">
          <p class="text-xs font-medium text-gray-500">Boletos em Aberto</p>
          <p class="text-2xl font-bold text-amber-700 mt-1">${cobrancas.length}</p>
          <p class="text-xs text-gray-500 mt-1">${hojeOuEmBreveCount} vencem hoje ou em até 3d</p>
        </div>
        <div class="bg-white rounded-xl border border-gray-200 p-4">
          <p class="text-xs font-medium text-gray-500">Boletos Vencidos</p>
          <p class="text-2xl font-bold ${vencidosCount ? 'text-red-700' : 'text-gray-900'} mt-1">${vencidosCount}</p>
          <p class="text-xs text-gray-500 mt-1">Requer cobrança prioritária</p>
        </div>
        <div class="bg-white rounded-xl border border-gray-200 p-4">
          <p class="text-xs font-medium text-gray-500">Pedidos Liquidados</p>
          <p class="text-2xl font-bold text-brand-900 mt-1">${pagos.length}</p>
          <p class="text-xs text-gray-500 mt-1">${pagos.reduce((a, p) => a + (p.totalPecas || 0), 0)} peças já pagas</p>
        </div>
      </div>

      <!-- Abas + Filtros -->
      <div class="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div class="border-b border-gray-200 px-4 pt-3 flex flex-wrap gap-2 bg-gray-50">
          ${renderFinTabButton('faturamento', 'Fila de Faturamento', filaFaturamento.length, 'file-plus')}
          ${renderFinTabButton('cobrancas', 'Controle de Cobranças', cobrancas.length, 'calendar-clock')}
          ${renderFinTabButton('historico', 'Histórico de Pagos', pagos.length, 'check-circle-2')}
        </div>

        <!-- Barra de Filtros -->
        <div class="p-4 border-b border-gray-200 flex flex-col lg:flex-row lg:items-center gap-3">
          <div class="relative flex-1">
            <i data-lucide="search" class="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2"></i>
            <input type="text" id="fin-search" value="${escapeHtml(viewState.busca)}"
              placeholder="Buscar por pedido, empresa, CNPJ ou nº do boleto..."
              class="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg bg-white" />
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <select id="fin-unit-filter" class="text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white">
              <option value="TODAS" ${viewState.unidadeFiltro === 'TODAS' ? 'selected' : ''}>Todas as Unidades</option>
              ${state.unidades
                .map(
                  (u) =>
                    `<option value="${escapeHtml(u)}" ${viewState.unidadeFiltro === u ? 'selected' : ''}>${escapeHtml(u)}</option>`
                )
                .join('')}
            </select>

            ${
              viewState.tab === 'cobrancas'
                ? `<select id="fin-situacao-filter" class="text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white">
                    <option value="TODAS" ${viewState.situacaoFiltro === 'TODAS' ? 'selected' : ''}>Todos Vencimentos</option>
                    <option value="vencido" ${viewState.situacaoFiltro === 'vencido' ? 'selected' : ''}>Vencidos</option>
                    <option value="alerta" ${viewState.situacaoFiltro === 'alerta' ? 'selected' : ''}>Vence Hoje / Em breve</option>
                    <option value="no_prazo" ${viewState.situacaoFiltro === 'no_prazo' ? 'selected' : ''}>No Prazo</option>
                  </select>`
                : ''
            }

            ${
              viewState.tab === 'historico'
                ? `<div class="flex items-center gap-1.5 text-xs">
                    <label class="text-gray-600 font-medium">De:</label>
                    <input type="date" id="fin-date-start" value="${escapeHtml(viewState.dataInicio)}"
                      class="border border-gray-300 rounded-lg px-2 py-1.5 text-xs bg-white" />
                    <label class="text-gray-600 font-medium">Até:</label>
                    <input type="date" id="fin-date-end" value="${escapeHtml(viewState.dataFim)}"
                      class="border border-gray-300 rounded-lg px-2 py-1.5 text-xs bg-white" />
                  </div>`
                : ''
            }
          </div>
        </div>

        <!-- Conteúdo da Aba -->
        <div class="p-4">
          ${renderFinTabBody({ filaFaturamento, cobrancas, pagos })}
        </div>
      </div>
    </div>
  `;

  refreshIcons(container);
  bindFinanceiroEvents(container, { state, onOpenRaioX });
}

function renderFinTabButton(id, label, count, icon) {
  const active = viewState.tab === id;
  return `
    <button type="button" data-fin-tab="${id}"
      class="px-4 py-2.5 text-xs sm:text-sm font-semibold rounded-t-xl border-b-2 inline-flex items-center gap-2 transition ${
        active
          ? 'bg-white text-brand-900 border-brand-900'
          : 'text-gray-600 border-transparent hover:text-gray-900 hover:bg-gray-100'
      }">
      <i data-lucide="${icon}" class="w-4 h-4"></i>
      <span>${label}</span>
      <span class="px-2 py-0.5 rounded-full text-[11px] font-bold ${active ? 'bg-brand-100 text-brand-900' : 'bg-gray-200 text-gray-700'}">${count}</span>
    </button>
  `;
}

function filterByCommon(list) {
  return list.filter((ped) => {
    if (viewState.unidadeFiltro !== 'TODAS' && ped.unidade !== viewState.unidadeFiltro) {
      return false;
    }
    if (viewState.busca.trim()) {
      const q = viewState.busca.trim().toLowerCase();
      const hit =
        String(ped.codigo || '').toLowerCase().includes(q) ||
        String(ped.empresaNome || '').toLowerCase().includes(q) ||
        String(ped.empresaCnpj || '').toLowerCase().includes(q) ||
        String(ped.turma || '').toLowerCase().includes(q) ||
        String(ped.financeiro?.numeroBoleto || '').toLowerCase().includes(q);
      if (!hit) return false;
    }
    return true;
  });
}

function renderFinTabBody({ filaFaturamento, cobrancas, pagos }) {
  if (viewState.tab === 'faturamento') {
    const rows = filterByCommon(filaFaturamento);
    if (rows.length === 0) {
      return renderEmptyFin('Nenhum pedido aguardando faturamento.');
    }

    return `
      <div class="overflow-x-auto">
        <table class="min-w-full text-sm text-left">
          <thead class="bg-gray-50 text-xs uppercase text-gray-500 border-b border-gray-200">
            <tr>
              <th class="px-4 py-3 font-semibold">Pedido / Unidade</th>
              <th class="px-4 py-3 font-semibold">Empresa / Turma</th>
              <th class="px-4 py-3 font-semibold">Peças / Grade</th>
              <th class="px-4 py-3 font-semibold">Solicitado em</th>
              <th class="px-4 py-3 font-semibold text-right">Ações</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200">
            ${rows
              .map((ped) => {
                const grade = calcularGradeItens(ped.itens || []);
                return `
              <tr class="hover:bg-gray-50">
                <td class="px-4 py-3.5 whitespace-nowrap">
                  <span class="font-mono font-bold text-xs text-brand-900 bg-brand-50 border border-brand-100 px-2 py-0.5 rounded">${escapeHtml(ped.codigo)}</span>
                  <div class="text-xs text-gray-600 mt-1">${escapeHtml(ped.unidade)}</div>
                </td>
                <td class="px-4 py-3.5">
                  <div class="font-semibold text-gray-900">${escapeHtml(ped.empresaNome)}</div>
                  <div class="text-xs text-gray-500">CNPJ ${escapeHtml(ped.empresaCnpj)} • Turma ${escapeHtml(ped.turma)}</div>
                </td>
                <td class="px-4 py-3.5">
                  <div class="font-semibold text-gray-900">${ped.totalPecas} peças (${(ped.itens || []).length} jovens)</div>
                  <div class="text-xs text-gray-500">${escapeHtml(formatGradeResumo(grade))}</div>
                </td>
                <td class="px-4 py-3.5 text-xs text-gray-600 whitespace-nowrap">
                  <div>${formatDateTime(ped.criadoEm)}</div>
                  <div class="text-gray-400">por ${escapeHtml(ped.criadoPor)}</div>
                </td>
                <td class="px-4 py-3.5 text-right whitespace-nowrap">
                  <div class="inline-flex items-center gap-2">
                    <button type="button" data-action="raio-x" data-pedido-id="${escapeHtml(ped.id)}"
                      class="px-2.5 py-1.5 rounded-lg border border-gray-300 text-xs font-medium text-gray-700 hover:bg-gray-100">
                      Raio-X
                    </button>
                    <button type="button" data-action="registrar-boleto" data-pedido-id="${escapeHtml(ped.id)}"
                      class="btn-primary px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5">
                      <i data-lucide="receipt" class="w-3.5 h-3.5"></i>
                      <span>Registrar Boleto</span>
                    </button>
                  </div>
                </td>
              </tr>
            `;
              })
              .join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  if (viewState.tab === 'cobrancas') {
    let rows = filterByCommon(cobrancas);
    if (viewState.situacaoFiltro !== 'TODAS') {
      rows = rows.filter((ped) => {
        const st = getVencimentoInfo(ped.financeiro?.dataVencimento).status;
        if (viewState.situacaoFiltro === 'vencido') return st === 'vencido';
        if (viewState.situacaoFiltro === 'alerta') return st === 'vence_hoje' || st === 'em_breve';
        if (viewState.situacaoFiltro === 'no_prazo') return st === 'no_prazo';
        return true;
      });
    }

    // Ordena mais urgentes primeiro (vencidos no topo)
    rows.sort((a, b) => {
      const da = getVencimentoInfo(a.financeiro?.dataVencimento).diasDiff ?? 9999;
      const dbDiff = getVencimentoInfo(b.financeiro?.dataVencimento).diasDiff ?? 9999;
      return da - dbDiff;
    });

    if (rows.length === 0) {
      return renderEmptyFin('Nenhuma cobrança em aberto para os filtros aplicados.');
    }

    return `
      <div class="overflow-x-auto">
        <table class="min-w-full text-sm text-left">
          <thead class="bg-gray-50 text-xs uppercase text-gray-500 border-b border-gray-200">
            <tr>
              <th class="px-4 py-3 font-semibold">Pedido / Unidade</th>
              <th class="px-4 py-3 font-semibold">Empresa / Boleto</th>
              <th class="px-4 py-3 font-semibold">Vencimento</th>
              <th class="px-4 py-3 font-semibold">Situação</th>
              <th class="px-4 py-3 font-semibold text-right">Ações</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200">
            ${rows
              .map((ped) => {
                const venc = getVencimentoInfo(ped.financeiro?.dataVencimento);
                return `
              <tr class="hover:bg-gray-50 ${venc.status === 'vencido' ? 'bg-red-50/40' : ''}">
                <td class="px-4 py-3.5 whitespace-nowrap">
                  <span class="font-mono font-bold text-xs text-brand-900 bg-brand-50 border border-brand-100 px-2 py-0.5 rounded">${escapeHtml(ped.codigo)}</span>
                  <div class="text-xs text-gray-600 mt-1">${escapeHtml(ped.unidade)} • ${ped.totalPecas} peças</div>
                </td>
                <td class="px-4 py-3.5">
                  <div class="font-semibold text-gray-900">${escapeHtml(ped.empresaNome)}</div>
                  <div class="text-xs text-gray-600 mt-0.5">
                    Boleto: <strong class="font-mono text-gray-900">${escapeHtml(ped.financeiro?.numeroBoleto || '—')}</strong>
                    • Emissão ${formatDateTime(ped.financeiro?.dataEmissaoBoleto)}
                  </div>
                </td>
                <td class="px-4 py-3.5 whitespace-nowrap font-medium text-gray-900">
                  ${formatIsoDateBR(ped.financeiro?.dataVencimento)}
                </td>
                <td class="px-4 py-3.5 whitespace-nowrap">
                  <span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${venc.badgeClass}">
                    ${escapeHtml(venc.label)}
                  </span>
                </td>
                <td class="px-4 py-3.5 text-right whitespace-nowrap">
                  <div class="inline-flex items-center gap-2">
                    <button type="button" data-action="raio-x" data-pedido-id="${escapeHtml(ped.id)}"
                      class="px-2.5 py-1.5 rounded-lg border border-gray-300 text-xs font-medium text-gray-700 hover:bg-gray-100">
                      Raio-X
                    </button>
                    <button type="button" data-action="confirmar-pagamento" data-pedido-id="${escapeHtml(ped.id)}"
                      class="btn-primary px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5">
                      <i data-lucide="badge-check" class="w-3.5 h-3.5"></i>
                      <span>Confirmar Pagamento</span>
                    </button>
                  </div>
                </td>
              </tr>
            `;
              })
              .join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  // Aba Histórico de Pagos
  let rows = filterByCommon(pagos);
  if (viewState.dataInicio) {
    const startParts = viewState.dataInicio.split('-').map(Number);
    const startDate = new Date(startParts[0], startParts[1] - 1, startParts[2], 0, 0, 0);
    rows = rows.filter((p) => {
      const pagDate = toDate(p.financeiro?.dataPagamento);
      return pagDate && pagDate >= startDate;
    });
  }
  if (viewState.dataFim) {
    const endParts = viewState.dataFim.split('-').map(Number);
    const endDate = new Date(endParts[0], endParts[1] - 1, endParts[2], 23, 59, 59, 999);
    rows = rows.filter((p) => {
      const pagDate = toDate(p.financeiro?.dataPagamento);
      return pagDate && pagDate <= endDate;
    });
  }

  if (rows.length === 0) {
    return renderEmptyFin('Nenhum pagamento encontrado no período/filtro selecionado.');
  }

  return `
    <div class="overflow-x-auto">
      <table class="min-w-full text-sm text-left">
        <thead class="bg-gray-50 text-xs uppercase text-gray-500 border-b border-gray-200">
          <tr>
            <th class="px-4 py-3 font-semibold">Pedido / Unidade</th>
            <th class="px-4 py-3 font-semibold">Empresa / Boleto</th>
            <th class="px-4 py-3 font-semibold">Vencimento</th>
            <th class="px-4 py-3 font-semibold">Pago em</th>
            <th class="px-4 py-3 font-semibold">Status Atual</th>
            <th class="px-4 py-3 font-semibold text-right">Detalhes</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-200">
          ${rows
            .map(
              (ped) => `
            <tr class="hover:bg-gray-50">
              <td class="px-4 py-3.5 whitespace-nowrap">
                <span class="font-mono font-bold text-xs text-brand-900 bg-brand-50 border border-brand-100 px-2 py-0.5 rounded">${escapeHtml(ped.codigo)}</span>
                <div class="text-xs text-gray-600 mt-1">${escapeHtml(ped.unidade)} • ${ped.totalPecas} peças</div>
              </td>
              <td class="px-4 py-3.5">
                <div class="font-semibold text-gray-900">${escapeHtml(ped.empresaNome)}</div>
                <div class="text-xs text-gray-500">Boleto <strong class="font-mono">${escapeHtml(ped.financeiro?.numeroBoleto || '—')}</strong></div>
              </td>
              <td class="px-4 py-3.5 whitespace-nowrap text-xs text-gray-600">${formatIsoDateBR(ped.financeiro?.dataVencimento)}</td>
              <td class="px-4 py-3.5 whitespace-nowrap text-xs font-semibold text-emerald-700">${formatDateTime(ped.financeiro?.dataPagamento)}</td>
              <td class="px-4 py-3.5 whitespace-nowrap">${renderStatusBadge(ped.status)}</td>
              <td class="px-4 py-3.5 text-right whitespace-nowrap">
                <button type="button" data-action="raio-x" data-pedido-id="${escapeHtml(ped.id)}"
                  class="px-2.5 py-1.5 rounded-lg border border-gray-300 text-xs font-medium text-gray-700 hover:bg-gray-100">
                  Raio-X
                </button>
              </td>
            </tr>
          `
            )
            .join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderEmptyFin(msg) {
  return `
    <div class="text-center py-12">
      <div class="w-12 h-12 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center mx-auto mb-3">
        <i data-lucide="receipt" class="w-6 h-6"></i>
      </div>
      <p class="text-sm font-medium text-gray-600">${escapeHtml(msg)}</p>
    </div>
  `;
}

function bindFinanceiroEvents(container, { state, onOpenRaioX }) {
  const rerenderCurrent = () => renderFinanceiroModule(container, { state: getState(), onOpenRaioX });

  container.querySelectorAll('[data-fin-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      viewState.tab = btn.getAttribute('data-fin-tab');
      rerenderCurrent();
    });
  });

  container.querySelector('#fin-search')?.addEventListener('input', (e) => {
    viewState.busca = e.target.value;
    rerenderCurrent();
    const el = container.querySelector('#fin-search');
    if (el) {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
  });

  container.querySelector('#fin-unit-filter')?.addEventListener('change', (e) => {
    viewState.unidadeFiltro = e.target.value;
    rerenderCurrent();
  });

  container.querySelector('#fin-situacao-filter')?.addEventListener('change', (e) => {
    viewState.situacaoFiltro = e.target.value;
    rerenderCurrent();
  });

  container.querySelector('#fin-date-start')?.addEventListener('change', (e) => {
    viewState.dataInicio = e.target.value;
    rerenderCurrent();
  });

  container.querySelector('#fin-date-end')?.addEventListener('change', (e) => {
    viewState.dataFim = e.target.value;
    rerenderCurrent();
  });

  container.querySelectorAll('[data-action="raio-x"]').forEach((btn) => {
    btn.addEventListener('click', () => onOpenRaioX(btn.getAttribute('data-pedido-id')));
  });

  container.querySelectorAll('[data-action="registrar-boleto"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const pedidoId = btn.getAttribute('data-pedido-id');
      const ped = state.pedidos.find((p) => p.id === pedidoId);
      if (ped) openRegistrarBoletoModal(ped);
    });
  });

  container.querySelectorAll('[data-action="confirmar-pagamento"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const pedidoId = btn.getAttribute('data-pedido-id');
      const ped = state.pedidos.find((p) => p.id === pedidoId);
      if (!ped) return;

      const ok = await confirmAction({
        title: 'Confirmar Pagamento do Boleto',
        message: `Confirmar a liquidação do boleto ${ped.financeiro?.numeroBoleto || ''} referente ao pedido ${ped.codigo} (${ped.empresaNome})? O pedido será liberado imediatamente para fabricação.`,
        confirmLabel: 'Confirmar Pagamento'
      });
      if (!ok) return;

      try {
        await confirmarPagamento(pedidoId);
        showToast(`Pagamento do pedido ${ped.codigo} confirmado! Liberado ao Patrimônio.`, 'success');
      } catch (error) {
        showToast(error.message || 'Erro ao confirmar pagamento.', 'error');
      }
    });
  });
}

function openRegistrarBoletoModal(ped) {
  const defaultDue = addDaysIsoDate(getTodayIsoDate(), 5);

  openModal({
    title: `Registrar Boleto — ${ped.codigo}`,
    subtitle: `${ped.empresaNome} (${ped.unidade}) • ${ped.totalPecas} peças`,
    size: 'md',
    bodyHtml: `
      <form id="form-registrar-boleto" class="space-y-4">
        <div class="rounded-xl bg-gray-50 border border-gray-200 p-3 text-xs text-gray-700">
          CNPJ: <strong>${escapeHtml(ped.empresaCnpj)}</strong> • Turma: <strong>${escapeHtml(ped.turma)}</strong>
        </div>

        <div>
          <label for="input-numero-boleto" class="block text-sm font-medium text-gray-700 mb-1">Número / Identificador do Boleto *</label>
          <input id="input-numero-boleto" type="text" required placeholder="Ex: BOL-2026-0915"
            class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg font-mono" />
        </div>

        <div>
          <label for="input-vencimento-boleto" class="block text-sm font-medium text-gray-700 mb-1">Data de Vencimento *</label>
          <input id="input-vencimento-boleto" type="date" required value="${defaultDue}"
            class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg" />
        </div>
      </form>
    `,
    footerHtml: `
      <button type="button" data-modal-close class="px-4 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-100">
        Cancelar
      </button>
      <button type="submit" form="form-registrar-boleto" id="btn-submit-boleto"
        class="btn-primary px-4 py-2 rounded-lg text-sm font-semibold inline-flex items-center gap-1.5">
        <i data-lucide="check" class="w-4 h-4"></i>
        <span>Salvar Boleto</span>
      </button>
    `,
    onRender: (modalEl) => {
      const form = modalEl.querySelector('#form-registrar-boleto');
      const numInput = modalEl.querySelector('#input-numero-boleto');
      numInput?.focus();

      form?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const numeroBoleto = numInput?.value || '';
        const dataVencimento = modalEl.querySelector('#input-vencimento-boleto')?.value || '';
        const btn = modalEl.querySelector('#btn-submit-boleto');

        try {
          if (btn) btn.disabled = true;
          await registrarBoleto(ped.id, { numeroBoleto, dataVencimento });
          closeModal();
          showToast(`Boleto registrado para ${ped.codigo}. Movido para Controle de Cobranças.`, 'success');
        } catch (error) {
          showToast(error.message || 'Erro ao registrar boleto.', 'error');
        } finally {
          if (btn) btn.disabled = false;
        }
      });
    }
  });
}
