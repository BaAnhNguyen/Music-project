export type TokenType = 'access' | 'refresh';

// Nội dung bên trong JWT
export interface JwtPayload {
  sub: string;
  role: string;
  type: TokenType;
  jti?: string; // id duy nhất của token (dùng để thu hồi)
  iat?: number;
  exp?: number; // epoch seconds
}

// Đối tượng gắn vào request.user sau khi qua JwtAuthGuard
export interface AuthUser {
  userId: string;
  role: string;
  jti?: string;
  exp?: number;
}
