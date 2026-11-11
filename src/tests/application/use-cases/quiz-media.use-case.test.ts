import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IQuizRepository } from '@domain/repositories/quiz-repository';
import type { IQuestionRepository } from '@domain/repositories/question-repository';
import { Quiz } from '@domain/entities/quiz';
import { Question } from '@domain/entities/question';
import { QuizSessionAggregate } from '@domain/aggregates/quiz-session-aggregate';
import { AssertQuizOwnerUseCase } from '@application/use-cases/assert-quiz-owner.use-case';
import { UploadQuizMediaUseCase } from '@application/use-cases/quiz-media/upload-quiz-media.use-case';
import { DeleteQuizMediaUseCase } from '@application/use-cases/quiz-media/delete-quiz-media.use-case';
import { ListOwnerMediaUseCase } from '@application/use-cases/quiz-media/list-owner-media.use-case';
import { CreateQuestionUseCase } from '@application/use-cases/create-question.use-case';
import { UpdateQuestionUseCase } from '@application/use-cases/update-question.use-case';
import { DeleteQuizUseCase } from '@application/use-cases/delete-quiz.use-case';
import {
  FAKE_MEDIA_BASE,
  FakeMediaStorage,
} from '@/tests/support/fake-media-storage';

const HOST_A = 'host-a';
const HOST_B = 'host-b';
const A_QUIZ = 'quiz-a';
const A_OTHER_QUIZ = 'quiz-a2';
const B_QUIZ = 'quiz-b';

const makeQuiz = (id: string, ownerId: string): Quiz =>
  new Quiz(
    id,
    `Title ${id}`,
    [],
    { timePerQuestion: 30, allowSkipping: false },
    { ownerId }
  );

const quizzes: Record<string, Quiz> = {
  [A_QUIZ]: makeQuiz(A_QUIZ, HOST_A),
  [A_OTHER_QUIZ]: makeQuiz(A_OTHER_QUIZ, HOST_A),
  [B_QUIZ]: makeQuiz(B_QUIZ, HOST_B),
};

const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3,
]);
const HTML_AS_PNG = new TextEncoder().encode('<html><script>x</script>');

const NOT_FOUND = (quizId: string) => `Quiz with ID ${quizId} not found`;

