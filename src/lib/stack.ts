interface IStack<T> {
  push(item: T): void;
  pop(): T;
  peek(): T;
  size(): number;
  isEmpty(): boolean;
}

export class Stack<T> implements IStack<T> {
  constructor(private storage: T[] = [], private capacity: number = Infinity) {}

  public push(item: T): void {
    if (this.size() === this.capacity) {
      throw Error('Stack has reached max capacity, you cannot add more items');
    }
    this.storage.push(item);
  }

  public pop(): T {
    if (this.isEmpty()) {
      throw new Error('Cannot pop from an empty stack');
    }
    return this.storage?.pop() as T;
  }

  public peek(): T {
    if (this.isEmpty()) {
      throw new Error('Cannot peek at an empty stack');
    }
    return this.storage[this.size() - 1];
  }

  public size(): number {
    return this.storage.length;
  }

  public isEmpty(): boolean {
    return this.size() === 0;
  }
}
