// Conexão com o Firebase do MCI. Estas chaves são públicas por natureza:
// quem protege os dados são as regras de segurança (firebase/firestore.rules).
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

const app = initializeApp({
  apiKey: 'AIzaSyBbVnWgDuhZRrn0FTCLd0cROlYwV6Lb9r4',
  authDomain: 'mci-brasil.firebaseapp.com',
  projectId: 'mci-brasil',
  storageBucket: 'mci-brasil.firebasestorage.app',
  messagingSenderId: '621491584803',
  appId: '1:621491584803:web:7a19eadb1066a10f5a1696',
});

export const auth = getAuth(app);
auth.languageCode = 'pt';
export const db = getFirestore(app);

export const EMAIL_ADMIN = 'contato.mci2026@gmail.com';

// Mensagens de erro do Firebase em português simples.
export function traduzErro(e) {
  const c = (e && e.code) || '';
  const m = {
    'auth/email-already-in-use': 'Este e-mail já tem cadastro. Use a aba "Entrar".',
    'auth/invalid-email': 'E-mail inválido.',
    'auth/weak-password': 'A senha precisa ter pelo menos 6 caracteres.',
    'auth/invalid-credential': 'E-mail ou senha incorretos.',
    'auth/wrong-password': 'E-mail ou senha incorretos.',
    'auth/user-not-found': 'E-mail ou senha incorretos.',
    'auth/too-many-requests': 'Muitas tentativas. Espere alguns minutos e tente de novo.',
    'auth/network-request-failed': 'Sem conexão com a internet.',
    'permission-denied': 'Sem permissão para esta ação.',
  };
  return m[c] || 'Algo deu errado. Tente de novo em instantes.';
}
