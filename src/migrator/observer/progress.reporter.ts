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
        this.handleFileStarted(data);
        break;
      case "fileProgress":
        this.handleFileProgress(data);
        break;
      case "fileCompleted":
        this.handleFileCompleted(data);
        break;
      case "folderStarted":
        this.handleFolderStarted(data);
        break;
      case "folderProgress":
        this.handleFolderProgress(data);
        break;
      case "folderCompleted":
        this.handleFolderCompleted(data);
        break;
      default:
        console.warn(`Unknown progress event: ${event}`);
    }
  }

  private handleFileStarted(data: EventData): void {
    this.spinnies.add(data.id, {
      text: `Migrating file: ${data.fileName}`,
    });
  }

  private handleFileProgress(data: EventData): void {
    this.spinnies.update(data.id, {
      text: `File progress: ${data.percentage}% (${data.processedElements} elements)`,
    });
  }

  private handleFileCompleted(data: EventData): void {
    this.spinnies.succeed(data.id, {
      text: `Migrated file: ${data.fileName}`,
    });
  }

  private handleFolderStarted(data: EventData): void {
    this.spinnies.add(data.id, {
      text: `Migrating directory: ${data.folderName}`,
    });
  }

  private handleFolderProgress(data: EventData): void {
    this.spinnies.update(data.id, {
      text: `Directory progress: ${data.percentage}% (${data.processedFiles} files)`,
    });
  }

  private handleFolderCompleted(data: EventData): void {
    this.spinnies.succeed(data.id, {
      text: `Migrated directory: ${data.folderName}`,
    });
  }
}

export { ProgressReporter };
