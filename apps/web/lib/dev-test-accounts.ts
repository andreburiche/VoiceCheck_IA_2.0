/**
 * Contas de teste espelhadas do seed da API (app.main._DEV_TEST_USERS).
 * Visíveis só na tela de login — senha compartilhada de desenvolvimento.
 */

export type DevTestAccount = {
  id: string;
  email: string;
  password: string;
  name: string;
  role: "admin" | "user";
  label: string;
  description: string;
};

export const DEV_TEST_ACCOUNTS: DevTestAccount[] = [
  {
    id: "admin",
    email: "admin@estudio.local",
    password: "senha12345",
    name: "Admin Teste",
    role: "admin",
    label: "Administrador",
    description: "Painel /admin · usuários, jobs e auditoria",
  },
  {
    id: "musician",
    email: "musico@estudio.local",
    password: "senha12345",
    name: "Músico Teste",
    role: "user",
    label: "Músico",
    description: "Projetos, estúdio, treino, análise e export",
  },
  {
    id: "andre",
    email: "andre@estudio.local",
    password: "senha12345",
    name: "André Silva",
    role: "user",
    label: "Músico (demo)",
    description: "Perfil de demonstração estilo dashboard",
  },
];

/**
 * Atalhos de teste só fora de produção.
 * Desative com NEXT_PUBLIC_SHOW_DEV_ACCOUNTS=false.
 * Em produção nunca exibe (nem senhas).
 */
export function showDevTestAccounts(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  return process.env.NEXT_PUBLIC_SHOW_DEV_ACCOUNTS !== "false";
}
