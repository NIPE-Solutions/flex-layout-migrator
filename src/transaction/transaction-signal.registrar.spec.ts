import { TransactionSignalRegistrar, type TransactionSignalTarget } from './transaction-signal.registrar';

describe('TransactionSignalRegistrar', () => {
  test('registers SIGINT and SIGTERM only for the returned scope and restores both handlers', () => {
    const target = new FakeSignalTarget();
    const registrar = new TransactionSignalRegistrar(target);
    const received: NodeJS.Signals[] = [];

    expect(target.listeners.size).toBe(0);
    const unregister = registrar.register(signal => received.push(signal));

    expect([...target.listeners.keys()]).toEqual(['SIGINT', 'SIGTERM']);
    target.emit('SIGINT');
    target.emit('SIGTERM');
    expect(received).toEqual(['SIGINT', 'SIGTERM']);

    unregister();
    expect(target.listeners.size).toBe(0);
    target.emit('SIGINT');
    expect(received).toEqual(['SIGINT', 'SIGTERM']);
  });

  test('unregisters idempotently without removing another registration', () => {
    const target = new FakeSignalTarget();
    const registrar = new TransactionSignalRegistrar(target);
    const first = vi.fn();
    const second = vi.fn();
    const unregisterFirst = registrar.register(first);
    registrar.register(second);

    unregisterFirst();
    unregisterFirst();
    target.emit('SIGTERM');

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith('SIGTERM');
  });
});

class FakeSignalTarget implements TransactionSignalTarget {
  readonly listeners = new Map<NodeJS.Signals, Set<(signal: NodeJS.Signals) => void>>();

  on(signal: NodeJS.Signals, listener: (signal: NodeJS.Signals) => void): void {
    const listeners = this.listeners.get(signal) ?? new Set();
    listeners.add(listener);
    this.listeners.set(signal, listeners);
  }

  off(signal: NodeJS.Signals, listener: (signal: NodeJS.Signals) => void): void {
    const listeners = this.listeners.get(signal);
    listeners?.delete(listener);
    if (listeners?.size === 0) this.listeners.delete(signal);
  }

  emit(signal: NodeJS.Signals): void {
    for (const listener of this.listeners.get(signal) ?? []) listener(signal);
  }
}
