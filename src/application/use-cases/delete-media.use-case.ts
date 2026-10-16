import type { IStorageService } from '@application/ports/storage-service';
import {
  DeleteMediaInputSchema,
  type DeleteMediaInputDTO,
} from '@application/dtos/media.dto';
import { MediaValidationError } from './media-validation-error';

export class DeleteMediaUseCase {
  constructor(private readonly storage: IStorageService) {}

  async execute(input: DeleteMediaInputDTO): Promise<void> {
    const parsed = DeleteMediaInputSchema.safeParse(input);
    if (
      !parsed.success ||
      parsed.data.path.startsWith('/') ||
      parsed.data.path.includes('..')
    ) {
      throw new MediaValidationError('Invalid media path');
    }
    await this.storage.delete(parsed.data.path);
  }
}
