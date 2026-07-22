#!/usr/bin/env node
/**
 * Injeta FIREBASE_SERVICE_ACCOUNT_JSON no .env.local a partir do arquivo de
 * service account baixado do Firebase Console (Configurações do projeto →
 * Contas de serviço → Gerar nova chave privada).
 *
 * A chave privada tem quebras de linha que quebram um .env se coladas à mão;
 * este script serializa em uma única linha (aspas simples) que o Next lê e o
 * Admin SDK faz JSON.parse corretamente.
 *
 * Uso:
 *   node scripts/set-service-account.mjs ~/Downloads/<projeto>-firebase-adminsdk-xxxx.json
 *
 * Mantenha o JSON original FORA do repositório (ex.: ~/Downloads).
 */

import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const src = process.argv[2]
if (!src) {
  console.error("Uso: node scripts/set-service-account.mjs <caminho/para/serviceAccount.json>")
  process.exit(1)
}

let sa
try {
  sa = JSON.parse(fs.readFileSync(src, "utf-8"))
} catch (e) {
  console.error(`Não consegui ler/parsear o JSON: ${src}\n${e.message}`)
  process.exit(1)
}

for (const field of ["type", "project_id", "private_key", "client_email"]) {
  if (!sa[field]) { console.error(`JSON inválido: falta o campo "${field}". É mesmo uma service account?`); process.exit(1) }
}
if (sa.type !== "service_account") {
  console.error(`type="${sa.type}" — esperado "service_account".`); process.exit(1)
}

const oneLine = JSON.stringify(sa) // única linha; \n dentro da chave já escapados
const envPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".env.local")
let env = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf-8") : ""

// remove qualquer linha existente da variável (incluindo comentário placeholder)
env = env
  .split("\n")
  .filter((l) => !/^\s*#?\s*FIREBASE_SERVICE_ACCOUNT_JSON=/.test(l))
  .join("\n")
  .replace(/\n{3,}/g, "\n\n")
  .replace(/\s+$/, "")

env += `\n\n# Firebase Admin (server-side) — service account (NÃO commitar)\nFIREBASE_SERVICE_ACCOUNT_JSON='${oneLine}'\n`

fs.writeFileSync(envPath, env, "utf-8")
console.log(`✓ FIREBASE_SERVICE_ACCOUNT_JSON gravado em ${envPath}`)
console.log(`  projeto: ${sa.project_id} | conta: ${sa.client_email}`)
console.log(`  reinicie o 'npm run dev' do dataspaceapp para carregar.`)
