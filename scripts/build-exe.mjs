// Gera o PokemonSimulatorEvolution.exe: compila a interface (Vite), copia o resultado para launcher/web
// (o Go embute essa pasta no executável) e compila o launcher para Windows.
//   npm run build:exe                 → PokemonSimulatorEvolution.exe na raiz do projeto
//   npm run build:exe -- --out=caminho/arquivo.exe
// Precisa do Go 1.24+ instalado. Não depende da pasta recursos/ (ela fica ao lado do .exe, fora dele).
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const outArg = process.argv.find((arg) => arg.startsWith('--out='))
const output = resolve(root, outArg ? outArg.slice(6) : 'PokemonSimulatorEvolution.exe')
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', cwd: root, shell: process.platform === 'win32' && command === npm, ...options })
  if (result.error?.code === 'ENOENT') {
    console.error(`"${command}" não foi encontrado${command === 'go' ? ' — instale o Go 1.24+ em https://go.dev/dl' : ''}.`)
    process.exit(1)
  }
  if (result.status !== 0) process.exit(result.status ?? 1)
}

console.log(`Versão ${version}`)
run(npm, ['run', 'build'])

const web = join(root, 'launcher', 'web')
for (const entry of existsSync(web) ? readdirSync(web) : []) if (entry !== '.gitkeep') rmSync(join(web, entry), { recursive: true, force: true })
mkdirSync(web, { recursive: true })
cpSync(join(root, 'apps', 'web', 'dist'), web, { recursive: true })

mkdirSync(dirname(output), { recursive: true })
run('go', ['build', '-trimpath', '-ldflags', `-s -w -H=windowsgui -X main.version=${version}`, '-o', output, '.'], {
  cwd: join(root, 'launcher'),
  env: { ...process.env, GOOS: 'windows', GOARCH: 'amd64', CGO_ENABLED: '0' },
})

const hash = createHash('sha256').update(readFileSync(output)).digest('hex')
writeFileSync(`${output}.sha256`, `${hash}  ${output.split(/[\\/]/).pop()}\n`)
console.log(`\n${output}\nsha256 ${hash}`)
