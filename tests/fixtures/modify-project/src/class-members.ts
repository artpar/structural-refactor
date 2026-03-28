export class Service {
  public name: string;
  static instance: Service | null = null;

  constructor(name: string) {
    this.name = name;
  }

  greet(): string {
    return `Hello, ${this.name}`;
  }
}

export abstract class BaseHandler {
  abstract handle(): void;
}
