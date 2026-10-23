import { Injectable } from '@nestjs/common';
import { TanvirStorage } from './common/lib/Disk/TanvirStorage';
import { PHOTOS, safeStoredName } from './common/helper/upload-files';

@Injectable()
export class AppService {
  getHello(): string {
    return 'Hello world';
  }

  async test(image: Express.Multer.File) {
    try {
      // never the uploaded name: a random one with the real (image) extension
      const fileName = safeStoredName(image?.buffer, PHOTOS);
      const fileType = image.mimetype;
      const fileSize = image.size;
      const fileBuffer = image.buffer;

      const result = await TanvirStorage.put(fileName, fileBuffer);

      return {
        success: true,
        message: 'Image uploaded successfully',
        data: result,
        url: TanvirStorage.url('tony1.jpg'),
      };
    } catch (error) {
      throw new Error(`Failed to upload image: ${error}`);
    }
  }
}
