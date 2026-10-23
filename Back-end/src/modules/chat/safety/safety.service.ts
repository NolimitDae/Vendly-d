import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { avatarUrl, formatMessage, messageInclude } from '../extras/format';
import { ReportUserDto, ResolveReportDto } from './safety.dto';

/** Messages shown with a report so the admin can see what happened. */
const CONTEXT_MESSAGES = 10;
const DONE = ['ACTIONED', 'DISMISSED'];
const personSelect = { id: true, name: true, email: true, avatar: true, status: true, type: true } as const;

const person = (u: { id: string; name: string | null; email: string | null; avatar: string | null; status?: number | null; type?: string | null } | null) =>
  u ? { id: u.id, name: u.name, email: u.email, avatar_url: avatarUrl(u.avatar), status: u.status ?? null, type: u.type ?? null } : null;

/** Blocking and reporting people in chat, plus the admin queue for reports. */
@Injectable()
export class ChatSafetyService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Blocking ─────────────────────────────────────────────────────────────

  async block(me: string, userId: string) {
    if (!userId || userId === me) throw new BadRequestException("You can't block yourself.");
    const target = await this.prisma.user.findFirst({ where: { id: userId, deleted_at: null }, select: { id: true } });
    if (!target) throw new NotFoundException('User not found');
    await this.prisma.userBlock.upsert({
      where: { blocker_id_blocked_id: { blocker_id: me, blocked_id: userId } },
      create: { blocker_id: me, blocked_id: userId },
      update: {},
    });
    return { success: true, message: 'Blocked. Neither of you can message the other until you unblock.', data: { user_id: userId, blocked: true } };
  }

  async unblock(me: string, userId: string) {
    await this.prisma.userBlock.deleteMany({ where: { blocker_id: me, blocked_id: userId } });
    return { success: true, message: 'Unblocked', data: { user_id: userId, blocked: false } };
  }

  async listBlocks(me: string) {
    const rows = await this.prisma.userBlock.findMany({
      where: { blocker_id: me },
      orderBy: { created_at: 'desc' },
      include: { blocked: { select: { id: true, name: true, avatar: true } } },
    });
    return {
      success: true,
      data: rows.map((r) => ({ id: r.blocked.id, name: r.blocked.name, avatar_url: avatarUrl(r.blocked.avatar), blocked_at: r.created_at })),
    };
  }

  // ─── Reporting ────────────────────────────────────────────────────────────

  async report(me: string, dto: ReportUserDto) {
    if (dto.reported_id === me) throw new BadRequestException("You can't report yourself.");
    const reported = await this.prisma.user.findFirst({ where: { id: dto.reported_id }, select: { id: true } });
    if (!reported) throw new NotFoundException('User not found');

    let conversationId = dto.conversation_id || null;
    if (dto.message_id) {
      const msg = await this.prisma.message.findUnique({ where: { id: dto.message_id }, select: { id: true, conversationId: true, senderId: true } });
      if (!msg) throw new NotFoundException('Message not found');
      if (conversationId && msg.conversationId !== conversationId) throw new BadRequestException("That message isn't in this conversation.");
      if (msg.senderId !== dto.reported_id) throw new BadRequestException("That message wasn't sent by this person.");
      conversationId = msg.conversationId;
    }
    if (conversationId) {
      const member = await this.prisma.participant.findFirst({ where: { conversationId, userId: me }, select: { id: true } });
      if (!member) throw new ForbiddenException('You are not a participant of this conversation.');
    }

    const report = await this.prisma.userReport.create({
      data: {
        reporter_id: me,
        reported_id: dto.reported_id,
        conversation_id: conversationId,
        message_id: dto.message_id || null,
        reason: dto.reason,
        details: dto.details?.trim() || null,
      },
    });
    if (dto.block) await this.block(me, dto.reported_id);

    return {
      success: true,
      message: 'Thanks for telling us. Our team will review this report.',
      data: { id: report.id, status: report.status, blocked: !!dto.block },
    };
  }

  // ─── Admin queue ──────────────────────────────────────────────────────────

  async adminList(opts: { status?: string; page?: number; limit?: number }) {
    const done = opts.status === 'done';
    const page = Math.max(1, Number(opts.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(opts.limit) || 20));
    const where = done ? { status: { in: DONE } } : { status: 'OPEN' };

    const [total, reports] = await Promise.all([
      this.prisma.userReport.count({ where }),
      this.prisma.userReport.findMany({
        where,
        // open: oldest first, like a queue; done: most recent first
        orderBy: { created_at: done ? 'desc' : 'asc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { reporter: { select: personSelect }, reported: { select: personSelect } },
      }),
    ]);

    const resolverIds = [...new Set(reports.map((r) => r.resolved_by).filter((x): x is string => !!x))];
    const resolvers = resolverIds.length
      ? await this.prisma.user.findMany({ where: { id: { in: resolverIds } }, select: { id: true, name: true } })
      : [];
    const resolverName = new Map(resolvers.map((u) => [u.id, u.name]));

    const data = await Promise.all(
      reports.map(async (r) => {
        const msg = r.message_id ? await this.prisma.message.findUnique({ where: { id: r.message_id }, include: messageInclude }) : null;
        const context = r.conversation_id
          ? await this.prisma.message.findMany({
              where: { conversationId: r.conversation_id, ...(msg ? { createdAt: { lte: msg.createdAt } } : {}) },
              orderBy: { createdAt: 'desc' },
              take: CONTEXT_MESSAGES,
              include: messageInclude,
            })
          : [];
        return {
          id: r.id,
          created_at: r.created_at,
          reason: r.reason,
          details: r.details,
          status: r.status,
          resolved_at: r.resolved_at,
          resolved_by: r.resolved_by ? { id: r.resolved_by, name: resolverName.get(r.resolved_by) ?? null } : null,
          resolution_note: r.resolution_note,
          reporter: person(r.reporter),
          reported: person(r.reported),
          conversation_id: r.conversation_id,
          message_id: r.message_id,
          // null when the sender has since deleted it
          message: msg ? formatMessage(msg) : null,
          context: context.reverse().map(formatMessage),
        };
      }),
    );

    return { success: true, data, meta: { page, limit, total } };
  }

  async resolve(adminId: string, id: string, dto: ResolveReportDto) {
    const report = await this.prisma.userReport.findUnique({ where: { id }, select: { id: true, status: true } });
    if (!report) throw new NotFoundException('Report not found');
    const status = dto.action === 'dismiss' ? 'DISMISSED' : 'ACTIONED';
    const resolvedAt = new Date();
    const note = dto.note?.trim() || null;
    const done = await this.prisma.userReport.updateMany({
      where: { id, status: 'OPEN' },
      data: { status, resolved_at: resolvedAt, resolved_by: adminId, resolution_note: note },
    });
    if (done.count !== 1) throw new BadRequestException('This report has already been resolved.');
    return { success: true, data: { id, status, resolved_at: resolvedAt, resolution_note: note } };
  }
}
