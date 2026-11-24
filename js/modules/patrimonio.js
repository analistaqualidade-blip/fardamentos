import {
  TAMANHOS,
  escapeHtml,
  formatDateTime,
  calcularGradeItens,
  calcularGradePedidos,
  sumGrade,
  renderGradePills,
  renderStatusBadge,
  openModal,
  closeModal,
  confirmAction,
  showToast,
  refreshIcons
} from '../utils.js';
import { getState, gerarLoteFabricacao, despacharLote } from '../store.js';

const viewState = {
  tab: 'fila', // 'fila' | 'lotes'
  loteStatusFilter: 'EM_FABRICACAO', // 'EM_FABRICACAO' | 'FINALIZADO_FABRICA' | 'TODOS'
  selectedIds: new Set(),
  observacoes: '',
  unidadeFiltro: 'TODAS',
  busca: ''
};

export function renderPatrimonioModule(container, { state, onOpenRaioX }) {
  const pedidosPagos = state.pedidos.filter((p) => p.status === 'PAGO');
  const lotesEmFab = state.lotes.filter((l) => l.status === 'EM_FABRICACAO');
  const lotesFinalizados = state.lotes.filter((l) => l.status === 'FINALIZADO_FABRICA');

  // Remove da seleção IDs que já saíram do status PAGO
  const pagosIdsSet = new Set(pedidosPagos.map((p) => p.id));
  for (const id of [...viewState.selectedIds]) {
    if (!pagosIdsSet.has(id)) viewState.selectedIds.delete(id);
  }

  const pedidosPagosFiltrados = pedidosPagos.filter((ped) => {
    if (viewState.unidadeFiltro !== 'TODAS' && ped.unidade !== viewState.unidadeFiltro) {
      return false;
    }
    if (viewState.busca.trim()) {
      const q = viewState.busca.trim().toLowerCase();
      const hit =
        String(ped.codigo || '').toLowerCase().includes(q) ||
        String(ped.empresaNome || '').toLowerCase().includes(q) ||
        String(ped.turma || '').toLowerCase().includes(q);
      if (!hit) return false;
    }
    return true;
  });

  const selectedPedidos = pedidosPagos.filter((p) => viewState.selectedIds.has(p.id));
  const gradeSelecionada = calcularGradePedidos(selectedPedidos);
  const totalPecasSelecionadas = sumGrade(gradeSelecionada);

  const lotesFiltrados = state.lotes.filter((l) => {
    if (viewState.loteStatusFilter === 'TODOS') return true;
    return l.status === viewState.loteStatusFilter;
  });

  container.innerHTML = `
    <div class="space-y-6">
      <div>
        <h2 class="text-xl font-bold text-gray-900">Patrimônio &amp; Logística de Fabricação</h2>
        <p class="text-sm text-gray-600">Consolide pedidos pagos em ordens de fabricação, gere mapas de separação por unidade e imprima romaneios.</p>
      </div>

      <!-- KPIs Logísticos -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div class="bg-white rounded-xl border border-gray-200 p-4">
          <p class="text-xs font-medium text-gray-500">Pagos p/ Produção</p>
          <p class="text-2xl font-bold text-brand-900 mt-1">${pedidosPagos.length}</p>
          <p class="text-xs text-gray-500 mt-1">${pedidosPagos.reduce((a, p) => a + (p.totalPecas || 0), 0)} peças aguardando lote</p>
        </div>
        <div class="bg-white rounded-xl border border-gray-200 p-4">
          <p class="text-xs font-medium text-gray-500">Selecionados no Lote</p>
          <p class="text-2xl font-bold text-gray-900 mt-1">${selectedPedidos.length}</p>
          <p class="text-xs text-gray-500 mt-1">${totalPecasSelecionadas} peças consolidadas</p>
        </div>
        <div class="bg-white rounded-xl border border-gray-200 p-4">
          <p class="text-xs font-medium text-gray-500">Lotes em Fabricação</p>
          <p class="text-2xl font-bold text-sky-700 mt-1">${lotesEmFab.length}</p>
          <p class="text-xs text-gray-500 mt-1">${lotesEmFab.reduce((a, l) => a + (l.totalGeralPecas || 0), 0)} peças na fábrica</p>
        </div>
        <div class="bg-white rounded-xl border border-gray-200 p-4">
          <p class="text-xs font-medium text-gray-500">Lotes Despachados</p>
          <p class="text-2xl font-bold text-gray-900 mt-1">${lotesFinalizados.length}</p>
          <p class="text-xs text-gray-500 mt-1">Romaneios disponíveis</p>
        </div>
      </div>

      <!-- Abas Principais -->
      <div class="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div class="border-b border-gray-200 px-4 pt-3 flex flex-wrap gap-2 bg-gray-50">
          ${renderPatTab('fila', 'Fila de Produção (Pagos)', pedidosPagos.length, 'layers')}
          ${renderPatTab('lotes', 'Lotes em Fabricação & Despacho', lotesEmFab.length, 'factory')}
        </div>

        <div class="p-4 sm:p-5">
          ${
            viewState.tab === 'fila'
              ? renderFilaProducao({
                  pedidosPagos,
                  pedidosPagosFiltrados,
                  selectedPedidos,
                  gradeSelecionada,
                  totalPecasSelecionadas,
                  unidades: state.unidades
                })
              : renderLotesTab({ lotesFiltrados, state })
          }
        </div>
      </div>
    </div>
  `;

  refreshIcons(container);
  bindPatrimonioEvents(container, { state, pedidosPagosFiltrados, onOpenRaioX });
}

