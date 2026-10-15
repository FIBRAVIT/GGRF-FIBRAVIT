// ============================================
// AUTENTICAÇÃO — LOGIN, LOGOUT, PERFIS
// Padrão Fibravit — Everest Consultoria
// ============================================

import { auth, db } from './firebase-config.js';
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  createUserWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  doc, setDoc, getDoc, collection, getDocs
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ============================================
// LOGIN — chamado pelo botão da tela
// ============================================
window.fazerLogin = async function () {
  const email    = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errDiv   = document.getElementById('lp-err');
  const loadBar  = document.getElementById('loadBar');

  errDiv.style.display = 'none';

  if (!email || !password) {
    errDiv.style.display = 'block';
    errDiv.textContent   = '❌ Preencha e-mail e senha';
    return;
  }

  loadBar.style.opacity = 1;

  try {
    await signInWithEmailAndPassword(auth, email, password);
    // onAuthStateChanged cuida do restante
  } catch (err) {
    loadBar.style.opacity = 0;
    errDiv.style.display  = 'block';
    errDiv.textContent    = traduzirErro(err.code);
  }
};

// ============================================
// ESTADO DE AUTENTICAÇÃO
// ============================================
onAuthStateChanged(auth, async (user) => {
  const loadBar = document.getElementById('loadBar');

  if (user) {
    loadBar.style.opacity = 1;

    // Busca perfil no Firestore
    const perfil = await buscarPerfil(user.uid);

    if (!perfil) {
      await signOut(auth);
      loadBar.style.opacity = 0;
      const errDiv = document.getElementById('lp-err');
      errDiv.style.display = 'block';
      errDiv.textContent   = '❌ Usuário sem perfil. Contate o administrador.';
      return;
    }

    // Salva globalmente
    window.currentUser = {
      uid:    user.uid,
      email:  user.email,
      nome:   perfil.nome,
      perfil: perfil.perfil
    };

    // Atualiza UI
    const primeiroNome = perfil.nome.split(' ')[0];
    document.getElementById('userName').textContent    = primeiroNome;
    document.getElementById('userAvatar').textContent  = primeiroNome.charAt(0).toUpperCase();
    document.getElementById('userRoleBadge').textContent = `[${perfil.perfil.toUpperCase()}]`;

    // Aplica permissões de menu
    aplicarPermissoes(perfil.perfil);

    // Mostra sistema, esconde login
    document.getElementById('loginPage').style.display = 'none';
    document.getElementById('app').style.display       = 'flex';
    loadBar.style.opacity = 0;

    // Inicializa app
    window.initApp();

  } else {
    // Não logado
    document.getElementById('loginPage').style.display = 'flex';
    document.getElementById('app').style.display       = 'none';
    if (loadBar) loadBar.style.opacity = 0;
    window.currentUser = null;
  }
});

// ============================================
// BUSCAR PERFIL
// ============================================
async function buscarPerfil(uid) {
  try {
    const snap = await getDoc(doc(db, 'usuarios', uid));
    return snap.exists() ? snap.data() : null;
  } catch {
    return null;
  }
}

// ============================================
// PERMISSÕES DE MENU
// ============================================
function aplicarPermissoes(perfil) {
  // Admin: tudo visível
  if (perfil === 'admin') {
    document.querySelectorAll('.admin-only').forEach(el => el.style.display = '');
    document.querySelectorAll('.admin-diretor-only').forEach(el => el.style.display = '');
    // Botão novo indicador
    const btnInd = document.getElementById('btnNovoIndicador');
    if (btnInd) btnInd.style.display = '';
  }
  // Diretor: vê config mas não usuários
  else if (perfil === 'diretor') {
    document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.admin-diretor-only').forEach(el => el.style.display = '');
  }
  // Gestor / Analista: sem admin
  else {
    document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.admin-diretor-only').forEach(el => el.style.display = 'none');
  }
}

// ============================================
// LOGOUT
// ============================================
document.getElementById('btnLogout').addEventListener('click', async () => {
  await signOut(auth);
  window.showToast('Sessão encerrada com sucesso', 'info');
});

