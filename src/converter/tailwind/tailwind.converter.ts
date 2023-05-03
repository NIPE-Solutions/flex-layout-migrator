import { Converter } from '../converter';
import { FxFlexAttributeConverter } from './attribute/example_test.attribute';

export class TailwindCssConverter extends Converter {
  constructor() {
    super();

    this.addConverter(new FxFlexAttributeConverter());
  }
}
