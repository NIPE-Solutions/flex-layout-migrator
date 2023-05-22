import { Converter } from '../converter';
import { FxFlexAttributeConverter } from './attribute/fxflex.attribute';
import { FxFlexFillAttributeConverter } from './attribute/fxflexfill.attribute';
import { FxFlexOffsetAttributeConverter } from './attribute/fxflexoffset.attribute';
import { FxFlexOrderAttributeConverter } from './attribute/fxflexorder.attribute';
import { FxLayoutAttributeConverter } from './attribute/fxlayout.attribute';
import { FxLayoutAlignAttributeConverter } from './attribute/fxlayoutalign.attribute';
import { FxLayoutGapAttributeConverter } from './attribute/fxlayoutgap.attribute';

export class TailwindCssConverter extends Converter {
  constructor() {
    super();

    this.addConverter(new FxFlexAttributeConverter());
    this.addConverter(new FxFlexFillAttributeConverter());
    this.addConverter(new FxFlexOffsetAttributeConverter());
    this.addConverter(new FxFlexOrderAttributeConverter());
    this.addConverter(new FxLayoutAttributeConverter());
    this.addConverter(new FxLayoutAlignAttributeConverter());
    this.addConverter(new FxLayoutGapAttributeConverter());
  }
}
