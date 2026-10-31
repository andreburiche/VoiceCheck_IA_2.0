/** Sem React: pode ser importado pelo layout (componente de servidor). */
export const CHAVE_TEMA = "vc-tema";

/** Script do <head>: aplica o tema salvo antes da primeira pintura (sem piscar). */
export const SCRIPT_TEMA = `(function(){try{var p=localStorage.getItem("${CHAVE_TEMA}");var c=p==="claro"||(p==="sistema"&&window.matchMedia&&window.matchMedia("(prefers-color-scheme: light)").matches);var r=document.documentElement;r.dataset.theme=c?"light":"dark";r.style.colorScheme=c?"light":"dark";}catch(e){}})();`;
