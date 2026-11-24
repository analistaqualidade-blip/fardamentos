import {
  db,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  query,
  where,
  onSnapshot,
  writeBatch,
  Timestamp,
  serverTimestamp,
  isFirebaseConfigured,
  createAuthUserWithoutSignOut
} from './firebase-config.js';
import { getCurrentUser, isDemoMode, DEMO_USERS } from './auth.js';
import {
  UNIDADES_PADRAO,
  ROLES_CONFIG,
  calcularGradeItens,
  calcularGradePedidos,
  sumGrade,
  toDate,
  generateId,
  getTodayIsoDate,
  addDaysIsoDate,
  maskCnpj
} from './utils.js';

const DEMO_DB_KEY = 'fardamentos_demo_db_v1';

const state = {
  pedidos: [],
  lotes: [],
  users: [],
  unidades: [...UNIDADES_PADRAO],
  loading: false,
  initialized: false
};

const listeners = new Set();
let firestoreUnsubs = [];

export function getState() {
  return {
    pedidos: state.pedidos,
    lotes: state.lotes,
    users: state.users,
    unidades: state.unidades,
    loading: state.loading,
    initialized: state.initialized
  };
}

export function subscribe(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function notify() {
  const snapshot = getState();
  listeners.forEach((cb) => cb(snapshot));
}

function nowArrayTimestamp() {
  // IMPORTANTE: Nunca usar serverTimestamp() dentro de arrays do Firestore (itens e historicoLogs).
  return isDemoMode() ? new Date().toISOString() : Timestamp.now();
}

function nowFieldTimestamp() {
  return isDemoMode() ? new Date().toISOString() : serverTimestamp();
}

function makeLogEntry(acao, userOverride = null) {
  const user = userOverride || getCurrentUser();
  const roleInfo = ROLES_CONFIG[user?.role] || { setor: 'Sistema' };
  return {
    data: nowArrayTimestamp(),
    usuario: user?.nome || 'Sistema',
    setor: roleInfo.setor,
    acao
  };
}

function buildFinanceiroPayload(currentFin, overrides = {}) {
  return {
    numeroBoleto: overrides.numeroBoleto !== undefined ? overrides.numeroBoleto : (currentFin?.numeroBoleto ?? null),
    dataEmissaoBoleto:
      overrides.dataEmissaoBoleto !== undefined
        ? overrides.dataEmissaoBoleto
        : (currentFin?.dataEmissaoBoleto ?? null),
    dataVencimento:
      overrides.dataVencimento !== undefined ? overrides.dataVencimento : (currentFin?.dataVencimento ?? null),
    dataPagamento:
      overrides.dataPagamento !== undefined ? overrides.dataPagamento : (currentFin?.dataPagamento ?? null),
    registradoPor:
      overrides.registradoPor !== undefined ? overrides.registradoPor : (currentFin?.registradoPor ?? null)
  };
}

function buildPatrimonioPayload(currentPat, overrides = {}) {
  return {
    loteFabricacaoId:
      overrides.loteFabricacaoId !== undefined
        ? overrides.loteFabricacaoId
        : (currentPat?.loteFabricacaoId ?? null),
    dataEnvioUnidade:
      overrides.dataEnvioUnidade !== undefined
        ? overrides.dataEnvioUnidade
        : (currentPat?.dataEnvioUnidade ?? null),
    dataRecebimentoUnidade:
      overrides.dataRecebimentoUnidade !== undefined
        ? overrides.dataRecebimentoUnidade
        : (currentPat?.dataRecebimentoUnidade ?? null)
  };
}

function translateFirestoreError(error) {
  const code = error?.code || '';
  const msg = String(error?.message || '');
  if (code === 'permission-denied' || msg.toLowerCase().includes('insufficient permissions')) {
    return new Error(
      'Permissão negada pelo Firestore. Verifique se você publicou as regras atualizadas de firestore.rules no Firebase Console (Firestore Database → Regras) e se seu perfil em users/{uid} está ativo.'
    );
  }
  return error;
}

function sortPedidosDesc(list) {
  return [...list].sort((a, b) => {
    const da = toDate(a.criadoEm)?.getTime() || Date.now();
    const dbTime = toDate(b.criadoEm)?.getTime() || Date.now();
    return dbTime - da;
  });
}

function sortLotesDesc(list) {
  return [...list].sort((a, b) => {
    const da = toDate(a.dataCriacao)?.getTime() || Date.now();
    const dbTime = toDate(b.dataCriacao)?.getTime() || Date.now();
    return dbTime - da;
  });
}

function sortUsersAsc(list) {
  return [...list].sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'));
}

function createSeedPayload(forFirestore = false) {
  const hoursAgo = (h) => {
    const d = new Date(Date.now() - h * 3600000);
    return forFirestore ? Timestamp.fromDate(d) : d.toISOString();
  };
  const todayIso = getTodayIsoDate();
  const currentYear = new Date().getFullYear();

  const loteFinalizadoId = forFirestore ? null : 'lote-seed-01';
  const loteEmFabId = forFirestore ? null : 'lote-seed-02';

  const makeItem = (nome, tam, qtd = 2, entregue = false, dataEntrega = null) => ({
    idItem: generateId(),
    jovemNome: nome,
    tamanho: tam,
    quantidade: qtd,
    entregueAoJovem: entregue,
    dataEntregaJovem: dataEntrega
  });

  const ped1Itens = [
    makeItem('Lucas Gabriel Almeida', 'M', 2, false, null),
    makeItem('Mariana Ferreira Lima', 'P', 2, false, null),
    makeItem('João Victor Rocha', 'G', 2, false, null)
  ];

  const ped2Itens = [
    makeItem('Beatriz Sousa Costa', 'PP', 2, false, null),
    makeItem('Pedro Henrique Dias', 'M', 2, false, null),
    makeItem('Larissa Mendes Alves', 'P', 2, false, null),
    makeItem('Mateus Silva Nogueira', 'GG', 2, false, null)
  ];

  const ped3Itens = [
    makeItem('Camila Rodrigues Pinto', 'P', 2, false, null),
    makeItem('Gabriel Martins Gomes', 'G', 2, false, null)
  ];

  const ped4Itens = [
    makeItem('Rafael Nascimento Braga', 'M', 2, false, null),
    makeItem('Ana Clara Barbosa', 'P', 2, false, null),
    makeItem('Vinícius Cardoso Moura', 'XG', 2, false, null)
  ];

  const ped5Itens = [
    makeItem('Sofia Carvalho Teixeira', 'M', 2, false, null),
    makeItem('Cauã Batista Ribeiro', 'G', 2, false, null),
    makeItem('Letícia Araújo Freitas', 'P', 2, false, null)
  ];

  const ped6Itens = [
    makeItem('Gustavo Lima Peixoto', 'M', 2, false, null),
    makeItem('Isabela Vieira Castro', 'P', 2, false, null),
    makeItem('Thiago Moreira Santos', 'G', 2, false, null)
  ];

  const ped7Itens = [
    makeItem('Amanda Duarte Cavalcante', 'P', 2, true, hoursAgo(12)),
    makeItem('Enzo Fernandes Correia', 'M', 2, false, null),
    makeItem('Yasmim Lopes Barros', 'M', 2, false, null)
  ];

  const ped8Itens = [
    makeItem('Bruno Teixeira Sampaio', 'G', 2, true, hoursAgo(26)),
    makeItem('Júlia Monteiro Farias', 'P', 2, true, hoursAgo(25))
  ];

  const pedidos = [
    {
      id: 'ped-seed-001',
      codigo: '#PED-001',
      unidade: 'Fortaleza',
      empresaNome: 'M. Dias Branco Indústria e Comércio',
      empresaCnpj: '07.206.816/0001-15',
      turma: 'ADM-FOR-2026.1',
      status: 'AGUARDANDO_FATURAMENTO',
      itens: ped1Itens,
      totalPecas: 6,
      financeiro: {
        numeroBoleto: null,
        dataEmissaoBoleto: null,
        dataVencimento: null,
        dataPagamento: null,
        registradoPor: null
      },
      patrimonio: {
        loteFabricacaoId: null,
        dataEnvioUnidade: null,
        dataRecebimentoUnidade: null
      },
      historicoLogs: [
        { data: hoursAgo(4), usuario: 'Ana Paula Silva', setor: 'Supervisão de Unidade', acao: 'Solicitação criada para Fortaleza (3 jovens / 6 peças).' }
      ],
      criadoPor: 'Ana Paula Silva',
      criadoPorUid: 'demo-sup-for-01',
      criadoEm: hoursAgo(4)
    },
    {
      id: 'ped-seed-002',
      codigo: '#PED-002',
      unidade: 'Pacajus',
      empresaNome: 'Santana Textiles S/A',
      empresaCnpj: '07.043.628/0001-48',
      turma: 'LOG-PAC-2026.1',
      status: 'AGUARDANDO_PAGAMENTO',
      itens: ped2Itens,
      totalPecas: 8,
      financeiro: {
        numeroBoleto: 'BOL-2026-0842',
        dataEmissaoBoleto: hoursAgo(96),
        dataVencimento: addDaysIsoDate(todayIso, -2),
        dataPagamento: null,
        registradoPor: 'Juliana Costa'
      },
      patrimonio: {
        loteFabricacaoId: null,
        dataEnvioUnidade: null,
        dataRecebimentoUnidade: null
      },
      historicoLogs: [
        { data: hoursAgo(120), usuario: 'Marcos Oliveira', setor: 'Supervisão de Unidade', acao: 'Solicitação criada para Pacajus (4 jovens / 8 peças).' },
        { data: hoursAgo(96), usuario: 'Juliana Costa', setor: 'Financeiro', acao: 'Boleto BOL-2026-0842 emitido com vencimento em atraso.' }
      ],
      criadoPor: 'Marcos Oliveira',
      criadoPorUid: 'demo-sup-pac-01',
      criadoEm: hoursAgo(120)
    },
    {
      id: 'ped-seed-003',
      codigo: '#PED-003',
      unidade: 'Maracanaú',
      empresaNome: 'Pague Menos Empreendimentos Farmacêuticos',
      empresaCnpj: '06.626.253/0001-51',
      turma: 'VAR-MAR-2026.2',
      status: 'AGUARDANDO_PAGAMENTO',
      itens: ped3Itens,
      totalPecas: 4,
      financeiro: {
        numeroBoleto: 'BOL-2026-0899',
        dataEmissaoBoleto: hoursAgo(30),
        dataVencimento: todayIso,
        dataPagamento: null,
        registradoPor: 'Juliana Costa'
      },
      patrimonio: {
        loteFabricacaoId: null,
        dataEnvioUnidade: null,
        dataRecebimentoUnidade: null
      },
      historicoLogs: [
        { data: hoursAgo(48), usuario: 'Carlos Mendes', setor: 'Administração / Gestão', acao: 'Solicitação criada para Maracanaú (2 jovens / 4 peças).' },
        { data: hoursAgo(30), usuario: 'Juliana Costa', setor: 'Financeiro', acao: 'Boleto BOL-2026-0899 registrado para vencimento hoje.' }
      ],
      criadoPor: 'Carlos Mendes',
      criadoPorUid: 'demo-admin-01',
      criadoEm: hoursAgo(48)
    },
    {
      id: 'ped-seed-004',
      codigo: '#PED-004',
      unidade: 'Fortaleza',
      empresaNome: 'Hapvida Assistência Médica S/A',
      empresaCnpj: '63.554.067/0001-98',
      turma: 'SAU-FOR-2026.1',
      status: 'PAGO',
      itens: ped4Itens,
      totalPecas: 6,
      financeiro: {
        numeroBoleto: 'BOL-2026-0811',
        dataEmissaoBoleto: hoursAgo(72),
        dataVencimento: addDaysIsoDate(todayIso, 5),
        dataPagamento: hoursAgo(18),
        registradoPor: 'Juliana Costa'
      },
      patrimonio: {
        loteFabricacaoId: null,
        dataEnvioUnidade: null,
        dataRecebimentoUnidade: null
      },
      historicoLogs: [
        { data: hoursAgo(80), usuario: 'Ana Paula Silva', setor: 'Supervisão de Unidade', acao: 'Solicitação criada para Fortaleza (3 jovens / 6 peças).' },
        { data: hoursAgo(72), usuario: 'Juliana Costa', setor: 'Financeiro', acao: 'Boleto BOL-2026-0811 registrado.' },
        { data: hoursAgo(18), usuario: 'Juliana Costa', setor: 'Financeiro', acao: 'Pagamento confirmado. Pedido liberado para o Patrimônio.' }
      ],
      criadoPor: 'Ana Paula Silva',
      criadoPorUid: 'demo-sup-for-01',
      criadoEm: hoursAgo(80)
    },
    {
      id: 'ped-seed-005',
      codigo: '#PED-005',
      unidade: 'Caucaia',
      empresaNome: 'ArcelorMittal Brasil Logística',
      empresaCnpj: '17.469.701/0001-77',
      turma: 'IND-CAU-2026.1',
      status: 'PAGO',
      itens: ped5Itens,
      totalPecas: 6,
      financeiro: {
        numeroBoleto: 'BOL-2026-0820',
        dataEmissaoBoleto: hoursAgo(65),
        dataVencimento: addDaysIsoDate(todayIso, 6),
        dataPagamento: hoursAgo(10),
        registradoPor: 'Juliana Costa'
      },
      patrimonio: {
        loteFabricacaoId: null,
        dataEnvioUnidade: null,
        dataRecebimentoUnidade: null
      },
      historicoLogs: [
        { data: hoursAgo(70), usuario: 'Carlos Mendes', setor: 'Administração / Gestão', acao: 'Solicitação criada para Caucaia (3 jovens / 6 peças).' },
        { data: hoursAgo(65), usuario: 'Juliana Costa', setor: 'Financeiro', acao: 'Boleto BOL-2026-0820 registrado.' },
        { data: hoursAgo(10), usuario: 'Juliana Costa', setor: 'Financeiro', acao: 'Pagamento confirmado. Liberado para fila de produção.' }
      ],
      criadoPor: 'Carlos Mendes',
      criadoPorUid: 'demo-admin-01',
      criadoEm: hoursAgo(70)
    },
    {
      id: 'ped-seed-006',
      codigo: '#PED-006',
      unidade: 'Fortaleza',
      empresaNome: 'Solar Coca-Cola Nordeste',
      empresaCnpj: '10.557.540/0001-70',
      turma: 'COM-FOR-2026.2',
      status: 'EM_FABRICACAO',
      itens: ped6Itens,
      totalPecas: 6,
      financeiro: {
        numeroBoleto: 'BOL-2026-0774',
        dataEmissaoBoleto: hoursAgo(140),
        dataVencimento: addDaysIsoDate(todayIso, 2),
        dataPagamento: hoursAgo(110),
        registradoPor: 'Juliana Costa'
      },
      patrimonio: {
        loteFabricacaoId: loteEmFabId,
        dataEnvioUnidade: null,
        dataRecebimentoUnidade: null
      },
      historicoLogs: [
        { data: hoursAgo(150), usuario: 'Ana Paula Silva', setor: 'Supervisão de Unidade', acao: 'Solicitação criada para Fortaleza (3 jovens / 6 peças).' },
        { data: hoursAgo(140), usuario: 'Juliana Costa', setor: 'Financeiro', acao: 'Boleto BOL-2026-0774 registrado.' },
        { data: hoursAgo(110), usuario: 'Juliana Costa', setor: 'Financeiro', acao: 'Pagamento confirmado.' },
        { data: hoursAgo(60), usuario: 'Roberto Ferreira', setor: 'Patrimônio / Logística', acao: `Incluído na Ordem de Fabricação LOTE-${currentYear}-02.` }
      ],
      criadoPor: 'Ana Paula Silva',
      criadoPorUid: 'demo-sup-for-01',
      criadoEm: hoursAgo(150)
    },
    {
      id: 'ped-seed-007',
      codigo: '#PED-007',
      unidade: 'Fortaleza',
      empresaNome: 'Grupo Edson Queiroz',
      empresaCnpj: '07.207.833/0001-60',
      turma: 'TI-FOR-2026.1',
      status: 'RECEBIDO_UNIDADE',
      itens: ped7Itens,
      totalPecas: 6,
      financeiro: {
        numeroBoleto: 'BOL-2026-0701',
        dataEmissaoBoleto: hoursAgo(260),
        dataVencimento: addDaysIsoDate(todayIso, -5),
        dataPagamento: hoursAgo(230),
        registradoPor: 'Juliana Costa'
      },
      patrimonio: {
        loteFabricacaoId: loteFinalizadoId,
        dataEnvioUnidade: hoursAgo(36),
        dataRecebimentoUnidade: hoursAgo(16)
      },
      historicoLogs: [
        { data: hoursAgo(280), usuario: 'Ana Paula Silva', setor: 'Supervisão de Unidade', acao: 'Solicitação criada para Fortaleza (3 jovens / 6 peças).' },
        { data: hoursAgo(260), usuario: 'Juliana Costa', setor: 'Financeiro', acao: 'Boleto BOL-2026-0701 registrado.' },
        { data: hoursAgo(230), usuario: 'Juliana Costa', setor: 'Financeiro', acao: 'Pagamento confirmado.' },
        { data: hoursAgo(170), usuario: 'Roberto Ferreira', setor: 'Patrimônio / Logística', acao: `Enviado para fabricação no lote LOTE-${currentYear}-01.` },
        { data: hoursAgo(36), usuario: 'Roberto Ferreira', setor: 'Patrimônio / Logística', acao: `Lote LOTE-${currentYear}-01 recebido da fábrica e despachado para Fortaleza.` },
        { data: hoursAgo(16), usuario: 'Ana Paula Silva', setor: 'Supervisão de Unidade', acao: 'Recebimento confirmado na unidade Fortaleza.' },
        { data: hoursAgo(12), usuario: 'Ana Paula Silva', setor: 'Supervisão de Unidade', acao: 'Farda entregue ao jovem Amanda Duarte Cavalcante.' }
      ],
      criadoPor: 'Ana Paula Silva',
      criadoPorUid: 'demo-sup-for-01',
      criadoEm: hoursAgo(280)
    },
    {
      id: 'ped-seed-008',
      codigo: '#PED-008',
      unidade: 'Pacajus',
      empresaNome: 'Vulcabras Azaleia Nordeste',
      empresaCnpj: '50.926.955/0001-42',
      turma: 'PRD-PAC-2026.1',
      status: 'CONCLUIDO',
      itens: ped8Itens,
      totalPecas: 4,
      financeiro: {
        numeroBoleto: 'BOL-2026-0688',
        dataEmissaoBoleto: hoursAgo(320),
        dataVencimento: addDaysIsoDate(todayIso, -10),
        dataPagamento: hoursAgo(290),
        registradoPor: 'Juliana Costa'
      },
      patrimonio: {
        loteFabricacaoId: loteFinalizadoId,
        dataEnvioUnidade: hoursAgo(36),
        dataRecebimentoUnidade: hoursAgo(28)
      },
      historicoLogs: [
        { data: hoursAgo(340), usuario: 'Marcos Oliveira', setor: 'Supervisão de Unidade', acao: 'Solicitação criada para Pacajus (2 jovens / 4 peças).' },
        { data: hoursAgo(320), usuario: 'Juliana Costa', setor: 'Financeiro', acao: 'Boleto BOL-2026-0688 registrado.' },
        { data: hoursAgo(290), usuario: 'Juliana Costa', setor: 'Financeiro', acao: 'Pagamento confirmado.' },
        { data: hoursAgo(170), usuario: 'Roberto Ferreira', setor: 'Patrimônio / Logística', acao: `Incluído no lote LOTE-${currentYear}-01.` },
        { data: hoursAgo(36), usuario: 'Roberto Ferreira', setor: 'Patrimônio / Logística', acao: `Despachado no lote LOTE-${currentYear}-01 para Pacajus.` },
        { data: hoursAgo(28), usuario: 'Marcos Oliveira', setor: 'Supervisão de Unidade', acao: 'Recebimento confirmado na unidade Pacajus.' },
        { data: hoursAgo(25), usuario: 'Marcos Oliveira', setor: 'Supervisão de Unidade', acao: 'Entrega concluída para todos os jovens do pedido.' }
      ],
      criadoPor: 'Marcos Oliveira',
      criadoPorUid: 'demo-sup-pac-01',
      criadoEm: hoursAgo(340)
    }
  ];

  const lotes = [
    {
      id: 'lote-seed-01',
      codigo: `LOTE-${currentYear}-01`,
      dataCriacao: hoursAgo(170),
      status: 'FINALIZADO_FABRICA',
      pedidosIds: ['ped-seed-007', 'ped-seed-008'],
      gradeConsolidada: calcularGradePedidos([pedidos[6], pedidos[7]]),
      totalGeralPecas: 10,
      observacoesFabricante: 'Fardamento padrão gola polo verde institucional com silk frontal.',
      criadoPor: 'Roberto Ferreira',
      criadoPorUid: 'demo-pat-01',
      dataFinalizacao: hoursAgo(36)
    },
    {
      id: 'lote-seed-02',
      codigo: `LOTE-${currentYear}-02`,
      dataCriacao: hoursAgo(60),
      status: 'EM_FABRICACAO',
      pedidosIds: ['ped-seed-006'],
      gradeConsolidada: calcularGradePedidos([pedidos[5]]),
      totalGeralPecas: 6,
      observacoesFabricante: 'Prioridade turma COM-FOR-2026.2.',
      criadoPor: 'Roberto Ferreira',
      criadoPorUid: 'demo-pat-01',
      dataFinalizacao: null
    }
  ];

  const users = Object.values(DEMO_USERS).map(({ demoKey, ...rest }) => rest);

  return {
    pedidos,
    lotes,
    users,
    unidades: [...UNIDADES_PADRAO]
  };
}

function loadDemoDb() {
  try {
    const raw = localStorage.getItem(DEMO_DB_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.pedidos) && Array.isArray(parsed.lotes)) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn('Falha ao ler demo DB, recriando seed:', err);
  }
  const seeded = createSeedPayload(false);
  saveDemoDb(seeded);
  return seeded;
}

