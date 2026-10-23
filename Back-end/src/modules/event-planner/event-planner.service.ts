import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ADMIN_APPROVE_STATUS } from 'prisma/generated/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { TanvirStorage } from 'src/common/lib/Disk/TanvirStorage';
import { PHOTOS, PHOTOS_OR_PDF, safeStoredNames } from 'src/common/helper/upload-files';
import appConfig from 'src/config/app.config';
import { CreateEventPlannerProfileDto } from './dto/create-profile.dto';

@Injectable()
export class EventPlannerService {
  constructor(private prisma: PrismaService) {}

  async upsertProfile(
    userId: string,
    dto: CreateEventPlannerProfileDto,
    portfolioFiles?: Express.Multer.File[],
    licenseFiles?: Express.Multer.File[],
  ) {
    // check every file before any old one is removed: portfolio is photos, licences photos or PDFs
    const portfolioNames = safeStoredNames(portfolioFiles, PHOTOS);
    const licenseNames = safeStoredNames(licenseFiles, PHOTOS_OR_PDF);
    if (portfolioFiles?.length) {
      const existing = await this.prisma.eventPlannerProfile.findUnique({
        where: { user_id: userId },
        select: { portfolio: true },
      });
      for (const old of existing?.portfolio ?? []) {
        await TanvirStorage.delete(`event-planner/portfolio/${old}`).catch(() => null);
      }
      for (const [i, file] of portfolioFiles.entries()) {
        await TanvirStorage.put(`event-planner/portfolio/${portfolioNames[i]}`, file.buffer);
      }
    }

    for (const [i, file] of (licenseFiles ?? []).entries()) {
      await TanvirStorage.put(`event-planner/license/${licenseNames[i]}`, file.buffer);
    }

    const data: any = {
      business_name: dto.business_name,
      bio: dto.bio,
      website: dto.website,
      instagram: dto.instagram,
      event_types: dto.event_types,
      years_experience: dto.years_experience,
      team_size: dto.team_size,
    };

    if (portfolioNames.length) data.portfolio = portfolioNames;
    if (licenseNames.length) {
      data.license_photo = licenseNames;
      data.license_status = ADMIN_APPROVE_STATUS.PENDING;
    }

    const profile = await this.prisma.eventPlannerProfile.upsert({
      where: { user_id: userId },
      create: { user_id: userId, ...data },
      update: data,
    });

    return { success: true, data: this.formatProfile(profile) };
  }

  async getMyProfile(userId: string) {
    const profile = await this.prisma.eventPlannerProfile.findUnique({
      where: { user_id: userId },
      include: { user: { select: { id: true, name: true, email: true, avatar: true } } },
    });
    if (!profile) throw new NotFoundException('Profile not found');
    return { success: true, data: this.formatProfile(profile) };
  }

  async getPublicProfile(userId: string) {
    const profile = await this.prisma.eventPlannerProfile.findUnique({
      where: { user_id: userId },
      include: { user: { select: { id: true, name: true, avatar: true } } },
    });
    if (!profile || profile.license_status !== ADMIN_APPROVE_STATUS.APPROVED)
      throw new NotFoundException('Event planner not found');
    return { success: true, data: this.formatProfile(profile) };
  }

  async listApprovedPlanners(query: { page?: number; limit?: number; event_type?: string }) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 12;
    const skip = (page - 1) * limit;

    const where: any = {
      license_status: ADMIN_APPROVE_STATUS.APPROVED,
      deleted_at: null,
    };

    if (query.event_type) {
      where.event_types = { has: query.event_type };
    }

    const [total, planners] = await Promise.all([
      this.prisma.eventPlannerProfile.count({ where }),
      this.prisma.eventPlannerProfile.findMany({
        where,
        skip,
        take: limit,
        include: { user: { select: { id: true, name: true, avatar: true } } },
        orderBy: { created_at: 'desc' },
      }),
    ]);

    return {
      success: true,
      data: planners.map((p) => this.formatProfile(p)),
      meta: { total, page, limit, last_page: Math.ceil(total / limit) },
    };
  }

  // Admin: approve or suspend a planner
  async updateApprovalStatus(
    userId: string,
    status: ADMIN_APPROVE_STATUS,
  ) {
    const profile = await this.prisma.eventPlannerProfile.findUnique({
      where: { user_id: userId },
    });
    if (!profile) throw new NotFoundException('Event planner profile not found');

    const updated = await this.prisma.eventPlannerProfile.update({
      where: { user_id: userId },
      data: {
        license_status: status,
        approved_at: status === ADMIN_APPROVE_STATUS.APPROVED ? new Date() : null,
      },
    });

    return { success: true, data: updated };
  }

  async getPendingPlanners(query: { page?: number; limit?: number }) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const where = { license_status: ADMIN_APPROVE_STATUS.PENDING };

    const [total, planners] = await Promise.all([
      this.prisma.eventPlannerProfile.count({ where }),
      this.prisma.eventPlannerProfile.findMany({
        where,
        skip,
        take: limit,
        include: { user: { select: { id: true, name: true, email: true, avatar: true } } },
        orderBy: { created_at: 'desc' },
      }),
    ]);

    return {
      success: true,
      data: planners.map((p) => this.formatProfile(p)),
      meta: { total, page, limit, last_page: Math.ceil(total / limit) },
    };
  }

  private formatProfile(profile: any) {
    return {
      ...profile,
      portfolio: (profile.portfolio ?? []).map((img: string) =>
        TanvirStorage.url(`event-planner/portfolio/${img}`),
      ),
      license_photo: (profile.license_photo ?? []).map((img: string) =>
        TanvirStorage.url(`event-planner/license/${img}`),
      ),
      user: profile.user
        ? {
            ...profile.user,
            avatar_url: profile.user.avatar
              ? TanvirStorage.url(
                  `${appConfig().storageUrl.avatar}/${profile.user.avatar}`,
                )
              : null,
          }
        : undefined,
    };
  }
}
