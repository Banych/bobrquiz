import type { IStorageService } from '@application/ports/storage-service';
import type { MediaFileDTO } from '@application/dtos/media.dto';

export class ListMediaUseCase {
  constructor(private readonly storage: IStorageService) {}

  async execute(): Promise<MediaFileDTO[]> {
    const entries = await this.storage.list();
    return entries.map((entry) => ({
      name: entry.name,
      path: entry.path,
      url: this.storage.getPublicUrl(entry.path),
      size: entry.size,
      createdAt: entry.createdAt,
    }));
  }
}