function saveDemoDb(dbData) {
  localStorage.setItem(DEMO_DB_KEY, JSON.stringify(dbData));
  state.pedidos = sortPedidosDesc(dbData.pedidos || []);
  state.lotes = sortLotesDesc(dbData.lotes || []);
  state.users = sortUsersAsc(dbData.users || []);
  state.unidades = [...(dbData.unidades || UNIDADES_PADRAO)];
  state.loading = false;
  state.initialized = true;
  notify();
}

export function stopListeners() {
  firestoreUnsubs.forEach((unsub) => {
    try {
      unsub();
    } catch (_) {}
  });
  firestoreUnsubs = [];
  state.pedidos = [];
  state.lotes = [];
  state.users = [];
  state.unidades = [...UNIDADES_PADRAO];
  state.loading = false;
  state.initialized = false;
}

export function startListeners(user) {
  stopListeners();
  if (!user) return;

  if (isDemoMode() || !isFirebaseConfigured()) {
    const demoDb = loadDemoDb();
    state.pedidos = sortPedidosDesc(demoDb.pedidos || []);
    state.lotes = sortLotesDesc(demoDb.lotes || []);
    state.users = sortUsersAsc(demoDb.users || []);
    state.unidades = [...(demoDb.unidades || UNIDADES_PADRAO)];
    state.loading = false;
    state.initialized = true;
    notify();
    return;
  }

  state.loading = true;
  state.initialized = false;
  notify();

  // 1. Unidades (config/unidades)
  const unsubUnidades = onSnapshot(
    doc(db, 'config', 'unidades'),
    (snap) => {
      if (snap.exists() && Array.isArray(snap.data().lista) && snap.data().lista.length > 0) {
        state.unidades = [...snap.data().lista];
      } else {
        state.unidades = [...UNIDADES_PADRAO];
      }
      notify();
    },
    () => {
      state.unidades = [...UNIDADES_PADRAO];
    }
  );
  firestoreUnsubs.push(unsubUnidades);

  // 2. Pedidos (Supervisão filtrada por unidade sem orderBy para não exigir índice composto)
  const pedidosQuery =
    user.role === 'supervisao'
      ? query(collection(db, 'pedidos'), where('unidade', '==', user.unidade))
      : collection(db, 'pedidos');

  const unsubPedidos = onSnapshot(
    pedidosQuery,
    (snapshot) => {
      const items = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      state.pedidos = sortPedidosDesc(items);
      state.loading = false;
      state.initialized = true;
      notify();
    },
    (error) => {
      console.error('Erro no listener de pedidos:', error);
      state.loading = false;
      state.initialized = true;
      notify();
    }
  );
  firestoreUnsubs.push(unsubPedidos);

  // 3. Lotes de fabricação (apenas Patrimônio e Admin)
  if (user.role === 'patrimonio' || user.role === 'admin') {
    const unsubLotes = onSnapshot(
      collection(db, 'lotes_fabricacao'),
      (snapshot) => {
        const items = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        state.lotes = sortLotesDesc(items);
        notify();
      },
      (error) => {
        console.error('Erro no listener de lotes:', error);
      }
    );
    firestoreUnsubs.push(unsubLotes);
  } else {
    state.lotes = [];
  }

  // 4. Usuários (lista completa apenas para Admin; demais mantêm apenas o próprio perfil)
  if (user.role === 'admin') {
    const unsubUsers = onSnapshot(
      collection(db, 'users'),
      (snapshot) => {
        const items = snapshot.docs.map((d) => ({ uid: d.id, ...d.data() }));
        state.users = sortUsersAsc(items);
        notify();
      },
      (error) => {
        console.error('Erro no listener de usuários:', error);
      }
    );
    firestoreUnsubs.push(unsubUsers);
  } else {
    state.users = [user];
  }
}

