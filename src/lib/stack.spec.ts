import { Stack } from './stack';

describe('Stack', () => {
  let stack: Stack<number>;

  beforeEach(() => {
    stack = new Stack<number>();
  });

  it('should create an empty stack', () => {
    expect(stack.size()).toBe(0);
    expect(stack.isEmpty()).toBe(true);
  });

  it('should push items to the stack', () => {
    stack.push(1);
    stack.push(2);

    expect(stack.size()).toBe(2);
    expect(stack.isEmpty()).toBe(false);
  });

  it('should pop items from the stack', () => {
    stack.push(1);
    stack.push(2);

    expect(stack.pop()).toBe(2);
    expect(stack.pop()).toBe(1);
    expect(stack.size()).toBe(0);
    expect(stack.isEmpty()).toBe(true);
  });

  it('should peek at the top item of the stack', () => {
    stack.push(1);
    stack.push(2);

    expect(stack.peek()).toBe(2);
    expect(stack.size()).toBe(2);
    expect(stack.isEmpty()).toBe(false);
  });

  it('should throw an error when popping from an empty stack', () => {
    expect(() => stack.pop()).toThrowError('Cannot pop from an empty stack');
  });

  it('should throw an error when peeking at an empty stack', () => {
    expect(() => stack.peek()).toThrowError('Cannot peek at an empty stack');
  });

  it('should throw an error when the stack has reached max capacity', () => {
    const capacity = 2;
    stack = new Stack<number>([], capacity);

    stack.push(1);
    stack.push(2);

    expect(() => stack.push(3)).toThrowError('Stack has reached max capacity, you cannot add more items');
  });
});
