# Angular Flex-Layout Migration Tool
This tool assists in migrating projects that use the deprecated Angular Flex-Layout library to CSS classes. The package is designed to be as flexible and customizable as possible to accommodate different migration scenarios. Contributions are highly welcome!

## Features
- Scans and processes HTML files or entire directories.
- Migrates Angular Flex-Layout attributes to CSS classes.
- Configurable attribute-to-class mapping using a JSON configuration file.
- Support for handling attribute values.

## Installation
Install the package globally using npm:

```bash
npm install -g flex-layout-migrator
```

## Usage
To migrate a single HTML file or an entire directory, use the fxMigrate command followed by the path to the file or directory:

```bash
fxMigrate /path/to/folder/or/html/file
The tool will recursively process all HTML files in the specified directory and apply the migration according to the configuration.
```

## Configuration
The migration tool uses a JSON configuration file to define the mapping of Angular Flex-Layout attributes to CSS classes. An example configuration file is provided in the repository.

You can customize the configuration to suit your specific migration needs. The configuration file contains an array of objects, each representing an Angular Flex-Layout attribute group. Each object has the following properties:

- attribute: The base name of the Angular Flex-Layout attribute.
- classPrefix: The prefix to be used for the generated CSS class.
- useValueAsClassSuffix: (Optional) A flag indicating whether to use the attribute value as a class suffix. Defaults to false.
- suffixes: An array of objects that define suffixes for the attribute and corresponding class prefixes.

## Contributing
Contributions are highly welcome! If you find any issues or have suggestions for improvements, please feel free to open an issue or submit a pull request.

To set up the development environment, follow these steps:

1. Clone the repository.
2. Run npm install to install the dependencies.
3. Make your changes and test them using the provided test files or your own test cases.
4. Update the README and any relevant documentation if necessary.
5. Submit a pull request with a clear description of your changes.

## License
This project is licensed under the MIT License.
