export interface IDatabaseHealthRepository {
  /** Runs one cheap query; rejects when the database cannot answer. */
  ping(): Promise<void>;
}
