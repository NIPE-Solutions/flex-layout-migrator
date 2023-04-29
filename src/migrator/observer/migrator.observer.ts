interface Subject {
  addObserver(observer: Observer): void;
  removeObserver(observer: Observer): void;
  notifyObservers(): void;
}

type EventData = {
  id: string;
  [key: string]: any;
};

interface Observer {
  update(event: string, data: EventData): void;
}

export { Observer, Subject, EventData };
