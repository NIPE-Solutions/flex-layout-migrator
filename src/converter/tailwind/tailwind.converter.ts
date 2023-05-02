import { Converter } from '../converter';
import { FxTestAttributeConverter } from './attribute/example_test.attribute';
import { FxFlexAttributeConverter } from './attribute/fxflex.attribute';

export class TailwindCssConverter extends Converter {
  constructor() {
    super();

    this.addConverter(new FxFlexAttributeConverter());
    this.addConverter(new FxTestAttributeConverter());
  }
}
