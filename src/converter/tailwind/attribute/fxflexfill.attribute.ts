import { Cheerio } from 'cheerio';
import type { Element } from 'domhandler';
import classNames from 'classnames';
import { AttributeConverter } from '../../attribute.converter';
import { BreakPoint } from '../../breakpoint.type';
import { generateTailwindClassName } from '../breakpoint.mapper';

export class FxFlexFillAttributeConverter extends AttributeConverter<unknown> {
  constructor() {
    super('fxFlexFill');
  }

  public convert(value: string[], element: Cheerio<Element>, breakPoint: BreakPoint | undefined): void {
    const classes = classNames({
      [generateTailwindClassName('w-full', undefined, breakPoint)]: true,
      [generateTailwindClassName('min-w-full', undefined, breakPoint)]: true,
      [generateTailwindClassName('h-full', undefined, breakPoint)]: true,
      [generateTailwindClassName('min-h-full', undefined, breakPoint)]: true,
    });

    element.addClass(classes.trim());
  }
}