function renderPatTab(id, label, count, icon) {
  const active = viewState.tab === id;
  return `
    <button type="button" data-pat-tab="${id}"
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

function renderFilaProducao({
  pedidosPagos,
  pedidosPagosFiltrados,
  selectedPedidos,
  gradeSelecionada,
  totalPecasSelecionadas,
  unidades
}) {
  const allFilteredSelected =
    pedidosPagosFiltrados.length > 0 &&
    pedidosPagosFiltrados.every((p) => viewState.selectedIds.has(p.id));
  const unidadesEnvolvidas = [...new Set(selectedPedidos.map((p) => p.unidade))];

  return `
    <div class="space-y-5">
      <!-- Consolidador Inteligente -->
      <div class="rounded-2xl border-2 ${selectedPedidos.length ? 'border-brand-700 bg-brand-50/60' : 'border-gray-200 bg-gray-50'} p-4 sm:p-5 transition">
        <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div class="space-y-2 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <span class="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-brand-900">
                <i data-lucide="calculator" class="w-4 h-4"></i>
                Consolidador Inteligente de Lote
              </span>
              <span class="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-white border border-gray-200 text-gray-800">
                ${selectedPedidos.length} pedidos selecionados • ${totalPecasSelecionadas} peças
              </span>
              ${
                unidadesEnvolvidas.length
                  ? `<span class="text-xs text-gray-600">Unidades: <strong>${escapeHtml(unidadesEnvolvidas.join(', '))}</strong></span>`
                  : ''
              }
            </div>

            <div class="grid grid-cols-3 sm:grid-cols-6 gap-2 pt-1">
              ${TAMANHOS.map(
                (tam) => `
                <div class="bg-white rounded-xl border border-gray-200 px-3 py-2 text-center">
                  <span class="block text-[11px] font-semibold text-gray-500">${tam}</span>
                  <span class="block text-lg font-extrabold ${gradeSelecionada[tam] > 0 ? 'text-brand-900' : 'text-gray-300'}">${gradeSelecionada[tam]}</span>
                </div>
              `
              ).join('')}
            </div>
          </div>

          <div class="lg:w-80 space-y-2.5 shrink-0">
            <textarea id="pat-observacoes-lote" rows="2"
              placeholder="Observações para o fabricante (ex: Silk padrão, urgência...)"
              class="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg bg-white">${escapeHtml(viewState.observacoes)}</textarea>

            <button type="button" id="btn-gerar-lote" ${selectedPedidos.length === 0 ? 'disabled' : ''}
              class="btn-primary w-full py-2.5 px-4 rounded-xl text-sm font-semibold inline-flex items-center justify-center gap-2 shadow-sm">
              <i data-lucide="factory" class="w-4 h-4"></i>
              <span>Gerar Ordem de Fabricação (Lote)</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Filtros e Seleção em Massa -->
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div class="flex flex-wrap items-center gap-2">
          <button type="button" id="btn-selecionar-todos-pagos" ${pedidosPagos.length === 0 ? 'disabled' : ''}
            class="px-3 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-xs font-semibold text-gray-800 inline-flex items-center gap-1.5 disabled:opacity-50">
            <i data-lucide="${allFilteredSelected ? 'check-square' : 'square'}" class="w-4 h-4 text-brand-700"></i>
            <span>${allFilteredSelected ? 'Desmarcar Visíveis' : 'Selecionar Todos os Pagos'}</span>
          </button>
          ${
            viewState.selectedIds.size > 0
              ? `<button type="button" id="btn-limpar-selecao" class="text-xs font-medium text-gray-600 hover:text-gray-900 underline px-2">Limpar seleção</button>`
              : ''
          }
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <div class="relative">
            <i data-lucide="search" class="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2"></i>
            <input type="text" id="pat-search" value="${escapeHtml(viewState.busca)}"
              placeholder="Buscar pedido ou empresa..."
              class="pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg bg-white" />
          </div>
          <select id="pat-unit-filter" class="text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white">
            <option value="TODAS" ${viewState.unidadeFiltro === 'TODAS' ? 'selected' : ''}>Todas as Unidades</option>
            ${unidades
              .map(
                (u) =>
                  `<option value="${escapeHtml(u)}" ${viewState.unidadeFiltro === u ? 'selected' : ''}>${escapeHtml(u)}</option>`
              )
              .join('')}
          </select>
        </div>
      </div>

      <!-- Tabela de Pedidos Pagos -->
      ${
        pedidosPagosFiltrados.length === 0
          ? `<div class="text-center py-12 border border-dashed border-gray-300 rounded-xl">
              <p class="text-sm font-medium text-gray-600">Nenhum pedido pago aguardando envio para fabricação.</p>
            </div>`
          : `<div class="overflow-x-auto border border-gray-200 rounded-xl">
              <table class="min-w-full text-sm text-left">
                <thead class="bg-gray-50 text-xs uppercase text-gray-500 border-b border-gray-200">
                  <tr>
                    <th class="px-4 py-3 w-10">Sel.</th>
                    <th class="px-4 py-3 font-semibold">Pedido / Unidade</th>
                    <th class="px-4 py-3 font-semibold">Empresa / Turma</th>
                    <th class="px-4 py-3 font-semibold">Grade de Tamanhos</th>
                    <th class="px-4 py-3 font-semibold">Pago em</th>
                    <th class="px-4 py-3 font-semibold text-right">Detalhes</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-200 bg-white">
                  ${pedidosPagosFiltrados
                    .map((ped) => {
                      const checked = viewState.selectedIds.has(ped.id);
                      const grade = calcularGradeItens(ped.itens || []);
                      return `
                    <tr class="${checked ? 'bg-brand-50/60' : 'hover:bg-gray-50'}">
                      <td class="px-4 py-3.5">
                        <input type="checkbox" data-select-pedido="${escapeHtml(ped.id)}" ${checked ? 'checked' : ''}
                          class="w-4 h-4 rounded border-gray-300 text-brand-900 accent-[#064E3B] cursor-pointer" />
                      </td>
                      <td class="px-4 py-3.5 whitespace-nowrap">
                        <span class="font-mono font-bold text-xs text-brand-900 bg-brand-50 border border-brand-100 px-2 py-0.5 rounded">${escapeHtml(ped.codigo)}</span>
                        <div class="text-xs font-semibold text-gray-700 mt-1">${escapeHtml(ped.unidade)}</div>
                      </td>
                      <td class="px-4 py-3.5">
                        <div class="font-semibold text-gray-900">${escapeHtml(ped.empresaNome)}</div>
                        <div class="text-xs text-gray-500">Turma ${escapeHtml(ped.turma)} • <strong>${ped.totalPecas} peças</strong></div>
                      </td>
                      <td class="px-4 py-3.5">${renderGradePills(grade)}</td>
                      <td class="px-4 py-3.5 text-xs text-gray-600 whitespace-nowrap">
                        ${formatDateTime(ped.financeiro?.dataPagamento)}
                      </td>
                      <td class="px-4 py-3.5 text-right whitespace-nowrap">
                        <button type="button" data-action="raio-x" data-pedido-id="${escapeHtml(ped.id)}"
                          class="px-2.5 py-1.5 rounded-lg border border-gray-300 text-xs font-medium text-gray-700 hover:bg-gray-100">
                          Raio-X
                        </button>
                      </td>
                    </tr>
                  `;
                    })
                    .join('')}
                </tbody>
              </table>
            </div>`
      }
    </div>
  `;
}

function renderLotesTab({ lotesFiltrados, state }) {
  return `
    <div class="space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="inline-flex rounded-lg border border-gray-200 bg-gray-100 p-1">
          <button type="button" data-lote-filter="EM_FABRICACAO"
            class="px-3 py-1.5 rounded-md text-xs font-semibold ${viewState.loteStatusFilter === 'EM_FABRICACAO' ? 'bg-white text-brand-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}">
            Em Fabricação
          </button>
          <button type="button" data-lote-filter="FINALIZADO_FABRICA"
            class="px-3 py-1.5 rounded-md text-xs font-semibold ${viewState.loteStatusFilter === 'FINALIZADO_FABRICA' ? 'bg-white text-brand-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}">
            Finalizados / Despachados
          </button>
          <button type="button" data-lote-filter="TODOS"
            class="px-3 py-1.5 rounded-md text-xs font-semibold ${viewState.loteStatusFilter === 'TODOS' ? 'bg-white text-brand-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}">
            Todos
          </button>
        </div>
      </div>

      ${
        lotesFiltrados.length === 0
          ? `<div class="text-center py-12 border border-dashed border-gray-300 rounded-xl">
              <p class="text-sm font-medium text-gray-600">Nenhum lote encontrado nesta categoria.</p>
            </div>`
          : `<div class="space-y-4">
              ${lotesFiltrados.map((lote) => renderLoteCard(lote, state.pedidos)).join('')}
            </div>`
      }
    </div>
  `;
}

function renderLoteCard(lote, allPedidos) {
  const pedidosDoLote = allPedidos.filter((p) => (lote.pedidosIds || []).includes(p.id));
  const unidadesResumo = [...new Set(pedidosDoLote.map((p) => p.unidade))];
  const isFinalizado = lote.status === 'FINALIZADO_FABRICA';

  return `
    <div class="rounded-xl border border-gray-200 bg-white p-4 sm:p-5 space-y-4">
      <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-sm font-bold font-mono text-brand-900 bg-brand-50 border border-brand-100 px-2.5 py-0.5 rounded-lg">${escapeHtml(lote.codigo)}</span>
            <span class="px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
              isFinalizado
                ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                : 'bg-sky-100 text-sky-900 border-sky-300'
            }">
              ${isFinalizado ? 'Finalizado & Despachado' : 'Em Fabricação'}
            </span>
          </div>
          <p class="text-xs text-gray-500 mt-1.5">
            Gerado em ${formatDateTime(lote.dataCriacao)} por ${escapeHtml(lote.criadoPor || 'Patrimônio')}
            ${isFinalizado && lote.dataFinalizacao ? ` • Despachado em ${formatDateTime(lote.dataFinalizacao)}` : ''}
          </p>
        </div>

        <div class="flex flex-wrap gap-2 shrink-0">
          ${
            isFinalizado
              ? `<button type="button" data-action="abrir-mapa-lote" data-lote-id="${escapeHtml(lote.id)}"
                  class="px-3.5 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-xs font-semibold text-gray-800 inline-flex items-center gap-1.5">
                  <i data-lucide="printer" class="w-4 h-4"></i>
                  <span>Mapa de Separação / Reimprimir</span>
                </button>`
              : `<button type="button" data-action="abrir-mapa-lote" data-lote-id="${escapeHtml(lote.id)}"
                  class="btn-primary px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold inline-flex items-center gap-2">
                  <i data-lucide="package-check" class="w-4 h-4"></i>
                  <span>Receber Lote da Fábrica &amp; Despachar</span>
                </button>`
          }
        </div>
      </div>

      <!-- Grade Consolidada do Lote -->
      <div class="rounded-xl bg-gray-50 border border-gray-200 p-3.5 space-y-2">
        <div class="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span class="font-semibold text-gray-700">Grade Consolidada (${lote.totalGeralPecas} peças • ${pedidosDoLote.length} pedidos)</span>
          <span class="text-gray-600">Destinos: <strong>${escapeHtml(unidadesResumo.join(', ') || '—')}</strong></span>
        </div>
        ${renderGradePills(lote.gradeConsolidada)}
        ${
          lote.observacoesFabricante
            ? `<p class="text-xs text-gray-600 pt-1 border-t border-gray-200"><strong>Obs. Fabricante:</strong> ${escapeHtml(lote.observacoesFabricante)}</p>`
            : ''
        }
      </div>

      <!-- Pedidos Vinculados -->
      <div class="flex flex-wrap gap-2">
        ${pedidosDoLote
          .map(
            (ped) => `
          <button type="button" data-action="raio-x" data-pedido-id="${escapeHtml(ped.id)}"
            class="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:border-brand-700 text-xs transition">
            <span class="font-mono font-bold text-brand-900">${escapeHtml(ped.codigo)}</span>
            <span class="text-gray-700">${escapeHtml(ped.unidade)}</span>
            <span class="text-gray-400">•</span>
            <span class="text-gray-600 truncate max-w-[160px]">${escapeHtml(ped.empresaNome)}</span>
            <span class="font-semibold text-gray-900">(${ped.totalPecas} pç)</span>
          </button>
        `
          )
          .join('')}
      </div>
    </div>
  `;
}

function bindPatrimonioEvents(container, { state, pedidosPagosFiltrados, onOpenRaioX }) {
  const rerenderCurrent = () => renderPatrimonioModule(container, { state: getState(), onOpenRaioX });

  container.querySelectorAll('[data-pat-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      viewState.tab = btn.getAttribute('data-pat-tab');
      rerenderCurrent();
    });
  });

  container.querySelectorAll('[data-lote-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      viewState.loteStatusFilter = btn.getAttribute('data-lote-filter');
      rerenderCurrent();
    });
  });

  container.querySelector('#pat-search')?.addEventListener('input', (e) => {
    viewState.busca = e.target.value;
    rerenderCurrent();
    const el = container.querySelector('#pat-search');
    if (el) {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
  });

  container.querySelector('#pat-unit-filter')?.addEventListener('change', (e) => {
    viewState.unidadeFiltro = e.target.value;
    rerenderCurrent();
  });

  container.querySelector('#pat-observacoes-lote')?.addEventListener('input', (e) => {
    viewState.observacoes = e.target.value;
  });

  container.querySelectorAll('[data-select-pedido]').forEach((chk) => {
    chk.addEventListener('change', () => {
      const id = chk.getAttribute('data-select-pedido');
      if (chk.checked) {
        viewState.selectedIds.add(id);
      } else {
        viewState.selectedIds.delete(id);
      }
      rerenderCurrent();
    });
  });

  container.querySelector('#btn-selecionar-todos-pagos')?.addEventListener('click', () => {
    const allSelected =
      pedidosPagosFiltrados.length > 0 &&
      pedidosPagosFiltrados.every((p) => viewState.selectedIds.has(p.id));
    if (allSelected) {
      pedidosPagosFiltrados.forEach((p) => viewState.selectedIds.delete(p.id));
    } else {
      pedidosPagosFiltrados.forEach((p) => viewState.selectedIds.add(p.id));
    }
    rerenderCurrent();
  });

  container.querySelector('#btn-limpar-selecao')?.addEventListener('click', () => {
    viewState.selectedIds.clear();
    rerenderCurrent();
  });

  container.querySelector('#btn-gerar-lote')?.addEventListener('click', async () => {
    const ids = [...viewState.selectedIds];
    if (ids.length === 0) return;

    const ok = await confirmAction({
      title: 'Gerar Ordem de Fabricação (Lote)',
      message: `Consolidar ${ids.length} pedido(s) em uma nova Ordem de Fabricação? Os pedidos passarão para o status EM FABRICAÇÃO.`,
      confirmLabel: 'Gerar Ordem de Fabricação'
    });
    if (!ok) return;

    try {
      viewState.selectedIds.clear();
      const obs = viewState.observacoes;
      viewState.observacoes = '';
      viewState.tab = 'lotes';
      viewState.loteStatusFilter = 'EM_FABRICACAO';
      const lote = await gerarLoteFabricacao(ids, obs);
      showToast(`Ordem ${lote.codigo} criada com ${lote.totalGeralPecas} peças!`, 'success');
      rerenderCurrent();
    } catch (error) {
      viewState.tab = 'fila';
      showToast(error.message || 'Erro ao gerar lote.', 'error');
      rerenderCurrent();
    }
  });

  container.querySelectorAll('[data-action="raio-x"]').forEach((btn) => {
    btn.addEventListener('click', () => onOpenRaioX(btn.getAttribute('data-pedido-id')));
  });

  container.querySelectorAll('[data-action="abrir-mapa-lote"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const loteId = btn.getAttribute('data-lote-id');
      const lote = state.lotes.find((l) => l.id === loteId);
      if (lote) openMapaSeparacaoModal(lote, state.pedidos);
    });
  });
}

function buildSeparacaoPorUnidade(lote, allPedidos) {
  const pedidosDoLote = allPedidos.filter((p) => (lote.pedidosIds || []).includes(p.id));
  const map = new Map();

  for (const ped of pedidosDoLote) {
    const unidade = ped.unidade || 'Sem Unidade';
    if (!map.has(unidade)) {
      map.set(unidade, {
        unidade,
        pedidos: [],
        grade: { PP: 0, P: 0, M: 0, G: 0, GG: 0, XG: 0 },
        totalPecas: 0
      });
    }
    const bucket = map.get(unidade);
    bucket.pedidos.push(ped);
    const g = calcularGradeItens(ped.itens || []);
    for (const tam of TAMANHOS) {
      bucket.grade[tam] += g[tam];
    }
    bucket.totalPecas += ped.totalPecas || sumGrade(g);
  }

  return [...map.values()].sort((a, b) => a.unidade.localeCompare(b.unidade, 'pt-BR'));
}

function renderPrintRomaneio(lote, gruposPorUnidade) {
  const printEl = document.getElementById('print-romaneio');
  if (!printEl) return;

  const agora = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date());

  printEl.innerHTML = `
    <div class="romaneio-header">
      <div>
        <div style="font-size: 16px; font-weight: 800; color: #064E3B;">ROMANEIO DE SEPARAÇÃO E DESPACHO DE FARDAMENTOS</div>
        <div style="font-size: 11px; color: #4B5563; margin-top: 2px;">Programa Jovens Aprendizes • Controle Patrimônio &amp; Logística</div>
      </div>
      <div style="text-align: right;">
        <div style="font-size: 14px; font-weight: 800;">${escapeHtml(lote.codigo)}</div>
        <div style="font-size: 10px; color: #4B5563;">Impresso em ${agora}</div>
      </div>
    </div>

    <div style="margin-bottom: 12px; padding: 8px 10px; border: 1px solid #d1d5db; border-radius: 6px; background: #f9fafb;">
      <strong>Resumo Geral do Lote (${lote.totalGeralPecas} peças):</strong>
      ${TAMANHOS.map((t) => `${t}: ${lote.gradeConsolidada?.[t] || 0}`).join(' | ')}
      ${lote.observacoesFabricante ? `<div style="margin-top: 4px;"><strong>Obs. Fabricante:</strong> ${escapeHtml(lote.observacoesFabricante)}</div>` : ''}
    </div>

    ${gruposPorUnidade
      .map(
        (grp) => `
      <div class="romaneio-unit-block">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
          <strong style="font-size: 13px; color: #064E3B;">UNIDADE DESTINO: ${escapeHtml(grp.unidade.toUpperCase())}</strong>
          <strong style="font-size: 12px;">Total Unidade: ${grp.totalPecas} peças (${grp.pedidos.length} pedidos)</strong>
        </div>

        <table class="romaneio-table">
          <thead>
            <tr>
              <th>PP</th>
              <th>P</th>
              <th>M</th>
              <th>G</th>
              <th>GG</th>
              <th>XG</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              ${TAMANHOS.map((t) => `<td><strong>${grp.grade[t]}</strong></td>`).join('')}
              <td><strong>${grp.totalPecas}</strong></td>
            </tr>
          </tbody>
        </table>

        <table class="romaneio-table" style="margin-top: 8px;">
          <thead>
            <tr>
              <th>Código</th>
              <th>Empresa Parceira</th>
              <th>Turma</th>
              <th>Jovens / Tamanhos</th>
              <th>Qtd Peças</th>
            </tr>
          </thead>
          <tbody>
            ${grp.pedidos
              .map(
                (ped) => `
              <tr>
                <td><strong>${escapeHtml(ped.codigo)}</strong></td>
                <td>${escapeHtml(ped.empresaNome)}</td>
                <td>${escapeHtml(ped.turma)}</td>
                <td>${(ped.itens || [])
                  .map((it) => `${escapeHtml(it.jovemNome)} (${escapeHtml(it.tamanho)}x${it.quantidade})`)
                  .join('; ')}</td>
                <td><strong>${ped.totalPecas}</strong></td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>

        <div class="romaneio-signatures">
          <div class="romaneio-signature-line">Responsável Expedição / Patrimônio</div>
          <div class="romaneio-signature-line">Conferência / Recebedor (${escapeHtml(grp.unidade)}) — Data: ____/____/______</div>
        </div>
      </div>
    `
      )
      .join('')}
  `;
}

function openMapaSeparacaoModal(lote, allPedidos) {
  const grupos = buildSeparacaoPorUnidade(lote, allPedidos);
  const isFinalizado = lote.status === 'FINALIZADO_FABRICA';

  openModal({
    title: `Mapa de Separação por Unidade — ${lote.codigo}`,
    subtitle: `${lote.totalGeralPecas} peças distribuídas em ${grupos.length} unidade(s)`,
    size: 'xl',
    bodyHtml: `
      <div class="space-y-4">
        <div class="rounded-xl bg-brand-50 border border-brand-100 p-3.5">
          <div class="text-xs font-semibold text-brand-900 mb-2">Grade Consolidada do Lote</div>
          ${renderGradePills(lote.gradeConsolidada)}
        </div>

        <div class="space-y-3">
          ${grupos
            .map(
              (grp) => `
            <div class="rounded-xl border border-gray-200 overflow-hidden">
              <div class="px-4 py-2.5 bg-gray-50 border-b border-gray-200 flex flex-wrap items-center justify-between gap-2">
                <div class="flex items-center gap-2">
                  <i data-lucide="map-pin" class="w-4 h-4 text-brand-700"></i>
                  <span class="text-sm font-bold text-gray-900">${escapeHtml(grp.unidade)}</span>
                </div>
                <span class="text-xs font-bold text-brand-900 bg-brand-100 px-2.5 py-0.5 rounded-full">
                  ${grp.totalPecas} peças • ${grp.pedidos.length} pedido(s)
                </span>
              </div>

              <div class="p-3.5 space-y-3">
                <div class="grid grid-cols-6 gap-2 text-center">
                  ${TAMANHOS.map(
                    (t) => `
                    <div class="rounded-lg bg-gray-50 border border-gray-200 py-1.5">
                      <span class="block text-[10px] font-semibold text-gray-500">${t}</span>
                      <span class="text-sm font-bold ${grp.grade[t] ? 'text-brand-900' : 'text-gray-300'}">${grp.grade[t]}</span>
                    </div>
                  `
                  ).join('')}
                </div>

                <div class="divide-y divide-gray-100 text-xs">
                  ${grp.pedidos
                    .map(
                      (ped) => `
                    <div class="py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                      <div>
                        <span class="font-mono font-bold text-brand-900">${escapeHtml(ped.codigo)}</span>
                        <span class="font-semibold text-gray-800 ml-1.5">${escapeHtml(ped.empresaNome)}</span>
                        <span class="text-gray-500 ml-1">(Turma ${escapeHtml(ped.turma)})</span>
                      </div>
                      <span class="font-semibold text-gray-700">${ped.totalPecas} peças</span>
                    </div>
                  `
                    )
                    .join('')}
                </div>
              </div>
            </div>
          `
            )
            .join('')}
        </div>
      </div>
    `,
    footerHtml: `
      <button type="button" data-modal-close class="px-4 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-100">
        Fechar
      </button>
      <button type="button" id="btn-imprimir-romaneio"
        class="px-4 py-2 rounded-lg border border-brand-700 bg-brand-50 text-brand-900 hover:bg-brand-100 text-sm font-semibold inline-flex items-center gap-1.5">
        <i data-lucide="printer" class="w-4 h-4"></i>
        <span>Imprimir Romaneio</span>
      </button>
      ${
        !isFinalizado
          ? `<button type="button" id="btn-confirmar-despacho-lote"
              class="btn-primary px-4 py-2 rounded-lg text-sm font-semibold inline-flex items-center gap-1.5">
              <i data-lucide="truck" class="w-4 h-4"></i>
              <span>Confirmar Despacho para Unidades</span>
            </button>`
          : ''
      }
    `,
    onRender: (modalEl) => {
      modalEl.querySelector('#btn-imprimir-romaneio')?.addEventListener('click', () => {
        renderPrintRomaneio(lote, grupos);
        window.print();
      });

      modalEl.querySelector('#btn-confirmar-despacho-lote')?.addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        try {
          await despacharLote(lote.id);
          closeModal();
          showToast(`Lote ${lote.codigo} despachado! Pedidos atualizados para EM TRÂNSITO.`, 'success');
        } catch (error) {
          showToast(error.message || 'Erro ao despachar lote.', 'error');
          btn.disabled = false;
        }
      });
    }
  });
}
