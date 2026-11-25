import { z } from "zod";

export const EmailSchema = z.email().transform((value) => value.trim().toLowerCase());

export const PasswordSchema = z
  .string()
  .min(12)
  .max(256);

export const AccountInputSchema = z.object({
  email: EmailSchema,
  password: PasswordSchema,
});

export const LoginInputSchema = AccountInputSchema;

export const PasswordChangeSchema = z.object({
  currentPassword: PasswordSchema,
  newPassword: PasswordSchema,
});

export const ForgotPasswordSchema = z.object({
  email: EmailSchema,
});

export const ResetPasswordSchema = z.object({
  token: z.string().min(32),
  newPassword: PasswordSchema,
});

export const UserSchema = z.object({
  id: z.string().uuid(),
  email: EmailSchema,
  active: z.boolean(),
  deletedAt: z.number().int().nullable(),
});

export const SessionSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  expiresAt: z.number().int(),
});

export type User = z.infer<typeof UserSchema>;
export type Session = z.infer<typeof SessionSchema>;
