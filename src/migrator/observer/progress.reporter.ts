import Spinnies from "spinnies";
import { EventData, Observer } from "./migrator.observer";

class ProgressReporter implements Observer {
  private spinnies: Spinnies;

  constructor() {
    this.spinnies = new Spinnies();
  }

  public update(event: string, data: EventData): void {
    switch (event) {
      case "fileStarted":
        this.spinnies.add(data.id, {
          text: `Migrating file: ${data.fileName}`,
        });
        break;
      case "fileProgress":
        this.spinnies.update(data.id, {
          text: `File progress: ${data.percentage}% (${data.processedElements} elements)`,
        });
        break;
      case "fileCompleted":
        this.spinnies.succeed(data.id, {
          text: `Migrated file: ${data.fileName}`,
        });
        break;
      case "folderStarted":
        this.spinnies.add(data.id, {
          text: `Migrating directory: ${data.folderName}`,
        });
        break;
      case "folderProgress":
        this.spinnies.update(data.id, {
          text: `Directory progress: ${data.percentage}% (${data.processedFiles} files)`,
        });
        break;
      case "folderCompleted":
        this.spinnies.succeed(data.id, {
          text: `Migrated directory: ${data.folderName}`,
        });
        break;
      default:
        console.warn(`Unknown progress event: ${event}`);
    }
  }
}

export { ProgressReporter };