function nextPedidoCodigo(user, unidade) {
  let maxNum = 0;
  for (const p of state.pedidos) {
    const match = String(p.codigo || '').match(/(\d+)$/);
    if (match) {
      const n = Number(match[1]);
      if (n > maxNum) maxNum = n;
    }
  }
  const nextSeq = String(maxNum + 1).padStart(3, '0');
  if (isDemoMode() || user?.role !== 'supervisao') {
    return `#PED-${nextSeq}`;
  }
  const prefix = String(unidade || 'UNI')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z]/g, '')
    .slice(0, 3)
    .toUpperCase() || 'UNI';
  return `#PED-${prefix}-${nextSeq}`;
}

function nextLoteCodigo() {
  const year = new Date().getFullYear();
  let maxNum = 0;
  for (const l of state.lotes) {
    const match = String(l.codigo || '').match(/(\d+)$/);
    if (match) {
      const n = Number(match[1]);
      if (n > maxNum) maxNum = n;
    }
  }
  return `LOTE-${year}-${String(maxNum + 1).padStart(2, '0')}`;
}

// =========================================================
// OPERAÇÕES DE NEGÓCIO (FIRESTORE + DEMO)
// =========================================================

export async function criarPedido({ unidade, empresaNome, empresaCnpj, turma, itens }) {
  const user = getCurrentUser();
  if (!user) throw new Error('Usuário não autenticado.');
  if (!Array.isArray(itens) || itens.length === 0) {
    throw new Error('Adicione ao menos um jovem aprendiz ao pedido.');
  }

  const normalizedItens = itens.map((item) => ({
    idItem: item.idItem || generateId(),
    jovemNome: String(item.jovemNome || '').trim(),
    tamanho: item.tamanho,
    quantidade: Math.max(1, Math.min(50, Number(item.quantidade) || 2)),
    entregueAoJovem: false,
    dataEntregaJovem: null
  }));

  const totalPecas = normalizedItens.reduce((acc, it) => acc + it.quantidade, 0);
  const codigo = nextPedidoCodigo(user, unidade);

  const payload = {
    codigo,
    unidade: String(unidade).trim(),
    empresaNome: String(empresaNome).trim(),
    empresaCnpj: maskCnpj(empresaCnpj),
    turma: String(turma).trim(),
    status: 'AGUARDANDO_FATURAMENTO',
    itens: normalizedItens,
    totalPecas,
    financeiro: {
      numeroBoleto: null,
      dataEmissaoBoleto: null,
      dataVencimento: null,
      dataPagamento: null,
      registradoPor: null
    },
    patrimonio: {
      loteFabricacaoId: null,
      dataEnvioUnidade: null,
      dataRecebimentoUnidade: null
    },
    historicoLogs: [
      makeLogEntry(`Solicitação ${codigo} criada para ${unidade} (${normalizedItens.length} jovens / ${totalPecas} peças).`)
    ],
    criadoPor: user.nome,
    criadoPorUid: user.uid,
    criadoEm: nowFieldTimestamp()
  };

  if (isDemoMode()) {
    const demoDb = loadDemoDb();
    const novo = { id: generateId(), ...payload };
    demoDb.pedidos.unshift(novo);
    saveDemoDb(demoDb);
    return novo;
  }

  try {
    const ref = await addDoc(collection(db, 'pedidos'), payload);
    return { id: ref.id, ...payload };
  } catch (error) {
    throw translateFirestoreError(error);
  }
}

