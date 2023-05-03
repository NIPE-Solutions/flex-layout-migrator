import * as cheerio from 'cheerio';
import { Cheerio, CheerioAPI } from 'cheerio';
import { AttributeConverter } from '../../attribute.converter';
import { BreakPoint } from '../../converter.type';

interface IFxFlexAttributeContext {
  rtl: boolean;
  cool: boolean;
}

export class FxFlexAttributeConverter extends AttributeConverter<IFxFlexAttributeContext> {
  constructor() {
    super('fxTest');
  }

  public prepare(
    root: CheerioAPI,
    element: cheerio.Cheerio<cheerio.Element>,
  ): IFxFlexAttributeContext {
    const parent = element.parent();

    // Access the parent element to get the 'cool' attribute
    const cool = parent.attr('cool') !== undefined;

    // Access the <html> element to get the 'dir' attribute
    const htmlElement = root('html');
    const rtl = htmlElement.attr('dir') === 'rtl';

    return {
      rtl,
      cool,
    };
  }

  public convert(
    value: string[],
    element: Cheerio<cheerio.Element>,
    breakPoint: BreakPoint | undefined,
    context: IFxFlexAttributeContext,
  ): void {
    // context is now populated with the values from the prepare method

    // Add a class to the element based on the context

    element.addClass(
      `flex-hello-hello-dir-${context.rtl ? 'rtl' : 'ltr'}-cool-${
        context.cool
      }`,
    );
  }

  public usesBreakpoints(): boolean {
    return false;
  }
}
