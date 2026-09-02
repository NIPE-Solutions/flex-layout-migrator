export type TransactionInterruptionHandler = (signal: NodeJS.Signals) => void;

export interface TransactionSignalTarget {
  on(signal: NodeJS.Signals, listener: TransactionInterruptionHandler): void;
  off(signal: NodeJS.Signals, listener: TransactionInterruptionHandler): void;
}

export interface TransactionSignalRegistrarLike {
  register(handler: TransactionInterruptionHandler): () => void;
}

const transactionSignals: readonly NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];

export class TransactionSignalRegistrar implements TransactionSignalRegistrarLike {
  constructor(private readonly target: TransactionSignalTarget = process) {}

  register(handler: TransactionInterruptionHandler): () => void {
    for (const signal of transactionSignals) this.target.on(signal, handler);

    let registered = true;
    return () => {
      if (!registered) return;
      registered = false;
      for (const signal of transactionSignals) this.target.off(signal, handler);
    };
  }
}
