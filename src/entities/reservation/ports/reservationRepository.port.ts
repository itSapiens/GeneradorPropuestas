export interface ReservationRepositoryPort {
  create(): Promise<unknown>;
  confirm(): Promise<unknown>;
}