export async function registrarBoleto(pedidoId, { numeroBoleto, dataVencimento }) {
  const user = getCurrentUser();
  if (!user) throw new Error('Usuário não autenticado.');

  const numClean = String(numeroBoleto || '').trim();
  const vencClean = String(dataVencimento || '').trim();
  if (!numClean) throw new Error('Informe o número/identificador do boleto.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(vencClean)) throw new Error('Informe uma data de vencimento válida.');

  const logEntry = makeLogEntry(`Boleto ${numClean} registrado com vencimento em ${vencClean.split('-').reverse().join('/')}.`);

  if (isDemoMode()) {
    const demoDb = loadDemoDb();
    const ped = demoDb.pedidos.find((p) => p.id === pedidoId);
    if (!ped) throw new Error('Pedido não encontrado.');
    if (ped.status !== 'AGUARDANDO_FATURAMENTO') {
      throw new Error('Este pedido não está mais aguardando faturamento.');
    }
    ped.status = 'AGUARDANDO_PAGAMENTO';
    ped.financeiro = buildFinanceiroPayload(ped.financeiro, {
      numeroBoleto: numClean,
      dataEmissaoBoleto: nowFieldTimestamp(),
      dataVencimento: vencClean,
      dataPagamento: null,
      registradoPor: user.nome
    });
    ped.historicoLogs = [...(ped.historicoLogs || []), logEntry];
    saveDemoDb(demoDb);
    return ped;
  }

  try {
    const ref = doc(db, 'pedidos', pedidoId);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error('Pedido não encontrado.');
    const current = snap.data();
    if (current.status !== 'AGUARDANDO_FATURAMENTO') {
      throw new Error('Este pedido não está mais aguardando faturamento.');
    }

    await updateDoc(ref, {
      status: 'AGUARDANDO_PAGAMENTO',
      financeiro: buildFinanceiroPayload(current.financeiro, {
        numeroBoleto: numClean,
        dataEmissaoBoleto: serverTimestamp(),
        dataVencimento: vencClean,
        dataPagamento: null,
        registradoPor: user.nome
      }),
      historicoLogs: [...(current.historicoLogs || []), logEntry]
    });
  } catch (error) {
    throw translateFirestoreError(error);
  }
}

export async function confirmarPagamento(pedidoId) {
  const user = getCurrentUser();
  if (!user) throw new Error('Usuário não autenticado.');

  const logEntry = makeLogEntry('Pagamento confirmado. Pedido liberado para produção no Patrimônio.');

  if (isDemoMode()) {
    const demoDb = loadDemoDb();
    const ped = demoDb.pedidos.find((p) => p.id === pedidoId);
    if (!ped) throw new Error('Pedido não encontrado.');
    if (ped.status !== 'AGUARDANDO_PAGAMENTO') {
      throw new Error('Somente pedidos aguardando pagamento podem ser baixados.');
    }
    ped.status = 'PAGO';
    ped.financeiro = buildFinanceiroPayload(ped.financeiro, {
      dataPagamento: nowFieldTimestamp(),
      registradoPor: ped.financeiro?.registradoPor || user.nome
    });
    ped.historicoLogs = [...(ped.historicoLogs || []), logEntry];
    saveDemoDb(demoDb);
    return ped;
  }

  try {
    const ref = doc(db, 'pedidos', pedidoId);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error('Pedido não encontrado.');
    const current = snap.data();
    if (current.status !== 'AGUARDANDO_PAGAMENTO') {
      throw new Error('Somente pedidos aguardando pagamento podem ser baixados.');
    }

    await updateDoc(ref, {
      status: 'PAGO',
      financeiro: buildFinanceiroPayload(current.financeiro, {
        dataPagamento: serverTimestamp(),
        registradoPor: current.financeiro?.registradoPor || user.nome
      }),
      historicoLogs: [...(current.historicoLogs || []), logEntry]
    });
  } catch (error) {
    throw translateFirestoreError(error);
  }
}

export async function gerarLoteFabricacao(pedidosIds, observacoesFabricante = '') {
  const user = getCurrentUser();
  if (!user) throw new Error('Usuário não autenticado.');
  if (!Array.isArray(pedidosIds) || pedidosIds.length === 0) {
    throw new Error('Selecione pelo menos um pedido pago para gerar o lote.');
  }

  const selectedPedidos = state.pedidos.filter((p) => pedidosIds.includes(p.id) && p.status === 'PAGO');
  if (selectedPedidos.length === 0) {
    throw new Error('Nenhum dos pedidos selecionados está disponível com status PAGO.');
  }

  const gradeConsolidada = calcularGradePedidos(selectedPedidos);
  const totalGeralPecas = sumGrade(gradeConsolidada);
  const codigoLote = nextLoteCodigo();
  const obsClean = String(observacoesFabricante || '').trim();

  const lotePayload = {
    codigo: codigoLote,
    dataCriacao: nowFieldTimestamp(),
    status: 'EM_FABRICACAO',
    pedidosIds: selectedPedidos.map((p) => p.id),
    gradeConsolidada,
    totalGeralPecas,
    observacoesFabricante: obsClean,
    criadoPor: user.nome,
    criadoPorUid: user.uid,
    dataFinalizacao: null
  };

  if (isDemoMode()) {
    const demoDb = loadDemoDb();
    const novoLote = { id: generateId(), ...lotePayload };
    demoDb.lotes.unshift(novoLote);

    for (const ped of demoDb.pedidos) {
      if (lotePayload.pedidosIds.includes(ped.id)) {
        ped.status = 'EM_FABRICACAO';
        ped.patrimonio = {
          ...(ped.patrimonio || {}),
          loteFabricacaoId: novoLote.id
        };
        ped.historicoLogs = [
          ...(ped.historicoLogs || []),
          makeLogEntry(`Incluído na Ordem de Fabricação ${codigoLote} (${totalGeralPecas} peças no lote).`)
        ];
      }
    }

    saveDemoDb(demoDb);
    return novoLote;
  }

  try {
    const loteRef = doc(collection(db, 'lotes_fabricacao'));
    const batch = writeBatch(db);
    batch.set(loteRef, lotePayload);

    for (const ped of selectedPedidos) {
      const pedRef = doc(db, 'pedidos', ped.id);
      batch.update(pedRef, {
        status: 'EM_FABRICACAO',
        patrimonio: buildPatrimonioPayload(ped.patrimonio, {
          loteFabricacaoId: loteRef.id
        }),
        historicoLogs: [
          ...(ped.historicoLogs || []),
          makeLogEntry(`Incluído na Ordem de Fabricação ${codigoLote} (${totalGeralPecas} peças no lote).`)
        ]
      });
    }

    await batch.commit();
    return { id: loteRef.id, ...lotePayload };
  } catch (error) {
    throw translateFirestoreError(error);
  }
}

export async function despacharLote(loteId) {
  const user = getCurrentUser();
  if (!user) throw new Error('Usuário não autenticado.');

  if (isDemoMode()) {
    const demoDb = loadDemoDb();
    const lote = demoDb.lotes.find((l) => l.id === loteId);
    if (!lote) throw new Error('Lote não encontrado.');
    if (lote.status !== 'EM_FABRICACAO') {
      throw new Error('Este lote já foi finalizado e despachado.');
    }

    lote.status = 'FINALIZADO_FABRICA';
    lote.dataFinalizacao = nowFieldTimestamp();

    for (const ped of demoDb.pedidos) {
      if (lote.pedidosIds.includes(ped.id) && ped.status === 'EM_FABRICACAO') {
        ped.status = 'EM_TRANSITO';
        ped.patrimonio = {
          ...(ped.patrimonio || {}),
          dataEnvioUnidade: nowFieldTimestamp()
        };
        ped.historicoLogs = [
          ...(ped.historicoLogs || []),
          makeLogEntry(`Lote ${lote.codigo} recebido da fábrica e despachado para ${ped.unidade}.`)
        ];
      }
    }

    saveDemoDb(demoDb);
    return lote;
  }

  try {
    const loteRef = doc(db, 'lotes_fabricacao', loteId);
    const loteSnap = await getDoc(loteRef);
    if (!loteSnap.exists()) throw new Error('Lote não encontrado.');
    const lote = loteSnap.data();
    if (lote.status !== 'EM_FABRICACAO') {
      throw new Error('Este lote já foi finalizado e despachado.');
    }

    const batch = writeBatch(db);
    batch.update(loteRef, {
      status: 'FINALIZADO_FABRICA',
      dataFinalizacao: serverTimestamp()
    });

    for (const pid of lote.pedidosIds || []) {
      const pedRef = doc(db, 'pedidos', pid);
      const pedLocal = state.pedidos.find((p) => p.id === pid);
      const pedSnap = pedLocal ? null : await getDoc(pedRef);
      const pedData = pedLocal || (pedSnap?.exists() ? pedSnap.data() : null);

      if (pedData && pedData.status === 'EM_FABRICACAO') {
        batch.update(pedRef, {
          status: 'EM_TRANSITO',
          patrimonio: buildPatrimonioPayload(pedData.patrimonio, {
            dataEnvioUnidade: serverTimestamp()
          }),
          historicoLogs: [
            ...(pedData.historicoLogs || []),
            makeLogEntry(`Lote ${lote.codigo} recebido da fábrica e despachado para ${pedData.unidade}.`)
          ]
        });
      }
    }

    await batch.commit();
  } catch (error) {
    throw translateFirestoreError(error);
  }
}

export async function confirmarRecebimentoUnidade(pedidoId) {
  const user = getCurrentUser();
  if (!user) throw new Error('Usuário não autenticado.');

  const logEntry = makeLogEntry('Recebimento dos fardamentos confirmado na unidade.');

  if (isDemoMode()) {
    const demoDb = loadDemoDb();
    const ped = demoDb.pedidos.find((p) => p.id === pedidoId);
    if (!ped) throw new Error('Pedido não encontrado.');
    if (ped.status !== 'EM_TRANSITO') {
      throw new Error('Somente pedidos em trânsito podem ser recebidos pela unidade.');
    }
    ped.status = 'RECEBIDO_UNIDADE';
    ped.patrimonio = buildPatrimonioPayload(ped.patrimonio, {
      dataRecebimentoUnidade: nowFieldTimestamp()
    });
    ped.historicoLogs = [...(ped.historicoLogs || []), logEntry];
    saveDemoDb(demoDb);
    return ped;
  }

  try {
    const pedRef = doc(db, 'pedidos', pedidoId);
    const snap = await getDoc(pedRef);
    if (!snap.exists()) throw new Error('Pedido não encontrado.');
    const current = snap.data();
    if (current.status !== 'EM_TRANSITO') {
      throw new Error('Somente pedidos em trânsito podem ser recebidos pela unidade.');
    }

    await updateDoc(pedRef, {
      status: 'RECEBIDO_UNIDADE',
      patrimonio: buildPatrimonioPayload(current.patrimonio, {
        dataRecebimentoUnidade: serverTimestamp()
      }),
      historicoLogs: [...(current.historicoLogs || []), logEntry]
    });
  } catch (error) {
    throw translateFirestoreError(error);
  }
}

export async function registrarEntregaJovem(pedidoId, idItem, entregue = true) {
  const user = getCurrentUser();
  if (!user) throw new Error('Usuário não autenticado.');

  const buildUpdatedData = (ped) => {
    if (!['RECEBIDO_UNIDADE', 'CONCLUIDO'].includes(ped.status)) {
      throw new Error('Confirme o recebimento na unidade antes de registrar entregas aos jovens.');
    }

    let jovemAlvo = '';
    const updatedItens = (ped.itens || []).map((item) => {
      if (item.idItem !== idItem) return item;
      jovemAlvo = item.jovemNome;
      return {
        ...item,
        entregueAoJovem: Boolean(entregue),
        dataEntregaJovem: entregue ? nowArrayTimestamp() : null
      };
    });

    if (!jovemAlvo) throw new Error('Jovem não encontrado neste pedido.');

    const todosEntregues = updatedItens.length > 0 && updatedItens.every((it) => it.entregueAoJovem === true);
    const novoStatus = todosEntregues ? 'CONCLUIDO' : 'RECEBIDO_UNIDADE';

    const logs = [...(ped.historicoLogs || [])];
    logs.push(
      makeLogEntry(
        entregue
          ? `Farda entregue ao jovem ${jovemAlvo}.`
          : `Entrega desmarcada para o jovem ${jovemAlvo}.`
      )
    );
    if (todosEntregues && ped.status !== 'CONCLUIDO') {
      logs.push(makeLogEntry('Todos os jovens receberam as fardas. Pedido marcado como CONCLUÍDO.'));
    }

    return {
      itens: updatedItens,
      status: novoStatus,
      historicoLogs: logs
    };
  };

  if (isDemoMode()) {
    const demoDb = loadDemoDb();
    const ped = demoDb.pedidos.find((p) => p.id === pedidoId);
    if (!ped) throw new Error('Pedido não encontrado.');
    const patch = buildUpdatedData(ped);
    ped.itens = patch.itens;
    ped.status = patch.status;
    ped.historicoLogs = patch.historicoLogs;
    saveDemoDb(demoDb);
    return ped;
  }

  try {
    const pedRef = doc(db, 'pedidos', pedidoId);
    const snap = await getDoc(pedRef);
    if (!snap.exists()) throw new Error('Pedido não encontrado.');
    const patch = buildUpdatedData(snap.data());
    await updateDoc(pedRef, patch);
    return patch;
  } catch (error) {
    throw translateFirestoreError(error);
  }
}

export async function salvarUsuario({ uid, nome, email, senha, role, unidade, ativo = true, isNew = false }) {
  const currentUser = getCurrentUser();
  if (!currentUser || currentUser.role !== 'admin') {
    throw new Error('Apenas administradores podem gerenciar usuários.');
  }

  const cleanNome = String(nome || '').trim();
  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanUnidade = ['financeiro', 'patrimonio', 'admin'].includes(role)
    ? (unidade && unidade !== '' ? unidade : 'Todas')
    : String(unidade || '').trim();

  if (!cleanNome || !cleanEmail) {
    throw new Error('Nome e e-mail são obrigatórios.');
  }

  if (isDemoMode()) {
    const demoDb = loadDemoDb();
    const finalUid = uid || generateId();
    const userObj = {
      uid: finalUid,
      nome: cleanNome,
      email: cleanEmail,
      role,
      unidade: cleanUnidade || 'Todas',
      ativo: Boolean(ativo)
    };
    const idx = demoDb.users.findIndex((u) => u.uid === finalUid);
    if (idx >= 0) {
      demoDb.users[idx] = userObj;
    } else {
      demoDb.users.push(userObj);
    }
    saveDemoDb(demoDb);
    return userObj;
  }

  let targetUid = String(uid || '').trim();

  if (isNew && !targetUid) {
    if (!senha || senha.length < 6) {
      throw new Error('Para criar a conta automaticamente no Firebase Auth, informe uma senha com no mínimo 6 caracteres (ou informe o UID existente).');
    }
    targetUid = await createAuthUserWithoutSignOut(cleanEmail, senha);
  }

  if (!targetUid) {
    throw new Error('Informe o UID do Firebase Auth ou uma senha para criar o acesso.');
  }

  const userPayload = {
    uid: targetUid,
    nome: cleanNome,
    email: cleanEmail,
    role,
    unidade: cleanUnidade || 'Todas',
    ativo: Boolean(ativo)
  };

  await setDoc(doc(db, 'users', targetUid), userPayload, { merge: true });
  return userPayload;
}

export async function atualizarStatusUsuario(uid, ativo) {
  const currentUser = getCurrentUser();
  if (!currentUser || currentUser.role !== 'admin') {
    throw new Error('Apenas administradores podem alterar o status de usuários.');
  }
  if (uid === currentUser.uid && !ativo) {
    throw new Error('Você não pode desativar sua própria conta logada.');
  }

  if (isDemoMode()) {
    const demoDb = loadDemoDb();
    const target = demoDb.users.find((u) => u.uid === uid);
    if (!target) throw new Error('Usuário não encontrado.');
    target.ativo = Boolean(ativo);
    saveDemoDb(demoDb);
    return;
  }

  await updateDoc(doc(db, 'users', uid), { ativo: Boolean(ativo) });
}

export async function salvarUnidades(lista) {
  const currentUser = getCurrentUser();
  if (!currentUser || currentUser.role !== 'admin') {
    throw new Error('Apenas administradores podem gerenciar unidades.');
  }

  const cleaned = [...new Set((lista || []).map((u) => String(u).trim()).filter(Boolean))];
  if (cleaned.length === 0) {
    throw new Error('Mantenha pelo menos uma unidade cadastrada.');
  }

  if (isDemoMode()) {
    const demoDb = loadDemoDb();
    demoDb.unidades = cleaned;
    saveDemoDb(demoDb);
    return cleaned;
  }

  await setDoc(doc(db, 'config', 'unidades'), { lista: cleaned });
  return cleaned;
}

export async function popularDadosSeed(force = false) {
  const user = getCurrentUser();
  if (!user || user.role !== 'admin') {
    throw new Error('Apenas administradores podem executar o Seed de dados.');
  }

  if (isDemoMode()) {
    const seed = createSeedPayload(false);
    saveDemoDb(seed);
    return { createdPedidos: seed.pedidos.length, createdLotes: seed.lotes.length };
  }

  const existingPedidos = await getDocs(collection(db, 'pedidos'));
  if (!force && !existingPedidos.empty) {
    throw new Error('O banco já possui pedidos cadastrados. Confirme se deseja adicionar dados de teste adicionais.');
  }

  const seed = createSeedPayload(true);
  const batch = writeBatch(db);

  // Grava unidades padrão se config/unidades não existir
  const unidadesRef = doc(db, 'config', 'unidades');
  const unidadesSnap = await getDoc(unidadesRef);
  if (!unidadesSnap.exists()) {
    batch.set(unidadesRef, { lista: seed.unidades });
  }

  const loteRefsBySeedId = {};
  for (const lote of seed.lotes) {
    const { id: seedLoteId, ...loteData } = lote;
    const ref = doc(collection(db, 'lotes_fabricacao'));
    loteRefsBySeedId[seedLoteId] = { ref, data: { ...loteData, pedidosIds: [] } };
  }

  for (const ped of seed.pedidos) {
    const { id: seedPedId, ...pedData } = ped;
    const pedRef = doc(collection(db, 'pedidos'));
    const mappedLoteId = pedData.patrimonio?.loteFabricacaoId;
    let realLoteId = null;

    if (mappedLoteId && loteRefsBySeedId[mappedLoteId]) {
      realLoteId = loteRefsBySeedId[mappedLoteId].ref.id;
      loteRefsBySeedId[mappedLoteId].data.pedidosIds.push(pedRef.id);
    }

    batch.set(pedRef, {
      ...pedData,
      criadoPorUid: user.uid,
      patrimonio: {
        ...pedData.patrimonio,
        loteFabricacaoId: realLoteId
      }
    });
  }

  for (const entry of Object.values(loteRefsBySeedId)) {
    batch.set(entry.ref, {
      ...entry.data,
      criadoPorUid: user.uid
    });
  }

  await batch.commit();
  return { createdPedidos: seed.pedidos.length, createdLotes: seed.lotes.length };
}

export function resetarDadosDemo() {
  const seed = createSeedPayload(false);
  saveDemoDb(seed);
  return seed;
}