describe('Quiz media use cases', () => {
  const quizRepository = {
    findEntityById: vi.fn(),
    listByOwner: vi.fn(),
    findById: vi.fn(),
    delete: vi.fn(),
  } as unknown as IQuizRepository;
  let storage: FakeMediaStorage;
  let upload: UploadQuizMediaUseCase;
  let remove: DeleteQuizMediaUseCase;
  let list: ListOwnerMediaUseCase;
  let randomCalls = 0;
  const deleted = new Set<string>();

  beforeEach(() => {
    vi.resetAllMocks();
    randomCalls = 0;
    storage = new FakeMediaStorage();
    const assertOwner = new AssertQuizOwnerUseCase(quizRepository);
    upload = new UploadQuizMediaUseCase(
      quizRepository,
      storage,
      assertOwner,
      () => 1731300000000,
      // abc123 first, then a fresh name for every further upload
      () => (randomCalls++ === 0 ? 'abc123' : `r${randomCalls}`)
    );
    remove = new DeleteQuizMediaUseCase(storage, assertOwner);
    list = new ListOwnerMediaUseCase(quizRepository, storage);

    deleted.clear();
    vi.mocked(quizRepository.findEntityById).mockImplementation(
      async (id: string) => (deleted.has(id) ? null : (quizzes[id] ?? null))
    );
    vi.mocked(quizRepository.listByOwner).mockImplementation(
      async (ownerId: string) =>
        Object.values(quizzes).filter(
          (quiz) => quiz.ownerId === ownerId && !deleted.has(quiz.id)
        )
    );
    vi.mocked(quizRepository.delete).mockImplementation(async (id: string) => {
      deleted.add(id);
    });
  });

  describe('UploadQuizMediaUseCase', () => {
    it("stores an image in the owner's quiz folder with the detected type", async () => {
      const result = await upload.execute({
        quizId: A_QUIZ,
        ownerId: HOST_A,
        bytes: PNG,
      });

      const path = 'questions/quiz-a/1731300000000-abc123.png';
      expect(result).toEqual({
        url: `${FAKE_MEDIA_BASE}${path}`,
        path,
        name: '1731300000000-abc123.png',
        size: PNG.length,
      });
      expect(storage.objects.get(path)?.contentType).toBe('image/png');
    });

    it('refuses another host and a missing quiz with the same not-found error', async () => {
      await expect(
        upload.execute({ quizId: A_QUIZ, ownerId: HOST_B, bytes: PNG })
      ).rejects.toThrow(NOT_FOUND(A_QUIZ));
      await expect(
        upload.execute({ quizId: 'quiz-missing', ownerId: HOST_A, bytes: PNG })
      ).rejects.toThrow(NOT_FOUND('quiz-missing'));
      expect(storage.objects.size).toBe(0);
    });

    it('refuses an empty file, a file over 4 MB and bytes that are not an image', async () => {
      const tooBig = new Uint8Array(4 * 1024 * 1024 + 1);
      tooBig.set(PNG);

      for (const [bytes, message] of [
        [new Uint8Array(), 'Invalid media: the file is empty'],
        [tooBig, 'Invalid media: the file is larger than 4 MB'],
        [HTML_AS_PNG, 'Invalid media: not a JPEG, PNG, GIF or WebP image'],
      ] as const) {
        await expect(
          upload.execute({ quizId: A_QUIZ, ownerId: HOST_A, bytes })
        ).rejects.toThrow(message);
      }
      expect(storage.objects.size).toBe(0);
    });

    it("refuses the 201st file, counting all of the host's quizzes but not other hosts'", async () => {
      for (let i = 0; i < 150; i++) {
        storage.seed(`questions/${A_QUIZ}/1-a${i}.jpg`);
      }
      for (let i = 0; i < 49; i++) {
        storage.seed(`questions/${A_OTHER_QUIZ}/1-b${i}.jpg`);
      }
      for (let i = 0; i < 300; i++) {
        storage.seed(`questions/${B_QUIZ}/1-c${i}.jpg`);
      }

      // 199 files: the 200th is allowed
      await expect(
        upload.execute({ quizId: A_QUIZ, ownerId: HOST_A, bytes: PNG })
      ).resolves.toBeDefined();

      // 200 files: the 201st is refused
      await expect(
        upload.execute({ quizId: A_OTHER_QUIZ, ownerId: HOST_A, bytes: PNG })
      ).rejects.toThrow(/^Media limit reached/);
    });

    it('refuses an upload that would take the host past 50 MB', async () => {
      storage.seed(`questions/${A_QUIZ}/1-big.jpg`, 50 * 1024 * 1024 - 5);

      await expect(
        upload.execute({ quizId: A_QUIZ, ownerId: HOST_A, bytes: PNG })
      ).rejects.toThrow(/^Media limit reached/);
      expect(storage.objects.size).toBe(1);
    });

    it('allows an upload that lands exactly at 50 MB', async () => {
      storage.seed(
        `questions/${A_QUIZ}/1-big.jpg`,
        50 * 1024 * 1024 - PNG.length
      );

      await expect(
        upload.execute({ quizId: A_QUIZ, ownerId: HOST_A, bytes: PNG })
      ).resolves.toBeDefined();
      expect(storage.objects.size).toBe(2);
    });

    it.each([
      ['lands before the delete', 'write-then-delete'],
      ['lands after the delete', 'delete-then-write'],
    ] as const)(
      'leaves nothing behind when its quiz is deleted while the write %s',
      async (_name, order) => {
        const deleteQuiz = new DeleteQuizUseCase(quizRepository, storage);
        const write = storage.upload.bind(storage);
        vi.spyOn(storage, 'upload').mockImplementation(async (...args) => {
          if (order === 'delete-then-write') await deleteQuiz.execute(A_QUIZ);
          await write(...args);
          if (order === 'write-then-delete') await deleteQuiz.execute(A_QUIZ);
        });

        await expect(
          upload.execute({ quizId: A_QUIZ, ownerId: HOST_A, bytes: PNG })
        ).rejects.toThrow(NOT_FOUND(A_QUIZ));
        expect(storage.objects.size).toBe(0);
      }
    );

    it('removes its file when the count after the write fails', async () => {
      const list = storage.list.bind(storage);
      let calls = 0;
      vi.spyOn(storage, 'list').mockImplementation(async (folder) => {
        // The first count lists two folders; fail from the second count on
        if (++calls > 2) throw new Error('Failed to list media: rate limited');
        return list(folder);
      });

      await expect(
        upload.execute({ quizId: A_QUIZ, ownerId: HOST_A, bytes: PNG })
      ).rejects.toThrow('rate limited');
      expect(storage.objects.size).toBe(0);
    });

    it('keeps the cap when uploads run at the same moment', async () => {
      for (let i = 0; i < 199; i++) {
        storage.seed(`questions/${A_QUIZ}/1-a${i}.jpg`);
      }

      const results = await Promise.allSettled(
        Array.from({ length: 20 }, () =>
          upload.execute({ quizId: A_QUIZ, ownerId: HOST_A, bytes: PNG })
        )
      );

      // All twenty pass the first count; each one over the cap removes its own file
      expect(storage.objects.size).toBeLessThanOrEqual(200);
      const kept = results.filter((result) => result.status === 'fulfilled');
      expect(storage.objects.size).toBe(199 + kept.length);
      for (const result of results) {
        if (result.status === 'rejected') {
          expect(String(result.reason)).toMatch(/Media limit reached/);
        }
      }
    });
  });

  describe('DeleteQuizUseCase', () => {
    const deleteQuiz = () =>
      new DeleteQuizUseCase(quizRepository, storage).execute(A_QUIZ);

    beforeEach(() => {
      storage.seed(`questions/${A_QUIZ}/1-a.jpg`);
      storage.seed(`questions/${A_QUIZ}/1-b.jpg`);
      storage.seed(`questions/${A_OTHER_QUIZ}/1-c.jpg`);
    });

    it("removes the quiz's files with the quiz, so none are left outside the cap", async () => {
      await deleteQuiz();

      expect([...storage.objects.keys()]).toEqual([
        `questions/${A_OTHER_QUIZ}/1-c.jpg`,
      ]);
      expect(quizRepository.delete).toHaveBeenCalledWith(A_QUIZ);
    });

    it('sweeps again after the row delete, for an upload that finished in between', async () => {
      vi.mocked(quizRepository.delete).mockImplementation(
        async (id: string) => {
          // An upload runs start to finish after the first sweep, while the quiz
          // still exists, so its own check passes
          await upload.execute({ quizId: A_QUIZ, ownerId: HOST_A, bytes: PNG });
          deleted.add(id);
        }
      );

      await deleteQuiz();

      expect([...storage.objects.keys()]).toEqual([
        `questions/${A_OTHER_QUIZ}/1-c.jpg`,
      ]);
    });

    it('still reports the quiz deleted when the sweep after the row delete fails', async () => {
      const removeFolder = storage.removeFolder.bind(storage);
      let calls = 0;
      vi.spyOn(storage, 'removeFolder').mockImplementation(async (folder) => {
        if (++calls === 2) throw new Error('Failed to delete media: boom');
        return removeFolder(folder);
      });
      vi.spyOn(console, 'error').mockImplementation(() => undefined);

      await expect(deleteQuiz()).resolves.toBeUndefined();
      expect(quizRepository.delete).toHaveBeenCalledWith(A_QUIZ);
      expect(console.error).toHaveBeenCalled();
    });

    it('keeps the quiz when its files cannot be removed', async () => {
      vi.spyOn(storage, 'removeFolder').mockRejectedValue(
        new Error('Failed to delete media: boom')
      );

      await expect(deleteQuiz()).rejects.toThrow('Failed to delete media');
      expect(quizRepository.delete).not.toHaveBeenCalled();
    });
  });

  describe('DeleteQuizMediaUseCase', () => {
    const FILE = '1731300000000-abc123.png';
    const PATH = `questions/${A_QUIZ}/${FILE}`;

    beforeEach(() => {
      storage.seed(PATH);
    });

    it("deletes a file from the owner's quiz", async () => {
      await remove.execute({ quizId: A_QUIZ, ownerId: HOST_A, fileName: FILE });
      expect(storage.objects.has(PATH)).toBe(false);
    });

    it('refuses another host and a missing quiz with the not-found error and keeps the file', async () => {
      await expect(
        remove.execute({ quizId: A_QUIZ, ownerId: HOST_B, fileName: FILE })
      ).rejects.toThrow(NOT_FOUND(A_QUIZ));
      await expect(
        remove.execute({
          quizId: 'quiz-missing',
          ownerId: HOST_A,
          fileName: FILE,
        })
      ).rejects.toThrow(NOT_FOUND('quiz-missing'));
      expect(storage.objects.has(PATH)).toBe(true);
    });

    it('refuses a name that could point outside the folder', async () => {
      storage.seed(`questions/${B_QUIZ}/${FILE}`);

      await expect(
        remove.execute({
          quizId: A_QUIZ,
          ownerId: HOST_A,
          fileName: `../${B_QUIZ}/${FILE}`,
        })
      ).rejects.toThrow('Invalid media: not a media file name');
      expect(storage.objects.has(`questions/${B_QUIZ}/${FILE}`)).toBe(true);
    });

    it('reports a missing file as not found', async () => {
      await expect(
        remove.execute({
          quizId: A_QUIZ,
          ownerId: HOST_A,
          fileName: '1731300000000-gone.png',
        })
      ).rejects.toThrow('Media file not found: 1731300000000-gone.png');
    });
  });

  describe('ListOwnerMediaUseCase', () => {
    it("lists only the host's quizzes' files, newest first, with their quiz", async () => {
      storage.seed(`questions/${A_QUIZ}/1-old.jpg`);
      storage.seed(`questions/${B_QUIZ}/1-theirs.jpg`);
      storage.seed(`questions/${A_OTHER_QUIZ}/1-new.jpg`);
      storage.seed('somewhere-else/1-loose.jpg');

      const files = await list.execute(HOST_A);

      expect(
        files.map((file) => [file.name, file.quizId, file.quizTitle])
      ).toEqual([
        ['1-new.jpg', A_OTHER_QUIZ, `Title ${A_OTHER_QUIZ}`],
        ['1-old.jpg', A_QUIZ, `Title ${A_QUIZ}`],
      ]);
      expect(files[0].url).toBe(
        `${FAKE_MEDIA_BASE}questions/${A_OTHER_QUIZ}/1-new.jpg`
      );
    });

    it('returns nothing for a host with no quizzes', async () => {
      await expect(list.execute('host-new')).resolves.toEqual([]);
    });
  });

  describe("a question's image URL", () => {
    const OWN_URL = `${FAKE_MEDIA_BASE}questions/${A_QUIZ}/1731300000000-abc123.png`;
    const REFUSED =
      'Invalid media: the image must be a file uploaded to this quiz';
    const refusedUrls = [
      ['an outside address', 'https://tracker.example/pixel.png'],
      [
        "another quiz's file",
        `${FAKE_MEDIA_BASE}questions/${B_QUIZ}/1731300000000-abc123.png`,
      ],
      [
        'a path that climbs out of the folder',
        `${FAKE_MEDIA_BASE}questions/${A_QUIZ}/../${B_QUIZ}/1-a.png`,
      ],
      ['the folder itself', `${FAKE_MEDIA_BASE}questions/${A_QUIZ}/`],
    ] as const;

    const questionRepository = {
      findById: vi.fn(),
      listByQuizId: vi.fn(),
      save: vi.fn(),
    } as unknown as IQuestionRepository;

    beforeEach(() => {
      vi.mocked(questionRepository.listByQuizId).mockResolvedValue([]);
      vi.mocked(quizRepository.findById).mockResolvedValue(
        {} as QuizSessionAggregate
      );
    });

    describe('CreateQuestionUseCase', () => {
      const create = (mediaUrl: string | null) =>
        new CreateQuestionUseCase(
          questionRepository,
          quizRepository,
          storage
        ).execute({
          quizId: A_QUIZ,
          text: 'Q',
          type: 'text',
          correctAnswers: ['a'],
          options: [],
          points: 1,
          mediaUrl,
          mediaType: mediaUrl ? 'image' : null,
        });

      it.each(refusedUrls)('refuses %s', async (_name, url) => {
        await expect(create(url)).rejects.toThrow(REFUSED);
        expect(questionRepository.save).not.toHaveBeenCalled();
      });

      it("accepts a file from the quiz's own folder, or no image", async () => {
        await expect(create(OWN_URL)).resolves.toMatchObject({
          media: OWN_URL,
        });
        await expect(create(null)).resolves.toBeDefined();
      });
    });

    describe('UpdateQuestionUseCase', () => {
      const LEGACY_URL = 'https://old-host.example/legacy.png';
      let question: Question;
      const update = (mediaUrl: string | null | undefined) =>
        new UpdateQuestionUseCase(questionRepository, storage).execute(
          A_QUIZ,
          'q-1',
          { text: 'Edited', mediaUrl }
        );

      beforeEach(() => {
        question = new Question(
          'q-1',
          'Q',
          ['a'],
          'text',
          1,
          LEGACY_URL,
          'image'
        );
        question.quizId = A_QUIZ;
        vi.mocked(questionRepository.findById).mockResolvedValue(question);
      });

      it.each(refusedUrls)(
        'refuses changing the image to %s',
        async (_name, url) => {
          await expect(update(url)).rejects.toThrow(REFUSED);
          expect(questionRepository.save).not.toHaveBeenCalled();
          expect(question.media).toBe(LEGACY_URL);
        }
      );

      it('keeps an unchanged image saved before the rule', async () => {
        await expect(update(LEGACY_URL)).resolves.toMatchObject({
          text: 'Edited',
          media: LEGACY_URL,
        });
        await expect(update(undefined)).resolves.toMatchObject({
          media: LEGACY_URL,
        });
      });

      it("accepts a new image from the quiz's own folder, or removing it", async () => {
        await expect(update(OWN_URL)).resolves.toMatchObject({
          media: OWN_URL,
        });
        await expect(update(null)).resolves.toMatchObject({ media: undefined });
      });
    });
  });
});
