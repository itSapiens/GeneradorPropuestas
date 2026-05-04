export interface StudyRepositoryPort {
  confirmStudy(payload: Record<string, unknown>): Promise<unknown>;
}
