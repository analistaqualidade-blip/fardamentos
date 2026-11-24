# Sistema de Gestão de Fardamentos — Jovens Aprendizes

Aplicação web estática (GitHub Pages / PWA-ready), responsiva (mobile-first) e em tempo real para gerenciar o fluxo completo ponta a ponta de **solicitação, faturamento, fabricação, expedição e entrega individual de fardamentos** para jovens aprendizes em instituições de ensino/aprendizagem com múltiplas unidades (Fortaleza, Pacajus, Maracanaú, Caucaia, Eusébio, Sobral e polos adicionais).

---

## Sumário

- [Visão Geral do Fluxo (7 Status)](#visão-geral-do-fluxo-7-status)
- [Stack & Arquitetura de Arquivos](#stack--arquitetura-de-arquivos)
- [Módulos por Perfil de Acesso](#módulos-por-perfil-de-acesso)
- [Modo Demonstração (Teste Imediato sem Firebase)](#modo-demonstração-teste-imediato-sem-firebase)
- [Configuração Completa do Firebase (Passo a Passo)](#configuração-completa-do-firebase-passo-a-passo)
- [Regras de Segurança do Firestore (`firestore.rules`)](#regras-de-segurança-do-firestore-firestorerules)
- [Criando o Primeiro Administrador e Dados Iniciais (Seed)](#criando-o-primeiro-administrador-e-dados-iniciais-seed)
- [Publicação no GitHub Pages](#publicação-no-github-pages)

---

## Visão Geral do Fluxo (7 Status)

1. **`AGUARDANDO_FATURAMENTO`** — Supervisão da unidade solicita as fardas (com busca automática do CNPJ via BrasilAPI) e informa turma + lista nominal de jovens e tamanhos (`PP`, `P`, `M`, `G`, `GG`, `XG`).
2. **`AGUARDANDO_PAGAMENTO`** — Financeiro registra o número do boleto e a data de vencimento; o sistema calcula automaticamente badges de vencimento (**No Prazo**, **Vence Hoje / Em breve**, **Vencido há X dias**).
3. **`PAGO`** — Financeiro confirma a liquidação do boleto; o pedido entra instantaneamente na fila de produção do Patrimônio.
4. **`EM_FABRICACAO`** — Patrimônio seleciona pedidos pagos no Consolidador Inteligente de grade e gera uma Ordem de Fabricação (`lotes_fabricacao`).
5. **`EM_TRANSITO`** — Patrimônio recebe o lote da fábrica, visualiza o **Mapa de Separação por Unidade**, imprime o **Romaneio A4** (`window.print()`) e confirma o despacho.
6. **`RECEBIDO_UNIDADE`** — Supervisão da unidade de destino confirma o recebimento físico do lote/pedido.
7. **`CONCLUIDO`** — Supervisão marca a entrega individual no **Checklist de Entrega ao Jovem**; quando 100% dos jovens do pedido recebem a farda, o status muda automaticamente para `CONCLUIDO`.

---

## Stack & Arquitetura de Arquivos

- **Frontend:** HTML5 semântico, Tailwind CSS (CDN), CSS3 customizado (`@media print` para romaneio), Lucide Icons e JavaScript Vanilla (ES6+ Modules).
- **Backend / BaaS:** Firebase SDK v10.14.1 Modular via CDN (Firebase Authentication + Cloud Firestore com listeners `onSnapshot`).
- **PWA:** `manifest.json` + `sw.js` com caminhos relativos compatíveis com GitHub Pages.
- **API Pública:** [BrasilAPI CNPJ](https://brasilapi.com.br/docs#tag/CNPJ) (`https://brasilapi.com.br/api/cnpj/v1/{cnpj}`).

```text
Fardamentos/
├── index.html                 # Shell principal, tela de login, modais e romaneio
├── manifest.json              # Manifesto PWA
├── sw.js                      # Service Worker (cache do shell estático)
├── firestore.rules            # Regras de segurança do Cloud Firestore
├── README.md                  # Documentação e guia de implantação
├── assets/
│   └── icon.svg               # Ícone institucional PWA
├── css/
│   └── styles.css             # Tema Verde Escuro/Cinza e layout de impressão A4
└── js/
    ├── app.js                 # Roteador adaptativo, sidebar, Raio-X do pedido
    ├── auth.js                # Sessão Firebase Auth, verificação de perfil e Modo Demo
    ├── firebase-config.js     # Credenciais e inicialização modular do Firebase v10
    ├── store.js               # Estado central, listeners onSnapshot e operações em lote
    ├── utils.js               # Máscaras, BrasilAPI, datas locais, grades, modais e toasts
    └── modules/
        ├── supervisao.js      # Solicitação, acompanhamento e checklist mobile
        ├── financeiro.js      # Faturamento, cobranças com alertas e histórico
        ├── patrimonio.js      # Consolidador de grade, lotes, mapa e romaneio
        └── admin.js           # KPIs, SLA, gráficos, equipe/unidades, auditoria e seed
```

---

## Módulos por Perfil de Acesso

| Perfil (`role`) | Escopo de Unidade | Funcionalidades |
| :--- | :--- | :--- |
| `supervisao` | Restrito à sua `unidade` | Criar pedidos com BrasilAPI, acompanhar pedidos da unidade, confirmar recebimento (`EM_TRANSITO` → `RECEBIDO_UNIDADE`), baixar entregas individuais aos jovens. |
| `financeiro` | Global (`Todas`) | Registrar boletos e vencimentos, monitorar cobranças vencidas/a vencer, confirmar pagamentos (`PAGO`) e consultar histórico por período. |
| `patrimonio` | Global (`Todas`) | Consolidar pedidos pagos por grade de tamanhos, gerar ordens de fabricação (`lotes_fabricacao`), gerar mapa de separação por unidade, imprimir romaneio e despachar. |
| `admin` | Global (`Todas`) | Acesso completo ao Dashboard Executivo, SLA médio entre etapas, trilha de auditoria consolidada, alternância entre todos os módulos, gestão de equipe/unidades e Seed inicial. |

---

## Modo Demonstração (Teste Imediato sem Firebase)

Se você abrir a aplicação antes de configurar o `js/firebase-config.js` (ou quiser demonstrar o sistema offline/localmente), a tela inicial oferece o painel **Modo Demonstração (Sem Firebase)** com 5 perfis prontos (Administrador, Supervisão Fortaleza, Supervisão Pacajus, Financeiro e Patrimônio).

Os dados ficam salvos no `localStorage` do navegador com o mesmo schema do Firestore, permitindo testar toda a jornada ponta a ponta e alternar de perfil em tempo real pelo seletor no topo da tela.

---

## Configuração Completa do Firebase (Passo a Passo)

### 1. Criar Projeto no Firebase
1. Acesse o [Firebase Console](https://console.firebase.google.com/).
2. Clique em **Adicionar projeto** (ou *Create a project*), informe um nome (ex: `gestao-fardamentos`) e conclua a criação.

### 2. Ativar o Authentication (E-mail e Senha)
1. No menu lateral do projeto, clique em **Criação** (Build) → **Authentication**.
2. Clique em **Vamos começar** (Get started).
3. Na aba **Sign-in method** (Método de login), selecione **E-mail/senha**.
4. Ative a primeira chave (**E-mail/senha**) e clique em **Salvar**.

### 3. Criar o Banco Cloud Firestore
1. No menu lateral, clique em **Criação** (Build) → **Firestore Database**.
2. Clique em **Criar banco de dados**.
3. Escolha a localização mais próxima (ex: `southamerica-east1` — São Paulo).
4. Inicie em **Modo de produção** e clique em **Criar**.

> **Observação sobre Índices:** As queries deste sistema foram projetadas para não dependerem de índices compostos manuais (a ordenação temporal é feita no cliente após o `onSnapshot`).

### 4. Registrar o App Web e Configurar `js/firebase-config.js`
1. No menu lateral, clique no ícone de engrenagem ao lado de **Visão geral do projeto** → **Configurações do projeto**.
2. Em **Seus aplicativos**, clique no ícone Web (`</>`).
3. Dê um apelido (ex: `Fardamentos Web`) — não é necessário marcar Firebase Hosting caso vá hospedar no GitHub Pages — e clique em **Registrar app**.
4. Copie o objeto `firebaseConfig` exibido e cole em [`js/firebase-config.js`](js/firebase-config.js) substituindo os placeholders:

```javascript
export const firebaseConfig = {
  apiKey: 'SUA_API_KEY_REAL',
  authDomain: 'seu-projeto.firebaseapp.com',
  projectId: 'seu-projeto',
  storageBucket: 'seu-projeto.appspot.com',
  messagingSenderId: '123456789000',
  appId: '1:123456789000:web:abcdef123456'
};
```

---

## Regras de Segurança do Firestore (`firestore.rules`)

No Firebase Console, acesse **Firestore Database → Regras (Rules)**, substitua o conteúdo padrão pelo conteúdo de [`firestore.rules`](firestore.rules) abaixo e clique em **Publicar**:

```javascript
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {

    // Admins may edit and delete pedidos, lotes_fabricacao and (other) users.
    // Other roles remain restricted to their workflow transitions; no deletes.
    // ===============================================================
    // Assumed Data Model
    // ===============================================================
    //
    // This security rules file assumes the following data structures:
    //
    // Collection: users
    // Document ID: {userId} (Firebase Auth UID)
    // Fields:
    //   - uid: string (optional on legacy/manual docs; if present, == userId, immutable once set, 1..128 chars)
    //   - nome: string (required, 1..100 chars)
    //   - email: string (required, valid email format, 3..150 chars)
    //   - role: string (required, enum: 'supervisao' | 'financeiro' | 'patrimonio' | 'admin')
    //   - unidade: string (required, 1..80 chars; e.g., 'Fortaleza' or 'Todas')
    //   - ativo: bool (required on app writes; omitted treated as active on read/auth checks)
    //
    // Collection: config
    // Document ID: unidades
    // Fields:
    //   - lista: list of strings (required, 1..100 items, each string 1..80 chars)
    //
    // Collection: pedidos
    // Document ID: auto-generated
    // Fields:
    //   - codigo: string (required, immutable, 1..40 chars)
    //   - unidade: string (required, immutable, 1..80 chars)
    //   - empresaNome: string (required, immutable, 1..180 chars)
    //   - empresaCnpj: string (required, immutable, 14..20 chars)
    //   - turma: string (required, immutable, 1..80 chars)
    //   - status: string (required, enum: 'AGUARDANDO_FATURAMENTO' | 'AGUARDANDO_PAGAMENTO' |
    //             'PAGO' | 'EM_FABRICACAO' | 'EM_TRANSITO' | 'RECEBIDO_UNIDADE' | 'CONCLUIDO')
    //   - itens: list of maps (required, 1..200 items), each map:
    //       { idItem: string (1..80), jovemNome: string (1..120),
    //         tamanho: 'PP'|'P'|'M'|'G'|'GG'|'XG', quantidade: number (1..50),
    //         entregueAoJovem: bool, dataEntregaJovem: timestamp | null }
    //   - totalPecas: number (required, immutable, > 0 && <= 10000)
    //   - financeiro: map (required) with keys:
    //       { numeroBoleto: string (1..80) | null, dataEmissaoBoleto: timestamp | null,
    //         dataVencimento: string YYYY-MM-DD | null, dataPagamento: timestamp | null,
    //         registradoPor: string (1..100) | null }
    //   - patrimonio: map (required) with keys:
    //       { loteFabricacaoId: string (1..128) | null, dataEnvioUnidade: timestamp | null,
    //         dataRecebimentoUnidade: timestamp | null }
    //   - historicoLogs: list of maps (required, append-only, 1..500 items), each map:
    //       { data: timestamp, usuario: string (1..100), setor: string (1..60), acao: string (1..300) }
    //   - criadoPor: string (required, immutable, 1..100 chars)
    //   - criadoPorUid: string (required, immutable, == request.auth.uid on create, 1..128 chars)
    //   - criadoEm: timestamp (required, immutable)
    //
    // Collection: lotes_fabricacao
    // Document ID: auto-generated
    // Fields:
    //   - codigo: string (required, immutable, 1..40 chars)
    //   - dataCriacao: timestamp (required, immutable)
    //   - status: string (required, enum: 'EM_FABRICACAO' | 'FINALIZADO_FABRICA')
    //   - pedidosIds: list of strings (required, immutable, 1..300 items, each 1..128 chars)
    //   - gradeConsolidada: map (required, immutable) with keys ['PP', 'P', 'M', 'G', 'GG', 'XG'] (numbers >= 0)
    //   - totalGeralPecas: number (required, immutable, > 0 && <= 100000, == sum(gradeConsolidada))
    //   - observacoesFabricante: string (required, immutable, 0..1000 chars)
    //   - criadoPor: string (required, immutable, 1..100 chars)
    //   - criadoPorUid: string (required, immutable, == request.auth.uid on create, 1..128 chars)
    //   - dataFinalizacao: timestamp | null (required)
    //
    // ===============================================================

    // ===============================================================
    // Helper Functions
    // ===============================================================

    function isAuthenticated() {
      return request.auth != null;
    }

    function isOwner(userId) {
      return isAuthenticated() && request.auth.uid == userId;
    }

    function isDocOwner() {
      return isAuthenticated() && request.auth.uid == resource.data.uid;
    }

    function uidUnchanged() {
      return !('uid' in request.resource.data) ||
        request.resource.data.uid == request.auth.uid;
    }

    function uidNotModified() {
      return !('uid' in resource.data) ||
        ('uid' in request.resource.data && request.resource.data.uid == resource.data.uid);
    }

    function hasRequiredFields(fields) {
      return request.resource.data.keys().hasAll(fields);
    }

    function hasOnlyAllowedFields(fields) {
      return request.resource.data.keys().hasOnly(fields);
    }

    function areImmutableFieldsUnchanged(fields) {
      return !request.resource.data.diff(resource.data).affectedKeys().hasAny(fields);
    }

    function validStringLength(field, minLen, maxLen) {
      return request.resource.data[field] is string &&
        request.resource.data[field].size() >= minLen &&
        request.resource.data[field].size() <= maxLen;
    }

    function isValidEmail(email) {
      return email is string &&
        email.size() >= 3 &&
        email.size() <= 150 &&
        email.matches('^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$');
    }

    function isPositive(field) {
      return request.resource.data[field] is number && request.resource.data[field] > 0;
    }

    function isValidList(list, maxSize) {
      return list is list && list.size() <= maxSize;
    }

    function isValidMap(mapData, allowedKeys) {
      return mapData is map && mapData.keys().hasOnly(allowedKeys);
    }

    // ===============================================================
    // Auth & Role Lookup Helpers
    // ===============================================================

    function userPath() {
      return /databases/$(database)/documents/users/$(request.auth.uid);
    }

    function userDocExists() {
      return exists(userPath());
    }

    function getUserData() {
      return get(userPath()).data;
    }

    function isActiveUser() {
      return isAuthenticated() &&
        userDocExists() &&
        (!('ativo' in getUserData()) || getUserData().ativo == true);
    }

    function hasRole(role) {
      return isActiveUser() &&
        'role' in getUserData() &&
        getUserData().role == role;
    }

    function isAdmin() {
      return isAuthenticated() && (
        (
          isActiveUser() &&
          'role' in getUserData() &&
          getUserData().role == 'admin'
        ) ||
        (
          'role' in request.auth.token &&
          request.auth.token.role == 'admin' &&
          (!userDocExists() || !('ativo' in getUserData()) || getUserData().ativo == true)
        )
      );
    }

    // ===============================================================
    // Domain Validators
    // ===============================================================

    function isValidUser(data, userId) {
      return data is map &&
        data.keys().hasOnly(['uid', 'nome', 'email', 'role', 'unidade', 'ativo']) &&
        data.keys().hasAll(['nome', 'email', 'role', 'unidade', 'ativo']) &&
        (!('uid' in data) || (data.uid is string && data.uid == userId && data.uid.size() >= 1 && data.uid.size() <= 128)) &&
        data.nome is string && data.nome.size() >= 1 && data.nome.size() <= 100 &&
        isValidEmail(data.email) &&
        data.role in ['supervisao', 'financeiro', 'patrimonio', 'admin'] &&
        data.unidade is string && data.unidade.size() >= 1 && data.unidade.size() <= 80 &&
        data.ativo is bool;
    }

    function isValidUnitName(val) {
      return val is string && val.size() >= 1 && val.size() <= 80;
    }

    function isValidConfigUnidades(data) {
      return data is map &&
        data.keys().hasOnly(['lista']) &&
        data.keys().size() == 1 &&
        data.lista is list &&
        data.lista.size() >= 1 &&
        data.lista.size() <= 100 &&
        isValidUnitName(data.lista[0]) &&
        isValidUnitName(data.lista[data.lista.size() - 1]);
    }

    function isValidPedidoItem(item) {
      return item is map &&
        item.keys().hasOnly(['idItem', 'jovemNome', 'tamanho', 'quantidade', 'entregueAoJovem', 'dataEntregaJovem']) &&
        item.keys().size() == 6 &&
        item.idItem is string && item.idItem.size() >= 1 && item.idItem.size() <= 80 &&
        item.jovemNome is string && item.jovemNome.size() >= 1 && item.jovemNome.size() <= 120 &&
        item.tamanho in ['PP', 'P', 'M', 'G', 'GG', 'XG'] &&
        item.quantidade is number && item.quantidade > 0 && item.quantidade <= 50 &&
        item.entregueAoJovem is bool &&
        (item.dataEntregaJovem == null || item.dataEntregaJovem is timestamp);
    }

    function isValidPedidoItensList(itens) {
      return itens is list &&
        itens.size() >= 1 &&
        itens.size() <= 200 &&
        isValidPedidoItem(itens[0]);
    }

    function isValidFinanceiroMap(fin) {
      return fin is map &&
        fin.keys().hasOnly(['numeroBoleto', 'dataEmissaoBoleto', 'dataVencimento', 'dataPagamento', 'registradoPor']) &&
        fin.keys().size() == 5 &&
        (fin.numeroBoleto == null || (fin.numeroBoleto is string && fin.numeroBoleto.size() >= 1 && fin.numeroBoleto.size() <= 80)) &&
        (fin.dataEmissaoBoleto == null || fin.dataEmissaoBoleto is timestamp) &&
        (fin.dataVencimento == null || (fin.dataVencimento is string && fin.dataVencimento.matches('^[0-9]{4}-[0-9]{2}-[0-9]{2}$'))) &&
        (fin.dataPagamento == null || fin.dataPagamento is timestamp) &&
        (fin.registradoPor == null || (fin.registradoPor is string && fin.registradoPor.size() >= 1 && fin.registradoPor.size() <= 100));
    }

    function isValidPatrimonioMap(pat) {
      return pat is map &&
        pat.keys().hasOnly(['loteFabricacaoId', 'dataEnvioUnidade', 'dataRecebimentoUnidade']) &&
        pat.keys().size() == 3 &&
        (pat.loteFabricacaoId == null || (pat.loteFabricacaoId is string && pat.loteFabricacaoId.size() >= 1 && pat.loteFabricacaoId.size() <= 128)) &&
        (pat.dataEnvioUnidade == null || pat.dataEnvioUnidade is timestamp) &&
        (pat.dataRecebimentoUnidade == null || pat.dataRecebimentoUnidade is timestamp);
    }

    function isValidLogEntry(entry) {
      return entry is map &&
        entry.keys().hasOnly(['data', 'usuario', 'setor', 'acao']) &&
        entry.keys().size() == 4 &&
        entry.data is timestamp &&
        entry.usuario is string && entry.usuario.size() >= 1 && entry.usuario.size() <= 100 &&
        entry.setor is string && entry.setor.size() >= 1 && entry.setor.size() <= 60 &&
        entry.acao is string && entry.acao.size() >= 1 && entry.acao.size() <= 300;
    }

    function isValidHistoricoLogsList(logs) {
      return logs is list &&
        logs.size() >= 1 &&
        logs.size() <= 500 &&
        isValidLogEntry(logs[logs.size() - 1]);
    }

    function isValidPedido(data) {
      return data is map &&
        data.keys().hasOnly([
          'codigo', 'unidade', 'empresaNome', 'empresaCnpj', 'turma', 'status',
          'itens', 'totalPecas', 'financeiro', 'patrimonio', 'historicoLogs',
          'criadoPor', 'criadoPorUid', 'criadoEm'
        ]) &&
        data.keys().size() == 14 &&
        data.codigo is string && data.codigo.size() >= 1 && data.codigo.size() <= 40 &&
        data.unidade is string && data.unidade.size() >= 1 && data.unidade.size() <= 80 &&
        data.empresaNome is string && data.empresaNome.size() >= 1 && data.empresaNome.size() <= 180 &&
        data.empresaCnpj is string && data.empresaCnpj.size() >= 14 && data.empresaCnpj.size() <= 20 &&
        data.turma is string && data.turma.size() >= 1 && data.turma.size() <= 80 &&
        data.status in [
          'AGUARDANDO_FATURAMENTO',
          'AGUARDANDO_PAGAMENTO',
          'PAGO',
          'EM_FABRICACAO',
          'EM_TRANSITO',
          'RECEBIDO_UNIDADE',
          'CONCLUIDO'
        ] &&
        isValidPedidoItensList(data.itens) &&
        data.totalPecas is number && data.totalPecas > 0 && data.totalPecas <= 10000 &&
        isValidFinanceiroMap(data.financeiro) &&
        isValidPatrimonioMap(data.patrimonio) &&
        isValidHistoricoLogsList(data.historicoLogs) &&
        data.criadoPor is string && data.criadoPor.size() >= 1 && data.criadoPor.size() <= 100 &&
        data.criadoPorUid is string && data.criadoPorUid.size() >= 1 && data.criadoPorUid.size() <= 128 &&
        data.criadoEm is timestamp;
    }

    function isValidPedidoInitialState(data) {
      return data.status == 'AGUARDANDO_FATURAMENTO' &&
        data.financeiro.numeroBoleto == null &&
        data.financeiro.dataEmissaoBoleto == null &&
        data.financeiro.dataVencimento == null &&
        data.financeiro.dataPagamento == null &&
        data.financeiro.registradoPor == null &&
        data.patrimonio.loteFabricacaoId == null &&
        data.patrimonio.dataEnvioUnidade == null &&
        data.patrimonio.dataRecebimentoUnidade == null &&
        data.historicoLogs.size() == 1 &&
        data.itens[0].entregueAoJovem == false &&
        data.itens[0].dataEntregaJovem == null;
    }

    function isValidPedidoLogsAppend(oldLogs, newLogs) {
      return oldLogs is list &&
        newLogs.size() >= oldLogs.size() &&
        (oldLogs.size() == 0 || newLogs[0].acao == oldLogs[0].acao);
    }

    function isValidItensDeliveryUpdate(prevItens, nextItens) {
      return nextItens.size() == prevItens.size() &&
        nextItens[0].idItem == prevItens[0].idItem &&
        nextItens[0].quantidade == prevItens[0].quantidade;
    }

    function isValidFinanceiroTransition() {
      let prev = resource.data;
      let next = request.resource.data;
      return next.diff(prev).affectedKeys().hasOnly(['status', 'financeiro', 'historicoLogs']) &&
        (
          (
            prev.status == 'AGUARDANDO_FATURAMENTO' &&
            next.status == 'AGUARDANDO_PAGAMENTO' &&
            next.financeiro.numeroBoleto != null &&
            next.financeiro.dataEmissaoBoleto != null &&
            next.financeiro.dataVencimento != null &&
            next.financeiro.dataPagamento == null &&
            next.financeiro.registradoPor != null
          ) ||
          (
            prev.status == 'AGUARDANDO_PAGAMENTO' &&
            next.status == 'PAGO' &&
            next.financeiro.dataPagamento != null &&
            next.financeiro.numeroBoleto == prev.financeiro.numeroBoleto &&
            next.financeiro.dataVencimento == prev.financeiro.dataVencimento
          )
        );
    }

    function isValidPatrimonioTransition() {
      let prev = resource.data;
      let next = request.resource.data;
      return next.diff(prev).affectedKeys().hasOnly(['status', 'patrimonio', 'historicoLogs']) &&
        (
          (
            prev.status == 'PAGO' &&
            next.status == 'EM_FABRICACAO' &&
            next.patrimonio.loteFabricacaoId != null &&
            next.patrimonio.dataEnvioUnidade == null &&
            next.patrimonio.dataRecebimentoUnidade == null
          ) ||
          (
            prev.status == 'EM_FABRICACAO' &&
            next.status == 'EM_TRANSITO' &&
            next.patrimonio.dataEnvioUnidade != null &&
            next.patrimonio.loteFabricacaoId == prev.patrimonio.loteFabricacaoId &&
            next.patrimonio.dataRecebimentoUnidade == null
          )
        );
    }

    function isValidSupervisaoTransition() {
      let prev = resource.data;
      let next = request.resource.data;
      return (
        (
          prev.status == 'EM_TRANSITO' &&
          next.status == 'RECEBIDO_UNIDADE' &&
          next.diff(prev).affectedKeys().hasOnly(['status', 'patrimonio', 'historicoLogs']) &&
          next.patrimonio.dataRecebimentoUnidade != null &&
          next.patrimonio.loteFabricacaoId == prev.patrimonio.loteFabricacaoId
        ) ||
        (
          prev.status in ['RECEBIDO_UNIDADE', 'CONCLUIDO'] &&
          next.status in ['RECEBIDO_UNIDADE', 'CONCLUIDO'] &&
          next.diff(prev).affectedKeys().hasOnly(['status', 'itens', 'historicoLogs']) &&
          isValidItensDeliveryUpdate(prev.itens, next.itens)
        )
      );
    }

    function canUpdatePedido() {
      let u = getUserData();
      let role = 'role' in u ? u.role : '';
      let isAdm = role == 'admin' || ('role' in request.auth.token && request.auth.token.role == 'admin');
      let unit = 'unidade' in u ? u.unidade : '';
      return (
        ((isAdm || role == 'financeiro') && isValidFinanceiroTransition()) ||
        ((isAdm || role == 'patrimonio') && isValidPatrimonioTransition()) ||
        ((isAdm || (role == 'supervisao' && resource.data.unidade == unit)) && isValidSupervisaoTransition())
      );
    }

    // Cheap admin check (call only after isActiveUser() succeeded)
    function isAdminCheap() {
      let u = getUserData();
      return ('role' in u && u.role == 'admin') ||
        ('role' in request.auth.token && request.auth.token.role == 'admin');
    }

    function isValidPedidoIdStr(id) {
      return id is string && id.size() >= 1 && id.size() <= 128;
    }

    function isValidPedidosIdsList(ids) {
      return ids is list &&
        ids.size() >= 1 &&
        ids.size() <= 300 &&
        isValidPedidoIdStr(ids[0]) &&
        isValidPedidoIdStr(ids[ids.size() - 1]);
    }

    function isValidGradeValue(val) {
      return val is number && val >= 0 && val <= 100000;
    }

    function isValidGradeConsolidada(grade) {
      return grade is map &&
        grade.keys().hasOnly(['PP', 'P', 'M', 'G', 'GG', 'XG']) &&
        grade.keys().size() == 6 &&
        isValidGradeValue(grade.PP) &&
        isValidGradeValue(grade.P) &&
        isValidGradeValue(grade.M) &&
        isValidGradeValue(grade.G) &&
        isValidGradeValue(grade.GG) &&
        isValidGradeValue(grade.XG);
    }

    function isValidLoteFabricacao(data) {
      return data is map &&
        data.keys().hasOnly([
          'codigo', 'dataCriacao', 'status', 'pedidosIds', 'gradeConsolidada',
          'totalGeralPecas', 'observacoesFabricante', 'criadoPor', 'criadoPorUid',
          'dataFinalizacao'
        ]) &&
        data.keys().size() == 10 &&
        data.codigo is string && data.codigo.size() >= 1 && data.codigo.size() <= 40 &&
        data.dataCriacao is timestamp &&
        (
          (data.status == 'EM_FABRICACAO' && data.dataFinalizacao == null) ||
          (data.status == 'FINALIZADO_FABRICA' && data.dataFinalizacao is timestamp)
        ) &&
        isValidPedidosIdsList(data.pedidosIds) &&
        isValidGradeConsolidada(data.gradeConsolidada) &&
        data.totalGeralPecas is number &&
        data.totalGeralPecas > 0 &&
        data.totalGeralPecas <= 100000 &&
        data.totalGeralPecas == (
          data.gradeConsolidada.PP +
          data.gradeConsolidada.P +
          data.gradeConsolidada.M +
          data.gradeConsolidada.G +
          data.gradeConsolidada.GG +
          data.gradeConsolidada.XG
        ) &&
        data.observacoesFabricante is string &&
        data.observacoesFabricante.size() >= 0 &&
        data.observacoesFabricante.size() <= 1000 &&
        data.criadoPor is string && data.criadoPor.size() >= 1 && data.criadoPor.size() <= 100 &&
        data.criadoPorUid is string && data.criadoPorUid.size() >= 1 && data.criadoPorUid.size() <= 128;
    }

    // ===============================================================
    // Collection Rules
    // ===============================================================

    // Default deny at root
    match /{document=**} {
      allow read, write: if false;
    }

    // Users collection (contains PII: email)
    // Authenticated users read only their own profile; active admins manage all profiles.
    match /users/{userId} {
      allow read: if isOwner(userId) || isAdmin();
      allow create: if isAdmin() && isValidUser(request.resource.data, userId);
      allow update: if isAdmin() &&
        isValidUser(request.resource.data, userId) &&
        uidNotModified() &&
        (userId != request.auth.uid || (request.resource.data.ativo == true && request.resource.data.role == 'admin'));
      allow delete: if isAdmin() && userId != request.auth.uid;
    }

    // Global configuration: config/unidades
    // Active authenticated users read units; only active admins update them.
    match /config/unidades {
      allow read: if isActiveUser();
      allow create, update: if isAdmin() && isValidConfigUnidades(request.resource.data);
      allow delete: if false;
    }

    // Orders collection: pedidos/{pedidoId}
    match /pedidos/{pedidoId} {
      allow read: if isAdmin() ||
        hasRole('financeiro') ||
        hasRole('patrimonio') ||
        (hasRole('supervisao') && 'unidade' in getUserData() && resource.data.unidade == getUserData().unidade);

      allow create: if isValidPedido(request.resource.data) &&
        request.resource.data.criadoPorUid == request.auth.uid &&
        (
          isAdmin() ||
          (
            hasRole('supervisao') &&
            'unidade' in getUserData() &&
            request.resource.data.unidade == getUserData().unidade &&
            isValidPedidoInitialState(request.resource.data)
          )
        );

      // Admin: any business field (4 fields immutable). Others: restricted transitions.
      allow update: if isActiveUser() &&
        isValidPedido(request.resource.data) &&
        isValidPedidoLogsAppend(resource.data.historicoLogs, request.resource.data.historicoLogs) &&
        (
          (
            isAdminCheap() &&
            areImmutableFieldsUnchanged(['codigo', 'criadoPor', 'criadoPorUid', 'criadoEm'])
          ) ||
          (
            areImmutableFieldsUnchanged([
              'codigo',
              'unidade',
              'empresaNome',
              'empresaCnpj',
              'turma',
              'totalPecas',
              'criadoPor',
              'criadoPorUid',
              'criadoEm'
            ]) &&
            canUpdatePedido()
          )
        );

      allow delete: if isAdmin();
    }

    // Manufacturing batches: lotes_fabricacao/{loteId}
    match /lotes_fabricacao/{loteId} {
      allow read: if hasRole('patrimonio') || isAdmin();

      allow create: if isValidLoteFabricacao(request.resource.data) &&
        request.resource.data.criadoPorUid == request.auth.uid &&
        (
          isAdmin() ||
          (
            hasRole('patrimonio') &&
            request.resource.data.status == 'EM_FABRICACAO' &&
            request.resource.data.dataFinalizacao == null
          )
        );

      allow update: if (
          hasRole('patrimonio') &&
          isValidLoteFabricacao(request.resource.data) &&
          areImmutableFieldsUnchanged([
            'codigo',
            'dataCriacao',
            'pedidosIds',
            'gradeConsolidada',
            'totalGeralPecas',
            'observacoesFabricante',
            'criadoPor',
            'criadoPorUid'
          ]) &&
          request.resource.data.diff(resource.data).affectedKeys().hasOnly(['status', 'dataFinalizacao']) &&
          resource.data.status == 'EM_FABRICACAO' &&
          request.resource.data.status == 'FINALIZADO_FABRICA' &&
          request.resource.data.dataFinalizacao is timestamp
        ) || (
          isAdmin() &&
          isValidLoteFabricacao(request.resource.data) &&
          areImmutableFieldsUnchanged(['codigo', 'dataCriacao', 'criadoPor', 'criadoPorUid'])
        );

      allow delete: if isAdmin();
    }
  }
}
```

---

## Criando o Primeiro Administrador e Dados Iniciais (Seed)

1. No Firebase Console, vá em **Authentication → Users** e clique em **Adicionar usuário**.
2. Informe o e-mail e a senha do primeiro Administrador e copie o **UID do usuário** gerado.
3. Vá em **Firestore Database → Dados**, clique em **Iniciar coleção**, digite `users` e avance.
4. No **ID do documento**, cole exatamente o **UID** copiado no passo 2 e crie os seguintes campos:
   - `uid` (`string`): mesmo UID
   - `nome` (`string`): `Administrador Geral`
   - `email` (`string`): mesmo e-mail do Auth
   - `role` (`string`): `admin`
   - `unidade` (`string`): `Todas`
   - `ativo` (`boolean`): `true`
5. Faça login na aplicação com esse e-mail e senha.
6. No módulo **Gestão & Dashboard → Auditoria & Setup/Seed**, clique em **Popular Dados de Teste (Seed)** se quiser carregar pedidos e lotes iniciais de demonstração no Firestore, ou comece a cadastrar sua equipe em **Equipe & Unidades**.

---

## Publicação no GitHub Pages

1. Crie um repositório no GitHub e envie todos os arquivos desta pasta na branch `main`.
2. No GitHub, acesse **Settings → Pages**.
3. Em **Build and deployment**, selecione **Deploy from a branch**, escolha a branch `main` e a pasta `/ (root)`, e clique em **Save**.
4. **Importante no Firebase:** Após o GitHub Pages gerar sua URL (ex: `https://seu-usuario.github.io`), adicione o domínio `seu-usuario.github.io` em **Firebase Console → Authentication → Settings → Domínios autorizados**.
