export class Statistics {
  private folderProcessed = 0;
  private filesProcessed = 0;
  private attributesProcessed = 0;
  private startTime: Date = new Date();
  private endTime: Date | null = null;

  public incrementFoldersProcessed() {
    this.folderProcessed++;
  }

  public incrementFilesProcessed() {
    this.filesProcessed++;
  }

  public incrementAttributesProcessed() {
    this.attributesProcessed++;
  }

  public end() {
    this.endTime = new Date();
  }

  public print() {
    const duration = this.endTime ? (this.endTime.getTime() - this.startTime.getTime()) / 1000 : 0;
    console.log(`Migration Statistics:
      Files Processed: ${this.filesProcessed}
      Folders Processed: ${this.folderProcessed}
      Attributes Converted: ${this.attributesProcessed}
      Duration: ${duration} seconds`);
  }
}
