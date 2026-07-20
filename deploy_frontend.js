const { existsSync } = require('node:fs')
const { execFileSync } = require('node:child_process')
const { resolve } = require('node:path')

const rootDir = __dirname
const defaultSourceDirectory = resolve(rootDir, 'deploy', 'selfhosted')
const defaultRemoteDirectory = '/www/wwwroot/alumni-book'

function buildScpArguments({ privateKey, port, sourceDirectory, target }) {
  return ['-i', privateKey, '-P', port, '-r', `${resolve(sourceDirectory)}${process.platform === 'win32' ? '\\.' : '/.'}`, target]
}

async function deployFrontend({
  env = process.env,
  sourceDirectory = defaultSourceDirectory,
  remoteDirectory = env.DEPLOY_REMOTE_DIR || defaultRemoteDirectory,
  execFile = execFileSync,
} = {}) {
  const { assertDeploymentEnvironment, verifyDeploymentSecrets } = await import('./scripts/verify-deployment-secrets.mjs')
  verifyDeploymentSecrets()
  const config = assertDeploymentEnvironment(env)
  if (!existsSync(sourceDirectory)) throw new Error(`前端产物不存在：${sourceDirectory}`)
  const target = `${config.user}@${config.host}:${remoteDirectory}`
  execFile('scp', buildScpArguments({ ...config, sourceDirectory, target }), { stdio: 'inherit' })
}

module.exports = { buildScpArguments, deployFrontend }

if (process.argv[1]?.endsWith('deploy_frontend.js')) {
  deployFrontend().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
