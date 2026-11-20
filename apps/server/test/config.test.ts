import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ConfigError, defaultAppName, defaultAppVersion, loadConfig } from '../src/config.ts'

describe('loadConfig', () => {
  it('fills defaults when the environment is empty', () => {
    const config = loadConfig({})
    assert.equal(config.appName, defaultAppName)
    assert.equal(config.version, defaultAppVersion)
    assert.equal(config.host, '0.0.0.0')
    assert.equal(config.port, 3000)
    assert.equal(config.drainMs, 10_000)
  })

  it('treats empty strings as unset', () => {
    const config = loadConfig({ PORT: '', HOST: '', APP_NAME: '' })
    assert.equal(config.port, 3000)
    assert.equal(config.host, '0.0.0.0')
    assert.equal(config.appName, defaultAppName)
  })

  it('reads a valid custom environment', () => {
    const config = loadConfig({
      APP_NAME: 'stamped-app',
      APP_VERSION: '1.2.3',
      HOST: '127.0.0.1',
      PORT: '4200',
      SHUTDOWN_DRAIN_MS: '0',
      UNRELATED: 'ignored',
    })
    assert.deepEqual(config, {
      appName: 'stamped-app',
      version: '1.2.3',
      host: '127.0.0.1',
      port: 4200,
      drainMs: 0,
    })
  })

  it('rejects a port that is not an integer in range', () => {
    assert.throws(() => loadConfig({ PORT: 'nope' }), ConfigError)
    assert.throws(() => loadConfig({ PORT: '0' }), ConfigError)
    assert.throws(() => loadConfig({ PORT: '70000' }), ConfigError)
    assert.throws(() => loadConfig({ PORT: '3000.5' }), ConfigError)
  })

  it('rejects blank names and an oversized drain', () => {
    assert.throws(() => loadConfig({ APP_NAME: '   ' }), ConfigError)
    assert.throws(() => loadConfig({ APP_VERSION: ' ' }), ConfigError)
    assert.throws(() => loadConfig({ SHUTDOWN_DRAIN_MS: '120001' }), ConfigError)
  })
})
