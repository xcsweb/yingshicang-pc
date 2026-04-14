/**
 * 将 TypeScript 构建/类型错误输出到 ts-error.txt（Windows 友好，避免命令行重定向差异）
 */
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'

const cwd = process.cwd()
const outFile = path.resolve(cwd, 'ts-error.txt')
const tscEntry = path.resolve(cwd, 'node_modules', 'typescript', 'bin', 'tsc')

const child = spawn(process.execPath, [tscEntry, '-b', '--pretty', 'false'], {
  cwd,
  stdio: ['ignore', 'pipe', 'pipe'],
})

let output = ''
child.stdout.on('data', chunk => {
  output += String(chunk)
})
child.stderr.on('data', chunk => {
  output += String(chunk)
})

child.on('error', err => {
  fs.writeFile(outFile, String(err?.message || err), 'utf8', () => {})
  process.exitCode = 1
})

child.on('close', code => {
  fs.writeFile(outFile, output, 'utf8', err => {
    if (err) {
      process.exitCode = 1
      return
    }
    process.exitCode = typeof code === 'number' ? code : 1
  })
})
