import { Cheerio } from 'cheerio';
import type { Element } from 'domhandler';
import classNames from 'classnames';
import { logger } from '../../../logger';
import { AttributeConverter } from '../../attribute.converter';
import { BreakPoint } from '../../breakpoint.type';
import { generateTailwindClassName } from '../breakpoint.mapper';

export class FxLayoutGapAttributeConverter extends AttributeConverter<unknown> {
  constructor() {
    super('fxLayoutGap');
  }

  public convert(value: string[], element: Cheerio<Element>, breakPoint: BreakPoint | undefined): void {
    let [gap, grid] = value;

    gap ?? logger.warn('No value for fxLayoutGap');
    gap ??= '0';
    grid ??= '';

    const classes = classNames({
      [generateTailwindClassName('gap', gap, breakPoint)]: true,
      [generateTailwindClassName('grid', undefined, breakPoint)]: grid !== '',
    });

    element.addClass(classes.trim());
  }
}
