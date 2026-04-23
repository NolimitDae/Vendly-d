import { Injectable } from '@nestjs/common';
import { CreateUserDto2 } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { PrismaService } from '../../../prisma/prisma.service';
import { UserRepository } from '../../../common/repository/user/user.repository';
import appConfig from '../../../config/app.config';
import { TanvirStorage } from '../../../common/lib/Disk/TanvirStorage';
import { DateHelper } from '../../../common/helper/date.helper';
import { ApproveLicenseDto } from './dto/approve-license.dto';

@Injectable()
export class UserService {
  constructor(
    private prisma: PrismaService,
    private userRepository: UserRepository,
  ) {}

  // pending list document vendor and event planner
  async getPendingLicense() {
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
      name:
        user.name || `${user.first_name || ''} ${user.last_name || ''}`.trim(),
      business_name: user.vendorProfile?.business_name,
      license_photo: user.vendorProfile?.license_photo
        ? user.vendorProfile.license_photo.map((photo) =>
            TanvirStorage.url(
              appConfig().storageUrl.license + '/' + photo,
            ),
          )
        : [],
      license_status: user.vendorProfile?.license_status,
      about_me: user.vendorProfile?.about_me,
      address: user.vendorProfile?.address,
      created_at: user.created_at,
    }));
  }

  // approve list
  async getApprovedLicense() {
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
      license_photo: user.vendorProfile?.license_photo
        ? user.vendorProfile.license_photo.map((photo) =>
            TanvirStorage.url(
              appConfig().storageUrl.license + '/' + photo,
            ),
          )
        : [],
      license_status: user.vendorProfile?.license_status,
      about_me: user.vendorProfile?.about_me,
      address: user.vendorProfile?.address,
    }));
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
