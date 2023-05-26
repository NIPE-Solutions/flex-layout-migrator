import { Statistics } from '../../statistics';
import { Observer } from './migrator.observer';

class StatisticsReporter implements Observer {
  constructor(private statistics: Statistics) {}

  public update(event: string): void {
    switch (event) {
      case 'fileMigrationProgress':
        this.statistics.incrementAttributesProcessed();
        break;
      case 'fileCompleted':
        this.statistics.incrementFilesProcessed();
        break;
      case 'folderCompleted':
        this.statistics.incrementFoldersProcessed();
        break;
      default:
      // Do nothing
    }
  }
}

export { StatisticsReporter };
