// Monta os pacotes de release para Windows x64 (o mesmo esquema do Pokémon Simulator Remake):
//
//   PokemonSimulatorEvolution-v<versão>-full-win-x64.zip     pasta do jogo completa: .exe, runtime\node.exe, app\, recursos\
//   PokemonSimulatorEvolution-v<versão>-update-win-x64.zip   só o .exe e app\ (o que a atualização automática baixa)
//   (e o .sha256 de cada um)
//
//   npm run build:release -- --recursos=pasta-com-recursos   (a pasta que contém imagens e músicas, ex.: ./recursos)
//   --node=caminho\node.exe   usa este Node como runtime (padrão: baixa o node.exe da mesma versão do Node que está rodando)
//   --out=dist/release        pasta de saída
//   --skip-web                reaproveita apps/web/dist
//   --skip-launcher           não compila o .exe (só para conferir o conteúdo; o pacote sai sem o executável)
//
// Precisa de Node 22+, Go 1.24+ (compila o launcher para Windows de qualquer sistema) e, para baixar o runtime, de `unzip`/`tar`.
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { listFiles, sha256File, writeZip } from './zip.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const flag = (name) => args.includes(`--${name}`)
const option = (name) => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3)

const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z]+(\.[0-9A-Za-z]+)*)?$/.test(version)) throw new Error(`Versão inválida em package.json: ${version}`)
const tag = `v${version}`
const prefix = 'PokemonSimulatorEvolution'
const out = resolve(root, option('out') ?? 'dist/release')
const stage = join(out, 'stage', prefix)
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, { stdio: 'inherit', cwd: root, shell: process.platform === 'win32' && command === npm, ...options })
  if (result.error?.code === 'ENOENT') throw new Error(`"${command}" não foi encontrado${command === 'go' ? ' — instale o Go 1.24+ em https://go.dev/dl' : ''}.`)
  if (result.status !== 0) throw new Error(`Falhou: ${command} ${commandArgs.join(' ')}`)
}

rmSync(join(out, 'stage'), { recursive: true, force: true })
mkdirSync(join(stage, 'app'), { recursive: true })
console.log(`Montando ${prefix} ${tag} para Windows x64…`)

// 1. interface
if (!flag('skip-web')) run(npm, ['run', 'build'])
if (!existsSync(join(root, 'apps/web/dist/index.html'))) throw new Error('Interface não compilada (apps/web/dist). Rode "npm run build".')
cpSync(join(root, 'apps/web/dist'), join(stage, 'app/web'), { recursive: true })

// 2. servidor: um arquivo só, sem node_modules (usa o node:sqlite do próprio Node)
await build({
  entryPoints: [join(root, 'apps/server/src/main.ts')], outfile: join(stage, 'app/server.mjs'),
  bundle: true, platform: 'node', format: 'esm', target: 'node22', legalComments: 'none', external: ['node:*'], logLevel: 'warning',
  define: { 'process.env.POKESIM_VERSION': JSON.stringify(version) },
})

