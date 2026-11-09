import type { IDatabaseHealthRepository } from '@domain/repositories/database-health-repository';

export class PingDatabaseUseCase {
  constructor(private readonly databaseHealth: IDatabaseHealthRepository) {}

  async execute(): Promise<void> {
    await this.databaseHealth.ping();
  }
}
