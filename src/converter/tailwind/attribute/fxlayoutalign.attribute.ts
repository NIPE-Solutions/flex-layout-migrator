import * as cheerio from 'cheerio';
import { Cheerio } from 'cheerio';
import classNames from 'classnames';
import { logger } from '../../../logger';
import { AttributeConverter } from '../../attribute.converter';
import { BreakPoint } from '../../breakpoint.type';
import { generateTailwindClassName } from '../breakpoint.mapper';

interface IFxFlexLayoutAlignAttributeContext {
  direction: 'row' | 'column';
}

const mainAxisMapping = {
  ['start']: 'start',
  ['flex-start']: 'start',
  ['center']: 'center',
  ['end']: 'end',
  ['flex-end']: 'end',
  ['space-around']: 'around',
  ['space-between']: 'between',
  ['space-evenly']: 'evenly',
} as const;

const crossAxisItemMapping = {
  ['start']: 'start',
  ['flex-start']: 'start',
  ['center']: 'center',
  ['end']: 'end',
  ['flex-end']: 'end',
  ['stretch']: 'stretch',
  ['baseline']: 'baseline',
} as const;

const crossAxisContentMapping = {
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
} as const;

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
    let [mainAxis, crossAxis] = value;

    mainAxis ?? logger.warn('No value for main-axis for fxLayoutAlign');
    mainAxis ??= 'start';

    crossAxis ?? logger.warn('No value for cross-axis for fxLayoutAlign');
    crossAxis ??= 'stretch';

    const { direction } = context;
    const isParentRowLayout = direction === 'row';

    const mainAxisClassName = mainAxisMapping[mainAxis as keyof typeof mainAxisMapping];
    const crossAxisItemClassName = crossAxisItemMapping[crossAxis as keyof typeof crossAxisItemMapping];
    const crossAxisContentClassName = crossAxisContentMapping[crossAxis as keyof typeof crossAxisContentMapping];

    const classes = classNames({
      [generateTailwindClassName('justify', mainAxisClassName, breakPoint)]: true,
      [generateTailwindClassName('items', crossAxisItemClassName, breakPoint)]:
        isParentRowLayout && crossAxisItemClassName,
      [generateTailwindClassName('content', crossAxisContentClassName, breakPoint)]: !isParentRowLayout,
    });

    element.addClass(classes.trim());
  }
}
