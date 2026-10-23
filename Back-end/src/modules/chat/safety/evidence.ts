import { PrismaService } from 'src/prisma/prisma.service';

/**
 * Of these stored attachment names, the ones a report kept as evidence. When the sender deletes
 * a reported message these files stay in storage so the admin can still review them.
 */
export async function filesKeptForReports(prisma: Pick<PrismaService, 'userReport'>, names: string[]): Promise<Set<string>> {
  if (!names.length) return new Set();
  const reports = await prisma.userReport.findMany({
    where: { message_attachments: { hasSome: names } },
    select: { message_attachments: true },
  });
  const kept = new Set(reports.flatMap((r) => r.message_attachments ?? []));
  return new Set(names.filter((n) => kept.has(n)));
}