// ============================================
// CRIAR USUÁRIO (Admin only)
// ============================================
document.getElementById('formUsuario').addEventListener('submit', async (e) => {
  e.preventDefault();

  if (!window.currentUser || window.currentUser.perfil !== 'admin') {
    window.showToast('Sem permissão para criar usuários', 'error');
    return;
  }

  const nome   = document.getElementById('usuarioNome').value.trim();
  const email  = document.getElementById('usuarioEmail').value.trim();
  const senha  = document.getElementById('usuarioSenha').value;
  const perfil = document.getElementById('usuarioPerfil').value;
  const errDiv = document.getElementById('modalUsuarioErr');

  errDiv.style.display = 'none';

  if (!nome || !email || !senha || !perfil) {
    errDiv.style.display = 'block';
    errDiv.textContent   = '❌ Preencha todos os campos';
    return;
  }

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, senha);

    await setDoc(doc(db, 'usuarios', cred.user.uid), {
      nome, email, perfil,
      ativo: true,
      criadoEm:  new Date().toISOString(),
      criadoPor: window.currentUser.uid
    });

    window.showToast(`✅ Usuário ${nome} criado com sucesso!`, 'success');
    fecharModal('modalUsuario');
    document.getElementById('formUsuario').reset();
    window.carregarUsuarios();

  } catch (err) {
    errDiv.style.display = 'block';
    errDiv.textContent   = '❌ ' + traduzirErro(err.code);
  }
});

// ============================================
// CARREGAR LISTA DE USUÁRIOS
// ============================================
window.carregarUsuarios = async function () {
  const tbody = document.getElementById('usuariosTableBody');
  tbody.innerHTML = '<tr><td colspan="5" class="text-center" style="padding:24px;color:#94a3b8">Carregando...</td></tr>';

  try {
    const snap = await getDocs(collection(db, 'usuarios'));

    if (snap.empty) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center" style="padding:24px;color:#94a3b8">Nenhum usuário cadastrado</td></tr>';
      return;
    }

    tbody.innerHTML = '';
    snap.forEach(docSnap => {
      const u  = docSnap.data();
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${u.nome}</strong></td>
        <td style="color:#64748b">${u.email}</td>
        <td><span class="badge badge-${u.perfil}">${u.perfil}</span></td>
        <td><span class="badge badge-ativo">${u.ativo ? 'Ativo' : 'Inativo'}</span></td>
        <td>
          <button class="btn-reimport" onclick="editarUsuario('${docSnap.id}')">
            ✏️ Editar
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center" style="color:#ef4444;padding:24px">Erro ao carregar usuários</td></tr>';
  }
};

// ============================================
// TRADUZIR ERROS FIREBASE
// ============================================
function traduzirErro(code) {
  const erros = {
    'auth/user-not-found':      'E-mail não encontrado',
    'auth/wrong-password':      'Senha incorreta',
    'auth/invalid-email':       'E-mail inválido',
    'auth/too-many-requests':   'Muitas tentativas. Tente mais tarde',
    'auth/email-already-in-use':'E-mail já cadastrado',
    'auth/weak-password':       'Senha muito fraca (mínimo 6 caracteres)',
    'auth/invalid-credential':  'E-mail ou senha incorretos'
  };
  return erros[code] || 'Erro ao autenticar. Tente novamente.';
}

// ============================================
// FUNÇÕES GLOBAIS DE MODAL
// ============================================
window.abrirModalUsuario    = () => { document.getElementById('modalUsuario').classList.add('open'); };
window.abrirModalIndicador  = () => { document.getElementById('modalIndicador').classList.add('open'); };
window.fecharModal = (id)   => { document.getElementById(id).classList.remove('open'); };

// Fecha modal clicando no overlay
document.querySelectorAll('.modal-bg').forEach(bg => {
  bg.addEventListener('click', (e) => {
    if (e.target === bg) bg.classList.remove('open');
  });
});