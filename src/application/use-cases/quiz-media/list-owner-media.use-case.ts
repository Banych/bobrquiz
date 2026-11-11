import type { IQuizRepository } from '@domain/repositories/quiz-repository';
import type { IMediaStorage } from '@domain/repositories/media-storage';
import {
  quizMediaFolder,
  quizMediaPath,
} from '@domain/value-objects/media-file';
import type { OwnerMediaFileDTO } from '@application/dtos/media.dto';

/** Every file in the folders of the quizzes the host owns, newest first. */
export class ListOwnerMediaUseCase {
  constructor(
    private readonly quizRepository: IQuizRepository,
    private readonly storage: IMediaStorage
  ) {}

  async execute(ownerId: string): Promise<OwnerMediaFileDTO[]> {
    const quizzes = await this.quizRepository.listByOwner(ownerId);
    const perQuiz = await Promise.all(
      quizzes.map(async (quiz) => {
        const files = await this.storage.list(quizMediaFolder(quiz.id));
        return files.map((file): OwnerMediaFileDTO => {
          const path = quizMediaPath(quiz.id, file.name);
          return {
            name: file.name,
            path,
            url: this.storage.getPublicUrl(path),
            size: file.size,
            createdAt: file.createdAt,
            quizId: quiz.id,
            quizTitle: quiz.title,
          };
        });
      })
    );

    return perQuiz
      .flat()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}
