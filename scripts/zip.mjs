// Escritor de .zip mínimo (sem dependências): deflate por arquivo, nomes em UTF-8, sem zip64.
import { createHash } from 'node:crypto'
import { closeSync, createReadStream, openSync, readFileSync, readdirSync, statSync, writeSync } from 'node:fs'
import { join } from 'node:path'
import { crc32, deflateRawSync } from 'node:zlib'

const STORED = /\.(mp3|png|zip|webp|gif)$/i

function dosDateTime(date) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1)
  const day = ((Math.max(date.getFullYear(), 1980) - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  return { time, day }
}

/** Lista os arquivos de uma pasta (caminhos relativos com "/", ordenados). */
export function listFiles(root, base = '') {
  const found = []
  for (const entry of readdirSync(join(root, base), { withFileTypes: true })) {
    const relative = base ? `${base}/${entry.name}` : entry.name
    if (entry.isDirectory()) found.push(...listFiles(root, relative))
    else if (entry.isFile()) found.push(relative)
  }
  return found.sort()
}

/**
 * Cria o zip. `entries`: { name, file } (o nome dentro do zip e o arquivo no disco) ou { name, data }.
 */
export function writeZip(entries, destination) {
  if (entries.length >= 0xffff) throw new Error('arquivos demais para um .zip sem zip64')
  const fd = openSync(destination, 'w')
  const central = []
  let offset = 0
  const write = (buffer) => { writeSync(fd, buffer); offset += buffer.length }
  try {
    for (const entry of entries) {
      const data = entry.data ?? readFileSync(entry.file)
      const modified = entry.data ? new Date() : statSync(entry.file).mtime
      const { time, day } = dosDateTime(modified)
      const store = STORED.test(entry.name) || data.length < 64
      const body = store ? data : deflateRawSync(data, { level: 6 })
      const method = store ? 0 : 8
      const name = Buffer.from(entry.name, 'utf8')
      const checksum = crc32(data)
      if (data.length >= 0xffffffff || offset >= 0xffffffff) throw new Error(`${entry.name}: grande demais para um .zip sem zip64`)

      const local = Buffer.alloc(30)
      local.writeUInt32LE(0x04034b50, 0)
      local.writeUInt16LE(20, 4)
      local.writeUInt16LE(0x0800, 6)
      local.writeUInt16LE(method, 8)
      local.writeUInt16LE(time, 10)
      local.writeUInt16LE(day, 12)
      local.writeUInt32LE(checksum, 14)
      local.writeUInt32LE(body.length, 18)
      local.writeUInt32LE(data.length, 22)
      local.writeUInt16LE(name.length, 26)
      central.push({ name, method, time, day, checksum, compressed: body.length, size: data.length, offset })
      write(local)
      write(name)
      write(body)
    }
    const start = offset
    for (const e of central) {
      const header = Buffer.alloc(46)
      header.writeUInt32LE(0x02014b50, 0)
      header.writeUInt16LE(20, 4)
      header.writeUInt16LE(20, 6)
      header.writeUInt16LE(0x0800, 8)
      header.writeUInt16LE(e.method, 10)
      header.writeUInt16LE(e.time, 12)
      header.writeUInt16LE(e.day, 14)
      header.writeUInt32LE(e.checksum, 16)
      header.writeUInt32LE(e.compressed, 20)
      header.writeUInt32LE(e.size, 24)
      header.writeUInt16LE(e.name.length, 28)
      header.writeUInt32LE(e.offset, 42)
      write(header)
      write(e.name)
    }
    const end = Buffer.alloc(22)
    end.writeUInt32LE(0x06054b50, 0)
    end.writeUInt16LE(central.length, 8)
    end.writeUInt16LE(central.length, 10)
    end.writeUInt32LE(offset - start, 12)
    end.writeUInt32LE(start, 16)
    write(end)
  } finally {
    closeSync(fd)
  }
}

export function sha256File(file) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    createReadStream(file).on('data', (chunk) => hash.update(chunk)).on('error', reject).on('end', () => resolve(hash.digest('hex')))
  })
}
