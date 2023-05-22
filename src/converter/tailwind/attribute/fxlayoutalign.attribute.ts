import * as cheerio from 'cheerio';
import { Cheerio, CheerioAPI } from 'cheerio';
import classNames from 'classnames';
import { logger } from '../../../logger';
import { AttributeConverter } from '../../attribute.converter';
import { BreakPoint } from '../../converter.type';
import { generateTailwindClassName } from '../breakpoint.mapper';

interface IFxFlexLayoutAlignAttributeContext {
  direction: 'row' | 'column';
}

export class FxLayoutAlignAttributeConverter extends AttributeConverter<unknown> {
  constructor() {
    super('fxLayoutAlign');
  }

  public prepare(root: cheerio.CheerioAPI, element: Cheerio<cheerio.Element>): IFxFlexLayoutAlignAttributeContext {
    const parent = element.parent();

    const direction = (parent.attr('fxLayout') as 'row' | 'column') || 'row';

    return {
      direction,
    };
  }

  public convert(
    value: string[],
    element: Cheerio<cheerio.Element>,
    breakPoint: BreakPoint | undefined,
    context: IFxFlexLayoutAlignAttributeContext,
  ): void {
    const mainAxisMapping: any = {
      ['start']: 'start',
      ['flex-start']: 'start',
      ['center']: 'center',
      ['end']: 'end',
      ['flex-end']: 'end',
      ['space-around']: 'around',
      ['space-between']: 'between',
      ['space-evenly']: 'evenly',
    };

    const crossAxisItemMapping: any = {
      ['start']: 'start',
      ['flex-start']: 'start',
      ['center']: 'center',
      ['end']: 'end',
      ['flex-end']: 'end',
      ['stretch']: 'stretch',
      ['baseline']: 'baseline',
    };

    const crossAxisContentMapping: any = {
      ['start']: 'start',
      ['flex-start']: 'start',
      ['center']: 'center',
      ['end']: 'end',
      ['flex-end']: 'end',
      ['space-around']: 'around',
      ['space-between']: 'between',
      ['space-evenly']: 'evenly',
      ['stretch']: 'stretch',
      ['baseline']: 'baseline',
    };
    let [mainAxis, crossAxis] = value;

    mainAxis ?? logger.warn('No value for main-axis for fxLayoutAlign');
    mainAxis ??= 'start';

    crossAxis ?? logger.warn('No value for cross-axis for fxLayoutAlign');
    crossAxis ??= 'stretch';

    const { direction } = context;
    const isParentRowLayout = direction === 'row';

    const classes = classNames({
      [generateTailwindClassName('justify', mainAxisMapping[mainAxis], breakPoint)]: true,
      [generateTailwindClassName('items', crossAxisItemMapping[crossAxis], breakPoint)]:
        isParentRowLayout && crossAxisItemMapping[crossAxis],
      [generateTailwindClassName('content', crossAxisContentMapping[crossAxis], breakPoint)]: !isParentRowLayout,
    });

    element.addClass(classes.trim());
  }

  public usesBreakpoints(): boolean {
    return true;
  }
}
