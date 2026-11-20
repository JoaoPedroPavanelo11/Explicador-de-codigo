import { z } from 'zod';

const MAX_PASTE_BYTES = 2 * 1024 * 1024;

const title = z.string().trim().min(1).max(120).optional();
// no multipart o boolean chega como "true"/"false"
const useAi = z.union([z.boolean(), z.stringbool()]).default(false);

export const pasteSchema = z
  .strictObject({
    title,
    useAi,
    files: z
      .array(
        z.strictObject({
          path: z.string().trim().min(1).max(300),
          content: z
            .string()
            .max(500_000, 'Cada arquivo pode ter no máximo 500 KB'),
        }),
      )
      .min(1, 'Envie pelo menos um arquivo')
      .max(100, 'No máximo 100 arquivos colados por análise'),
  })
  .refine(
    (v) =>
      v.files.reduce((s, f) => s + Buffer.byteLength(f.content), 0) <=
      MAX_PASTE_BYTES,
    'O código colado passa de 2 MB. Para projetos maiores, envie um .zip.',
  );
export type PasteInput = z.infer<typeof pasteSchema>;

export const githubSchema = z.strictObject({
  title,
  useAi,
  url: z.string().trim().min(1).max(300),
});
export type GithubInput = z.infer<typeof githubSchema>;

export const uploadFieldsSchema = z.object({ title, useAi });
export type UploadFields = z.infer<typeof uploadFieldsSchema>;

export const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.uuid().optional(),
});
export type ListQuery = z.infer<typeof listQuerySchema>;

export const idSchema = z.uuid('Identificador inválido');
