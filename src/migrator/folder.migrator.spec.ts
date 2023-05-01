import * as fs from "fs-extra";
import * as path from "path";
import { IConverter } from "src/converter/converter";
import { FolderMigrator } from "./folder.migrator";
import { Observer } from "./observer/migrator.observer";

function createTestFolders(inputFolderPath: string): void {
  fs.ensureDirSync(path.join(inputFolderPath, "subfolder1"));
  fs.ensureFileSync(path.join(inputFolderPath, "file1.html"));
  fs.ensureFileSync(path.join(inputFolderPath, "subfolder1", "file2.html"));
}

describe("FolderMigrator", () => {
  let converter: IConverter;
  let observer: Observer;
  let inputFolder: string;
  let outputFolder: string;

  beforeEach(() => {
    converter = {
      getAllAttributes: jest.fn().mockReturnValue([]),
      convert: jest.fn(),
    } as unknown as IConverter;

    observer = { update: jest.fn() };
    inputFolder = path.join(__dirname, "test-input");
    outputFolder = path.join(__dirname, "test-output");

    createTestFolders(inputFolder);
  });

  afterEach(() => {
    fs.removeSync(inputFolder);
    fs.removeSync(outputFolder);
  });

  test("Folder migration", async () => {
    const migrator = new FolderMigrator(converter, inputFolder, outputFolder);
    migrator.addObserver(observer);
    await migrator.migrate();

    // Check if the update method of the observer has been called
    expect(observer.update).toHaveBeenCalled();

    // Check if the output folder has been created with the correct structure
    expect(fs.existsSync(outputFolder)).toBe(true);
    expect(fs.existsSync(path.join(outputFolder, "subfolder1"))).toBe(true);
    expect(fs.existsSync(path.join(outputFolder, "file1.html"))).toBe(true);
    expect(
      fs.existsSync(path.join(outputFolder, "subfolder1", "file2.html"))
    ).toBe(true);
  });
});
