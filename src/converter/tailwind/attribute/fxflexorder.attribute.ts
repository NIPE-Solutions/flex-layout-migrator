import * as cheerio from 'cheerio';
import { Cheerio } from 'cheerio';
import classNames from 'classnames';
import { logger } from '../../../logger';
import { AttributeConverter } from '../../attribute.converter';
import { BreakPoint } from '../../breakpoint.type';
import { generateTailwindClassName } from '../breakpoint.mapper';

export class FxFlexOrderAttributeConverter extends AttributeConverter<unknown> {
  constructor() {
    super('fxFlexOrder');
  }

  public convert(value: string[], element: Cheerio<cheerio.Element>, breakPoint: BreakPoint | undefined): void {
    let [order] = value;

    order ?? logger.warn('No value for fxFlexOrder');
    order ??= 'first';

    const classes = classNames({
      [generateTailwindClassName('order', order, breakPoint)]: true,
    });

    element.addClass(classes.trim());
  }

  public usesBreakpoints(): boolean {
    return true;
  }
}
