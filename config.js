// Preencha com os dados do seu Supabase (Project Settings > API). Este arquivo é público; a anon key é protegida por RLS.
window.__VM_SUPABASE_URL__ = "COLE_AQUI_PROJECT_URL";
window.__VM_SUPABASE_ANON__ = "COLE_AQUI_ANON_KEY";
window.__VM_REQUIRE_LOGIN__ = true;
// IA de texto/imagem: Supabase Edge Functions (publicadas com setup-supabase.sh). Deixe como está.
window.__VM_API_BASE__ = window.__VM_SUPABASE_URL__.replace(/\/$/, "") + "/functions/v1";
