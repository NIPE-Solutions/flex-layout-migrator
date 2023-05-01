import { ConverterFactory } from "./converter.factory";
import { TailwindCssConverter } from "./tailwind/tailwind.converter";
import { PlainCssConverter } from "./plaincss/plaincss.converter";

describe("ConverterFactory", () => {
  test("createConverter() should create a TailwindCssConverter instance", () => {
    const converter = ConverterFactory.createConverter("tailwind");
    expect(converter).toBeInstanceOf(TailwindCssConverter);
  });

  test("createConverter() should create a PlainCssConverter instance", () => {
    const converter = ConverterFactory.createConverter("plain-css");
    expect(converter).toBeInstanceOf(PlainCssConverter);
  });

  test("createConverter() should throw an error for an unknown converter type", () => {
    expect(() => {
      ConverterFactory.createConverter("unknown");
    }).toThrowError("Converter [unknown] not found");
  });
});