// 3. runtime do Node (o jogador não precisa instalar nada)
let nodeVersion = process.version
mkdirSync(join(stage, 'runtime'), { recursive: true })
const nodeOption = option('node')
if (nodeOption) {
  cpSync(resolve(nodeOption), join(stage, 'runtime/node.exe'))
  const license = join(dirname(resolve(nodeOption)), 'LICENSE')
  if (existsSync(license)) cpSync(license, join(stage, 'runtime/LICENSE'))
  nodeVersion = spawnSync(resolve(nodeOption), ['--version'], { encoding: 'utf8' }).stdout?.trim() || 'desconhecida'
} else {
  const folder = `node-${process.version}-win-x64`
  const base = `https://nodejs.org/dist/${process.version}`
  const download = async (url) => {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
    return Buffer.from(await response.arrayBuffer())
  }
  console.log(`Baixando o Node.js ${process.version} para Windows…`)
  const archive = await download(`${base}/${folder}.zip`)
  const sums = (await download(`${base}/SHASUMS256.txt`)).toString('utf8')
  const expected = sums.split('\n').find((line) => line.trim().endsWith(`${folder}.zip`))?.trim().split(/\s+/)[0]
  const actual = createHash('sha256').update(archive).digest('hex')
  if (!expected || expected !== actual) throw new Error(`Checksum do Node.js não confere (${expected} ≠ ${actual}).`)
  const work = mkdtempSync(join(tmpdir(), 'pokesim-node-'))
  writeFileSync(join(work, 'node.zip'), archive)
  const unzip = spawnSync('unzip', ['-q', '-o', join(work, 'node.zip'), `${folder}/node.exe`, `${folder}/LICENSE`, '-d', work])
  if (unzip.status !== 0) run('tar', ['-xf', join(work, 'node.zip'), '-C', work, `${folder}/node.exe`, `${folder}/LICENSE`])
  cpSync(join(work, folder, 'node.exe'), join(stage, 'runtime/node.exe'))
  cpSync(join(work, folder, 'LICENSE'), join(stage, 'runtime/LICENSE'))
  rmSync(work, { recursive: true, force: true })
}

// 4. launcher (.exe da bandeja)
if (!flag('skip-launcher')) {
  run('go', ['build', '-trimpath', '-ldflags', `-s -w -H=windowsgui -X main.version=${version}`, '-o', join(stage, `${prefix}.exe`), '.'], {
    cwd: join(root, 'launcher'), env: { ...process.env, GOOS: 'windows', GOARCH: 'amd64', CGO_ENABLED: '0' },
  })
} else {
  console.warn('Aviso: o launcher (.exe) não foi compilado (--skip-launcher).')
}

// 5. documentação
cpSync(join(root, 'RELEASE_NOTES.md'), join(stage, 'LEIAME.md'))

// 6. pacotes
mkdirSync(out, { recursive: true })
const recursos = option('recursos') ? resolve(root, option('recursos')) : null
if (recursos && !existsSync(recursos)) throw new Error(`Pasta de recursos não encontrada: ${recursos}`)

const manifest = (kind, files) => Buffer.from(`${JSON.stringify({ version, platform: 'win-x64', kind, nodeVersion, files }, null, 2)}\n`)
const stageFiles = listFiles(stage)
const updateFiles = stageFiles.filter((file) => !file.startsWith('runtime/'))
const recursosFiles = recursos ? listFiles(recursos).map((file) => `recursos/${file}`) : []

const packages = [
  {
    kind: 'update',
    entries: (data) => [...updateFiles.map((file) => ({ name: file, file: join(stage, file) })), { name: 'distribution.json', data }],
    names: updateFiles,
  },
  {
    kind: 'full',
    entries: (data) => [
      ...stageFiles.map((file) => ({ name: `${prefix}/${file}`, file: join(stage, file) })),
      ...recursosFiles.map((file) => ({ name: `${prefix}/${file}`, file: join(recursos, file.slice('recursos/'.length)) })),
      { name: `${prefix}/distribution.json`, data },
    ],
    names: [...stageFiles, ...recursosFiles],
  },
]
if (!recursos) {
  console.warn('Aviso: sem --recursos, o pacote "full" sai sem imagens e músicas.')
}

for (const { kind, entries, names } of packages) {
  const data = manifest(kind, [...names, 'distribution.json'])
  const name = `${prefix}-${tag}-${kind}-win-x64.zip`
  const archive = join(out, name)
  console.log(`Compactando ${name}…`)
  writeZip(entries(data), archive)
  const hash = await sha256File(archive)
  writeFileSync(`${archive}.sha256`, `${hash}  ${name}\n`, 'ascii')
  console.log(`  ${(readFileSync(archive).length / 1024 / 1024).toFixed(1)} MB  sha256 ${hash.slice(0, 12)}…`)
}
console.log(`\nPacotes em ${out}`)
