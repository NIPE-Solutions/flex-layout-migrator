import { Cheerio } from 'cheerio';
import * as cheerio from 'cheerio';
import { AttributeConverter } from '../../../attribute.converter';
import { BreakPoint } from '../../../converter.type';
import { mapBreakpoint } from '../../breakpoint.mapper';
import { logger } from '../../../../logger';

/**
 * Converter for the fxFlexOffset attribute. Converts the value to the tailwind format.
 *
 * Its a bit tricky to convert the fxFlexOffset attribute because it depends on the parent layout.
 * In a row layout the offset is a margin-right, in a column layout its a margin-top.
 * But if the parent layout is a row and the direction is rtl, the offset is a margin-left.
 *
 * @example
 * ```html
 * <div fxFlexOffset="10"></div>
 * ```
 *
 * becomes
 *
 * ```html
 * <div class="ml-10"></div>
 * ```
 *
 * If the element has a breakpoint, the breakpoint is added as prefix.
 *
 * @example
 * ```html
 * <div fxFlexOffset.md="10"></div>
 *
 * becomes
 *
 * <div class="md:ml-10"></div>
 * ```
 *
 * If the element has multiple breakpoints, the converter is called multiple times.
 *
 * @example
 * ```html
 * <div fxFlexOffset.md="10" fxFlexOffset.lg="20"></div>
 * ```
 *
 * becomes
 *
 * ```html
 * <div class="md:ml-10 lg:ml-20"></div>
 * ```
 *
 * If the element has no value, the converter does nothing.
 *
 */
export class FxFlexOffsetConverter extends AttributeConverter {
  constructor() {
    super('fxFlexOffset');
  }

  public convert(
    value: string[],
    element: Cheerio<cheerio.Element>,
    breakPoint?: BreakPoint,
  ): void {
    const [offset] = value;

    if (!offset) {
      logger.warn(
        'received fxFlexOffset attribute without value. Ignoring conversion.',
      );
      return;
    }

    const parent = element.parent();

    const isParentRowLayout = parent.hasClass('flex-row');
    const isRtl = parent.attr('dir') === 'rtl';

    const mappedBreakPoint = mapBreakpoint(breakPoint);

    const classes = [
      mappedBreakPoint ? `${mappedBreakPoint}:` : '',
      isParentRowLayout
        ? isRtl
          ? `mr-${offset}` // margin-right
          : `ml-${offset}` // margin-left
        : `mt-${offset}`, // margin-top
    ].join('');

    element.addClass(classes.trim());
  }
}
