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
