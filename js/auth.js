import {
  auth,
  db,
  doc,
  onSnapshot,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  isFirebaseConfigured
} from './firebase-config.js';

const DEMO_SESSION_KEY = 'fardamentos_demo_user_key';

export const DEMO_USERS = {
  admin: {
    uid: 'demo-admin-01',
    nome: 'Carlos Mendes',
    email: 'admin@instituicao.org.br',
    role: 'admin',
    unidade: 'Todas',
    ativo: true,
    demoKey: 'admin'
  },
  supervisao_fortaleza: {
    uid: 'demo-sup-for-01',
    nome: 'Ana Paula Silva',
    email: 'fortaleza@instituicao.org.br',
    role: 'supervisao',
    unidade: 'Fortaleza',
    ativo: true,
    demoKey: 'supervisao_fortaleza'
  },
  supervisao_pacajus: {
    uid: 'demo-sup-pac-01',
    nome: 'Marcos Oliveira',
    email: 'pacajus@instituicao.org.br',
    role: 'supervisao',
    unidade: 'Pacajus',
    ativo: true,
    demoKey: 'supervisao_pacajus'
  },
  financeiro: {
    uid: 'demo-fin-01',
    nome: 'Juliana Costa',
    email: 'financeiro@instituicao.org.br',
    role: 'financeiro',
    unidade: 'Todas',
    ativo: true,
    demoKey: 'financeiro'
  },
  patrimonio: {
    uid: 'demo-pat-01',
    nome: 'Roberto Ferreira',
    email: 'patrimonio@instituicao.org.br',
    role: 'patrimonio',
    unidade: 'Todas',
    ativo: true,
    demoKey: 'patrimonio'
  }
};

let currentUser = null;
let demoMode = false;
let userDocUnsub = null;
let authCallback = null;

function stopUserDocListener() {
  if (typeof userDocUnsub === 'function') {
    userDocUnsub();
    userDocUnsub = null;
  }
}

export function getCurrentUser() {
  return currentUser;
}

export function isDemoMode() {
  return demoMode;
}

export function initAuth(onUserChange) {
  authCallback = onUserChange;

  const savedDemoKey = localStorage.getItem(DEMO_SESSION_KEY);
  if (savedDemoKey && DEMO_USERS[savedDemoKey]) {
    demoMode = true;
    currentUser = { ...DEMO_USERS[savedDemoKey] };
    authCallback(currentUser, null);
    return;
  }

  if (!isFirebaseConfigured() || !auth) {
    demoMode = false;
    currentUser = null;
    authCallback(null, null);
    return;
  }

  onAuthStateChanged(auth, (firebaseUser) => {
    stopUserDocListener();

    // Se o usuário entrou explicitamente no Modo Demonstração, ignora estado anônimo/vazio do Auth
    if (localStorage.getItem(DEMO_SESSION_KEY)) {
      return;
    }

    if (!firebaseUser) {
      demoMode = false;
      currentUser = null;
      authCallback(null, null);
      return;
    }

    const userRef = doc(db, 'users', firebaseUser.uid);
    userDocUnsub = onSnapshot(
      userRef,
      async (snapshot) => {
        if (!snapshot.exists()) {
          await signOut(auth).catch(() => {});
          currentUser = null;
          authCallback(
            null,
            'Seu login existe no Firebase Auth, mas seu perfil não foi cadastrado na coleção "users". Solicite ao Administrador.'
          );
          return;
        }

        const profile = snapshot.data();
        if (profile.ativo === false) {
          await signOut(auth).catch(() => {});
          currentUser = null;
          authCallback(null, 'Sua conta está desativada. Entre em contato com o Administrador.');
          return;
        }

        demoMode = false;
        currentUser = {
          uid: firebaseUser.uid,
          email: profile.email || firebaseUser.email || '',
          nome: profile.nome || 'Usuário',
          role: profile.role || 'supervisao',
          unidade: profile.unidade || 'Fortaleza',
          ativo: profile.ativo !== false
        };
        authCallback(currentUser, null);
      },
      (error) => {
        console.error('Erro ao ler perfil do usuário:', error);
        currentUser = null;
        authCallback(
          null,
          'Não foi possível validar suas permissões no Firestore. Verifique as regras de segurança e sua conexão.'
        );
      }
    );
  });
}

export async function loginWithEmail(email, password) {
  if (!isFirebaseConfigured() || !auth) {
    throw new Error(
      'Firebase ainda não configurado em js/firebase-config.js. Utilize o Modo Demonstração abaixo ou adicione suas credenciais.'
    );
  }

  localStorage.removeItem(DEMO_SESSION_KEY);
  demoMode = false;

  try {
    await signInWithEmailAndPassword(auth, email.trim(), password);
  } catch (error) {
    const code = error?.code || '';
    if (
      code === 'auth/invalid-credential' ||
      code === 'auth/wrong-password' ||
      code === 'auth/user-not-found'
    ) {
      throw new Error('E-mail ou senha incorretos.');
    }
    if (code === 'auth/too-many-requests') {
      throw new Error('Muitas tentativas seguidas. Aguarde alguns minutos e tente novamente.');
    }
    if (code === 'auth/invalid-email') {
      throw new Error('Formato de e-mail inválido.');
    }
    throw new Error(error?.message || 'Erro ao autenticar no Firebase.');
  }
}

export async function resetPassword(email) {
  if (!isFirebaseConfigured() || !auth) {
    throw new Error('Recuperação de senha disponível apenas com Firebase configurado.');
  }
  const cleanEmail = String(email || '').trim();
  if (!cleanEmail) {
    throw new Error('Informe seu e-mail no campo acima para enviar o link de recuperação.');
  }
  await sendPasswordResetEmail(auth, cleanEmail);
}

export function enterDemoMode(demoKey = 'admin') {
  const userTemplate = DEMO_USERS[demoKey] || DEMO_USERS.admin;
  stopUserDocListener();
  localStorage.setItem(DEMO_SESSION_KEY, userTemplate.demoKey);
  demoMode = true;
  currentUser = { ...userTemplate };
  if (typeof authCallback === 'function') {
    authCallback(currentUser, null);
  }
  return currentUser;
}

export function switchDemoProfile(demoKey) {
  return enterDemoMode(demoKey);
}

export async function logout() {
  stopUserDocListener();
  localStorage.removeItem(DEMO_SESSION_KEY);
  const wasDemo = demoMode;
  demoMode = false;
  currentUser = null;

  if (!wasDemo && isFirebaseConfigured() && auth && auth.currentUser) {
    await signOut(auth);
  } else if (typeof authCallback === 'function') {
    authCallback(null, null);
  }
}
