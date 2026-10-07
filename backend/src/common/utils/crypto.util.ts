import * as bcrypt from 'bcryptjs'

const SALT_ROUNDS = 10

/**
 * 密码加密
 */
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS)
}

/**
 * 密码校验
 */
export async function comparePassword(plain: string, hashed: string): Promise<boolean> {
  if (!plain || !hashed) return false
  try {
    return await bcrypt.compare(plain, hashed)
  } catch {
    return false
  }
}