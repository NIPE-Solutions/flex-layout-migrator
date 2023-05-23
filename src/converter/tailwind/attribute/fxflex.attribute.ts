import * as cheerio from 'cheerio';
import { Cheerio } from 'cheerio';
import classNames from 'classnames';
import { logger } from '../../../logger';
import { AttributeConverter } from '../../attribute.converter';
import { BreakPoint } from '../../breakpoint.type';
import { generateTailwindClassName } from '../breakpoint.mapper';

export class FxFlexAttributeConverter extends AttributeConverter<unknown> {
  constructor() {
    super('fxFlex');
  }

  public convert(value: string[], element: Cheerio<cheerio.Element>, breakPoint: BreakPoint | undefined): void {
    const flexMap: { [key: string]: string } = {
      ['[0_1_auto]']: 'initial',
      ['[1_1_0%]']: '1',
      ['[1_1_auto]']: 'auto',
    };
    let flex: string | undefined = undefined;

    if (value.length === 1) {
      let [basis] = value;

      basis ?? logger.warn('No value basis in fxFlex');
      basis ??= 'initial';

      flex = basis;
    } else if (value.length > 1) {
      let [grow, shrink, basis] = value;

      grow ?? logger.warn('No value for grow in fxFlex');
      grow ??= '0';
      shrink ?? logger.warn('No value shrink in fxFlex');
      shrink ??= '1';
      basis ?? logger.warn('No value basis in fxFlex');
      basis ??= 'auto';

      const result = `[${grow}_${shrink}_${basis}]`;
      flex = flexMap[result] ?? result;
    }

    const classes = classNames({
      [generateTailwindClassName('flex', flex, breakPoint)]: true,
    });

    element.addClass(classes.trim());
  }
}
