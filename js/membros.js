import { auth, db, EMAIL_ADMIN, ehAdmin, traduzErro } from './firebase.js';
import {
  onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  sendEmailVerification, sendPasswordResetEmail, signOut,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { doc, getDoc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

const $ = (id) => document.getElementById(id);
const VISOES = ['v-carregando', 'v-fora', 'v-sem-pedido', 'v-pendente', 'v-recusado', 'v-membro', 'v-admin'];

function mostrar(id) {
  VISOES.forEach((v) => $(v).classList.toggle('oculto', v !== id));
}

function mensagem(el, texto, tipo = 'erro') {
  el.textContent = texto;
  el.className = 'msg ' + tipo;
}

const soDigitos = (s) => (s || '').replace(/\D/g, '');

function cpfValido(cpf) {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  for (const n of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(cpf[i]) * (n + 1 - i);
    const dig = ((soma * 10) % 11) % 10;
    if (dig !== Number(cpf[n])) return false;
  }
  return true;
}

function idade(dataISO) {
  const n = new Date(dataISO + 'T00:00:00');
  const h = new Date();
  let a = h.getFullYear() - n.getFullYear();
  if (h.getMonth() < n.getMonth() || (h.getMonth() === n.getMonth() && h.getDate() < n.getDate())) a--;
  return a;
}

// Máscaras simples de CPF e telefone.
$('s-cpf').addEventListener('input', (e) => {
  const d = soDigitos(e.target.value).slice(0, 11);
  e.target.value = d.slice(0, 3)
    + (d.length > 3 ? '.' + d.slice(3, 6) : '')
    + (d.length > 6 ? '.' + d.slice(6, 9) : '')
    + (d.length > 9 ? '-' + d.slice(9) : '');
});
$('s-whats').addEventListener('input', (e) => {
  const d = soDigitos(e.target.value).slice(0, 11);
  if (d.length <= 2) { e.target.value = d; return; }
  const resto = d.slice(2);
  e.target.value = `(${d.slice(0, 2)}) ` + (d.length > 6 ? resto.slice(0, -4) + '-' + resto.slice(-4) : resto);
});

// Abas Entrar / Solicitar.
function abrirAba(qual) {
  const entrar = qual === 'entrar';
  $('aba-entrar').classList.toggle('ativa', entrar);
  $('aba-solicitar').classList.toggle('ativa', !entrar);
  $('f-entrar').classList.toggle('oculto', !entrar);
  $('f-solicitar').classList.toggle('oculto', entrar);
}
$('aba-entrar').onclick = () => abrirAba('entrar');
$('aba-solicitar').onclick = () => abrirAba('solicitar');
if (location.hash === '#solicitar') abrirAba('solicitar');

// Entrar.
$('f-entrar').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('e-msg');
  try {
    await signInWithEmailAndPassword(auth, $('e-email').value.trim(), $('e-senha').value);
  } catch (err) {
    mensagem(msg, traduzErro(err));
  }
});

$('esqueci').onclick = async () => {
  const msg = $('e-msg');
  const email = $('e-email').value.trim();
  if (!email) return mensagem(msg, 'Digite seu e-mail no campo acima e clique de novo em "Esqueci minha senha".');
  try {
    await sendPasswordResetEmail(auth, email);
    mensagem(msg, 'Se este e-mail tiver cadastro, você vai receber um link para criar uma nova senha.', 'ok');
  } catch (err) {
    mensagem(msg, traduzErro(err));
  }
};

// Solicitar adesão.
let enviando = false;

function lerFormulario() {
  const d = {
    nome: $('s-nome').value.trim().replace(/\s+/g, ' '),
    cpf: soDigitos($('s-cpf').value),
    mae: $('s-mae').value.trim().replace(/\s+/g, ' '),
    nascimento: $('s-nasc').value,
    cidade: $('s-cidade').value.trim(),
    uf: $('s-uf').value,
    whatsapp: soDigitos($('s-whats').value),
    motivo: $('s-motivo').value.trim(),
  };
  if (d.nome.split(' ').length < 2) return [null, 'Digite seu nome completo.'];
  if (!cpfValido(d.cpf)) return [null, 'CPF inválido. Confira os números.'];
  if (!d.nascimento) return [null, 'Informe sua data de nascimento.'];
  if (idade(d.nascimento) < 18) return [null, 'É preciso ter 18 anos ou mais para ser membro.'];
  if (d.mae.split(' ').length < 2) return [null, 'Digite o nome completo da sua mãe.'];
  if (d.cidade.length < 2 || !d.uf) return [null, 'Informe sua cidade e estado.'];
  if (d.whatsapp.length < 10) return [null, 'Informe seu WhatsApp com DDD.'];
  if (d.motivo.length < 10) return [null, 'Conte um pouco por que você quer fazer parte (pelo menos uma frase).'];
  if (!$('s-consent').checked) return [null, 'Para enviar, marque a caixa de autorização.'];
  return [d, null];
}

