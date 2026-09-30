// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PASSWORD_POLICY_REGEX } from './password-policy'

describe('PASSWORD_POLICY_REGEX (CU-01/CU-08)', () => {
  it.each(['Segura123', 'ABCDEFG1', 'unaMayuscula9'])('acepta %s', (pwd) => {
    expect(PASSWORD_POLICY_REGEX.test(pwd)).toBe(true)
  })

  it.each([
    ['Corta1A', 'menos de 8 caracteres'],
    ['sinmayuscula1', 'sin mayúscula'],
    ['SinNumeroAca', 'sin número'],
  ])('rechaza %s (%s)', (pwd) => {
    expect(PASSWORD_POLICY_REGEX.test(pwd)).toBe(false)
  })

  it('es idéntica a la del backend', () => {
    const backend = readFileSync(
      new URL('../../../../backend/src/modules/auth/dto/password-policy.ts', import.meta.url),
      'utf8',
    )
    const match = /PASSWORD_POLICY_REGEX = \/(.+)\/;/.exec(backend)

    expect(match?.[1]).toBe(PASSWORD_POLICY_REGEX.source)
  })
})
