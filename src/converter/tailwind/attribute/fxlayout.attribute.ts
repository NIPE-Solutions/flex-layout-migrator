import { Cheerio } from 'cheerio';
import type { Element } from 'domhandler';
import classNames from 'classnames';
import { logger } from '../../../logger';
import { AttributeConverter } from '../../attribute.converter';
import { BreakPoint } from '../../breakpoint.type';
import { generateTailwindClassName } from '../breakpoint.mapper';

export class FxLayoutAttributeConverter extends AttributeConverter<unknown> {
  constructor() {
    super('fxLayout');
  }

  public convert(value: string[], element: Cheerio<Element>, breakPoint: BreakPoint | undefined): void {
    let [direction, wrap] = value;

    direction ?? logger.warn('No value for fxLayout');
    direction ??= 'row';

    wrap ??= '';

    const classes = classNames({
      [generateTailwindClassName('flex', undefined, undefined)]: true,
      [generateTailwindClassName('flex', direction, breakPoint)]: true,
      [generateTailwindClassName('flex', wrap, breakPoint)]: wrap !== '',
    });

    element.addClass(classes.trim());
  }
}