$('f-solicitar').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('s-msg');
  const botao = e.target.querySelector('button[type=submit]');
  const [dados, erro] = lerFormulario();
  if (erro) return mensagem(msg, erro);

  let user = auth.currentUser;
  if (!user) {
    const email = $('s-email').value.trim();
    const senha = $('s-senha').value;
    if (!email) return mensagem(msg, 'Informe seu e-mail.');
    if (senha.length < 6) return mensagem(msg, 'A senha precisa ter pelo menos 6 caracteres.');
    if (senha !== $('s-senha2').value) return mensagem(msg, 'As duas senhas não são iguais.');
    if (email.toLowerCase() === EMAIL_ADMIN) return mensagem(msg, 'Este e-mail é da administração do movimento.');
  }

  botao.disabled = true;
  enviando = true;
  try {
    if (!user) {
      const cred = await createUserWithEmailAndPassword(auth, $('s-email').value.trim(), $('s-senha').value);
      user = cred.user;
    }
    await setDoc(doc(db, 'solicitacoes', user.uid), {
      ...dados,
      email: user.email,
      consentimento: true,
      status: 'pendente',
      criadoEm: serverTimestamp(),
    });
    if (!user.emailVerified) sendEmailVerification(user).catch(() => {});
    e.target.reset();
  } catch (err) {
    mensagem(msg, traduzErro(err));
  } finally {
    botao.disabled = false;
    enviando = false;
    if (auth.currentUser) atualizar(auth.currentUser);
  }
});

$('reenviar').onclick = async () => {
  try {
    await sendEmailVerification(auth.currentUser);
    $('reenviar').textContent = 'Enviado!';
  } catch (err) {
    $('reenviar').textContent = traduzErro(err);
  }
};

$('sair').onclick = () => signOut(auth);

// Coloca o formulário no lugar certo (aba do visitante ou caixa de quem já tem conta).
function posicionarFormulario(logado) {
  const f = $('f-solicitar');
  $(logado ? 'solicitar-logado' : 'solicitar-aqui').appendChild(f);
  $('campos-conta').classList.toggle('oculto', logado);
  $('campos-conta').querySelectorAll('input').forEach((i) => (i.required = !logado));
  if (logado) f.classList.remove('oculto');
  else abrirAba($('aba-solicitar').classList.contains('ativa') ? 'solicitar' : 'entrar');
}

async function atualizar(user) {
  $('sair').classList.toggle('oculto', !user);
  if (!user) {
    posicionarFormulario(false);
    return mostrar('v-fora');
  }
  if (ehAdmin(user) || user.email === EMAIL_ADMIN) return mostrar('v-admin');

  mostrar('v-carregando');
  try {
    const snap = await getDoc(doc(db, 'solicitacoes', user.uid));
    if (!snap.exists()) {
      posicionarFormulario(true);
      return mostrar('v-sem-pedido');
    }
    const s = snap.data();
    if (s.status === 'aprovado') {
      $('boas-vindas').textContent = `Bem-vindo, ${s.nome.split(' ')[0]}`;
      mostrar('v-membro');
      try {
        const mural = await getDoc(doc(db, 'conteudo', 'mural'));
        if (mural.exists() && mural.data().texto) $('mural').textContent = mural.data().texto;
      } catch { /* mural vazio */ }
    } else if (s.status === 'recusado') {
      mostrar('v-recusado');
    } else {
      $('aviso-verificar').classList.toggle('oculto', user.emailVerified);
      mostrar('v-pendente');
    }
  } catch (err) {
    $('v-carregando').innerHTML = '';
    const p = document.createElement('p');
    p.textContent = traduzErro(err);
    $('v-carregando').appendChild(p);
  }
}

onAuthStateChanged(auth, (user) => {
  if (!enviando) atualizar(user);
});
