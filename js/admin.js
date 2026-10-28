import { auth, db, EMAIL_ADMIN, traduzErro } from './firebase.js';
import {
  onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  sendEmailVerification, sendPasswordResetEmail, signOut,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  collection, getDocs, doc, getDoc, setDoc, updateDoc, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

const $ = (id) => document.getElementById(id);
const VISOES = ['v-carregando', 'v-login', 'v-verificar', 'v-negado', 'v-painel'];
const mostrar = (id) => VISOES.forEach((v) => $(v).classList.toggle('oculto', v !== id));

function mensagem(el, texto, tipo = 'erro') {
  el.textContent = texto;
  el.className = 'msg ' + tipo;
}

const fmtCPF = (c) => (c || '').replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
const fmtData = (iso) => (iso ? iso.split('-').reverse().join('/') : '');
const fmtFone = (f) => (f || '').replace(/(\d{2})(\d+)(\d{4})$/, '($1) $2-$3');
const fmtQuando = (ts) => (ts && ts.toDate ? ts.toDate().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '');

// Monta elementos sempre com textContent, nunca com HTML vindo do formulário.
function el(tag, props = {}, filhos = []) {
  const e = document.createElement(tag);
  Object.assign(e, props);
  filhos.forEach((f) => e.appendChild(typeof f === 'string' ? document.createTextNode(f) : f));
  return e;
}

// --- Login ---
$('f-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await signInWithEmailAndPassword(auth, $('a-email').value.trim(), $('a-senha').value);
  } catch (err) {
    mensagem($('a-msg'), traduzErro(err));
  }
});

$('criar').onclick = async () => {
  const email = $('a-email').value.trim().toLowerCase();
  const senha = $('a-senha').value;
  if (email !== EMAIL_ADMIN) return mensagem($('a-msg'), 'Digite o e-mail oficial da administração e a senha que deseja criar.');
  if (senha.length < 8) return mensagem($('a-msg'), 'Para a administração, use uma senha com pelo menos 8 caracteres.');
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, senha);
    await sendEmailVerification(cred.user);
  } catch (err) {
    mensagem($('a-msg'), traduzErro(err));
  }
};

$('esqueci').onclick = async () => {
  const email = $('a-email').value.trim();
  if (!email) return mensagem($('a-msg'), 'Digite o e-mail acima primeiro.');
  try {
    await sendPasswordResetEmail(auth, email);
    mensagem($('a-msg'), 'Link para criar nova senha enviado.', 'ok');
  } catch (err) {
    mensagem($('a-msg'), traduzErro(err));
  }
};

$('reenviar').onclick = async () => {
  try {
    await sendEmailVerification(auth.currentUser);
    mensagem($('v-msg'), 'E-mail reenviado.', 'ok');
  } catch (err) {
    mensagem($('v-msg'), traduzErro(err));
  }
};

$('ja-confirmei').onclick = async () => {
  await auth.currentUser.reload();
  await auth.currentUser.getIdToken(true);
  atualizar(auth.currentUser);
};

$('sair').onclick = () => signOut(auth);

// --- Painel ---
async function aprovar(id, nome) {
  if (!confirm(`Aprovar ${nome} como membro do MCI?`)) return;
  await updateDoc(doc(db, 'solicitacoes', id), { status: 'aprovado', decididoEm: serverTimestamp() });
  carregarPedidos();
}

// Recusar ou remover: apaga todos os dados pessoais e guarda só o e-mail e a situação.
async function recusar(id, s, texto) {
  if (!confirm(`${texto} ${s.nome}? Os dados pessoais (CPF, nascimento, mãe, telefone etc.) serão apagados.`)) return;
  await setDoc(doc(db, 'solicitacoes', id), { status: 'recusado', email: s.email, decididoEm: serverTimestamp() });
  carregarPedidos();
}

function cartao(id, s, pendente) {
  const linhas = pendente
    ? [['CPF', fmtCPF(s.cpf)], ['Nascimento', fmtData(s.nascimento)], ['Mãe', s.mae], ['Cidade', `${s.cidade} - ${s.uf}`],
       ['WhatsApp', fmtFone(s.whatsapp)], ['E-mail', s.email], ['Motivo', s.motivo], ['Pedido em', fmtQuando(s.criadoEm)]]
    : [['Cidade', `${s.cidade} - ${s.uf}`], ['WhatsApp', fmtFone(s.whatsapp)], ['E-mail', s.email], ['Aprovado em', fmtQuando(s.decididoEm)]];
  const dl = el('dl');
  linhas.forEach(([k, v]) => { dl.appendChild(el('dt', { textContent: k })); dl.appendChild(el('dd', { textContent: v || '' })); });

  const botoes = el('div', { className: 'botoes' });
  if (pendente) {
    botoes.appendChild(el('button', { className: 'botao pequeno', textContent: 'Aprovar', onclick: () => aprovar(id, s.nome) }));
    botoes.appendChild(el('button', { className: 'botao pequeno perigo', textContent: 'Recusar', onclick: () => recusar(id, s, 'Recusar') }));
  } else {
    botoes.appendChild(el('button', { className: 'botao pequeno perigo', textContent: 'Remover do movimento', onclick: () => recusar(id, s, 'Remover') }));
  }
  return el('div', { className: 'pedido' }, [el('h3', { textContent: s.nome }), dl, botoes]);
}

async function carregarPedidos() {
  const snap = await getDocs(collection(db, 'solicitacoes'));
  const todos = snap.docs.map((d) => [d.id, d.data()]);
  const quando = (s) => (s.criadoEm && s.criadoEm.seconds) || 0;
  const pend = todos.filter(([, s]) => s.status === 'pendente').sort((a, b) => quando(a[1]) - quando(b[1]));
  const apr = todos.filter(([, s]) => s.status === 'aprovado').sort((a, b) => a[1].nome.localeCompare(b[1].nome));
  const rec = todos.filter(([, s]) => s.status === 'recusado');

  $('pendentes').replaceChildren(...(pend.length ? pend.map(([id, s]) => cartao(id, s, true)) : [el('p', { textContent: 'Nenhum pedido aguardando.' })]));
  $('aprovados').replaceChildren(...(apr.length ? apr.map(([id, s]) => cartao(id, s, false)) : [el('p', { textContent: 'Nenhum membro aprovado ainda.' })]));
  $('n-pendentes').textContent = `(${pend.length})`;
  $('n-aprovados').textContent = `(${apr.length})`;
  $('n-recusados').textContent = rec.length ? `${rec.length} pedido(s) recusado(s) ou removido(s), com dados pessoais apagados.` : '';
}

$('salvar-mural').onclick = async () => {
  try {
    await setDoc(doc(db, 'conteudo', 'mural'), { texto: $('mural').value, atualizadoEm: serverTimestamp() });
    mensagem($('m-msg'), 'Mural salvo.', 'ok');
  } catch (err) {
    mensagem($('m-msg'), traduzErro(err));
  }
};

async function atualizar(user) {
  $('sair').classList.toggle('oculto', !user);
  if (!user) return mostrar('v-login');
  if (user.email !== EMAIL_ADMIN) return mostrar('v-negado');
  if (!user.emailVerified) return mostrar('v-verificar');

  mostrar('v-carregando');
  try {
    await carregarPedidos();
    const mural = await getDoc(doc(db, 'conteudo', 'mural'));
    if (mural.exists()) $('mural').value = mural.data().texto || '';
    mostrar('v-painel');
  } catch (err) {
    $('v-carregando').replaceChildren(el('p', { textContent: traduzErro(err) }));
  }
}

onAuthStateChanged(auth, atualizar);
