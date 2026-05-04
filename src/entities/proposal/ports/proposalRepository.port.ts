export interface ProposalRepositoryPort {
  validateInvoice(file: File): Promise<unknown>;
}
