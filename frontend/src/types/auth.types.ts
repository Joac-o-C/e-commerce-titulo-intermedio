/**
 * El backend no expone un endpoint /auth/me en esta fase: el usuario
 * autenticado se deriva decodificando el payload del access token
 * (sub + role), que es lo único que el JWT firma (ver JwtAccessPayload
 * en el backend).
 */
export interface AuthUser {
  id: string
  role: 'cliente' | 'administrador'
}

export interface LoginResponse {
  accessToken: string
}
