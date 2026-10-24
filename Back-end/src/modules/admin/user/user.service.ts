import { Injectable } from '@nestjs/common';
import { CreateUserDto2 } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { PrismaService } from '../../../prisma/prisma.service';
import { UserRepository } from '../../../common/repository/user/user.repository';
import appConfig from '../../../config/app.config';
import { TanvirStorage } from '../../../common/lib/Disk/TanvirStorage';
import { DateHelper } from '../../../common/helper/date.helper';
import { ApproveLicenseDto } from './dto/approve-license.dto';
import { licenceFileUrls } from '../../licence-files/licence-files';
import { TRACK_THRESHOLD, vendorCancellationCounts } from 'src/modules/booking/vendor-cancellations';

@Injectable()
export class UserService {
  constructor(
    private prisma: PrismaService,
    private userRepository: UserRepository,
  ) {}

  // pending list document vendor and event planner
  async getPendingLicense(adminId: string) {
    const pendingUsers = await this.prisma.user.findMany({
      where: {
        type: {
          in: ['VENDOR', 'EVENT_PLANNER'],
        },
        vendorProfile: {
          license_status: 'PENDING',
          license_photo: {
            isEmpty: false, 
          },
        },
      },
      select: {
        id: true,
        email: true,
        first_name: true,
        last_name: true,
        name: true,
        type: true,
        created_at: true,
        vendorProfile: {
          select: {
            business_name: true,
            license_photo: true,
            license_status: true,
            about_me: true,
            address: true,
            created_at: true,
          },
        },
      },
      orderBy: {
        created_at: 'desc',
      },
    });

    return pendingUsers.map((user) => ({
      id: user.id,
      email: user.email,
      type: user.type,
      name:
        user.name || `${user.first_name || ''} ${user.last_name || ''}`.trim(),
      business_name: user.vendorProfile?.business_name,
      // short-lived signed links for this admin
      license_photo: licenceFileUrls('vendor', user.id, user.vendorProfile?.license_photo, adminId),
      license_status: user.vendorProfile?.license_status,
      about_me: user.vendorProfile?.about_me,
      address: user.vendorProfile?.address,
      created_at: user.created_at,
    }));
  }

  // approve list
  async getApprovedLicense(adminId: string) {
    const approvedUsers = await this.prisma.user.findMany({
      where: {
        type: {
          in: ['VENDOR', 'EVENT_PLANNER'],
        },
        vendorProfile: {
          license_status: 'APPROVED',
          license_photo: {
            isEmpty: false,
          },
        },
      },
      select: {
        id: true,
        email: true,
        first_name: true,
        last_name: true,
        vendorProfile: {
          select: {
            business_name: true,
            license_photo: true,
            license_status: true,
            about_me: true,
            address: true,
          },
        },
      },
    });

    return approvedUsers.map((user) => ({
      id: user.id,
      email: user.email,
      name: `${user.first_name || ''} ${user.last_name || ''}`.trim(),
      business_name: user.vendorProfile?.business_name,
      // short-lived signed links for this admin
      license_photo: licenceFileUrls('vendor', user.id, user.vendorProfile?.license_photo, adminId),
      license_status: user.vendorProfile?.license_status,
      about_me: user.vendorProfile?.about_me,
      address: user.vendorProfile?.address,
    }));
  }


  async getVendors(query: { page?: number; limit?: number; status?: string }) {
    // status (account active/suspended) is returned so admins can suspend from the list
    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 20);
    const skip = (page - 1) * limit;

    const where: any = { type: 'VENDOR' };
    if (query.status) {
      where.vendorProfile = { license_status: query.status };
    }

    const [total, users] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        select: {
          id: true,
          name: true,
          first_name: true,
          last_name: true,
          email: true,
          avatar: true,
          created_at: true,
          status: true,
          vendorProfile: {
            select: {
              business_name: true,
              address: true,
              license_status: true,
              about_me: true,
            },
          },
          _count: {
            select: { vendorListings: true, vendorBookings: true },
          },
        },
      }),
    ]);

    // cancellations of their own in the last 90 days (2 or more: shown after others in search)
    const cancellations = await vendorCancellationCounts(this.prisma, users.map((u) => u.id)).catch(() => ({}) as Record<string, number>);
    const data = users.map((u) => ({
      id: u.id,
      name: u.name || `${u.first_name || ''} ${u.last_name || ''}`.trim(),
      email: u.email,
      avatar: u.avatar
        ? TanvirStorage.url(`${appConfig().storageUrl.avatar}/${u.avatar}`)
        : null,
      created_at: u.created_at,
      status: u.status ?? 1,
      business_name: u.vendorProfile?.business_name ?? null,
      address: u.vendorProfile?.address ?? null,
      license_status: u.vendorProfile?.license_status ?? null,
      total_listings: u._count.vendorListings,
      total_bookings: u._count.vendorBookings,
      cancellations_90d: cancellations[u.id] ?? 0,
      ranked_lower: (cancellations[u.id] ?? 0) >= TRACK_THRESHOLD,
    }));

    return {
      success: true,
      data,
      meta: { total, page, limit, last_page: Math.ceil(total / limit) },
    };
  }

  // approval or reject license
  async approveLicense(
    approveLicenseDto: ApproveLicenseDto,
    userId: string
  ) { 

    const { licenseStatus } = approveLicenseDto;

    const user = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
      include: {
        vendorProfile: true,
      },
    });

    if (!user || !user.vendorProfile) {
      throw new Error('User not found or does not have a vendor profile');
    }

    const update = await this.prisma.vendorProfile.update({
      where: {
        license_status: 'PENDING',
        user_id: userId, 
      },
      data: {
        license_status: licenseStatus,
        approved_at: licenseStatus === 'APPROVED' ? new Date() : null, 
      },
    });

    if (!update) {
      throw new Error('User not found or license status is not pending');
    }

    return {
      sucess: true,
      message: `License has been ${licenseStatus.toLowerCase()}.`,
      data: {
        userId,
        licenseStatus,
      },  
    };
  }
    
}
