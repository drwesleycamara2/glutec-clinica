require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
// Copia os 710 arquivos OnDoctor necessarios para uma pasta temp e gera tar
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SRC = 'C:/Users/wesle/OneDrive/Documentos/New project/Backup On Doctor Março 2026 - WESLEY SERVICOS MEDICOS LTDA/arquivos';
const STAGE = 'C:/Users/wesle/OneDrive/Documentos/New project/deploy_tool/_ond_stage';
const TAR = 'C:/Users/wesle/OneDrive/Documentos/New project/deploy_tool/ond_filtered.tar';
const KEYS = fs.readFileSync('C:/Users/wesle/OneDrive/Documentos/New project/deploy_tool/ond_keys.txt', 'utf8').split('\n').filter(Boolean);

if (fs.existsSync(STAGE)) fs.rmSync(STAGE, { recursive: true, force: true });
fs.mkdirSync(STAGE, { recursive: true });

let copied = 0, missing = 0;
const missingList = [];
for (const k of KEYS) {
  const src = path.join(SRC, k);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(STAGE, k));
    copied++;
  } else {
    missing++;
    if (missingList.length < 5) missingList.push(k);
  }
}
console.log(`copied=${copied} missing=${missing}`);
if (missingList.length) console.log('sample missing:', missingList);

if (fs.existsSync(TAR)) fs.unlinkSync(TAR);
// BSD tar no Windows interpreta "C:" como host remoto. Usa cwd em STAGE e saida com --force-local
process.chdir(STAGE);
execSync(`tar --force-local -cf "${TAR}" .`, { stdio: 'inherit', shell: true });
console.log(`tar size: ${(fs.statSync(TAR).size/1024/1024).toFixed(1)} MB`);
