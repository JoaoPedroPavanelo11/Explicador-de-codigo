import { z } from 'zod';

const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('E-mail inválido').max(254));

export const registerSchema = z.strictObject({
  name: z.string().trim().min(2, 'Nome muito curto').max(80),
  email,
  // regras de força só no cadastro, para não travar senhas antigas no login
  password: z
    .string()
    .min(8, 'A senha precisa ter pelo menos 8 caracteres')
    .max(128)
    .regex(/[A-Za-z]/, 'A senha precisa ter pelo menos uma letra')
    .regex(/[0-9]/, 'A senha precisa ter pelo menos um número'),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.strictObject({
  email,
  password: z.string().min(1).max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;
