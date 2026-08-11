import { describe, it, expect } from 'vitest'
import { contracts } from './contracts'
import type { Api } from './api'

// Api 는 계약에서 조건부 타입으로 파생된다. 조건이 안 맞으면 조용히 never 가 되고,
// never 에는 무엇이든 대입되므로 preload 의 `: Api` 검사가 통째로 공허해진다.
// 이 대입이 파생 결과가 실제로 호출 가능한 함수 타입임을 컴파일 시점에 못박는다.
const _apiShapeIsDerived: Api['system']['getAppInfo'] = () =>
  Promise.resolve({ appVersion: '0.1.0', schemaVersion: 1 })

describe('system.getAppInfo contract', () => {
  it('res accepts a valid payload', () => {
    expect(
      contracts.system.getAppInfo.res.parse({ appVersion: '0.1.0', schemaVersion: 1 })
    ).toEqual({ appVersion: '0.1.0', schemaVersion: 1 })
  })
  it('res rejects missing fields', () => {
    expect(() => contracts.system.getAppInfo.res.parse({ appVersion: '0.1.0' })).toThrow()
  })
  it('res rejects a non-integer schemaVersion', () => {
    expect(() =>
      contracts.system.getAppInfo.res.parse({ appVersion: '0.1.0', schemaVersion: 1.5 })
    ).toThrow()
  })
  // z.object() 는 모르는 키를 조용히 버린다 — 계약이 어긋나도 알 수 없다.
  // strictObject 로 거부해서 계약 드리프트가 소리를 내게 한다 (zod 스킬 schema-object-unknowns).
  it('res rejects unknown fields instead of silently stripping them', () => {
    expect(() =>
      contracts.system.getAppInfo.res.parse({
        appVersion: '0.1.0',
        schemaVersion: 1,
        rogue: true
      })
    ).toThrow()
  })
  it('req accepts no arguments', () => {
    expect(contracts.system.getAppInfo.req.parse([])).toEqual([])
  })
  it('req rejects unexpected arguments', () => {
    expect(() => contracts.system.getAppInfo.req.parse(['rogue'])).toThrow()
  })
})

describe('settings.getTheme · setTheme contract (design-system ADR-010 §1)', () => {
  it('accepts only light and dark', () => {
    expect(contracts.settings.setTheme.req.parse(['light'])).toEqual(['light'])
    expect(contracts.settings.setTheme.req.parse(['dark'])).toEqual(['dark'])
  })

  /**
   * `system` 을 계약에서 거부하는 것이 이 ADR 의 경계선이다. 통과시키면 화면이 다시
   * OS 추종을 요청할 수 있게 되고, 그 값을 저장하는 순간 상태가 셋으로 돌아간다.
   */
  it('rejects the removed system option', () => {
    expect(() => contracts.settings.setTheme.req.parse(['system'])).toThrow()
  })

  it('rejects an arbitrary string', () => {
    expect(() => contracts.settings.setTheme.req.parse(['purple'])).toThrow()
  })

  it('getTheme takes no arguments', () => {
    expect(contracts.settings.getTheme.req.parse([])).toEqual([])
    expect(() => contracts.settings.getTheme.req.parse(['light'])).toThrow()
  })

  it('both responses carry the stored theme and nothing else', () => {
    expect(contracts.settings.getTheme.res.parse({ theme: 'dark' })).toEqual({ theme: 'dark' })
    expect(contracts.settings.setTheme.res.parse({ theme: 'light' })).toEqual({ theme: 'light' })
    expect(() => contracts.settings.getTheme.res.parse({ theme: 'dark', rogue: true })).toThrow()
  })
})
