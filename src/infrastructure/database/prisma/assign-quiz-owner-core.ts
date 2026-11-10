const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The slice of the Prisma client the backfill needs (keeps tests mock-friendly). */
export interface OwnerBackfillClient {
  $executeRaw(
    query: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<number>;
  $queryRaw<T = unknown>(
    query: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T>;
}

export interface OwnerBackfillResult {
  updated: number;
  remaining: number;
}

export const parseOwnerIdArg = (value: string | undefined): string => {
  if (!value || !UUID_PATTERN.test(value)) {
    throw new Error(
      'Owner id must be a uuid (copy it from the Supabase dashboard, Authentication > Users).'
    );
  }
  return value;
};

/**
 * Sets ownerId on every quiz that has none. Raw SQL because the generated
 * client types ownerId as non-null.
 */
export const assignQuizOwner = async (
  client: OwnerBackfillClient,
  ownerIdArg: string | undefined
): Promise<OwnerBackfillResult> => {
  const ownerId = parseOwnerIdArg(ownerIdArg);
  const updated =
    await client.$executeRaw`UPDATE "Quiz" SET "ownerId" = ${ownerId}::uuid WHERE "ownerId" IS NULL`;
  const rows = await client.$queryRaw<
    Array<{ count: bigint }>
  >`SELECT COUNT(*) AS count FROM "Quiz" WHERE "ownerId" IS NULL`;
  return { updated, remaining: Number(rows[0]?.count ?? 0) };
};
