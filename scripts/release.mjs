// Publica uma versão nova: sobe o número, gera o APK e o instalador de PC, faz commit + tag e cria o release no GitHub.
// Uso: npm run release -- [patch|minor|major|1.2.3] ["o que mudou"]
// As notas vêm de src/changelog.json. Escreva a entrada da versão nova lá antes de rodar,
// ou passe uma frase no comando que o script cria a entrada sozinho.
import { execSync } from 'node:child_process';
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const run = (cmd, cwd = root) => execSync(cmd, { cwd, stdio: 'inherit' });

const [bumpArg = 'patch', ...notesParts] = process.argv.slice(2);
const argNotes = notesParts.join(' ').trim();

const pkgPath = join(root, 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const [ma, mi, pa] = pkg.version.split('.').map(Number);
const next = /^\d+\.\d+\.\d+$/.test(bumpArg) ? bumpArg
  : bumpArg === 'major' ? `${ma + 1}.0.0`
  : bumpArg === 'minor' ? `${ma}.${mi + 1}.0`
  : `${ma}.${mi}.${pa + 1}`;

const clPath = join(root, 'src/changelog.json');
const changelog = JSON.parse(readFileSync(clPath, 'utf8'));
let entry = changelog.find(e => e.version === next);
if (!entry) {
  if (!argNotes) {
    console.error(`\nNão há entrada para ${next} em src/changelog.json. Escreva a entrada ou passe as notas no comando.\n`);
    process.exit(1);
  }
  const d = new Date();
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  entry = { version: next, date, title: `Versão ${next}`, items: [argNotes] };
  changelog.unshift(entry);
  writeFileSync(clPath, JSON.stringify(changelog, null, 2) + '\n');
}

console.log(`\ndQuests ${pkg.version} → ${next}: ${entry.title}\n`);

pkg.version = next;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

const gradlePath = join(root, 'android/app/build.gradle');
let gradle = readFileSync(gradlePath, 'utf8');
const code = Number(gradle.match(/versionCode (\d+)/)[1]) + 1;
gradle = gradle.replace(/versionCode \d+/, `versionCode ${code}`).replace(/versionName "[^"]*"/, `versionName "${next}"`);
writeFileSync(gradlePath, gradle);

run('npm run apk');
run('npx electron-builder --win nsis --publish never');
const exe = join(root, `release/dQuests-Setup-${next}.exe`);

const apk = join(tmpdir(), `dQuests-${next}.apk`);
copyFileSync(join(root, 'android/app/build/outputs/apk/debug/app-debug.apk'), apk);

const notesFile = join(tmpdir(), `dquests-notes-${next}.md`);
writeFileSync(notesFile, `## ${entry.title}\n\n${entry.items.map(i => `- ${i}`).join('\n')}\n`);

run('git add -A', join(root, '..'));
run(`git commit -m "Release v${next}"`, join(root, '..'));
run(`git tag -a v${next} -m "dQuests ${next}"`);
run(`git push origin HEAD v${next}`);
run(`gh release create v${next} "${apk}" "${exe}" --title "dQuests ${next}" --notes-file "${notesFile}"`);

console.log(`\nPublicado: v${next}. O app vai avisar na próxima checagem.\n`);
