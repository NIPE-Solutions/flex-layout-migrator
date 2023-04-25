import * as cheerio from "cheerio";

export abstract class AttributeConverter {
  public abstract convert(value: string, element: cheerio.Cheerio<any>): void;

  public abstract getSelector(): string;
}
