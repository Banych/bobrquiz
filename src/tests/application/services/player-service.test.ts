import { PlayerService } from '@application/services/player-service';
import { AddPlayerUseCase } from '@application/use-cases/add-player.use-case';
import { FindPlayerByIdUseCase } from '@application/use-cases/find-player-by-id.use-case';
import { UpdatePlayerStatusUseCase } from '@application/use-cases/update-player-status.use-case';
import { UpdatePlayerPresenceUseCase } from '@application/use-cases/update-player-presence.use-case';
import { ListQuizPlayersUseCase } from '@application/use-cases/list-quiz-players.use-case';
import { GetPlayerSessionUseCase } from '@application/use-cases/get-player-session.use-case';
import { RemovePlayerUseCase } from '@application/use-cases/remove-player.use-case';
import { Player, PlayerStatus } from '@domain/entities/player';
import { beforeEach, describe, expect, it, Mocked, vi } from 'vitest';
import type { PlayerDTO } from '@application/dtos/player.dto';
import type { PlayerSessionDTO } from '@application/dtos/player-session.dto';

describe('PlayerService', () => {
  let addPlayerUseCase: Mocked<AddPlayerUseCase>;
  let updatePlayerStatusUseCase: Mocked<UpdatePlayerStatusUseCase>;
  let updatePlayerPresenceUseCase: Mocked<UpdatePlayerPresenceUseCase>;
  let findPlayerByIdUseCase: Mocked<FindPlayerByIdUseCase>;
  let listQuizPlayersUseCase: Mocked<ListQuizPlayersUseCase>;
  let getPlayerSessionUseCase: Mocked<GetPlayerSessionUseCase>;
  let removePlayerUseCase: Mocked<RemovePlayerUseCase>;
  let playerService: PlayerService;

  beforeEach(() => {
    addPlayerUseCase = {
      execute: vi.fn(),
    } as unknown as Mocked<AddPlayerUseCase>;

    updatePlayerStatusUseCase = {
      execute: vi.fn(),
    } as unknown as Mocked<UpdatePlayerStatusUseCase>;

    updatePlayerPresenceUseCase = {
      execute: vi.fn(),
    } as unknown as Mocked<UpdatePlayerPresenceUseCase>;

    findPlayerByIdUseCase = {
      execute: vi.fn(),
    } as unknown as Mocked<FindPlayerByIdUseCase>;

    listQuizPlayersUseCase = {
      execute: vi.fn(),
    } as unknown as Mocked<ListQuizPlayersUseCase>;

    getPlayerSessionUseCase = {
      execute: vi.fn(),
    } as unknown as Mocked<GetPlayerSessionUseCase>;

    removePlayerUseCase = {
      execute: vi.fn(),
    } as unknown as Mocked<RemovePlayerUseCase>;

    playerService = new PlayerService(
      addPlayerUseCase,
      updatePlayerStatusUseCase,
      updatePlayerPresenceUseCase,
      findPlayerByIdUseCase,
      listQuizPlayersUseCase,
      getPlayerSessionUseCase,
      removePlayerUseCase
    );
  });

  it('should add a player to a quiz', async () => {
    await playerService.addPlayer('quiz1', 'p1', 'Player 1');
    expect(addPlayerUseCase.execute).toHaveBeenCalledWith(
      'quiz1',
      'p1',
      'Player 1'
    );
  });

  it('should update the status of a player', async () => {
    await playerService.updatePlayerStatus('p1', PlayerStatus.Disconnected);
    expect(updatePlayerStatusUseCase.execute).toHaveBeenCalledWith(
      'p1',
      PlayerStatus.Disconnected
    );
  });

  it('should fetch player details', async () => {
    const player = new Player('p1', 'Player 1', 'quiz1');
    findPlayerByIdUseCase.execute.mockResolvedValueOnce(player);

    const result = await playerService.getPlayerDetails('p1');
    expect(findPlayerByIdUseCase.execute).toHaveBeenCalledWith('p1');
    expect(result).toEqual(player);
  });

  it('lists quiz players via DTOs', async () => {
    const players = [{ id: 'p1' } as PlayerDTO];
    listQuizPlayersUseCase.execute.mockResolvedValue(players);

    const result = await playerService.listPlayersForQuiz('quiz1');
    expect(listQuizPlayersUseCase.execute).toHaveBeenCalledWith('quiz1');
    expect(result).toEqual(players);
  });

  it('returns a player session DTO', async () => {
    const session = {
      quiz: { id: 'quiz1' },
      player: { id: 'p1' },
    } as unknown as PlayerSessionDTO;
    getPlayerSessionUseCase.execute.mockResolvedValue(session);

    const result = await playerService.getPlayerSession('quiz1', 'p1');
    expect(getPlayerSessionUseCase.execute).toHaveBeenCalledWith('quiz1', 'p1');
    expect(result).toEqual(session);
  });
});
